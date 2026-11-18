import {
  ACCEL_MAX_MM_S2, ACCEL_MIN_MM_S2, DEFAULT_TRAVEL_MAX_MM, DEFAULT_TRAVEL_MIN_MM, NODE_IDS, OPEN_INTENTS, RPM_MAX, RPM_MIN,
  clockReadyForCollective, newFirmwareRunId,
  positionAt, rpmToMmPerS, scoreFingerprint, scoreLoopCompatible, validateScore,
  type Intent, type LogEntry, type NodeId, type NodeLimits, type NodeOutcome, type RunState, type Score, type SimScenario, type Snapshot
} from '@swarm/shared';
import { monoNow } from './clock';
import type { Config } from './config';
import type { Codec, DeviceCommand, Telemetry } from './devices/protocol';
import { DeviceServer } from './devices/server';
import { DurableLog } from './durable-log';
import { Fleet } from './fleet';
import {
  COMPLETION_GRACE_MS,
  expectedRunDurationMs,
  resolveAutonomousMaxRuntimeMs,
  type AutonomousWatchOpts
} from './run-duration';

export interface IntentResult {
  ok: boolean;
  error?: string;
  outcomes?: NodeOutcome[];
}
export interface SimControl {
  scenario(name: SimScenario, node?: NodeId): void;
}

const ACTIVE = new Set<RunState['phase']>(['positioning', 'loading', 'preparing', 'committing', 'armed', 'running']);
const idleRun = (): RunState => ({
  phase: 'idle', runId: null, scoreName: null, scoreFingerprint: null, durationMs: 0, startAtMs: null,
  repeat: false, autonomous: false, autonomousLoop: false, pass: 0, error: null, perNode: {}
});
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Who/what requested a collective cancel+stop (distinct from the later command fan-out). */
type StopOrigin = {
  intentType: 'engageStop' | 'stopAll' | 'cancelRun' | 'stopNodes' | 'failRun' | 'reconnect';
  clientId?: string | null;
  initiator?: string;
};

const STOP_ACK_ATTEMPTS = 3;
const STOP_RETRY_GAP_MS = 150;
const STOP_VERIFY_MS = 2500;

function describeStopInitiator(ctx?: StopOrigin): string {
  if (ctx?.initiator) return ctx.initiator;
  const client = ctx?.clientId ?? 'unknown';
  switch (ctx?.intentType) {
    case 'engageStop':
      return `client:${client}:engageStop`;
    case 'stopAll':
      return `client:${client}:stopAll`;
    case 'cancelRun':
      return `client:${client}:cancelRun`;
    case 'stopNodes':
      return `client:${client}:stopNodes`;
    case 'failRun':
      return 'coordinator:failRun';
    case 'reconnect':
      return 'coordinator:reconnect_while_stop_engaged';
    default:
      return 'operator_or_stop';
  }
}

/**
 * Authoritative operational state while the Mac is running: who may command, whether the
 * software stop is engaged, what the nodes last reported and where a collective run stands.
 * It has no dependency on any browser being connected.
 */
export class Coordinator {
  readonly fleet = new Fleet();
  readonly device: DeviceServer;
  readonly codec: Codec;
  readonly durable: DurableLog;
  private log: LogEntry[] = [];
  private stop = { engaged: false, atMs: null as number | null };
  private run: RunState = idleRun();
  /** Last autonomous watch options (for disconnect/fault policy and expected end). */
  private runAuto: AutonomousWatchOpts = { autonomous: false, autonomousLoop: false, continuous: false };
  private expectedEndAtMs: number | null = null;
  /** True after Mac watch deadline without module completion — modules left alone. */
  private watchExpired = false;
  /** Modules participating in the current goToStart/execute (default: all nine). */
  private runNodes: NodeId[] = [...NODE_IDS];
  /** Incremented to abandon whatever asynchronous run flow is in progress. */
  private token = 0;
  private operator: string | null = null;
  private clients = new Set<string>();
  private monitor: NodeJS.Timeout | null = null;
  /** Serializes cancel/stop vs go-to-start so command floods cannot starve acknowledgments. */
  private fleetIo: Promise<void> = Promise.resolve();
  /** Last durable-logged completedPasses per node (bounded pass timeline). */
  private lastLoggedPasses = new Map<NodeId, number>();
  sim: SimControl | null = null;

