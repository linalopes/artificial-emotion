import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS, NODE_IDS, checkScoreShape, generate, generateDrift, generateWave, parseEnvelope, positionAt, rpmToMmPerS,
  scoreFingerprint, scoreLoopCompatible, validateScore, type NodeId, type NodeLimits, type Score
} from '../src/index';

const limits = (speed: number, min = 0, max = 1000) => Object.fromEntries(NODE_IDS.map((id) => [id, { minMm: min, maxMm: max, maxSpeedMmS: speed }])) as Record<NodeId, NodeLimits>;

describe('score model', () => {
  const score: Score = {
    schema: 1, name: 't', durationMs: 2000, loop: false,
    tracks: Object.fromEntries(NODE_IDS.map((id) => [id, [{ tMs: 0, zMm: 100, ease: 'linear' }, { tMs: 1000, zMm: 200, ease: 'linear' }, { tMs: 2000, zMm: 100, ease: 'sine' }]])) as Score['tracks']
  };
  it('interpolates linearly and with sine easing', () => {
    expect(positionAt(score, 'Mau01', 500)).toBeCloseTo(150);
    expect(positionAt(score, 'Mau01', 1500)).toBeCloseTo(150);
    expect(positionAt(score, 'Mau01', 1250)).toBeGreaterThan(175);
  });
  it('clamps outside the score and wraps on request', () => {
    expect(positionAt(score, 'Mau01', -5)).toBe(100);
    expect(positionAt(score, 'Mau01', 9999)).toBe(100);
    expect(positionAt(score, 'Mau01', 2500, true)).toBeCloseTo(150);
  });
  it('fingerprints change with content', () => {
    const other = structuredClone(score);
    other.tracks.Mau05[1].zMm = 201;
    expect(scoreFingerprint(other)).not.toBe(scoreFingerprint(score));
    expect(scoreFingerprint(structuredClone(score))).toBe(scoreFingerprint(score));
  });
});

describe('generators', () => {
  it('produce well-formed looping scores for all three presets', () => {
    for (const type of ['wave', 'breathing', 'drift'] as const) {
      const s = generate(type, DEFAULT_PARAMS[type]);
      expect('score' in checkScoreShape(JSON.parse(JSON.stringify(s)))).toBe(true);
      for (const id of NODE_IDS) expect(s.tracks[id][0].zMm).toBe(s.tracks[id].at(-1)!.zMm);
      expect(validateScore(s, limits(rpmToMmPerS(12))).ok).toBe(true);
    }
  });
  it('wave propagates: neighbours along the diagonal are phase shifted', () => {
    const s = generateWave({ ...DEFAULT_PARAMS.wave, phaseDeg: 90 });
    expect(positionAt(s, 'Mau01', 0)).toBeCloseTo(DEFAULT_PARAMS.wave.centerMm, 0);
    expect(positionAt(s, 'Mau02', 0)).toBeCloseTo(DEFAULT_PARAMS.wave.centerMm - DEFAULT_PARAMS.wave.amplitudeMm, 0);
    expect(positionAt(s, 'Mau02', 0)).toBeCloseTo(positionAt(s, 'Mau04', 0), 5);
  });
  it('keeps every preset within the firmware keyframe cap so Preview matches Live', () => {
    for (const type of ['wave', 'breathing', 'drift'] as const) {
      const s = generate(type, DEFAULT_PARAMS[type]);
      for (const id of NODE_IDS) expect(s.tracks[id].length).toBeLessThanOrEqual(32);
      expect(scoreLoopCompatible(s)).toBe(true);
    }
  });
  it('drift is reproducible from its seed and differs between seeds', () => {
    const a = generateDrift(DEFAULT_PARAMS.drift);
    const b = generateDrift({ ...DEFAULT_PARAMS.drift });
    const c = generateDrift({ ...DEFAULT_PARAMS.drift, seed: 8 });
    expect(a.tracks).toEqual(b.tracks);
    expect(c.tracks).not.toEqual(a.tracks);
    expect(a.generator?.seed).toBe(7);
  });
});

describe('validation', () => {
  const wave = generateWave(DEFAULT_PARAMS.wave);
  it('flags a score that is too fast for the current speed setting', () => {
    const r = validateScore(wave, limits(rpmToMmPerS(4)));
    expect(r.ok).toBe(false);
    expect(r.issues.every((i) => i.kind === 'speed')).toBe(true);
  });
  it('flags travel outside the limits of a single node', () => {
    const l = limits(50);
    l.Mau03 = { ...l.Mau03, maxMm: 200 };
    const r = validateScore(wave, l);
    expect(r.issues.map((i) => `${i.kind}:${i.node}`)).toEqual(['range:Mau03']);
  });
  it('flags a loop that does not close', () => {
    const s = structuredClone(wave);
    s.tracks.Mau01.at(-1)!.zMm += 40;
    expect(validateScore(s, limits(50)).issues.some((i) => i.kind === 'loop' && i.node === 'Mau01')).toBe(true);
  });
  it('rejects malformed scores without throwing', () => {
    const bad = structuredClone(wave) as any;
    bad.tracks.Mau04[3].tMs = 1;
    expect('error' in checkScoreShape(bad)).toBe(true);
    delete bad.tracks.Mau09;
    expect('error' in checkScoreShape(bad)).toBe(true);
    expect('error' in checkScoreShape(null)).toBe(true);
    expect('error' in checkScoreShape({ ...wave, schema: 2 })).toBe(true);
  });
});

describe('browser message validation', () => {
  it('accepts well-formed intents', () => {
    expect(parseEnvelope({ id: 'a', intent: { type: 'move', nodes: ['Mau01', 'Mau02'], targetMm: 300 } })).toMatchObject({ intent: { type: 'move' } });
  });
  it('rejects unknown nodes, duplicates, missing confirmation and unknown types', () => {
    const bad = [
      { id: 'a', intent: { type: 'move', nodes: ['Mau10'], targetMm: 1 } },
      { id: 'a', intent: { type: 'home', nodes: ['Mau01', 'Mau01'] } },
      { id: 'a', intent: { type: 'move', nodes: ['Mau01'], targetMm: 'far' } },
      { id: 'a', intent: { type: 'execute', score: generateWave(DEFAULT_PARAMS.wave) } },
      { id: 'a', intent: { type: 'step', nodes: ['Mau01'], steps: 400 } },
      { intent: { type: 'stopAll' } },
      'stopAll'
    ];
    for (const b of bad) expect('error' in parseEnvelope(b)).toBe(true);
  });
});
