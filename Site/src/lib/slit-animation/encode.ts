import { generateHeartbeatFrames, frameNames, contractionForFrame } from './heart';
import {
  CENTER_BRIDGE_MAX,
  DEFAULT_PARAMS,
  type SlitAnimationModel,
  type SlitAnimationParams,
} from './types';

export function wedgeAngle(params: Pick<SlitAnimationParams, 'frames' | 'slices'>): number {
  return (Math.PI * 2) / Math.max(1, params.frames * params.slices);
}

export function wedgeCount(params: Pick<SlitAnimationParams, 'frames' | 'slices'>): number {
  return Math.max(1, params.frames * params.slices);
}

/**
 * Complete source-frame cycles during one 360° mask revolution.
 *
 * Encoding walks the frame sequence sequentially around the disc:
 *   frame = round(angle / wedgeAngle) % frames
 * There are `frames * slices` wedges, so the sequence 0…frames-1
 * repeats `slices` times. Therefore cyclesPerRevolution === slices.
 */
export function cyclesPerRevolution(slices: number): number {
  return Math.max(1, slices);
}

/** Optical animation rate for a continuous motor, in cycles/min. */
export function animationCyclesPerMin(motorRpm: number, slices: number): number {
  return motorRpm * cyclesPerRevolution(slices);
}

/** Frame revealed when the mask is rotated by `angle` radians. */
export function frameAtAngle(angle: number, params: Pick<SlitAnimationParams, 'frames' | 'slices'>): number {
  const da = wedgeAngle(params);
  const idx = Math.round(angle / da);
  const n = params.frames;
  return ((idx % n) + n) % n;
}

export function snapAngle(angle: number, params: Pick<SlitAnimationParams, 'frames' | 'slices'>): number {
  const da = wedgeAngle(params);
  return Math.round(angle / da) * da;
}

export function buildSlitAnimation(partial: Partial<SlitAnimationParams> = {}): SlitAnimationModel {
  const params: SlitAnimationParams = {
    frames: partial.frames ?? DEFAULT_PARAMS.frames,
    slices: partial.slices ?? DEFAULT_PARAMS.slices,
    diameterMm: partial.diameterMm ?? DEFAULT_PARAMS.diameterMm,
    guideMm: partial.guideMm ?? DEFAULT_PARAMS.guideMm,
    centerBridgeMm: clampCenterBridgeMm(
      partial.centerBridgeMm ?? DEFAULT_PARAMS.centerBridgeMm,
      partial.guideMm ?? DEFAULT_PARAMS.guideMm,
      partial.diameterMm ?? DEFAULT_PARAMS.diameterMm,
    ),
  };
  return {
    params,
    names: frameNames(params.frames),
    contractions: Array.from({ length: params.frames }, (_, i) => contractionForFrame(i, params.frames)),
    hearts: generateHeartbeatFrames(params.frames),
    wedgeCount: wedgeCount(params),
    wedgeAngle: wedgeAngle(params),
  };
}

export function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/** Keep Center bridge at least as large as the axle guide, and smaller than the disc. */
export function clampCenterBridgeMm(bridgeMm: number, guideMm: number, diameterMm: number): number {
  const min = Math.max(0, guideMm);
  const max = Math.max(min, Math.min(CENTER_BRIDGE_MAX, diameterMm * 0.5));
  if (!Number.isFinite(bridgeMm)) return Math.min(max, Math.max(min, DEFAULT_PARAMS.centerBridgeMm));
  return Math.min(max, Math.max(min, bridgeMm));
}

/** Inner radius of the uncut hub, in the same units as `discRadius`. */
export function maskHubRadius(params: Pick<SlitAnimationParams, 'centerBridgeMm' | 'guideMm' | 'diameterMm'>, discRadius: number): number {
  const bridge = clampCenterBridgeMm(params.centerBridgeMm, params.guideMm, params.diameterMm);
  if (params.diameterMm <= 0) return 0;
  return (bridge / 2) * ((2 * discRadius) / params.diameterMm);
}

export function wedgePathD(
  cx: number,
  cy: number,
  radius: number,
  a0: number,
  a1: number,
  digits = 3,
): string {
  const r = (n: number) => {
    const p = 10 ** digits;
    return Math.round(n * p) / p;
  };
  const p0 = polar(cx, cy, radius, a0);
  const p1 = polar(cx, cy, radius, a1);
  const sweep = a1 - a0;
  const large = Math.abs(sweep) > Math.PI ? 1 : 0;
  return `M ${r(cx)} ${r(cy)} L ${r(p0.x)} ${r(p0.y)} A ${r(radius)} ${r(radius)} 0 ${large} 1 ${r(p1.x)} ${r(p1.y)} Z`;
}

/**
 * Radial slit aperture from an inner hub radius to the outer disc.
 * Used by the cuttable mask; encoded-base interlacing still uses wedgePathD from the centre.
 */
export function annularWedgePathD(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  a0: number,
  a1: number,
  digits = 3,
): string {
  if (!(innerRadius > 0) || innerRadius >= outerRadius) {
    return wedgePathD(cx, cy, outerRadius, a0, a1, digits);
  }
  const r = (n: number) => {
    const p = 10 ** digits;
    return Math.round(n * p) / p;
  };
  const outer0 = polar(cx, cy, outerRadius, a0);
  const outer1 = polar(cx, cy, outerRadius, a1);
  const inner0 = polar(cx, cy, innerRadius, a0);
  const inner1 = polar(cx, cy, innerRadius, a1);
  const sweep = a1 - a0;
  const large = Math.abs(sweep) > Math.PI ? 1 : 0;
  return (
    `M ${r(inner0.x)} ${r(inner0.y)} L ${r(outer0.x)} ${r(outer0.y)} ` +
    `A ${r(outerRadius)} ${r(outerRadius)} 0 ${large} 1 ${r(outer1.x)} ${r(outer1.y)} ` +
    `L ${r(inner1.x)} ${r(inner1.y)} ` +
    `A ${r(innerRadius)} ${r(innerRadius)} 0 ${large} 0 ${r(inner0.x)} ${r(inner0.y)} Z`
  );
}

/** Wedges that are opaque on the mask at rotation 0 (all but frame-0 apertures). */
export function isMaskSolid(wedgeIndex: number, frames: number): boolean {
  return wedgeIndex % frames !== 0;
}

export function apertureWedges(params: Pick<SlitAnimationParams, 'frames' | 'slices'>): number[] {
  const total = wedgeCount(params);
  const open: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (!isMaskSolid(i, params.frames)) open.push(i);
  }
  return open;
}