  private enqueueFleetIo<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.fleetIo.then(fn, fn);
    this.fleetIo = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  constructor(private readonly cfg: Config, codec: Codec) {
    this.codec = codec;
    this.durable = new DurableLog(cfg.eventLogPath);
    this.device = new DeviceServer(codec, cfg, {
      onConnect: (node, info) => {
        const wasInRun = ACTIVE.has(this.run.phase) && this.run.perNode[node] === 'disconnected';
        this.fleet.connected(node, info);
        this.note('info', `${node} connected${info.simulated ? ' (simulated)' : ''}, firmware ${info.fwVersion}.`);
        this.durable.write({
          kind: wasInRun ? 'reconnect_reconcile' : 'connect',
          nodeId: node,
          runId: this.run.runId,
          message: `${node} connected (fw ${info.fwVersion})`,
          detail: { simulated: info.simulated, wasInRun, phase: this.run.phase }
        });
        if (wasInRun) {
          // Do not re-arm or replay. Wait for status / run_status from the module.
          this.run.perNode[node] = 'reconnected';
          this.note(
            'info',
            `${node} reconnected during autonomous run ${this.run.runId ?? '?'}; reconciling from module reports (no trajectory replay).`
          );
        }
        // Software stop latch: re-deliver STOP when a mute/stale node returns (does not restart trajectories).
        if (this.stop.engaged) {
          void this.enqueueFleetIo(async () => {
            try {
              await this.device.send(node, { name: 'stop' });
              this.note('info', `${node} STOP re-sent after reconnect (software stop still engaged).`);
              this.durable.write({
                kind: 'cancel_stop',
                nodeId: node,
                runId: this.run.runId,
                message: `${node} stop on reconnect while software stop engaged`,
                detail: {
                  initiator: describeStopInitiator({ intentType: 'reconnect' }),
                  intentType: 'reconnect'
                }
              });
            } catch (e) {
              this.note('warn', `${node} reconnect STOP failed: ${msg(e)}. Use physical power cut-off if it is still moving.`);
            }
          });
        }
        // Align the node's prepare_run gate with Mac clockMaxUncertaintyMs (runtime only, not NVS).
        if (this.cfg.fleet === 'hardware' && this.cfg.authToken) {
          const us = Math.round(this.cfg.clockMaxUncertaintyMs * 1000);
          setTimeout(() => {
            void this.device
              .send(node, { name: 'set_config', save: false, fields: { clock_uncertainty_max_us: us } })
              .then(() => this.note('info', `${node} clock gate set to ±${this.cfg.clockMaxUncertaintyMs} ms.`))
              .catch((e) =>
                this.note(
                  'warn',
                  `${node} could not set clock_uncertainty_max_us: ${e instanceof Error ? e.message : e}`
                )
              );
          }, 300);
        }
      },
      onDisconnect: (node) => {
        this.fleet.disconnected(node);
        this.note('warn', `${node} disconnected.`);
        this.durable.write({
          kind: 'disconnect',
          nodeId: node,
          runId: this.run.runId,
          message: `${node} disconnected`,
          detail: { phase: this.run.phase, autonomous: this.run.autonomous, autonomousStarted: this.autonomousStarted() }
        });
        if (!ACTIVE.has(this.run.phase)) return;
        // Autonomous playback already underway: firmware continues locally; do not fleet-cancel.
        if (this.autonomousStarted()) {
          this.run.perNode[node] = 'disconnected';
          this.note(
            'warn',
            `${node} link lost during autonomous run — fleet continues; module keeps its authorized trajectory if already started.`
          );
          return;
        }
        void this.failRun(`${node} disconnected during ${this.run.phase}.`, { initiator: 'coordinator:disconnect' });
      },
      onTelemetry: (node, t) => {
        const before = this.fleet.get(node).faultCode;
        this.fleet.telemetry(node, t, Date.now());
        this.maybeLogPassProgress(node, t);
        this.reconcileAutonomousTelemetry(node, t);
        if (t.faultCode && t.faultCode !== before) {
          this.note('error', `${node} reports fault ${t.faultCode}.`);
          this.durable.write({
            kind: 'fault',
            nodeId: node,
            runId: this.run.runId,
            message: `${node} firmware FAULT ${t.faultCode}`,
            detail: {
              fault: t.faultCode,
              phase: this.run.phase,
              positionValid: t.positionValid ?? null,
              loopIndex: t.loopIndex ?? null,
              completedPasses: t.completedPasses ?? null
            }
          });
          if (!ACTIVE.has(this.run.phase)) return;
          // Communication loss ≠ FAULT. A local fault stops that module only during autonomous runs.
          if (this.autonomousStarted()) {
            this.run.perNode[node] = 'faulted';
            this.note(
              'error',
              `${node} faulted (${t.faultCode}) during autonomous run — other modules are not cancelled.`
            );
            return;
          }
          void this.failRun(`${node} reported fault ${t.faultCode} during ${this.run.phase}.`, {
            initiator: 'coordinator:fault'
          });
        }
      },
      onRunStatus: (node, ev) => {
        if (ev.runId !== this.run.runId) return;
        if (ev.state === 'armed') {
          this.run.perNode[node] = 'armed';
          return;
        }
        this.run.perNode[node] = ev.state;
        if (ev.state === 'finished') {
          this.durable.write({
            kind: 'completion',
            nodeId: node,
            runId: ev.runId,
            message: `${node} reported run_completed`,
            detail: { state: ev.state, reason: ev.reason ?? null }
          });
        }
        if (ev.state === 'aborted' && ACTIVE.has(this.run.phase)) {
          if (this.autonomousStarted()) {
            this.run.perNode[node] = 'aborted';
            this.note('warn', `${node} aborted autonomous run${ev.reason ? `: ${ev.reason}` : ''} — fleet not cancelled.`);
            this.durable.write({
              kind: 'warn',
              nodeId: node,
              runId: ev.runId,
              message: `${node} aborted`,
              detail: { reason: ev.reason ?? null }
            });
            return;
          }
          void this.failRun(`${node} aborted the run${ev.reason ? `: ${ev.reason}` : ''}.`, {
            initiator: 'coordinator:abort'
          });
        }
      },
      onLog: (level, message) => this.note(level, message)
    });
  }

  /** True once an autonomous collective run has crossed the shared start time. */
  private autonomousStarted(): boolean {
    return this.run.autonomous === true && this.run.phase === 'running';
  }

  /** After reconnect, adopt module-reported run progress without replaying a trajectory. */
  private reconcileAutonomousTelemetry(node: NodeId, t: Telemetry): void {
    if (!this.run.autonomous || !this.run.runId || !ACTIVE.has(this.run.phase)) return;
    if (t.runId && t.runId !== this.run.runId) return;
    const prev = this.run.perNode[node];
    if (prev === 'disconnected' || prev === 'reconnected') {
      this.durable.write({
        kind: 'reconnect_reconcile',
        nodeId: node,
        runId: this.run.runId,
        message: `${node} status after reconnect`,
        detail: {
          runId: t.runId ?? null,
          loopIndex: t.loopIndex ?? null,
          completedPasses: t.completedPasses ?? null,
          positionValid: t.positionValid ?? null,
          autonomous: t.autonomous ?? null,
          fault: t.faultCode,
          moving: t.moving,
          homed: t.homed
        }
      });
      // One reconcile log per reconnect — do not re-log every subsequent status frame.
      if (!t.faultCode) {
        this.run.perNode[node] = t.moving || t.autonomous ? 'running' : prev === 'reconnected' ? 'running' : prev;
      }
    }
    if (t.faultCode) {
      this.run.perNode[node] = 'faulted';
      return;
    }
    if (t.completedPasses != null && t.completedPasses > 0 && !t.moving && t.positionValid) {
      // Heuristic for firmware status without a fresh run_completed event after offline finish.
      if (prev === 'reconnected' || prev === 'disconnected' || prev === 'running') {
        /* keep running until explicit finished unless we already have finished */
      }
    }
  }

