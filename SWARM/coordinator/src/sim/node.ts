import WebSocket from 'ws';
import { positionAt, rpmToMmPerS, SCORE_SCHEMA, type Keyframe, type NodeId, type Score } from '@swarm/shared';
import type { DeviceCommand, DeviceEvent, Telemetry } from '../devices/protocol';
import { simDecodeInbound, simEncodeEvent } from '../devices/sim-codec';

export interface SimNodeOptions {
  /** How much faster than real time the simulated motor moves. 1 = real motor speed. Score time is never scaled. */
  speedFactor?: number;
  telemetryMs?: number;
  tickMs?: number;
  reconnectMs?: number;
}

interface Trajectory {
  runId: string;
  score: Score;
  prepared: boolean;
  startAt: number | null;
  started: boolean;
}

/**
 * A software stand-in for one MauMau node. It connects to the coordinator as a WebSocket client,
 * keeps its own unsynchronised clock, integrates a speed- and acceleration-limited motor model,
 * and only acknowledges what it actually accepted.
 *
 * Its behaviour is an ASSUMPTION about the firmware, written without access to the firmware
 * source. In particular: it keeps moving when the coordinator disconnects, it has no retry
 * logic, and it supports `clear_fault`. Each of these must be checked against v0.2.0.
 */
export class SimNode {
  private ws: WebSocket | null = null;
  private timers: NodeJS.Timeout[] = [];
  private stopped = false;
  private offline = false;
  private muteClock = false;
  private readonly skew = Math.random() * 20000 - 10000;

  private pos: number;
  private vel = 0;
  private target: number;
  private homed = false;
  private homing = false;
  private fault: string | null = null;
  private rpm = 12;
  private accel = 30;
  private readonly limitMin = 0;
  private readonly limitMax = 1000;
  private traj: Trajectory | null = null;
  private lastTick = performance.now();

  constructor(
    readonly id: NodeId,
    private readonly url: string,
    private readonly opts: SimNodeOptions = {}
  ) {
    this.pos = 150 + Math.random() * 250;
    this.target = this.pos;
  }

  private clock(): number {
    return performance.now() + this.skew;
  }

  start(): void {
    this.connect();
    this.timers.push(setInterval(() => this.tick(), this.opts.tickMs ?? 20));
    this.timers.push(setInterval(() => this.emit({ type: 'telemetry', telemetry: this.telemetry() }), this.opts.telemetryMs ?? 200));
  }

  stop(): void {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    this.ws?.close();
  }

  // ---- scenarios ------------------------------------------------------------------------

  setOffline(v: boolean): void {
    this.offline = v;
    if (v) this.ws?.close();
    else this.connect();
  }
  setClockMuted(v: boolean): void {
    this.muteClock = v;
  }
  injectHomingFault(): void {
    this.fault = 'HOMING_FAILED';
    this.homed = false;
    this.homing = false;
    this.vel = 0;
    this.abortRun('fault');
  }

  // ---- connection -----------------------------------------------------------------------

  private connect(): void {
    if (this.stopped || this.offline || (this.ws && this.ws.readyState <= WebSocket.OPEN)) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.on('open', () => this.emit({ type: 'hello', nodeId: this.id, fwVersion: 'sim-0.2.0', simulated: true }));
    ws.on('message', (data) => this.receive(data.toString()));
    ws.on('error', () => {});
    ws.on('close', () => {
      if (this.ws === ws) this.ws = null;
      if (!this.stopped && !this.offline) setTimeout(() => this.connect(), this.opts.reconnectMs ?? 1000);
    });
  }

  private emit(ev: DeviceEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(simEncodeEvent(ev));
  }

  private receive(text: string): void {
    const t2 = this.clock();
    const m = simDecodeInbound(text);
    if (!m) return;
    if (m.kind === 'clock_req') {
      if (!this.muteClock) this.emit({ type: 'clock_reply', seq: m.seq, t1: m.t1, t2, t3: this.clock() });
      return;
    }
    if (m.kind === 'reject') {
      // The coordinator refused this identity. Do not hammer it with reconnects.
      this.offline = true;
      return;
    }
    const error = this.apply(m.cmd);
    this.emit({ type: 'ack', messageId: m.message_id, ok: error === null, ...(error ? { error } : {}) });
  }

  // ---- commands -------------------------------------------------------------------------

