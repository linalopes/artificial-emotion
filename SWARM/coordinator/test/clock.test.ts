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
  it('prefers the lowest-RTT samples and reports max half-RTT uncertainty (firmware-aligned)', () => {
    const c = new ClockTracker(25, 7000);
    c.add({ t1: 0, t2: 5060, t3: 5060, t4: 80 }); // rtt 80 → unc 40 (excluded from top-3? no, worst of three)
    c.add({ t1: 100, t2: 5103, t3: 5103, t4: 106 }); // rtt 6 → unc 3
    c.add({ t1: 200, t2: 5250, t3: 5250, t4: 290 }); // rtt 90
    // Top-3 by RTT are all three; uncertainty = max(40,3,45)=45 → not synced at 25ms gate.
    // Add a tighter set:
    const c2 = new ClockTracker(25, 7000);
    c2.add({ t1: 0, t2: 5010, t3: 5010, t4: 20 });
    c2.add({ t1: 100, t2: 5103, t3: 5103, t4: 106 });
    c2.add({ t1: 200, t2: 5208, t3: 5208, t4: 216 });
    const s = c2.status(300)!;
    expect(s.offsetMs).toBeCloseTo(5000, 0);
    expect(s.uncertaintyMs).toBeCloseTo(10); // max half-RTT among top-3 (rtt 20)
    expect(s.synced).toBe(true);
    expect(c.status(300)!.synced).toBe(false);
  });
  it('reports unsynchronised when stale or too uncertain, and nothing before the first sample', () => {
    const c = new ClockTracker(25, 7000);
    expect(c.status(0)).toBeNull();
    c.add({ t1: 0, t2: 5100, t3: 5100, t4: 200 }); // rtt 200 → unc 100
    expect(c.status(300)!.synced).toBe(false);
    // One good sample is not enough: firmware max-of-3 still includes the bad one.
    c.add({ t1: 400, t2: 5405, t3: 5405, t4: 410 }); // rtt 10
    expect(c.status(500)!.synced).toBe(false);
    // Three low-RTT samples push the bad exchange out of the top-3 → synced.
    c.add({ t1: 500, t2: 5504, t3: 5504, t4: 508 });
    c.add({ t1: 600, t2: 5606, t3: 5606, t4: 612 });
    expect(c.status(700)!.synced).toBe(true);
    expect(c.status(9000)!.synced).toBe(false);
  });
});