  /**
   * Durable, bounded pass timeline: one JSONL event when completedPasses increases
   * (or first mid-run sighting). Does not flood on every status frame.
   */
  private maybeLogPassProgress(node: NodeId, t: Telemetry): void {
    const passes = t.completedPasses;
    if (passes == null || !Number.isFinite(passes)) return;
    const prev = this.lastLoggedPasses.get(node);
    if (prev === passes) return;
    this.lastLoggedPasses.set(node, passes);
    const increased = prev === undefined ? passes > 0 : passes > prev;
    const reset = prev !== undefined && passes < prev;
    if (!increased && !reset) return;
    this.durable.write({
      kind: 'pass',
      nodeId: node,
      runId: t.runId ?? this.run.runId,
      message: reset
        ? `${node} pass counter reset to ${passes}`
        : `${node} completedPasses=${passes}`,
      detail: {
        loopIndex: t.loopIndex ?? null,
        completedPasses: passes,
        moving: t.moving,
        positionMm: t.positionMm,
        autonomous: t.autonomous ?? null,
        positionValid: t.positionValid ?? null,
        loopBoundaryAction: t.loopBoundary?.action ?? null,
        segmentResult: t.loopBoundary?.segmentResult ?? null,
        reset
      }
    });
  }

  note(level: LogEntry['level'], message: string): void {
    if (!this.durable.accept(level, message)) return;
    const atMs = Date.now();
    this.log.push({ atMs, level, message });
    if (this.log.length > 200) this.log.shift();
    const line = `[${new Date(atMs).toISOString()}] ${level.toUpperCase()} ${message}`;
    if (level === 'error') console.error(line);
    else console.log(line);
  }

  // ---- browsers -------------------------------------------------------------------------

  clientJoined(id: string): void {
    this.clients.add(id);
  }
  clientLeft(id: string): void {
    this.clients.delete(id);
    if (this.operator === id) {
      this.operator = null;
      this.note('info', 'The controlling browser disconnected. Control is free. Motion in progress is not affected.');
    }
  }

  snapshot(clientId: string): Snapshot {
    const nodes = this.fleet.all().map((n) => ({ ...n, clock: n.connected ? this.device.clockStatus(n.id) : null }));
    return {
      fleet: this.cfg.fleet,
      serverTimeMs: monoNow(),
      wallTimeMs: Date.now(),
      nodes,
      stop: { ...this.stop },
      run: { ...this.run, perNode: { ...this.run.perNode } },
      operatorClientId: this.operator,
      clients: this.clients.size,
      you: { clientId, isOperator: this.operator === clientId },
      log: this.log.slice(-40)
    };
  }

  // ---- intents --------------------------------------------------------------------------

  async handle(clientId: string, intent: Intent): Promise<IntentResult> {
    if (!OPEN_INTENTS.has(intent.type) && this.operator !== clientId) {
      return { ok: false, error: this.operator ? 'Another browser holds control. You can still stop the installation.' : 'Take control before sending commands.' };
    }
    switch (intent.type) {
      case 'claimOperator':
        if (this.operator && this.operator !== clientId) return { ok: false, error: 'Another browser already holds control.' };
        this.operator = clientId;
        return { ok: true };
      case 'releaseOperator':
        if (this.operator === clientId) this.operator = null;
        return { ok: true };
      case 'engageStop':
        return this.engageStop(clientId);
      case 'releaseStop':
        this.stop = { engaged: false, atMs: null };
        this.note('info', 'Software stop released.');
        return { ok: true };
      case 'stopAll':
        return this.stopAll('Stop all requested.', { intentType: 'stopAll', clientId });
      case 'stopNodes':
        if (ACTIVE.has(this.run.phase)) {
          return this.stopAll('Stop requested during a run: all modules stopped.', {
            intentType: 'stopNodes',
            clientId
          });
        }
        return this.perNode(intent.nodes, () => null, { name: 'stop' });
      case 'home':
        return this.motion(intent.nodes, { name: 'home' }, (n) => (n.faultCode ? `has fault ${n.faultCode}; clear it first` : null));
      case 'move':
        return this.motion(intent.nodes, { name: 'move', targetMm: intent.targetMm }, (n) => {
          if (n.faultCode) return `has fault ${n.faultCode}`;
          if (!n.homed) return 'is not homed';
          if (n.limitMinMm === null || n.limitMaxMm === null) return 'has not reported its travel limits';
          if (intent.targetMm < n.limitMinMm || intent.targetMm > n.limitMaxMm) return `target is outside ${n.limitMinMm} to ${n.limitMaxMm} mm`;
          return null;
        });
      case 'setParams': {
        if (intent.rpm !== undefined && (intent.rpm < RPM_MIN || intent.rpm > RPM_MAX)) return { ok: false, error: `Speed must be ${RPM_MIN} to ${RPM_MAX} RPM.` };
        if (intent.accelMmS2 !== undefined && (intent.accelMmS2 < ACCEL_MIN_MM_S2 || intent.accelMmS2 > ACCEL_MAX_MM_S2)) return { ok: false, error: 'Acceleration is out of range.' };
        if (ACTIVE.has(this.run.phase)) return { ok: false, error: 'Parameters are locked while a run is in progress.' };
        return this.perNode(intent.nodes, () => null, { name: 'set_params', rpm: intent.rpm, accelMmS2: intent.accelMmS2 });
      }
      case 'clearFault':
        return this.clearFaults(intent.nodes);
      case 'goToStart':
        return this.goToStart(intent.score, intent.nodes);
      case 'execute':
        return this.execute(intent.score, {
          repeat: intent.repeat,
          autonomous: intent.autonomous === true,
          autonomousLoop: intent.autonomousLoop === true,
          continuous: intent.continuous === true,
          maxLoops: intent.maxLoops,
          maxRuntimeMs: intent.maxRuntimeMs,
          nodes: intent.nodes
        });
      case 'cancelRun':
        if (!ACTIVE.has(this.run.phase) && this.run.phase !== 'positioned') return { ok: false, error: 'No run to cancel.' };
        return this.stopAll('Run cancelled by the operator.', { intentType: 'cancelRun', clientId });
      case 'simScenario':
        if (this.cfg.fleet !== 'simulator' || !this.sim) return { ok: false, error: 'Scenarios exist only with simulated nodes.' };
        this.sim.scenario(intent.scenario, intent.node);
        this.note('info', `Simulator scenario: ${intent.scenario}${intent.node ? ` on ${intent.node}` : ''}.`);
        return { ok: true };
    }
  }

