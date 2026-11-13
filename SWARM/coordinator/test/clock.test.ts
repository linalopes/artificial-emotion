import { describe, expect, it } from 'vitest';
import { ClockTracker, solveSample } from '../src/clock';

describe('four-timestamp clock exchange', () => {
  it('recovers the offset exactly on a symmetric path', () => {
    // Node clock runs 5000 ms ahead; 10 ms each way; 2 ms processing.
    const r = solveSample({ t1: 100, t2: 5110, t3: 5112, t4: 122 });
    expect(r.offsetMs).toBeCloseTo(5000);
    expect(r.rttMs).toBeCloseTo(20);
  });
  it('bounds the error of an asymmetric path by half the round trip', () => {
    const r = solveSample({ t1: 0, t2: 5030, t3: 5030, t4: 40 }); // 30 ms out, 10 ms back
    expect(Math.abs(r.offsetMs - 5000)).toBeLessThanOrEqual(r.rttMs / 2);
  });
  it('prefers the sample with the shortest round trip', () => {
    const c = new ClockTracker(25, 7000);
    c.add({ t1: 0, t2: 5060, t3: 5060, t4: 80 });
    c.add({ t1: 100, t2: 5103, t3: 5103, t4: 106 });
    c.add({ t1: 200, t2: 5250, t3: 5250, t4: 290 });
    const s = c.status(300)!;
    expect(s.offsetMs).toBeCloseTo(5000);
    expect(s.uncertaintyMs).toBeCloseTo(3);
    expect(s.synced).toBe(true);
  });
  it('reports unsynchronised when stale or too uncertain, and nothing before the first sample', () => {
    const c = new ClockTracker(25, 7000);
    expect(c.status(0)).toBeNull();
    c.add({ t1: 0, t2: 5100, t3: 5100, t4: 200 });
    expect(c.status(300)!.synced).toBe(false);
    c.add({ t1: 400, t2: 5405, t3: 5405, t4: 410 });
    expect(c.status(500)!.synced).toBe(true);
    expect(c.status(9000)!.synced).toBe(false);
  });
});
