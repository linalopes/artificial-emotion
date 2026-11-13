/**
 * Mechanical constants. These are NOMINAL values taken from the project brief, not measurements.
 * The effective spool diameter changes as line stacks on the core, so every mm figure derived
 * from them is an estimate until the hardware has been calibrated.
 */
export const SPOOL_DIAMETER_MM = 15;
export const SPOOL_CIRCUMFERENCE_MM = Math.PI * SPOOL_DIAMETER_MM;

/** Application-side bounds for the speed control. The firmware's own limits remain authoritative. */
export const RPM_MIN = 1;
export const RPM_MAX = 15;
export const ACCEL_MIN_MM_S2 = 1;
export const ACCEL_MAX_MM_S2 = 100;

/** Nominal travel range used only when a node has not reported its limits yet. */
export const DEFAULT_TRAVEL_MIN_MM = 0;
export const DEFAULT_TRAVEL_MAX_MM = 1000;

export function rpmToMmPerS(rpm: number): number {
  return (rpm * SPOOL_CIRCUMFERENCE_MM) / 60;
}
