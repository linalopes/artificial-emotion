import { NODE_IDS, type NodeId } from './ids';
import { SCORE_SCHEMA, type Score } from './score';

/** What one module can do right now, as reported by the node (or nominal defaults). */
export interface NodeLimits {
  minMm: number;
  maxMm: number;
  maxSpeedMmS: number;
}

export type IssueKind = 'structure' | 'range' | 'speed' | 'loop';
export interface ScoreIssue {
  kind: IssueKind;
  node?: NodeId;
  tMs?: number;
  message: string;
}
export interface TrackStats {
  minMm: number;
  maxMm: number;
  peakSpeedMmS: number;
}
export interface ValidationResult {
  ok: boolean;
  issues: ScoreIssue[];
  stats: Record<NodeId, TrackStats>;
}

const MAX_KEYFRAMES_PER_TRACK = 5000;
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;

/** Structural check for data arriving from a browser or a file. Never throws. */
export function checkScoreShape(raw: unknown): { score: Score } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Score is not an object.' };
  const s = raw as Partial<Score>;
  if (s.schema !== SCORE_SCHEMA) return { error: `Unsupported score schema ${String(s.schema)}.` };
  if (typeof s.name !== 'string' || s.name.length > 80) return { error: 'Score name is missing or too long.' };
  if (typeof s.durationMs !== 'number' || !Number.isFinite(s.durationMs) || s.durationMs <= 0 || s.durationMs > MAX_DURATION_MS) return { error: 'Score duration is invalid.' };
  if (typeof s.loop !== 'boolean') return { error: 'Score loop flag is missing.' };
  if (!s.tracks || typeof s.tracks !== 'object') return { error: 'Score has no tracks.' };
  for (const id of NODE_IDS) {
    const tr = (s.tracks as Record<string, unknown>)[id];
    if (!Array.isArray(tr) || tr.length < 2) return { error: `${id} needs at least two keyframes.` };
    if (tr.length > MAX_KEYFRAMES_PER_TRACK) return { error: `${id} has too many keyframes.` };
    let prev = -1;
    for (const k of tr) {
      if (!k || typeof k.tMs !== 'number' || typeof k.zMm !== 'number' || !Number.isFinite(k.tMs) || !Number.isFinite(k.zMm)) return { error: `${id} has a malformed keyframe.` };
      if (k.ease !== 'linear' && k.ease !== 'sine') return { error: `${id} has an unknown easing.` };
      if (k.tMs <= prev) return { error: `${id} keyframes are not in increasing time order.` };
      prev = k.tMs;
    }
    if (tr[0].tMs !== 0) return { error: `${id} does not start at time 0.` };
    if (tr[tr.length - 1].tMs !== s.durationMs) return { error: `${id} does not end at the score duration.` };
  }
  return { score: s as Score };
}

/** Feasibility of a well-formed score against per-node travel and speed limits. */
export function validateScore(score: Score, limits: Record<NodeId, NodeLimits>): ValidationResult {
  const issues: ScoreIssue[] = [];
  const stats = {} as Record<NodeId, TrackStats>;
  for (const id of NODE_IDS) {
    const tr = score.tracks[id];
    const lim = limits[id];
    let minMm = Infinity;
    let maxMm = -Infinity;
    let peak = 0;
    let peakAt = 0;
    for (let i = 0; i < tr.length; i++) {
      minMm = Math.min(minMm, tr[i].zMm);
      maxMm = Math.max(maxMm, tr[i].zMm);
      if (i === 0) continue;
      const dt = (tr[i].tMs - tr[i - 1].tMs) / 1000;
      const mean = Math.abs(tr[i].zMm - tr[i - 1].zMm) / dt;
      // A sine-eased segment peaks at pi/2 times its mean speed.
      const v = tr[i].ease === 'sine' ? (mean * Math.PI) / 2 : mean;
      if (v > peak) {
        peak = v;
        peakAt = tr[i - 1].tMs;
      }
    }
    stats[id] = { minMm, maxMm, peakSpeedMmS: peak };
    if (minMm < lim.minMm - 0.01 || maxMm > lim.maxMm + 0.01) {
      issues.push({ kind: 'range', node: id, message: `${id} would travel ${minMm.toFixed(0)} to ${maxMm.toFixed(0)} mm, outside its limits of ${lim.minMm.toFixed(0)} to ${lim.maxMm.toFixed(0)} mm.` });
    }
    if (peak > lim.maxSpeedMmS + 1e-6) {
      issues.push({ kind: 'speed', node: id, tMs: peakAt, message: `${id} needs ${peak.toFixed(1)} mm/s but its current speed setting allows ${lim.maxSpeedMmS.toFixed(1)} mm/s.` });
    }
    if (score.loop && Math.abs(tr[0].zMm - tr[tr.length - 1].zMm) > 1) {
      issues.push({ kind: 'loop', node: id, message: `${id} ends ${Math.abs(tr[0].zMm - tr[tr.length - 1].zMm).toFixed(0)} mm away from where it starts, so the loop would jump.` });
    }
  }
  return { ok: issues.length === 0, issues, stats };
}
