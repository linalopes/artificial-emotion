import { NODE_IDS, type NodeId } from './ids';

/**
 * Canonical choreography score. Presets and the future editor both produce this format.
 * Positions are millimetres below the homing reference (0 = endstop, positive = down).
 */
export const SCORE_SCHEMA = 1;

export type Ease = 'linear' | 'sine';

export interface Keyframe {
  /** Time from the start of the score, in milliseconds. */
  tMs: number;
  /** Position in millimetres below the homing reference. */
  zMm: number;
  /** Interpolation of the segment that ARRIVES at this keyframe. Ignored on the first keyframe. */
  ease: Ease;
}

export interface GeneratorInfo {
  type: string;
  params: Record<string, number | string>;
  seed?: number;
}

export interface Score {
  schema: typeof SCORE_SCHEMA;
  name: string;
  durationMs: number;
  /** Looping INTENT. Whether hardware can loop without the coordinator is a firmware question. */
  loop: boolean;
  tracks: Record<NodeId, Keyframe[]>;
  /** How the score was generated, if it was. The score itself never depends on this. */
  generator?: GeneratorInfo;
}

/** Position of one node at time tMs. Clamps outside the score; wraps when `wrap` is set. */
export function positionAt(score: Score, node: NodeId, tMs: number, wrap = false): number {
  const track = score.tracks[node];
  if (!track || track.length === 0) return 0;
  let t = tMs;
  if (wrap && score.durationMs > 0) t = ((t % score.durationMs) + score.durationMs) % score.durationMs;
  if (t <= track[0].tMs) return track[0].zMm;
  const last = track[track.length - 1];
  if (t >= last.tMs) return last.zMm;
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].tMs <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const span = b.tMs - a.tMs;
  if (span <= 0) return b.zMm;
  let u = (t - a.tMs) / span;
  if (b.ease === 'sine') u = (1 - Math.cos(Math.PI * u)) / 2;
  return a.zMm + (b.zMm - a.zMm) * u;
}

/** Start position of every node. */
export function startPositions(score: Score): Record<NodeId, number> {
  const out = {} as Record<NodeId, number>;
  for (const id of NODE_IDS) out[id] = positionAt(score, id, 0);
  return out;
}

/** Stable short fingerprint, used to check that Execute runs the score that was positioned for. */
export function scoreFingerprint(score: Score): string {
  let h = 2166136261;
  const feed = (n: number) => {
    h ^= n & 0xffff;
    h = Math.imul(h, 16777619);
    h ^= (n >>> 16) & 0xffff;
    h = Math.imul(h, 16777619);
  };
  feed(score.durationMs);
  feed(score.loop ? 1 : 0);
  for (const id of NODE_IDS) {
    for (const k of score.tracks[id] ?? []) {
      feed(Math.round(k.tMs));
      feed(Math.round(k.zMm * 10));
      feed(k.ease === 'sine' ? 2 : 1);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
