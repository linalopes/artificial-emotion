import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { isNodeId, type ClockStatus, type NodeId } from '@swarm/shared';
import { ClockTracker, monoNow } from '../clock';
import type { Codec, DeviceCommand, DeviceEvent, Telemetry } from './protocol';

export interface DeviceServerOptions {
  helloTimeoutMs: number;
  ackTimeoutMs: number;
  clockIntervalMs: number;
  clockMaxUncertaintyMs: number;
  clockMaxAgeMs: number;
}

export interface DeviceHandlers {
  onConnect(node: NodeId, info: { fwVersion: string; simulated: boolean }): void;
  onDisconnect(node: NodeId): void;
  onTelemetry(node: NodeId, t: Telemetry): void;
  onRunStatus(node: NodeId, ev: Extract<DeviceEvent, { type: 'run_status' }>): void;
  onLog(level: 'info' | 'warn' | 'error', message: string): void;
}

interface Pending {
  resolve: () => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}
interface Link {
  ws: WebSocket;
  node: NodeId;
  pending: Map<string, Pending>;
  clock: ClockTracker;
  clockSeq: number;
  clockSent: Map<number, number>;
  clockTimer: NodeJS.Timeout;
}

/**
 * Owns the node connections: registration, duplicate-identity rejection, command acknowledgment
 * with timeouts, and the coordinator side of the four-timestamp clock exchange.
 * A command resolves only when the node acknowledges it. Sending alone is never success.
 */
export class DeviceServer {
  private links = new Map<NodeId, Link>();

  constructor(
    private readonly codec: Codec,
    private readonly opts: DeviceServerOptions,
    private readonly handlers: DeviceHandlers
  ) {}

  /** Call for every socket accepted on the device path. */
  accept(ws: WebSocket): void {
    let link: Link | null = null;
    const helloTimer = setTimeout(() => {
      if (!link) {
        this.handlers.onLog('warn', 'A device connection sent no identity in time and was closed.');
        ws.close();
      }
    }, this.opts.helloTimeoutMs);

    ws.on('message', (data) => {
      const t4 = monoNow();
      const ev = this.codec.decode(data.toString());
      if (!ev) return;
      if (!link) {
        if (ev.type !== 'hello') return;
        clearTimeout(helloTimer);
        if (!isNodeId(ev.nodeId)) {
          this.handlers.onLog('warn', `Rejected a device with unknown identity "${String(ev.nodeId).slice(0, 32)}".`);
          ws.send(this.codec.encodeReject('unknown_identity'));
          ws.close();
          return;
        }
        if (this.links.has(ev.nodeId)) {
          // The established connection keeps the identity. Two modules must never share one.
          this.handlers.onLog('error', `Duplicate identity: a second device claimed ${ev.nodeId} and was rejected. Check commissioning.`);
          ws.send(this.codec.encodeReject('duplicate_identity'));
          ws.close();
          return;
        }
        link = this.register(ws, ev.nodeId);
        this.handlers.onConnect(ev.nodeId, { fwVersion: ev.fwVersion, simulated: ev.simulated === true });
        return;
      }
      this.handle(link, ev, t4);
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (link) this.unregister(link);
    });
    ws.on('error', () => ws.close());
  }

  private register(ws: WebSocket, node: NodeId): Link {
    const link: Link = {
      ws,
      node,
      pending: new Map(),
      clock: new ClockTracker(this.opts.clockMaxUncertaintyMs, this.opts.clockMaxAgeMs),
      clockSeq: 0,
      clockSent: new Map(),
      clockTimer: setInterval(() => this.probeClock(link), this.opts.clockIntervalMs)
    };
    this.links.set(node, link);
    // A short burst gives a usable estimate soon after connecting.
    for (let i = 0; i < 4; i++) setTimeout(() => this.probeClock(link), 50 + i * 120);
    return link;
  }

  private unregister(link: Link): void {
    if (this.links.get(link.node) !== link) return;
    clearInterval(link.clockTimer);
    for (const p of link.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('disconnected before acknowledging'));
    }
    link.pending.clear();
    this.links.delete(link.node);
    this.handlers.onDisconnect(link.node);
  }

  private probeClock(link: Link): void {
    if (this.links.get(link.node) !== link || link.ws.readyState !== link.ws.OPEN) return;
    const seq = ++link.clockSeq;
    if (link.clockSent.size > 16) link.clockSent.clear();
    const t1 = monoNow();
    link.clockSent.set(seq, t1);
    link.ws.send(this.codec.encodeClockRequest(seq, t1));
  }

  private handle(link: Link, ev: DeviceEvent, t4: number): void {
    switch (ev.type) {
      case 'ack': {
        const p = link.pending.get(ev.messageId);
        if (!p) return;
        link.pending.delete(ev.messageId);
        clearTimeout(p.timer);
        if (ev.ok) p.resolve();
        else p.reject(new Error(ev.error ?? 'refused by the module'));
        return;
      }
      case 'telemetry':
        this.handlers.onTelemetry(link.node, ev.telemetry);
        return;
      case 'clock_reply': {
        const t1 = link.clockSent.get(ev.seq);
        if (t1 === undefined) return;
        link.clockSent.delete(ev.seq);
        link.clock.add({ t1, t2: ev.t2, t3: ev.t3, t4 });
        return;
      }
      case 'run_status':
        this.handlers.onRunStatus(link.node, ev);
        return;
      default:
        return;
    }
  }

  isConnected(node: NodeId): boolean {
    return this.links.has(node);
  }

  clockStatus(node: NodeId): ClockStatus | null {
    return this.links.get(node)?.clock.status(monoNow()) ?? null;
  }

  /** Coordinator time expressed on the node's clock, or null when there is no estimate. */
  toNodeTime(node: NodeId, coordMs: number): number | null {
    return this.links.get(node)?.clock.toNodeTime(coordMs, monoNow()) ?? null;
  }

  /** Resolves when the node acknowledges. Rejects on refusal, timeout or disconnect. */
  send(node: NodeId, cmd: DeviceCommand, timeoutMs = this.opts.ackTimeoutMs): Promise<void> {
    const link = this.links.get(node);
    if (!link || link.ws.readyState !== link.ws.OPEN) return Promise.reject(new Error('not connected'));
    const messageId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        link.pending.delete(messageId);
        reject(new Error(`no acknowledgment within ${timeoutMs} ms`));
      }, timeoutMs);
      link.pending.set(messageId, { resolve, reject, timer });
      link.ws.send(this.codec.encodeCommand(messageId, cmd), (err) => {
        if (err) {
          clearTimeout(timer);
          link.pending.delete(messageId);
          reject(new Error('send failed'));
        }
      });
    });
  }

  close(): void {
    for (const link of [...this.links.values()]) link.ws.close();
  }
}
