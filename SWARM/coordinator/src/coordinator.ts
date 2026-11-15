import {
  ACCEL_MAX_MM_S2, ACCEL_MIN_MM_S2, DEFAULT_TRAVEL_MAX_MM, DEFAULT_TRAVEL_MIN_MM, NODE_IDS, OPEN_INTENTS, RPM_MAX, RPM_MIN,
  clockReadyForCollective, newFirmwareRunId,
  positionAt, rpmToMmPerS, scoreFingerprint, scoreLoopCompatible, validateScore,
  type Intent, type LogEntry, type NodeId, type NodeLimits, type NodeOutcome, type RunState, type Score, type SimScenario, type Snapshot
} from '@swarm/shared';
import { monoNow } from './clock';
import type { Config } from './config';
import type { Codec, DeviceCommand } from './devices/protocol';
import { DeviceServer } from './devices/server';
import { Fleet } from './fleet';
import { COMPLETION_GRACE_MS, expectedRunDurationMs, type AutonomousWatchOpts } from './run-duration';

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

/**
 * Authoritative operational state while the Mac is running: who may command, whether the
 * software stop is engaged, what the nodes last reported and where a collective run stands.
 * It has no dependency on any browser being connected.
 */
export class Coordinator {
  readonly fleet = new Fleet();
  readonly device: DeviceServer;
  readonly codec: Codec;
  private log: LogEntry[] = [];
  private stop = { engaged: false, atMs: null as number | null };
  private run: RunState = idleRun();
  /** Incremented to abandon whatever asynchronous run flow is in progress. */
  private token = 0;
  private operator: string | null = null;
  private clients = new Set<string>();
  private monitor: NodeJS.Timeout | null = null;
  sim: SimControl | null = null;

  constructor(private readonly cfg: Config, codec: Codec) {
    this.codec = codec;
    this.device = new DeviceServer(codec, cfg, {
      onConnect: (node, info) => {
        this.fleet.connected(node, info);
        this.note('info', `${node} connected${info.simulated ? ' (simulated)' : ''}, firmware ${info.fwVersion}.`);
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
        if (ACTIVE.has(this.run.phase)) void this.failRun(`${node} disconnected during ${this.run.phase}.`);
      },
      onTelemetry: (node, t) => {
        const before = this.fleet.get(node).faultCode;
        this.fleet.telemetry(node, t, Date.now());
        if (t.faultCode && t.faultCode !== before) {
          this.note('error', `${node} reports fault ${t.faultCode}.`);
          if (ACTIVE.has(this.run.phase)) void this.failRun(`${node} reported fault ${t.faultCode} during ${this.run.phase}.`);
        }
      },
      onRunStatus: (node, ev) => {
        if (ev.runId !== this.run.runId) return;
        if (ev.state === 'armed') {
          this.run.perNode[node] = 'armed';
          return;
        }
        this.run.perNode[node] = ev.state;
        if (ev.state === 'aborted' && ACTIVE.has(this.run.phase)) void this.failRun(`${node} aborted the run${ev.reason ? `: ${ev.reason}` : ''}.`);
      },
      onLog: (level, message) => this.note(level, message)
    });
  }

