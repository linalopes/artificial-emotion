/**
 * Mechanical constants. These are NOMINAL values taken from the project brief, not measurements.
 * The effective spool diameter changes as line stacks on the core, so every mm figure derived
 * from them is an estimate until the hardware has been calibrated.
 */
export const SPOOL_DIAMETER_MM = 15;
export const SPOOL_CIRCUMFERENCE_MM = Math.PI * SPOOL_DIAMETER_MM;

/**
 * Application-side bounds for the speed control.
 * Firmware compile-time ceiling is SWARM_ABS_MAX_RPM (8). Do not raise the UI above that.
 * Per-device hardMaxRpm may be lower still; the node remains authoritative.
 */
export const RPM_MIN = 1;
export const RPM_MAX = 8;
/** Matches firmware SWARM_ABS_MAX_ACCEL_MM_S2 application-side soft range used by the UI. */
export const ACCEL_MIN_MM_S2 = 1;
export const ACCEL_MAX_MM_S2 = 100;

/** Nominal travel range used only when a node has not reported its limits yet (firmware default max_travel_mm is 500). */
export const DEFAULT_TRAVEL_MIN_MM = 0;
export const DEFAULT_TRAVEL_MAX_MM = 500;

export function rpmToMmPerS(rpm: number): number {
  return (rpm * SPOOL_CIRCUMFERENCE_MM) / 60;
}