  /** Sends one command to several nodes and reports each node's real acknowledgment. */
  private async perNode(nodes: NodeId[], refuse: (n: ReturnType<Fleet['get']>) => string | null, cmd: DeviceCommand): Promise<IntentResult> {
    const outcomes = await Promise.all(
      nodes.map(async (node): Promise<NodeOutcome> => {
        const n = this.fleet.get(node);
        if (!n.connected) return { node, ok: false, error: 'is not connected' };
        const why = refuse(n);
        if (why) return { node, ok: false, error: why };
        try {
          await this.device.send(node, cmd);
          return { node, ok: true };
        } catch (e) {
          return { node, ok: false, error: msg(e) };
        }
      })
    );
    const failed = outcomes.filter((o) => !o.ok);
    const label = cmd.name === 'move' ? `move to ${cmd.targetMm} mm` : cmd.name.replace('_', ' ');
    if (failed.length) this.note('warn', `${label}: ${failed.map((o) => `${o.node} ${o.error}`).join('; ')}.`);
    const done = outcomes.filter((o) => o.ok).map((o) => o.node);
    if (done.length) this.note('info', `${label} acknowledged by ${done.join(', ')}.`);
    return failed.length ? { ok: false, error: failed.map((o) => `${o.node} ${o.error}`).join('; '), outcomes } : { ok: true, outcomes };
  }

  /**
   * clear_fault ACK alone is not recovery — firmware 0.3.5 could ACK while leaving a sticky
   * fault string. Success requires subsequent telemetry with no fault (FAULT → UNHOMED).
   */
  private async clearFaults(nodes: NodeId[]): Promise<IntentResult> {
    const outcomes = await Promise.all(
      nodes.map(async (node): Promise<NodeOutcome> => {
        const n = this.fleet.get(node);
        if (!n.connected) return { node, ok: false, error: 'is not connected' };
        try {
          await this.device.send(node, { name: 'clear_fault' });
        } catch (e) {
          return { node, ok: false, error: msg(e) };
        }
        const cleared = await this.waitUntil(() => !this.fleet.get(node).faultCode, 2000);
        if (!cleared) {
          return {
            node,
            ok: false,
            error: `acknowledged clear_fault but still reports fault ${this.fleet.get(node).faultCode ?? 'unknown'}`
          };
        }
        if (this.fleet.get(node).homed) {
          return { node, ok: false, error: 'cleared fault but still reports homed; expected UNHOMED' };
        }
        return { node, ok: true };
      })
    );
    const failed = outcomes.filter((o) => !o.ok);
    if (failed.length) {
      this.note('warn', `clear fault: ${failed.map((o) => `${o.node} ${o.error}`).join('; ')}.`);
    }
    const done = outcomes.filter((o) => o.ok).map((o) => o.node);
    if (done.length) {
      this.note('info', `clear fault confirmed (UNHOMED) on ${done.join(', ')}.`);
      this.durable.write({
        kind: 'info',
        message: `clear_fault confirmed`,
        detail: { nodes: done }
      });
    }
    return failed.length
      ? { ok: false, error: failed.map((o) => `${o.node} ${o.error}`).join('; '), outcomes }
      : { ok: true, outcomes };
  }

