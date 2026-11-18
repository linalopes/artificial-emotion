import type { Telemetry } from './devices/protocol';
import type { AutonomousWatchOpts } from './run-duration';

/** Terminal completion reasons firmware reports after a bounded autonomous run. */
export const AUTONOMOUS_COMPLETION_REASONS = new Set(['max_loops', 'max_runtime']);

/** Status older than this is not used to unlock Perform. */
export const AUTONOMOUS_STATUS_FRESH_MS = 5000;

export type AutonomousCompletionEvidence = {
  moving: boolean;
  homing?: boolean;
  faultCode?: string | null;
  autonomous?: boolean | null;
  completionReason?: string | null;
  completedPasses?: number | null;
  runId?: string | null;
  /** Wall time of this status sample (Date.now() class). */
  telemetryAtMs: number;
};

export type AutonomousRunExpectation = {
  runId: string;
  maxLoops?: number;
  continuous?: boolean;
  maxRuntimeMs?: number;
};

/**
 * Whether a fresh status frame is sufficient evidence that this module finished
 * the Mac's current autonomous run locally (e.g. after 0.3.10 muted run_completed).
 *
 * Never true from elapsed time alone — requires explicit completion reason + idle.
 */
export function statusIndicatesAutonomousCompletion(
  evidence: AutonomousCompletionEvidence,
  expect: AutonomousRunExpectation,
  nowMs: number,
  freshMs: number = AUTONOMOUS_STATUS_FRESH_MS
): boolean {
  if (!expect.runId) return false;
  if (evidence.moving || evidence.homing) return false;
  if (evidence.faultCode) return false;
  if (evidence.autonomous === true) return false;

  const age = nowMs - evidence.telemetryAtMs;
  if (!Number.isFinite(age) || age < 0 || age > freshMs) return false;

  const reason = evidence.completionReason ?? '';
  if (!AUTONOMOUS_COMPLETION_REASONS.has(reason)) return false;

  const reportedId = evidence.runId ?? '';
  // Prefer explicit run id match. After firmware clears the run, id may be empty —
  // still accept when completion reason + pass count match this Mac run's policy.
  if (reportedId && reportedId !== expect.runId) return false;

  const passes = evidence.completedPasses;
  if (passes == null || !Number.isFinite(passes) || passes <= 0) return false;

  if (reason === 'max_loops') {
    const need = expect.maxLoops ?? 0;
    if (need <= 0) return false;
    return passes >= need;
  }

  // max_runtime: continuous or runtime-bounded — any positive completed pass count is enough
  // together with the reason + idle + autonomy ended.
  if (reason === 'max_runtime') {
    if (expect.continuous) return true;
    if (expect.maxRuntimeMs && expect.maxRuntimeMs > 0) return true;
    // Finite maxLoops run that hit runtime first (unusual) — still accept the reason.
    return true;
  }

  return false;
}

export function expectationFromWatch(runId: string, auto: AutonomousWatchOpts): AutonomousRunExpectation {
  return {
    runId,
    maxLoops: auto.maxLoops,
    continuous: auto.continuous,
    maxRuntimeMs: auto.maxRuntimeMs
  };
}

/** Map fleet/telemetry fields into completion evidence. */
export function evidenceFromTelemetry(
  t: Pick<
    Telemetry,
    | 'moving'
    | 'homing'
    | 'faultCode'
    | 'autonomous'
    | 'completionReason'
    | 'completedPasses'
    | 'runId'
  >,
  telemetryAtMs: number
): AutonomousCompletionEvidence {
  return {
    moving: t.moving,
    homing: t.homing,
    faultCode: t.faultCode,
    autonomous: t.autonomous,
    completionReason: t.completionReason,
    completedPasses: t.completedPasses,
    runId: t.runId,
    telemetryAtMs
  };
}
