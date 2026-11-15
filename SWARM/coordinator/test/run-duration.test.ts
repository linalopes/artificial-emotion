import { describe, expect, it } from 'vitest';
import {
  AUTONOMOUS_RUNTIME_CEILING_MS,
  COMPLETION_GRACE_MS,
  expectedRunDurationMs
} from '../src/run-duration';

describe('expectedRunDurationMs', () => {
  const single = { autonomous: false, autonomousLoop: false, continuous: false };
  const autoOnce = { autonomous: true, autonomousLoop: false, continuous: false };

  it('uses one score duration for live and single-pass autonomous', () => {
    expect(expectedRunDurationMs(120_000, single)).toBe(120_000);
    expect(expectedRunDurationMs(150_000, autoOnce)).toBe(150_000);
  });

  it('scales finite autonomous loops by maxLoops (Breathing-scale > 3 minutes)', () => {
    // Breathing defaults: 150s × 2 cycles = 300_000 ms per pass; UI maxLoops = 3 → 15 min.
    const auto = { autonomous: true, autonomousLoop: true, continuous: false, maxLoops: 3 };
    expect(expectedRunDurationMs(300_000, auto)).toBe(900_000);
    expect(expectedRunDurationMs(300_000, auto) + COMPLETION_GRACE_MS).toBeGreaterThan(180_000);
    // Wave 120s×2 = 240s × 2 loops = 8 min — still well past a one-pass 3–4 min false deadline.
    expect(expectedRunDurationMs(240_000, { ...auto, maxLoops: 2 })).toBe(480_000);
  });

  it('honours the earlier of maxLoops and maxRuntimeMs', () => {
    const auto = {
      autonomous: true,
      autonomousLoop: true,
      continuous: false,
      maxLoops: 10,
      maxRuntimeMs: 90_000
    };
    expect(expectedRunDurationMs(30_000, auto)).toBe(90_000);
  });

  it('uses runtime ceiling for continuous autonomous without maxRuntimeMs', () => {
    const auto = { autonomous: true, autonomousLoop: true, continuous: true };
    expect(expectedRunDurationMs(120_000, auto)).toBe(AUTONOMOUS_RUNTIME_CEILING_MS);
    expect(expectedRunDurationMs(120_000, { ...auto, maxRuntimeMs: 600_000 })).toBe(600_000);
  });
});
