import { NODE_IDS, gridOf, type NodeId } from './ids';
import { SCORE_SCHEMA, type Keyframe, type Score } from './score';

/** Keyframe spacing used by the preset generators. Linear segments at 1 s track a slow sine closely. */
export const GENERATOR_STEP_MS = 1000;

export interface WaveParams {
  amplitudeMm: number;
  periodS: number;
  /** Phase lag between neighbouring modules along the travel direction, in degrees. */
  phaseDeg: number;
  direction: 'diagonal' | 'rows' | 'columns';
  centerMm: number;
  cycles: number;
}
export interface BreathingParams {
  amplitudeMm: number;
  periodS: number;
  /** Phase lag from the centre module outward, per ring, in degrees. */
  ringDelayDeg: number;
  centerMm: number;
  cycles: number;
}
export interface DriftParams {
  amplitudeMm: number;
  durationS: number;
  /** 0 = all modules share one slow curve shape, 1 = strongly individual. */
  variation: number;
  seed: number;
  centerMm: number;
}

export type PresetType = 'wave' | 'breathing' | 'drift';
export interface PresetParams {
  wave: WaveParams;
  breathing: BreathingParams;
  drift: DriftParams;
}

export const DEFAULT_PARAMS: PresetParams = {
  wave: { amplitudeMm: 150, periodS: 120, phaseDeg: 40, direction: 'diagonal', centerMm: 450, cycles: 2 },
  breathing: { amplitudeMm: 200, periodS: 150, ringDelayDeg: 25, centerMm: 450, cycles: 2 },
  drift: { amplitudeMm: 160, durationS: 480, variation: 0.5, seed: 7, centerMm: 450 }
};

/** Small deterministic PRNG so Drift is reproducible from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(durationMs: number, fn: (tS: number) => number): Keyframe[] {
  const n = Math.max(2, Math.round(durationMs / GENERATOR_STEP_MS));
  const out: Keyframe[] = [];
  for (let j = 0; j <= n; j++) {
    const tMs = Math.round((durationMs * j) / n);
    out.push({ tMs, zMm: Math.round(fn(tMs / 1000) * 100) / 100, ease: 'linear' });
  }
  // Close the loop exactly so a repeated score has no seam.
  out[out.length - 1].zMm = out[0].zMm;
  return out;
}

function build(name: string, durationMs: number, type: PresetType, params: object, seed: number | undefined, fn: (id: NodeId, tS: number) => number): Score {
  const tracks = {} as Record<NodeId, Keyframe[]>;
  for (const id of NODE_IDS) tracks[id] = sample(durationMs, (tS) => fn(id, tS));
  return {
    schema: SCORE_SCHEMA,
    name,
    durationMs,
    loop: true,
    tracks,
    generator: { type, params: params as Record<string, number | string>, ...(seed === undefined ? {} : { seed }) }
  };
}

const TAU = Math.PI * 2;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function generateWave(p: WaveParams): Score {
  const durationMs = Math.round(p.periodS * p.cycles * 1000);
  return build('Wave', durationMs, 'wave', p, undefined, (id, tS) => {
    const { col, row } = gridOf(id);
    const step = p.direction === 'rows' ? row : p.direction === 'columns' ? col : col + row;
    return p.centerMm + p.amplitudeMm * Math.sin((TAU * tS) / p.periodS - step * rad(p.phaseDeg));
  });
}

export function generateBreathing(p: BreathingParams): Score {
  const durationMs = Math.round(p.periodS * p.cycles * 1000);
  return build('Breathing', durationMs, 'breathing', p, undefined, (id, tS) => {
    const { col, row } = gridOf(id);
    const ring = col === 1 && row === 1 ? 0 : col === 1 || row === 1 ? 1 : 2;
    return p.centerMm + p.amplitudeMm * Math.sin((TAU * tS) / p.periodS - ring * rad(p.ringDelayDeg));
  });
}

export function generateDrift(p: DriftParams): Score {
  const rng = mulberry32(p.seed);
  // Each module gets two whole-number harmonics of the duration, so every track closes its loop.
  const shape = NODE_IDS.map(() => {
    const a = rng();
    const b = rng();
    const n1 = 1 + Math.round(p.variation * a * 3);
    const n2 = n1 + 1 + Math.round(p.variation * b * 2);
    return { n1, n2, ph1: rng() * TAU, ph2: rng() * TAU };
  });
  const durationMs = Math.round(p.durationS * 1000);
  return build('Drift', durationMs, 'drift', p, p.seed, (id, tS) => {
    const s = shape[gridOf(id).index];
    const u = (TAU * tS) / p.durationS;
    return p.centerMm + p.amplitudeMm * (0.65 * Math.sin(s.n1 * u + s.ph1) + 0.35 * Math.sin(s.n2 * u + s.ph2));
  });
}

export function generate<T extends PresetType>(type: T, params: PresetParams[T]): Score {
  if (type === 'wave') return generateWave(params as WaveParams);
  if (type === 'breathing') return generateBreathing(params as BreathingParams);
  return generateDrift(params as DriftParams);
}
