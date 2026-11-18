/** Grace after the expected end before treating missing run_completed as failure. */
export const COMPLETION_GRACE_MS = 4000;

/**
 * Firmware software ceiling for continuous / unbounded autonomous runtime
 * (SWARM_AUTONOMOUS_MAX_RUNTIME_MS). Kept as a coordinator safety wait bound —
 * not a bypass of completion verification.
 */
export const AUTONOMOUS_RUNTIME_CEILING_MS = 12 * 60 * 60 * 1000;

export type AutonomousWatchOpts = {
  autonomous: boolean;
  autonomousLoop: boolean;
  continuous: boolean;
  maxLoops?: number;
  maxRuntimeMs?: number;
};

/**
 * Explicit maxRuntimeMs sent on prepare_run so firmware and Mac agree.
 * Continuous with unset runtime → 12 h ceiling (firmware normalizeAutonomousPolicy).
 */
export function resolveAutonomousMaxRuntimeMs(auto: AutonomousWatchOpts): number | undefined {
  if (!auto.autonomous) return undefined;
  if (auto.continuous) {
    return auto.maxRuntimeMs && auto.maxRuntimeMs > 0 ? auto.maxRuntimeMs : AUTONOMOUS_RUNTIME_CEILING_MS;
  }
  if (auto.maxRuntimeMs && auto.maxRuntimeMs > 0) return auto.maxRuntimeMs;
  return undefined;
}

/**
 * Expected wall-clock duration from startAt until modules should report finished.
 *
 * Non-autonomous / single-pass autonomous: one score duration.
 * Finite autonomous loops: score.durationMs × maxLoops (and/or maxRuntimeMs, whichever ends first).
 * Continuous: explicit maxRuntimeMs, else the firmware 12 h ceiling.
 */
export function expectedRunDurationMs(scoreDurationMs: number, auto: AutonomousWatchOpts): number {
  if (!auto.autonomous || !auto.autonomousLoop) return scoreDurationMs;

  if (auto.continuous) {
    return resolveAutonomousMaxRuntimeMs(auto)!;
  }

  const loops = Math.max(1, auto.maxLoops ?? 0);
  const byLoops = auto.maxLoops && auto.maxLoops > 0 ? scoreDurationMs * loops : 0;
  const byRuntime = auto.maxRuntimeMs && auto.maxRuntimeMs > 0 ? auto.maxRuntimeMs : 0;

  if (byLoops > 0 && byRuntime > 0) return Math.min(byLoops, byRuntime);
  if (byLoops > 0) return byLoops;
  if (byRuntime > 0) return byRuntime;
  // Loop requested without bounds should have been rejected upstream; fall back to one pass.
  return scoreDurationMs;
}