  private apply(cmd: DeviceCommand): string | null {
    switch (cmd.name) {
      case 'stop':
        this.homing = false;
        this.target = this.pos;
        this.vel = 0;
        this.abortRun('stopped');
        return null;
      case 'clear_fault':
        this.fault = null;
        return null;
      case 'set_params':
        if (cmd.rpm !== undefined) this.rpm = cmd.rpm;
        if (cmd.accelMmS2 !== undefined) this.accel = cmd.accelMmS2;
        return null;
      case 'cancel':
        if (this.traj?.runId === cmd.runId) this.abortRun('cancelled');
        return null;
    }
    if (this.fault) return `fault ${this.fault}`;
    switch (cmd.name) {
      case 'home':
        this.abortRun('homing');
        this.homing = true;
        return null;
      case 'move':
        if (!this.homed) return 'not homed';
        if (cmd.targetMm < this.limitMin || cmd.targetMm > this.limitMax) return 'target outside limits';
        this.abortRun('manual move');
        this.target = cmd.targetMm;
        return null;
      case 'load_trajectory':
        if (!this.homed) return 'not homed';
        this.traj = { runId: cmd.runId, score: this.wrap(cmd.durationMs, cmd.keyframes), prepared: false, startAt: null, started: false };
        return null;
      case 'prepare':
        if (!this.traj || this.traj.runId !== cmd.runId) return 'no trajectory for this run';
        if (!this.homed) return 'not homed';
        this.traj.prepared = true;
        return null;
      case 'commit':
        if (!this.traj || this.traj.runId !== cmd.runId || !this.traj.prepared) return 'run not prepared';
        if (cmd.startAtNodeMs === undefined) return 'start time missing';
        if (cmd.startAtNodeMs <= this.clock()) return 'start time already passed';
        this.traj.startAt = cmd.startAtNodeMs;
        return null;
      case 'get_config':
        return null;
    }
  }

  private wrap(durationMs: number, keyframes: Keyframe[]): Score {
    return { schema: SCORE_SCHEMA, name: 'run', durationMs, loop: false, tracks: { [this.id]: keyframes } as Score['tracks'] };
  }

  private abortRun(reason: string): void {
    if (!this.traj) return;
    const active = this.traj.startAt !== null;
    const runId = this.traj.runId;
    this.traj = null;
    if (active) this.emit({ type: 'run_status', runId, state: 'aborted', reason });
  }

  // ---- motor model ----------------------------------------------------------------------

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000) * (this.opts.speedFactor ?? 1);
    this.lastTick = now;
    if (this.fault) {
      this.vel = 0;
      return;
    }
    const vmax = rpmToMmPerS(this.rpm);
    if (this.homing) {
      this.pos -= vmax * dt;
      if (this.pos <= 0) {
        this.pos = 0;
        this.vel = 0;
        this.target = 0;
        this.homing = false;
        this.homed = true;
      }
      return;
    }
    if (!this.homed) return;

    const tr = this.traj;
    if (tr && tr.startAt !== null) {
      const t = this.clock() - tr.startAt;
      if (t >= 0) {
        if (!tr.started) {
          tr.started = true;
          this.emit({ type: 'run_status', runId: tr.runId, state: 'running' });
        }
        this.target = Math.max(this.limitMin, Math.min(this.limitMax, positionAt(tr.score, this.id, t)));
        if (t >= tr.score.durationMs) {
          this.traj = null;
          this.emit({ type: 'run_status', runId: tr.runId, state: 'finished' });
        }
      }
    }
    const d = this.target - this.pos;
    const following = tr?.started === true;
    // Following a trajectory: track it, limited by top speed. Point moves: ramp with acceleration.
    const want = following ? Math.sign(d) * Math.min(vmax, Math.abs(d) / Math.max(dt, 1e-3)) : Math.sign(d) * Math.min(vmax, Math.sqrt(2 * this.accel * Math.abs(d)));
    const dv = following ? want - this.vel : Math.max(-this.accel * dt, Math.min(this.accel * dt, want - this.vel));
    this.vel += dv;
    const step = this.vel * dt;
    if (Math.abs(step) >= Math.abs(d)) {
      this.pos = this.target;
      this.vel = 0;
    } else {
      this.pos += step;
    }
  }

  private telemetry(): Telemetry {
    return {
      positionMm: this.homed ? Math.round(this.pos * 10) / 10 : null,
      targetMm: this.homed ? Math.round(this.target * 10) / 10 : null,
      homed: this.homed,
      homing: this.homing,
      moving: this.homing || Math.abs(this.vel) > 0.01 || Math.abs(this.target - this.pos) > 0.05,
      endstop: this.homed && this.pos <= 0.05,
      faultCode: this.fault,
      rssiDbm: -45 - ((this.id.charCodeAt(4) * 7) % 20),
      rpm: this.rpm,
      accelMmS2: this.accel,
      limitMinMm: this.limitMin,
      limitMaxMm: this.limitMax
    };
  }
}
