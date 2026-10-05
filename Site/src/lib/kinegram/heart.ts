import type { BezierPath, HeartGeometry, Point } from './types';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Closed Catmull–Rom through landmarks → cubic Bézier path. */
export function closedCatmull(points: readonly Point[], tension = 0.85): BezierPath {
  const n = points.length;
  const cubics: BezierPath['cubics'] = [];
  const start = points[0];
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    cubics.push({
      c1: {
        x: p1.x + ((p2.x - p0.x) / 6) * tension,
        y: p1.y + ((p2.y - p0.y) / 6) * tension,
      },
      c2: {
        x: p2.x - ((p3.x - p1.x) / 6) * tension,
        y: p2.y - ((p3.y - p1.y) / 6) * tension,
      },
      p: p2,
    });
  }
  return { start, cubics, closed: true };
}

/**
 * Anterior-ish silhouette. Apex down and to the viewer's right; ventricular
 * mass; atrial roof; aortic arch with three nubs; pulmonary suggestion.
 * Coordinates are in a unit disc, scaled later to fill ~78% of the radius.
 */
const BODY: Point[] = [
  { x: 0.12, y: 0.54 },
  { x: 0.24, y: 0.44 },
  { x: 0.34, y: 0.3 },
  { x: 0.42, y: 0.16 },
  { x: 0.44, y: 0.02 },
  { x: 0.38, y: -0.12 },
  { x: 0.28, y: -0.22 },
  { x: 0.18, y: -0.28 },
  { x: 0.2, y: -0.4 },
  { x: 0.12, y: -0.46 },
  { x: 0.04, y: -0.4 },
  { x: 0.02, y: -0.52 },
  { x: -0.04, y: -0.6 },
  { x: -0.1, y: -0.54 },
  { x: -0.14, y: -0.62 },
  { x: -0.2, y: -0.52 },
  { x: -0.22, y: -0.6 },
  { x: -0.26, y: -0.48 },
  { x: -0.18, y: -0.36 },
  { x: -0.26, y: -0.3 },
  { x: -0.38, y: -0.2 },
  { x: -0.44, y: -0.04 },
  { x: -0.42, y: 0.12 },
  { x: -0.32, y: 0.28 },
  { x: -0.18, y: 0.42 },
  { x: -0.02, y: 0.5 },
];

const CHAMBER: Point[] = [
  { x: 0.08, y: 0.24 },
  { x: 0.18, y: 0.12 },
  { x: 0.18, y: -0.02 },
  { x: 0.08, y: -0.1 },
  { x: -0.04, y: -0.06 },
  { x: -0.14, y: 0.06 },
  { x: -0.12, y: 0.18 },
  { x: 0.0, y: 0.26 },
];

const PULMONARY: Point[] = [
  { x: 0.02, y: -0.28 },
  { x: 0.16, y: -0.36 },
  { x: 0.28, y: -0.34 },
  { x: 0.26, y: -0.26 },
  { x: 0.14, y: -0.24 },
  { x: 0.04, y: -0.26 },
];

const HEART_SCALE = 1.28;

function deformPoint(p: Point, c: number, vessel = false): Point {
  const t = clamp01(c) * (vessel ? 0.14 : 1);
  const ventricle = smoothstep(-0.2, 0.2, p.y);
  const apex = smoothstep(0.08, 0.5, p.y);
  const atrial = smoothstep(-0.32, -0.12, p.y) * (1 - smoothstep(-0.08, 0.1, p.y));
  const width = 1 - 0.32 * t * ventricle - 0.1 * t * atrial;
  const shorten = 1 - 0.26 * t * ventricle;
  const lift = 0.18 * t * apex;
  return {
    x: p.x * width,
    y: p.y * shorten - lift,
  };
}

function scalePt(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s };
}

function mapRing(ring: readonly Point[], contraction: number, vessel = false): Point[] {
  return ring.map((p) => scalePt(deformPoint(p, contraction, vessel), HEART_SCALE));
}