  private async waitUntil(pred: () => boolean, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    if (pred()) return true;
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 40));
      if (pred()) return true;
    }
    return pred();
  }

  private motion(nodes: NodeId[], cmd: DeviceCommand, refuse: (n: ReturnType<Fleet['get']>) => string | null): Promise<IntentResult> {
    if (this.stop.engaged) return Promise.resolve({ ok: false, error: 'Software stop is engaged. Release it first.' });
    if (ACTIVE.has(this.run.phase)) return Promise.resolve({ ok: false, error: 'A run is in progress. Stop it before moving modules by hand.' });
    // A manual move invalidates any earlier "at start position" state.
    if (this.run.phase === 'positioned') this.run = idleRun();
    return this.perNode(nodes, refuse, cmd);
  }

  // ---- stop -----------------------------------------------------------------------------

  private async stopAll(reason: string, origin?: StopOrigin): Promise<IntentResult> {
    return this.enqueueFleetIo(async () => {
      this.token++;
      const runId = this.run.runId;
      const stopWallMs = Date.now();
      const initiator = describeStopInitiator(origin);
      if (ACTIVE.has(this.run.phase) || this.run.phase === 'positioned') {
        this.run = { ...this.run, phase: 'cancelled', error: reason, startAtMs: null };
      }
      this.note('warn', reason);
      const connectedAtRequest = NODE_IDS.filter((id) => this.fleet.get(id).connected);
      this.durable.write({
        kind: 'cancel_stop',
        runId,
        message: reason,
        detail: {
          initiator,
          intentType: origin?.intentType ?? null,
          clientId: origin?.clientId ?? null,
          connected: connectedAtRequest
        }
      });

      // Collective STOP must account for every module — disconnected nodes are unconfirmed.
      const disconnected = NODE_IDS.filter((id) => !this.fleet.get(id).connected);
      const connected = NODE_IDS.filter((id) => this.fleet.get(id).connected);
      if (runId) {
        await Promise.allSettled(connected.map((id) => this.device.send(id, { name: 'cancel', runId })));
      }

      const ackByNode = new Map<NodeId, NodeOutcome>();
      for (const id of disconnected) {
        ackByNode.set(id, {
          node: id,
          ok: false,
          error: 'is not connected — cannot confirm software STOP'
        });
      }

      let pendingAck = [...connected];
      for (let attempt = 1; attempt <= STOP_ACK_ATTEMPTS && pendingAck.length > 0; attempt++) {
        if (attempt > 1) await sleep(STOP_RETRY_GAP_MS);
        const res = await this.perNode(pendingAck, () => null, { name: 'stop' });
        const next: NodeId[] = [];
        for (const o of res.outcomes ?? []) {
          if (o.ok) ackByNode.set(o.node, o);
          else {
            ackByNode.set(o.node, o);
            next.push(o.node);
          }
        }
        pendingAck = next.filter((id) => this.fleet.get(id).connected);
        if (pendingAck.length && attempt < STOP_ACK_ATTEMPTS) {
          this.note(
            'warn',
            `Stop ACK retry ${attempt}/${STOP_ACK_ATTEMPTS - 1} for ${pendingAck.join(', ')}.`
          );
        }
      }

      // Require fresh !moving telemetry after the stop was issued — ACK alone is not enough.
      const outcomes = await Promise.all(
        NODE_IDS.map(async (id): Promise<NodeOutcome> => {
          const ack = ackByNode.get(id)!;
          if (!ack.ok) return ack;
          const stopped = await this.waitUntil(() => {
            const n = this.fleet.get(id);
            if (!n.connected) return false;
            if (n.moving || n.homing) return false;
            if (n.lastTelemetryAtMs == null || n.lastTelemetryAtMs < stopWallMs) return false;
            return true;
          }, STOP_VERIFY_MS);
          if (stopped) return { node: id, ok: true };
          const n = this.fleet.get(id);
          const why = !n.connected
            ? 'acknowledged stop then disconnected before stopped telemetry'
            : n.moving || n.homing
              ? 'acknowledged stop but still reports moving'
              : 'acknowledged stop but no fresh stopped telemetry';
          return { node: id, ok: false, error: why };
        })
      );

      const failed = outcomes.filter((o) => !o.ok);
      this.durable.write({
        kind: 'cancel_stop',
        runId,
        message: failed.length
          ? `Stop confirmation incomplete (${NODE_IDS.length - failed.length}/${NODE_IDS.length})`
          : `Stop confirmed on all ${NODE_IDS.length} modules`,
        detail: {
          initiator,
          intentType: origin?.intentType ?? null,
          clientId: origin?.clientId ?? null,
          confirmed: outcomes.filter((o) => o.ok).map((o) => o.node),
          unconfirmed: failed.map((o) => ({ node: o.node, error: o.error })),
          attempts: STOP_ACK_ATTEMPTS,
          verifyMs: STOP_VERIFY_MS
        }
      });

      if (failed.length) {
        this.note(
          'error',
          `Stop was NOT confirmed by: ${failed.map((o) => `${o.node} (${o.error})`).join('; ')}. Use the physical power cut-off if they are moving.`
        );
        return {
          ok: false,
          error: `Stop was NOT confirmed by: ${failed.map((o) => o.node).join(', ')}. Use the physical power cut-off if they are moving.`,
          outcomes
        };
      }
      this.note('info', `Stop confirmed (ACK + fresh idle telemetry) on ${NODE_IDS.join(', ')}.`);
      return { ok: true, outcomes };
    });
  }

  private async engageStop(clientId?: string): Promise<IntentResult> {
    this.stop = { engaged: true, atMs: Date.now() };
    return this.stopAll('Software stop engaged.', { intentType: 'engageStop', clientId: clientId ?? null });
  }

  // ---- collective run -------------------------------------------------------------------

  private limits(): Record<NodeId, NodeLimits> {
    const out = {} as Record<NodeId, NodeLimits>;
    for (const id of NODE_IDS) {
      const n = this.fleet.get(id);
      out[id] = { minMm: n.limitMinMm ?? DEFAULT_TRAVEL_MIN_MM, maxMm: n.limitMaxMm ?? DEFAULT_TRAVEL_MAX_MM, maxSpeedMmS: rpmToMmPerS(n.rpm ?? RPM_MIN) };
    }
    return out;
  }

  /** Reasons selected modules cannot take part, or [] when they can. */
  readiness(needSync: boolean, nodes: readonly NodeId[] = NODE_IDS): string[] {
    const out: string[] = [];
    if (this.stop.engaged) out.push('Software stop is engaged.');
    for (const id of nodes) {
      const n = this.fleet.get(id);
      if (!n.connected) out.push(`${id} is not connected.`);
      else if (n.faultCode) out.push(`${id} has fault ${n.faultCode}.`);
      else if (!n.homed) out.push(`${id} is not homed.`);
      else if (needSync) {
        const view = { ...n, clock: this.device.clockStatus(id) };
        if (!clockReadyForCollective(view, this.cfg.fleet)) out.push(`${id} clock is not synchronised.`);
      }
    }
    return out;
  }

  private checkScore(score: Score): string | null {
    const v = validateScore(score, this.limits());
    return v.ok ? null : v.issues[0].message;
  }

  private async goToStart(score: Score, nodes?: NodeId[]): Promise<IntentResult> {
    return this.enqueueFleetIo(async () => {
      // After any in-flight cancel/stop (serialized), re-check readiness.
      // Stop / connectivity / faults must win over score-speed messaging (engageStop
      // may also clamp RPM, which would otherwise surface as a misleading speed error).
      if (ACTIVE.has(this.run.phase)) return { ok: false, error: 'A run is already in progress.' };
      const targets = nodes && nodes.length ? nodes : [...NODE_IDS];
      const again = this.readiness(false, targets);
      if (again.length) return { ok: false, error: again.join(' ') };
      const bad = this.checkScore(score);
      if (bad) return { ok: false, error: bad };

      const token = ++this.token;
      this.runNodes = targets;
      this.run = {
        ...idleRun(),
        phase: 'positioning',
        scoreName: score.name,
        scoreFingerprint: scoreFingerprint(score),
        durationMs: score.durationMs
      };
      this.note(
        'info',
        targets.length === NODE_IDS.length
          ? `Moving all modules to the start of ${score.name}.`
          : `Moving ${targets.join(', ')} to the start of ${score.name} (subset run).`
      );
      this.durable.write({
        kind: 'info',
        message: `goToStart ${score.name}`,
        detail: { score: score.name, fingerprint: scoreFingerprint(score), nodes: targets }
      });
      const results = await Promise.all(
        targets.map(async (id) => {
          try {
            await this.device.send(id, { name: 'move', targetMm: positionAt(score, id, 0) });
            this.run.perNode[id] = 'moving to start';
            return null;
          } catch (e) {
            return `${id} ${msg(e)}`;
          }
        })
      );
      if (token !== this.token) return { ok: false, error: 'Cancelled.' };
      const failed = results.filter((r): r is string => r !== null);
      if (failed.length) {
        await this.failRun(`Go to start was not accepted: ${failed.join('; ')}.`, {
          initiator: 'coordinator:goToStart'
        });
        return { ok: false, error: this.run.error ?? 'Go to start failed.' };
      }
      void this.awaitPositioned(score, token, targets);
      return { ok: true };
    });
  }

  private atStart(score: Score, id: NodeId): boolean {
    const n = this.fleet.get(id);
    return n.positionMm !== null && !n.moving && Math.abs(n.positionMm - positionAt(score, id, 0)) <= this.cfg.positionToleranceMm;
  }

  private async awaitPositioned(score: Score, token: number, nodes: readonly NodeId[]): Promise<void> {
    const lim = this.limits();
    let worst = 0;
    for (const id of nodes) {
      const n = this.fleet.get(id);
      worst = Math.max(worst, Math.abs((n.positionMm ?? 0) - positionAt(score, id, 0)) / lim[id].maxSpeedMmS);
    }
    const deadline = monoNow() + worst * 1500 + 8000;
    while (token === this.token) {
      for (const id of nodes) if (this.atStart(score, id)) this.run.perNode[id] = 'at start';
      if (nodes.every((id) => this.atStart(score, id))) {
        this.run.phase = 'positioned';
        this.note(
          'info',
          nodes.length === NODE_IDS.length
            ? `All modules report their start positions for ${score.name}.`
            : `${nodes.join(', ')} report start positions for ${score.name}.`
        );
        // Motion bursts can stall clock exchanges; drive the sync protocol while idle at start.
        void this.awaitClocksReady(8_000, nodes).then((blockers) => {
          if (token !== this.token) return;
          if (blockers.length === 0) this.note('info', 'Clocks re-synchronised after go-to-start.');
          else this.note('warn', `Clocks still catching up after go-to-start: ${blockers.join(' ')}`);
        });
        return;
      }
      if (monoNow() > deadline) {
        const late = nodes.filter((id) => !this.atStart(score, id));
        await this.failRun(`Start positions were not reached in time by ${late.join(', ')}.`);
        return;
      }
      await sleep(100);
    }
  }

  /** Drive the existing clock_sync protocol until selected modules are ready for prepare_run. */
  private async awaitClocksReady(timeoutMs = 12_000, nodes: readonly NodeId[] = this.runNodes): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    let last = this.readiness(true, nodes);
    while (Date.now() < deadline) {
      last = this.readiness(true, nodes);
      const clockOnly = last.filter((b) => b.includes('clock is not synchronised'));
      const other = last.filter((b) => !b.includes('clock is not synchronised'));
      if (other.length) return last;
      if (clockOnly.length === 0) return [];
      this.device.nudgeClocks((id) => {
        if (!nodes.includes(id)) return false;
        const n = this.fleet.get(id);
        const view = { ...n, clock: this.device.clockStatus(id) };
        return !clockReadyForCollective(view, this.cfg.fleet);
      });
      await sleep(200);
    }
    return last.length ? last : this.readiness(true, nodes);
  }

  private async execute(
    score: Score,
    opts: {
      repeat: boolean;
      autonomous: boolean;
      autonomousLoop: boolean;
      continuous: boolean;
      maxLoops?: number;
      maxRuntimeMs?: number;
      nodes?: NodeId[];
    }
  ): Promise<IntentResult> {
    if (this.run.phase !== 'positioned' || this.run.scoreFingerprint !== scoreFingerprint(score)) {
      return { ok: false, error: 'Move the modules to the start of this score first (Go to start). The score has changed or was never positioned.' };
    }
    if (opts.nodes && opts.nodes.length) {
      const same =
        opts.nodes.length === this.runNodes.length && opts.nodes.every((id) => this.runNodes.includes(id));
      if (!same) {
        return {
          ok: false,
          error: `Execute nodes must match goToStart subset (${this.runNodes.join(', ')}).`
        };
      }
    }
    this.note('info', 'Driving clock synchronisation before arming…');
    const blockers = await this.awaitClocksReady(12_000, this.runNodes);
    if (blockers.length) return { ok: false, error: blockers.join(' ') };
    const away = this.runNodes.filter((id) => !this.atStart(score, id));
    if (away.length) return { ok: false, error: `${away.join(', ')} moved away from the start position. Go to start again.` };
    const bad = this.checkScore(score);
    if (bad) return { ok: false, error: bad };
    if (opts.autonomous && opts.autonomousLoop && !scoreLoopCompatible(score)) {
      return { ok: false, error: 'This score is not loop-compatible for autonomous playback (first and last positions must match within 1 mm).' };
    }
    const token = ++this.token;
    // Autonomous runs loop on the modules; the Mac must not re-arm.
    const repeat = opts.autonomous ? false : opts.repeat;
    this.run = {
      ...this.run,
      repeat,
      autonomous: opts.autonomous,
      autonomousLoop: opts.autonomous && opts.autonomousLoop,
      pass: 0
    };
    const err = await this.startPass(score, token, opts);
    return err ? { ok: false, error: err } : { ok: true };
  }

  /** load, prepare, commit. Returns an error string, or null once every node has confirmed it is armed. */
  private async startPass(
    score: Score,
    token: number,
    auto: {
      autonomous: boolean;
      autonomousLoop: boolean;
      continuous: boolean;
      maxLoops?: number;
      maxRuntimeMs?: number;
    } = { autonomous: false, autonomousLoop: false, continuous: false }
  ): Promise<string | null> {
    // Firmware rejects strlen(run_id) >= 32 ("invalid run_id"); dashed UUIDs are 36 chars.
    const runId = newFirmwareRunId();
    this.lastLoggedPasses.clear();
    this.run = { ...this.run, runId, phase: 'loading', pass: this.run.pass + 1, startAtMs: null, error: null, perNode: {} };
    const participants = this.runNodes;
    const stage = async (phase: RunState['phase'], done: string, make: (id: NodeId) => DeviceCommand | null): Promise<string | null> => {
      if (token !== this.token) return 'Cancelled.';
      this.run.phase = phase;
      const res = await Promise.all(
        participants.map(async (id) => {
          const cmd = make(id);
          if (!cmd) return `${id} has no clock estimate`;
          try {
            await this.device.send(id, cmd);
            this.run.perNode[id] = done;
            return null;
          } catch (e) {
            return `${id} ${msg(e)}`;
          }
        })
      );
      if (token !== this.token) return 'Cancelled.';
      const failed = res.filter((r): r is string => r !== null);
      return failed.length ? `${phase} failed: ${failed.join('; ')}.` : null;
    };

    let err = await stage('loading', 'trajectory loaded', (id) => ({
      name: 'load_trajectory',
      runId,
      durationMs: score.durationMs,
      keyframes: score.tracks[id],
      presetId: score.name
    }));
    // Continuous with unset runtime → shared 12 h ceiling (firmware normalizeAutonomousPolicy).
    const preparedMaxRuntimeMs = auto.autonomous ? resolveAutonomousMaxRuntimeMs(auto) : undefined;
    const preparedAuto: AutonomousWatchOpts = {
      ...auto,
      maxRuntimeMs: preparedMaxRuntimeMs
    };
    err ??= await stage('preparing', 'ready', () => ({
      name: 'prepare',
      runId,
      autonomous: preparedAuto.autonomous,
      loop: preparedAuto.autonomous && preparedAuto.autonomousLoop,
      continuous: preparedAuto.autonomous && preparedAuto.continuous,
      maxLoops: preparedAuto.autonomous ? preparedAuto.maxLoops : undefined,
      maxRuntimeMs: preparedMaxRuntimeMs
    }));
    let startAt = 0;
    if (!err) {
      startAt = monoNow() + this.cfg.startLeadMs;
      if (this.codec.speaksFirmware) {
        const startAtCoordUs = Math.round(startAt * 1000);
        err = await stage('committing', 'armed', () => ({ name: 'commit', runId, startAtCoordUs }));
      } else {
        err = await stage('committing', 'armed', (id) => {
          const t = this.device.toNodeTime(id, startAt);
          return t === null ? null : { name: 'commit', runId, startAtNodeMs: t };
        });
      }
    }
    if (!err && monoNow() >= startAt) err = 'Arming took longer than the start lead time.';
    if (err) {
      if (err !== 'Cancelled.') await this.failRun(err);
      return err;
    }
    this.run.phase = 'armed';
    this.run.startAtMs = startAt;
    this.watchExpired = false;
    this.runAuto = preparedAuto;
    const expectedMs = expectedRunDurationMs(score.durationMs, preparedAuto);
    this.expectedEndAtMs = startAt + expectedMs;
    const who =
      participants.length === NODE_IDS.length ? 'nine modules' : participants.join(', ');
    this.note(
      'info',
      auto.autonomous
        ? `${score.name} armed AUTONOMOUS on ${who}. Mac may disconnect after start; modules continue locally.`
        : this.codec.speaksFirmware
          ? `${score.name} armed on ${who}, pass ${this.run.pass}. Shared start_at_us=${Math.round(startAt * 1000)}.`
          : `${score.name} armed on ${who}, pass ${this.run.pass}. Each module starts from its own clock.`
    );
    this.durable.write({
      kind: 'run_start',
      runId,
      message: `${score.name} armed`,
      detail: {
        score: score.name,
        durationMs: score.durationMs,
        startAtMs: startAt,
        expectedEndAtMs: this.expectedEndAtMs,
        nodes: participants,
        autonomous: preparedAuto.autonomous,
        autonomousLoop: preparedAuto.autonomousLoop,
        continuous: preparedAuto.continuous,
        maxLoops: preparedAuto.maxLoops ?? null,
        maxRuntimeMs: preparedMaxRuntimeMs ?? null,
        pass: this.run.pass
      }
    });
    this.durable.write({
      kind: 'run_expected_end',
      runId,
      message: `Expected completion window ends at +${expectedMs + COMPLETION_GRACE_MS}ms from start (incl. grace)`,
      detail: { expectedMs, graceMs: COMPLETION_GRACE_MS, expectedEndAtMs: this.expectedEndAtMs }
    });
    this.watch(score, token, startAt, preparedAuto);
    return null;
  }

  /** Node has finished, faulted, or aborted — no longer expected to report finished. */
  private nodeSettled(id: NodeId): boolean {
    const s = this.run.perNode[id];
    return s === 'finished' || s === 'faulted' || s === 'aborted';
  }

  private watch(score: Score, token: number, startAt: number, auto: AutonomousWatchOpts): void {
    if (this.monitor) clearInterval(this.monitor);
    // Autonomous multi-loop runs last score.durationMs × maxLoops (or maxRuntimeMs / continuous ceiling).
    const expectedMs = expectedRunDurationMs(score.durationMs, auto);
    const participants = this.runNodes;
    this.monitor = setInterval(() => {
      if (token !== this.token) {
        clearInterval(this.monitor!);
        return;
      }
      const now = monoNow();
      if (this.run.phase === 'armed' && now >= startAt) {
        this.run.phase = 'running';
        this.durable.write({
          kind: 'run_phase',
          runId: this.run.runId,
          message: `${score.name} phase → running`,
          detail: { startAtMs: startAt }
        });
      }

      if (auto.autonomous && this.run.phase === 'running') {
        // Disconnected modules may still be playing locally; do not require them for Mac-side success.
        const away = participants.filter((id) => this.run.perNode[id] === 'disconnected');
        const tracked = participants.filter((id) => this.run.perNode[id] !== 'disconnected');
        const trackedSettled = tracked.length > 0 && tracked.every((id) => this.nodeSettled(id));
        if (trackedSettled && away.length === 0) {
          clearInterval(this.monitor!);
          this.run.phase = 'finished';
          const anyFault = tracked.some((id) => this.run.perNode[id] === 'faulted' || this.run.perNode[id] === 'aborted');
          this.note(
            'info',
            anyFault
              ? `${score.name} finished on Mac (some modules faulted/aborted locally; fleet was not cancelled).`
              : `${score.name} finished. ${participants.length === NODE_IDS.length ? 'All nine modules' : participants.join(', ')} confirmed completion.`
          );
          this.durable.write({
            kind: 'run_complete',
            runId: this.run.runId,
            message: `${score.name} finished`,
            detail: { perNode: { ...this.run.perNode }, anyFault, nodes: participants }
          });
          return;
        }
        if (now > startAt + expectedMs + COMPLETION_GRACE_MS) {
          const missingConnected = participants.filter(
            (id) => this.fleet.get(id).connected && this.run.perNode[id] !== 'disconnected' && !this.nodeSettled(id)
          );
          if (missingConnected.length === 0) {
            clearInterval(this.monitor!);
            this.run.phase = 'finished';
            this.note(
              'warn',
              `${score.name} Mac watch ended: connected modules settled; still disconnected: ${away.join(', ') || 'none'}. Not stopping the fleet.`
            );
            this.durable.write({
              kind: 'run_complete',
              runId: this.run.runId,
              message: `${score.name} watch ended without fleet stop`,
              detail: { away, perNode: { ...this.run.perNode } }
            });
            return;
          }
          // 0.3.8: never cancel/stop healthy autonomous modules because the Mac watch expired.
          // Firmware owns the runtime bound; wait for run_completed / operator STOP.
          if (!this.watchExpired) {
            this.watchExpired = true;
            this.note(
              'warn',
              `${score.name} Mac completion watch expired; modules still active (${missingConnected.join(', ')}). Not issuing cancel/stop — waiting for local completion or operator Stop.`
            );
            this.durable.write({
              kind: 'run_watch_expired',
              runId: this.run.runId,
              message: `${score.name} watch expired without cancel/stop`,
              detail: {
                missingConnected,
                away,
                expectedMs,
                graceMs: COMPLETION_GRACE_MS,
                perNode: { ...this.run.perNode }
              }
            });
          }
        }
        return;
      }

      const finished = participants.every((id) => this.run.perNode[id] === 'finished');
      if (finished) {
        clearInterval(this.monitor!);
        if (this.run.repeat && !this.run.autonomous) {
          void this.startPass(score, token, { autonomous: false, autonomousLoop: false, continuous: false });
        } else {
          this.run.phase = 'finished';
          this.note(
            'info',
            `${score.name} finished. ${participants.length === NODE_IDS.length ? 'All nine modules' : participants.join(', ')} confirmed completion.`
          );
          this.durable.write({
            kind: 'run_complete',
            runId: this.run.runId,
            message: `${score.name} finished`,
            detail: { perNode: { ...this.run.perNode }, nodes: participants }
          });
        }
      } else if (now > startAt + expectedMs + COMPLETION_GRACE_MS) {
        clearInterval(this.monitor!);
        const missing = participants.filter((id) => this.run.perNode[id] !== 'finished');
        void this.failRun(`Completion was not confirmed by ${missing.join(', ')}.`, {
          initiator: 'coordinator:completion_watch'
        });
      }
    }, 50);
  }

  /** Abandons the run, records why, and asks every connected node to cancel and stop. */
  private async failRun(reason: string, opts?: { initiator?: string }): Promise<void> {
    if (!ACTIVE.has(this.run.phase)) return;
    this.token++;
    const runId = this.run.runId;
    const initiator = opts?.initiator ?? 'coordinator:failRun';
    this.run = { ...this.run, phase: 'failed', error: reason, startAtMs: null };
    this.note('error', `Run failed: ${reason} Stopping all modules.`);
    this.durable.write({
      kind: 'run_failed',
      runId,
      message: reason,
      detail: { initiator, stopping: true }
    });
    this.durable.write({
      kind: 'cancel_stop',
      runId,
      message: `cancel+stop after failRun: ${reason}`,
      detail: { initiator }
    });
    const connected = NODE_IDS.filter((id) => this.fleet.get(id).connected);
    if (runId) await Promise.allSettled(connected.map((id) => this.device.send(id, { name: 'cancel', runId })));
    const res = await Promise.allSettled(connected.map((id) => this.device.send(id, { name: 'stop' })));
    const silent = connected.filter((_, i) => res[i].status === 'rejected');
    if (silent.length) this.note('error', `Stop was NOT confirmed by ${silent.join(', ')}.`);
  }

  close(): void {
    this.token++;
    if (this.monitor) clearInterval(this.monitor);
    this.device.close();
  }
}
