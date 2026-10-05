import { generateHeartbeatFrames, frameNames, contractionForFrame } from './heart';
import { DEFAULT_PARAMS, type SlitAnimationModel, type SlitAnimationParams } from './types';

export function wedgeAngle(params: Pick<SlitAnimationParams, 'frames' | 'slices'>): number {
  return (Math.PI * 2) / (params.frames * params.slices);
}

export function wedgeCount(params: Pick<SlitAnimationParams, 'frames' | 'slices'>): number {
  return params.frames * params.slices;
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