/**
 * Heart geometry at a contraction amount: 0 = diastole, 1 = systole.
 * Ventricular mass shortens and narrows; great vessels stay comparatively still.
 */
export function heartGeometry(contraction: number): HeartGeometry {
  const c = clamp01(contraction);
  const chamberC = clamp01(c * 1.2);
  return {
    body: closedCatmull(mapRing(BODY, c), 0.88),
    chamber: closedCatmull(mapRing(CHAMBER, chamberC), 0.8),
    vessels: [closedCatmull(mapRing(PULMONARY, c, true), 0.85)],
  };
}

/** Cardiac cycle contraction samples for N frames. */
export function contractionForFrame(index: number, frames: number): number {
  const n = Math.max(2, frames);
  const u = index / n;
  if (u < 0.08) return 0;
  if (u < 0.42) {
    const t = (u - 0.08) / 0.34;
    return t * t * (3 - 2 * t);
  }
  if (u < 0.5) return 1;
  const t = (u - 0.5) / 0.5;
  const ease = t * t * (3 - 2 * t);
  return 1 - ease;
}

/** Visual motion labels — not medical phases. */
const PHASES: Record<number, readonly string[]> = {
  4: ['Open', 'Contracting', 'Closed', 'Releasing'],
  5: ['Open', 'Narrowing', 'Compressed', 'Releasing', 'Opening'],
  6: ['Open', 'Narrowing', 'Contracting', 'Compressed', 'Releasing', 'Open'],
  8: ['Open', 'Narrowing', 'Contracting', 'Tightening', 'Compressed', 'Loosening', 'Releasing', 'Opening'],
  10: [
    'Open',
    'Narrowing',
    'Folding',
    'Contracting',
    'Tightening',
    'Compressed',
    'Loosening',
    'Releasing',
    'Unfolding',
    'Opening',
  ],
  12: [
    'Open',
    'Early narrowing',
    'Narrowing',
    'Contracting',
    'Tightening',
    'Compressed',
    'Held',
    'Early release',
    'Releasing',
    'Loosening',
    'Opening',
    'Resting',
  ],
};

export function phaseNameForIndex(index: number, frames: number): string {
  const named = PHASES[frames];
  if (named) return named[index] ?? named[0] ?? 'Open';
  const cycle = PHASES[6]!;
  const u = index / Math.max(1, frames);
  return cycle[Math.min(cycle.length - 1, Math.floor(u * cycle.length))] ?? 'Open';
}

export function frameNames(frames: number): string[] {
  return Array.from({ length: frames }, (_, i) => phaseNameForIndex(i, frames));
}

export function generateHeartbeatFrames(frames: number): HeartGeometry[] {
  return Array.from({ length: frames }, (_, i) => heartGeometry(contractionForFrame(i, frames)));
}

export function pathToSvgD(path: BezierPath, cx: number, cy: number, radius: number): string {
  const tx = (p: Point) => round(cx + p.x * radius);
  const ty = (p: Point) => round(cy + p.y * radius);
  let d = `M ${tx(path.start)} ${ty(path.start)}`;
  for (const seg of path.cubics) {
    d += ` C ${tx(seg.c1)} ${ty(seg.c1)} ${tx(seg.c2)} ${ty(seg.c2)} ${tx(seg.p)} ${ty(seg.p)}`;
  }
  if (path.closed) d += ' Z';
  return d;
}

export function round(n: number, digits = 3): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function lerpPath(a: BezierPath, b: BezierPath, t: number): BezierPath {
  const mix = (p: Point, q: Point): Point => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
  return {
    start: mix(a.start, b.start),
    closed: a.closed,
    cubics: a.cubics.map((seg, i) => ({
      c1: mix(seg.c1, b.cubics[i].c1),
      c2: mix(seg.c2, b.cubics[i].c2),
      p: mix(seg.p, b.cubics[i].p),
    })),
  };
}
