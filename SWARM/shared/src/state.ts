import type { NodeId } from './ids';

export type FleetKind = 'simulator' | 'hardware';

export interface ClockStatus {
  synced: boolean;
  /** Estimated node clock minus coordinator clock, in ms. */
  offsetMs: number;
  /** Round-trip time of the best recent sample, in ms. */
  rttMs: number;
  /** Half the round trip of the best sample: the bound on the offset error, in ms. */
  uncertaintyMs: number;
  /** Time since the last successful exchange, in ms. */
  ageMs: number;
}

/** One module as the coordinator currently knows it. Everything here comes from the node or is marked otherwise. */
export interface NodeState {
  id: NodeId;
  connected: boolean;
  /** True when this node is a software simulation, never true for hardware. */
  simulated: boolean;
  fwVersion: string | null;
  homed: boolean;
  homing: boolean;
  moving: boolean;
  faultCode: string | null;
  /** Step-count estimate reported by the node, in mm. null while unhomed or never reported. */
  positionMm: number | null;
  targetMm: number | null;
  endstop: boolean | null;
  rssiDbm: number | null;
  rpm: number | null;
  accelMmS2: number | null;
  limitMinMm: number | null;
  limitMaxMm: number | null;
  /** Coordinator wall-clock time (ms since epoch) when the node last reported a completed homing. */
  lastHomedAtMs: number | null;
  /** Travel accumulated by the coordinator from telemetry since that homing, in mm. */
  travelSinceHomeMm: number;
  clock: ClockStatus | null;
  /** Coordinator wall-clock time of the last telemetry frame. Retained after disconnect. */
  lastTelemetryAtMs: number | null;
}

export type RunPhase = 'idle' | 'positioning' | 'positioned' | 'loading' | 'preparing' | 'committing' | 'armed' | 'running' | 'finished' | 'failed' | 'cancelled';

export interface RunState {
  phase: RunPhase;
  runId: string | null;
  scoreName: string | null;
  scoreFingerprint: string | null;
  durationMs: number;
  /** Start time on the coordinator's monotonic clock (same base as Snapshot.serverTimeMs). */
  startAtMs: number | null;
  /** True when the coordinator will start the score again after each pass. Needs the coordinator running. */
  repeat: boolean;
  pass: number;
  error: string | null;
  /** Last confirmed step per node, from device acknowledgments only. */
  perNode: Partial<Record<NodeId, string>>;
}

export interface LogEntry {
  atMs: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface Snapshot {
  fleet: FleetKind;
  /** Coordinator monotonic clock, ms. */
  serverTimeMs: number;
  /** Coordinator wall clock, ms since epoch. */
  wallTimeMs: number;
  nodes: NodeState[];
  stop: { engaged: boolean; atMs: number | null };
  run: RunState;
  operatorClientId: string | null;
  clients: number;
  you: { clientId: string; isOperator: boolean };
  log: LogEntry[];
}
