import {
  DEFAULT_PARAMS, DEFAULT_TRAVEL_MAX_MM, DEFAULT_TRAVEL_MIN_MM, NODE_IDS, RPM_MIN, generate, positionAt, rpmToMmPerS, scoreFingerprint, validateScore,
  type Intent, type NodeId, type NodeLimits, type NodeOutcome, type NodeState, type PresetParams, type PresetType, type Score, type ServerMessage, type Snapshot
} from '@swarm/shared';

export type Area = 'control' | 'perform' | 'system';
export type Mode = 'preview' | 'live';
export interface Result {
  ok: boolean;
  error?: string;
  outcomes?: NodeOutcome[];
}

const blank = (id: NodeId): NodeState => ({
  id, connected: false, simulated: false, fwVersion: null, homed: false, homing: false, moving: false, faultCode: null, positionMm: null,
  targetMm: null, endstop: null, rssiDbm: null, rpm: null, accelMmS2: null, limitMinMm: null, limitMaxMm: null, lastHomedAtMs: null,
  travelSinceHomeMm: 0, clock: null, clockSyncedFromNode: null, lastTelemetryAtMs: null
});
const ACTIVE = ['positioning', 'loading', 'preparing', 'committing', 'armed', 'running'];

/**
 * Browser-side state. The browser renders coordinator snapshots and sends intents.
 * Preview playback lives entirely here and never produces an intent.
 */
class AppState {
  // Connection to the coordinator
  linked = $state(false);
  snap = $state<Snapshot | null>(null);
  private snapAt = 0;
  private ws: WebSocket | null = null;
  private pending = new Map<string, (r: Result) => void>();
  private seq = 0;

  // Interface state
  area = $state<Area>('control');
  mode = $state<Mode>('preview');
  sel = $state<NodeId[]>(['Mau05']);
  multi = $state(false);
  moveMm = $state(400);
  confirm = $state(false);
  notice = $state<{ ok: boolean; text: string } | null>(null);

  // Choreography and preview
  preset = $state<PresetType>('wave');
  params = $state<PresetParams>(structuredClone(DEFAULT_PARAMS));
  loop = $state(true);
  /** Opt-in: modules continue after Mac disconnect. Not the same as Preview/Mac loop. */
  autonomous = $state(false);
  /** Local loop count when autonomous (finite). Ignored when continuousAutonomous. */
  autonomousMaxLoops = $state(3);
  continuousAutonomous = $state(false);
  playing = $state(false);
  rate = $state(10);
  tMs = $state(0);
  runT = $state(0);

  nodes = $derived(this.snap?.nodes ?? NODE_IDS.map(blank));
  run = $derived(this.snap?.run ?? null);
  runActive = $derived(this.run !== null && ACTIVE.includes(this.run.phase));
  stopEngaged = $derived(this.snap?.stop.engaged ?? false);
  isOperator = $derived(this.snap?.you.isOperator ?? false);
  simulated = $derived(this.snap?.fleet === 'simulator');
  /** True when this browser may send motion commands right now. */
  canCommand = $derived(this.linked && this.mode === 'live' && this.isOperator && !this.stopEngaged);

  score = $derived<Score>({ ...generate(this.preset, this.params[this.preset]), loop: this.loop });
  fingerprint = $derived(scoreFingerprint(this.score));
  limits = $derived.by(() => {
    const out = {} as Record<NodeId, NodeLimits>;
    for (const n of this.nodes) out[n.id] = { minMm: n.limitMinMm ?? DEFAULT_TRAVEL_MIN_MM, maxMm: n.limitMaxMm ?? DEFAULT_TRAVEL_MAX_MM, maxSpeedMmS: rpmToMmPerS(n.rpm ?? RPM_MIN) };
    return out;
  });
  /** True when every limit used for validation was reported by a connected node. */
  limitsReported = $derived(this.nodes.every((n) => n.connected && n.rpm !== null && n.limitMaxMm !== null));
  validation = $derived(validateScore(this.score, this.limits));
  /** True when the coordinator's run belongs to the score currently shown. */
  runIsThisScore = $derived(this.run !== null && this.run.scoreFingerprint === this.fingerprint);

  /** Planned position per node, when there is one worth drawing. */
  ghosts = $derived.by(() => {
    const out: Partial<Record<NodeId, number>> = {};
    const run = this.run;
    if (run && (run.phase === 'armed' || run.phase === 'running') && this.runIsThisScore) {
      for (const id of NODE_IDS) out[id] = positionAt(this.score, id, Math.max(0, this.runT));
    } else if (this.area === 'perform') {
      for (const id of NODE_IDS) out[id] = positionAt(this.score, id, this.tMs);
    } else {
      for (const n of this.nodes) if (n.connected && n.moving && !n.homing && n.targetMm !== null) out[n.id] = n.targetMm;
    }
    return out;
  });

  node(id: NodeId): NodeState {
    return this.nodes[NODE_IDS.indexOf(id)];
  }
  serverNow(): number {
    return this.snap ? this.snap.serverTimeMs + (performance.now() - this.snapAt) : 0;
  }

  // ---- selection --------------------------------------------------------------------------