  note(level: LogEntry['level'], message: string): void {
    this.log.push({ atMs: Date.now(), level, message });
    if (this.log.length > 200) this.log.shift();
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
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
        return this.engageStop();
      case 'releaseStop':
        this.stop = { engaged: false, atMs: null };
        this.note('info', 'Software stop released.');
        return { ok: true };
      case 'stopAll':
        return this.stopAll('Stop all requested.');
      case 'stopNodes':
        if (ACTIVE.has(this.run.phase)) return this.stopAll('Stop requested during a run: all modules stopped.');
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
        return this.perNode(intent.nodes, () => null, { name: 'clear_fault' });
      case 'goToStart':
        return this.goToStart(intent.score);
      case 'execute':
        return this.execute(intent.score, {
          repeat: intent.repeat,
          autonomous: intent.autonomous === true,
          autonomousLoop: intent.autonomousLoop === true,
          continuous: intent.continuous === true,
          maxLoops: intent.maxLoops,
          maxRuntimeMs: intent.maxRuntimeMs
        });
      case 'cancelRun':
        if (!ACTIVE.has(this.run.phase) && this.run.phase !== 'positioned') return { ok: false, error: 'No run to cancel.' };
        return this.stopAll('Run cancelled by the operator.');
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

  private motion(nodes: NodeId[], cmd: DeviceCommand, refuse: (n: ReturnType<Fleet['get']>) => string | null): Promise<IntentResult> {
    if (this.stop.engaged) return Promise.resolve({ ok: false, error: 'Software stop is engaged. Release it first.' });
    if (ACTIVE.has(this.run.phase)) return Promise.resolve({ ok: false, error: 'A run is in progress. Stop it before moving modules by hand.' });
    // A manual move invalidates any earlier "at start position" state.
    if (this.run.phase === 'positioned') this.run = idleRun();
    return this.perNode(nodes, refuse, cmd);
  }

  // ---- stop -----------------------------------------------------------------------------

  private async stopAll(reason: string): Promise<IntentResult> {
    this.token++;
    const runId = this.run.runId;
    if (ACTIVE.has(this.run.phase) || this.run.phase === 'positioned') {
      this.run = { ...this.run, phase: 'cancelled', error: reason, startAtMs: null };
    }
    this.note('warn', reason);
    const connected = NODE_IDS.filter((id) => this.fleet.get(id).connected);
    if (runId) await Promise.allSettled(connected.map((id) => this.device.send(id, { name: 'cancel', runId })));
    if (connected.length === 0) return { ok: true, outcomes: [] };
    const res = await this.perNode(connected, () => null, { name: 'stop' });
    return res.ok ? res : { ...res, error: `Stop was NOT confirmed by: ${res.outcomes!.filter((o) => !o.ok).map((o) => o.node).join(', ')}. Use the physical power cut-off if they are moving.` };
  }

  private async engageStop(): Promise<IntentResult> {
    this.stop = { engaged: true, atMs: Date.now() };
    return this.stopAll('Software stop engaged.');
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

  /** Reasons the fleet cannot take part in a collective operation, or [] when it can. */
  readiness(needSync: boolean): string[] {
    const out: string[] = [];
    if (this.stop.engaged) out.push('Software stop is engaged.');
    for (const id of NODE_IDS) {
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

  private async goToStart(score: Score): Promise<IntentResult> {
    if (ACTIVE.has(this.run.phase)) return { ok: false, error: 'A run is already in progress.' };
    const blockers = this.readiness(false);
    if (blockers.length) return { ok: false, error: blockers.join(' ') };
    const bad = this.checkScore(score);
    if (bad) return { ok: false, error: bad };

    const token = ++this.token;
    this.run = { ...idleRun(), phase: 'positioning', scoreName: score.name, scoreFingerprint: scoreFingerprint(score), durationMs: score.durationMs };
    this.note('info', `Moving all modules to the start of ${score.name}.`);
    const results = await Promise.all(
      NODE_IDS.map(async (id) => {
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
      await this.failRun(`Go to start was not accepted: ${failed.join('; ')}.`);
      return { ok: false, error: this.run.error ?? 'Go to start failed.' };
    }
    void this.awaitPositioned(score, token);
    return { ok: true };
  }

  private atStart(score: Score, id: NodeId): boolean {
    const n = this.fleet.get(id);
    return n.positionMm !== null && !n.moving && Math.abs(n.positionMm - positionAt(score, id, 0)) <= this.cfg.positionToleranceMm;
  }

  private async awaitPositioned(score: Score, token: number): Promise<void> {
    const lim = this.limits();
    let worst = 0;
    for (const id of NODE_IDS) {
      const n = this.fleet.get(id);
      worst = Math.max(worst, Math.abs((n.positionMm ?? 0) - positionAt(score, id, 0)) / lim[id].maxSpeedMmS);
    }
    const deadline = monoNow() + worst * 1500 + 8000;
    while (token === this.token) {
      for (const id of NODE_IDS) if (this.atStart(score, id)) this.run.perNode[id] = 'at start';
      if (NODE_IDS.every((id) => this.atStart(score, id))) {
        this.run.phase = 'positioned';
        this.note('info', `All modules report their start positions for ${score.name}.`);
        // Motion bursts can stall clock exchanges; drive the sync protocol while idle at start.
        void this.awaitClocksReady(8_000).then((blockers) => {
          if (token !== this.token) return;
          if (blockers.length === 0) this.note('info', 'Clocks re-synchronised after go-to-start.');
          else this.note('warn', `Clocks still catching up after go-to-start: ${blockers.join(' ')}`);
        });
        return;
      }
      if (monoNow() > deadline) {
        const late = NODE_IDS.filter((id) => !this.atStart(score, id));
        await this.failRun(`Start positions were not reached in time by ${late.join(', ')}.`);
        return;
      }
      await sleep(100);
    }
  }

  /** Drive the existing clock_sync protocol until every module is ready for prepare_run. */
  private async awaitClocksReady(timeoutMs = 12_000): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    let last = this.readiness(true);
    while (Date.now() < deadline) {
      last = this.readiness(true);
      const clockOnly = last.filter((b) => b.includes('clock is not synchronised'));
      const other = last.filter((b) => !b.includes('clock is not synchronised'));
      if (other.length) return last;
      if (clockOnly.length === 0) return [];
      this.device.nudgeClocks((id) => {
        const n = this.fleet.get(id);
        const view = { ...n, clock: this.device.clockStatus(id) };
        return !clockReadyForCollective(view, this.cfg.fleet);
      });
      await sleep(200);
    }
    return last.length ? last : this.readiness(true);
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
    }
  ): Promise<IntentResult> {
    if (this.run.phase !== 'positioned' || this.run.scoreFingerprint !== scoreFingerprint(score)) {
      return { ok: false, error: 'Move the modules to the start of this score first (Go to start). The score has changed or was never positioned.' };
    }
    this.note('info', 'Driving clock synchronisation before arming…');
    const blockers = await this.awaitClocksReady();
    if (blockers.length) return { ok: false, error: blockers.join(' ') };
    const away = NODE_IDS.filter((id) => !this.atStart(score, id));
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
    this.run = { ...this.run, runId, phase: 'loading', pass: this.run.pass + 1, startAtMs: null, error: null, perNode: {} };
    const stage = async (phase: RunState['phase'], done: string, make: (id: NodeId) => DeviceCommand | null): Promise<string | null> => {
      if (token !== this.token) return 'Cancelled.';
      this.run.phase = phase;
      const res = await Promise.all(
        NODE_IDS.map(async (id) => {
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
    err ??= await stage('preparing', 'ready', () => ({
      name: 'prepare',
      runId,
      autonomous: auto.autonomous,
      loop: auto.autonomous && auto.autonomousLoop,
      continuous: auto.autonomous && auto.continuous,
      maxLoops: auto.autonomous ? auto.maxLoops : undefined,
      maxRuntimeMs: auto.autonomous ? auto.maxRuntimeMs : undefined
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
    this.note(
      'info',
      auto.autonomous
        ? `${score.name} armed AUTONOMOUS on nine modules. Mac may disconnect after start; modules continue locally.`
        : this.codec.speaksFirmware
          ? `${score.name} armed on nine modules, pass ${this.run.pass}. Shared start_at_us=${Math.round(startAt * 1000)}.`
          : `${score.name} armed on nine modules, pass ${this.run.pass}. Each module starts from its own clock.`
    );
    this.watch(score, token, startAt, auto);
    return null;
  }

  private watch(score: Score, token: number, startAt: number, auto: AutonomousWatchOpts): void {
    if (this.monitor) clearInterval(this.monitor);
    // Autonomous multi-loop runs last score.durationMs × maxLoops (or maxRuntimeMs / continuous ceiling).
    // Using only one pass duration caused premature failRun + stop around the first score length (~3–5 min).
    const expectedMs = expectedRunDurationMs(score.durationMs, auto);
    this.monitor = setInterval(() => {
      if (token !== this.token) {
        clearInterval(this.monitor!);
        return;
      }
      const now = monoNow();
      if (this.run.phase === 'armed' && now >= startAt) this.run.phase = 'running';
      const finished = NODE_IDS.every((id) => this.run.perNode[id] === 'finished');
      if (finished) {
        clearInterval(this.monitor!);
        if (this.run.repeat && !this.run.autonomous) {
          void this.startPass(score, token, { autonomous: false, autonomousLoop: false, continuous: false });
        } else {
          this.run.phase = 'finished';
          this.note('info', `${score.name} finished. All nine modules confirmed completion.`);
        }
      } else if (now > startAt + expectedMs + COMPLETION_GRACE_MS) {
        clearInterval(this.monitor!);
        const missing = NODE_IDS.filter((id) => this.run.perNode[id] !== 'finished');
        void this.failRun(`Completion was not confirmed by ${missing.join(', ')}.`);
      }
    }, 50);
  }

  /** Abandons the run, records why, and asks every connected node to cancel and stop. */
  private async failRun(reason: string): Promise<void> {
    if (!ACTIVE.has(this.run.phase)) return;
    this.token++;
    const runId = this.run.runId;
    this.run = { ...this.run, phase: 'failed', error: reason, startAtMs: null };
    this.note('error', `Run failed: ${reason} Stopping all modules.`);
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
