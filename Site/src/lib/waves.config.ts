/**
 * Tomorrow's Waves — approved production defaults.
 *
 * Ported from the standalone p5.js HTML sketch. These values are the
 * visual source of truth; do not "reinterpret" them toward the old tissue
 * membranes. `amp` / `dark` keep the sketch's original parameter names.
 */

export const WAVES_CONFIG = {
  /** Approved seed. Do not randomise on first load. */
  seed: 330402,
  samples: 150,
  maxPixelDensity: 2,
  params: {
    speed: 1,
    ribbons: 6,
    lines: 72,
    amp: 1.5,
    width: 1.7,
    twist: 0.75,
    mesh: true,
    threads: true,
    mouse: true,
    dark: false,
  },
  /**
   * Ribbon width is authored against canvas height. In portrait heroes that
   * overfills the field; scale width only (not seed, count, or algorithm).
   * Landscape / desktop stays at 1. Aspect 0.5 (typical phone) → 0.58×.
   */
  compact: {
    fullAspect: 1,
    minAspect: 0.5,
    minWidthScale: 0.58,
  },
};

export type WavesParams = typeof WAVES_CONFIG.params;
export type WavesConfig = typeof WAVES_CONFIG;
