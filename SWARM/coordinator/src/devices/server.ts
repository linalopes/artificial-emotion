import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { isNodeId, type ClockStatus, type NodeId } from '@swarm/shared';
import { ClockTracker, monoNow, monoNowUs } from '../clock';
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
  /** seq → coordinator t1 in the same units the codec uses on the wire. */
  clockSent: Map<number, number>;
  clockTimer: NodeJS.Timeout;
}

interface ConfigWaiter {
  resolve: (config: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Owns the node connections: registration, duplicate-identity rejection, command acknowledgment
 * with timeouts, and the coordinator side of the four-timestamp clock exchange.
 * A command resolves only when the node acknowledges it. Sending alone is never success.
 */
export class DeviceServer {
  private links = new Map<NodeId, Link>();
  private configWaiters = new Map<NodeId, ConfigWaiter[]>();

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
      const t4 = this.codec.speaksFirmware ? monoNowUs() : monoNow();
      const ev = this.codec.decode(data.toString());
      if (!ev) return;
      if (!link) {
        const id = this.tryRegister(ws, ev, helloTimer);
        if (id) link = id;
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

  private tryRegister(ws: WebSocket, ev: DeviceEvent, helloTimer: NodeJS.Timeout): Link | null {
    let nodeId: string | null = null;
    let fwVersion = 'unknown';
    let simulated = false;
    let telemetry: Telemetry | null = null;

    if (ev.type === 'hello') {
      nodeId = ev.nodeId;
      fwVersion = ev.fwVersion;
      simulated = ev.simulated === true;
    } else if (ev.type === 'status') {
      nodeId = ev.nodeId;
      fwVersion = ev.fwVersion;
      simulated = ev.simulated === true;
      telemetry = ev.telemetry;
    } else {
      return null;
    }

    clearTimeout(helloTimer);
    if (!isNodeId(nodeId)) {
      this.handlers.onLog('warn', `Rejected a device with unknown identity "${String(nodeId).slice(0, 32)}".`);
      ws.send(this.codec.encodeReject('unknown_identity'));
      ws.close();
      return null;
    }
    if (this.links.has(nodeId)) {
      this.handlers.onLog('error', `Duplicate identity: a second device claimed ${nodeId} and was rejected. Check commissioning.`);
      ws.send(this.codec.encodeReject('duplicate_identity'));
      ws.close();
      return null;
    }
    const link = this.register(ws, nodeId);
    this.handlers.onConnect(nodeId, { fwVersion, simulated });
    if (telemetry) this.handlers.onTelemetry(nodeId, telemetry);
    return link;
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
    for (const w of this.configWaiters.get(link.node) ?? []) {
      clearTimeout(w.timer);
      w.reject(new Error('disconnected before config'));
    }
    this.configWaiters.delete(link.node);
    this.links.delete(link.node);
    this.handlers.onDisconnect(link.node);
  }

  private probeClock(link: Link): void {
    if (this.links.get(link.node) !== link || link.ws.readyState !== link.ws.OPEN) return;
    const seq = ++link.clockSeq;
    if (link.clockSent.size > 16) link.clockSent.clear();
    const t1 = this.codec.speaksFirmware ? monoNowUs() : monoNow();
    link.clockSent.set(seq, t1);
    link.ws.send(this.codec.encodeClockRequest(seq, t1, link.node));
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
      case 'status':
        if (ev.nodeId !== link.node) {
          this.handlers.onLog('warn', `Ignoring status from ${ev.nodeId} on the ${link.node} link.`);
          return;
        }
        this.handlers.onTelemetry(link.node, ev.telemetry);
        return;
      case 'clock_reply': {
        const t1 = link.clockSent.get(ev.seq);
        if (t1 === undefined) return;
        link.clockSent.delete(ev.seq);
        const units = ev.units ?? (this.codec.speaksFirmware ? 'us' : 'ms');
        if (units === 'us' && this.codec.encodeClockFin) {
          link.ws.send(
            this.codec.encodeClockFin(ev.seq, { t1, t2: ev.t2, t3: ev.t3, t4 }, link.node),
            () => undefined
          );
          // Store tracker samples in milliseconds for shared ClockStatus.
          link.clock.add({ t1: t1 / 1000, t2: ev.t2 / 1000, t3: ev.t3 / 1000, t4: t4 / 1000 });
        } else {
          link.clock.add({ t1, t2: ev.t2, t3: ev.t3, t4 });
        }
        return;
      }
      case 'run_status':
        this.handlers.onRunStatus(link.node, ev);
        return;
      case 'config': {
        const waiters = this.configWaiters.get(link.node) ?? [];
        this.configWaiters.delete(link.node);
        for (const w of waiters) {
          clearTimeout(w.timer);
          w.resolve(ev.config);
        }
        return;
      }
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
    let encoded: string;
    try {
      encoded = this.codec.encodeCommand(messageId, cmd, node);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        link.pending.delete(messageId);
        reject(new Error(`no acknowledgment within ${timeoutMs} ms`));
      }, timeoutMs);
      link.pending.set(messageId, { resolve, reject, timer });
      link.ws.send(encoded, (err) => {
        if (err) {
          clearTimeout(timer);
          link.pending.delete(messageId);
          reject(new Error('send failed'));
        }
      });
    });
  }

  /** Ask the node for its full config payload (after get_config ack). */
  async requestConfig(node: NodeId, timeoutMs = 5000): Promise<Record<string, unknown>> {
    if (!this.links.has(node)) return Promise.reject(new Error('not connected'));
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        const list = this.configWaiters.get(node) ?? [];
        this.configWaiters.set(
          node,
          list.filter((w) => w.resolve !== resolve)
        );
        reject(new Error(`no config payload within ${timeoutMs} ms`));
      }, timeoutMs);
      const waiter: ConfigWaiter = { resolve, reject, timer };
      const list = this.configWaiters.get(node) ?? [];
      list.push(waiter);
      this.configWaiters.set(node, list);
      void this.send(node, { name: 'get_config' }).catch((e) => {
        clearTimeout(timer);
        const cur = this.configWaiters.get(node) ?? [];
        this.configWaiters.set(
          node,
          cur.filter((w) => w !== waiter)
        );
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  close(): void {
    for (const link of [...this.links.values()]) link.ws.close();
  }
}