  pick(id: NodeId): void {
    if (this.multi) this.sel = this.sel.includes(id) ? this.sel.filter((x) => x !== id) : NODE_IDS.filter((x) => x === id || this.sel.includes(x));
    else this.sel = [id];
  }
  select(ids: NodeId[]): void {
    this.sel = [...ids];
  }

  // ---- modes and preview ------------------------------------------------------------------

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    if (mode === 'preview' && (this.runActive || this.nodes.some((n) => n.connected && n.moving)) && this.isOperator) {
      this.notice = { ok: false, text: 'Modules are moving. Stop them before leaving Live.' };
      return;
    }
    this.mode = mode;
    this.playing = false;
    this.tMs = 0;
  }
  togglePlay(): void {
    if (!this.runActive) this.playing = !this.playing;
  }
  resetPreview(): void {
    this.playing = false;
    this.tMs = 0;
  }
  /** Called once per animation frame. Advances the local preview and the run clock only. */
  frame(dtMs: number): void {
    if (this.playing) {
      let t = this.tMs + dtMs * this.rate;
      const d = this.score.durationMs;
      if (t >= d) {
        if (this.loop) t %= d;
        else {
          t = d;
          this.playing = false;
        }
      }
      this.tMs = t;
    }
    const run = this.run;
    if (run && run.startAtMs !== null && (run.phase === 'armed' || run.phase === 'running')) this.runT = this.serverNow() - run.startAtMs;
  }

  // ---- coordinator link -------------------------------------------------------------------

  connect(): void {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.linked = true;
      // Take control back after a reload if nobody else took it meanwhile.
      if (sessionStorage.getItem('swarm-operator') === '1') void this.send({ type: 'claimOperator' }, true);
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.type === 'snapshot') {
        this.snap = m.snapshot;
        this.snapAt = performance.now();
      } else {
        this.pending.get(m.id)?.({ ok: m.ok, error: m.error, outcomes: m.outcomes });
        this.pending.delete(m.id);
      }
    };
    ws.onclose = () => {
      this.linked = false;
      for (const done of this.pending.values()) done({ ok: false, error: 'Connection to the coordinator was lost before it answered.' });
      this.pending.clear();
      setTimeout(() => this.connect(), 1000);
    };
  }

  /** Sends an intent and resolves with the coordinator's answer. Never assumes success. */
  send(intent: Intent, quiet = false): Promise<Result> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const r = { ok: false, error: 'The coordinator is not reachable.' };
      if (!quiet) this.notice = { ok: false, text: r.error };
      return Promise.resolve(r);
    }
    const id = `${Date.now().toString(36)}-${++this.seq}`;
    return new Promise<Result>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) done({ ok: false, error: 'The coordinator did not answer in time.' });
      }, 15000);
      const done = (r: Result) => {
        clearTimeout(timer);
        if (!quiet) this.notice = r.ok ? { ok: true, text: `${describe(intent)}: acknowledged.` } : { ok: false, text: `${describe(intent)} failed. ${r.error ?? ''}` };
        resolve(r);
      };
      this.pending.set(id, done);
      this.ws!.send(JSON.stringify({ id, intent }));
    });
  }

  async takeControl(): Promise<void> {
    const r = await this.send({ type: 'claimOperator' });
    if (r.ok) sessionStorage.setItem('swarm-operator', '1');
  }
  async releaseControl(): Promise<void> {
    sessionStorage.removeItem('swarm-operator');
    await this.send({ type: 'releaseOperator' }, true);
  }

  // ---- preset parameters ------------------------------------------------------------------

  async loadPresets(): Promise<void> {
    try {
      const saved = (await (await fetch('/api/presets')).json()) as Partial<PresetParams>;
      for (const k of ['wave', 'breathing', 'drift'] as const) if (saved[k]) Object.assign(this.params[k], saved[k]);
    } catch {
      // Defaults stay in place when nothing was saved or the coordinator is unreachable.
    }
  }
  async savePresets(): Promise<void> {
    try {
      const res = await fetch('/api/presets', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(this.params) });
      this.notice = res.ok ? { ok: true, text: 'Parameters saved on the coordinator.' } : { ok: false, text: 'Saving parameters failed.' };
    } catch {
      this.notice = { ok: false, text: 'Saving parameters failed: coordinator unreachable.' };
    }
  }
}

function describe(i: Intent): string {
  const who = 'nodes' in i ? (i.nodes.length === 9 ? 'all modules' : i.nodes.join(', ')) : '';
  switch (i.type) {
    case 'home': return `Home ${who}`;
    case 'move': return `Move ${who} to ${i.targetMm} mm`;
    case 'stopNodes': return `Stop ${who}`;
    case 'stopAll': return 'Stop all';
    case 'engageStop': return 'Software stop';
    case 'releaseStop': return 'Release software stop';
    case 'setParams': return `Parameters for ${who}`;
    case 'clearFault': return `Clear fault on ${who}`;
    case 'goToStart': return `Go to start of ${i.score.name}`;
    case 'execute': return `Arm ${i.score.name} on all modules`;
    case 'cancelRun': return 'Stop run';
    case 'claimOperator': return 'Take control';
    case 'releaseOperator': return 'Release control';
    case 'simScenario': return `Simulator scenario ${i.scenario}`;
  }
}

export const app = new AppState();
