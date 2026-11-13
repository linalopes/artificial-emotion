import type { ClockStatus } from '@swarm/shared';

/** Coordinator monotonic clock in milliseconds. Never jumps with wall-clock adjustments. */
export const monoNow = (): number => performance.now();

/** Same monotonic base as monoNow, in microseconds — required by firmware clock_sync / commit_run. */
export const monoNowUs = (): number => Math.round(performance.now() * 1000);

export interface ClockSample {
  /** Coordinator send time. */
  t1: number;
  /** Node receive time, node clock. */
  t2: number;
  /** Node reply time, node clock. */
  t3: number;
  /** Coordinator receive time. */
  t4: number;
}

/** Standard four-timestamp estimate. offset = node clock minus coordinator clock. */
export function solveSample(s: ClockSample): { offsetMs: number; rttMs: number } {
  return {
    offsetMs: (s.t2 - s.t1 + (s.t3 - s.t4)) / 2,
    rttMs: s.t4 - s.t1 - (s.t3 - s.t2)
  };
}

interface Kept {
  offsetMs: number;
  rttMs: number;
  at: number;
}

/**
 * Keeps the recent exchanges for one node and reports the one with the shortest round trip,
 * because the offset error of a sample is bounded by half its round-trip time.
 * The numbers describe the estimate, not measured motor timing.
 * Samples are stored in milliseconds regardless of wire units.
 */
export class ClockTracker {
  private samples: Kept[] = [];
  private lastAt: number | null = null;

  constructor(
    private readonly maxUncertaintyMs: number,
    private readonly maxAgeMs: number,
    private readonly keep = 8
  ) {}

  add(sample: ClockSample): void {
    const { offsetMs, rttMs } = solveSample(sample);
    if (!Number.isFinite(offsetMs) || rttMs < 0) return;
    this.samples.push({ offsetMs, rttMs, at: sample.t4 });
    if (this.samples.length > this.keep) this.samples.shift();
    this.lastAt = sample.t4;
  }

  reset(): void {
    this.samples = [];
    this.lastAt = null;
  }

  status(now: number): ClockStatus | null {
    if (this.lastAt === null || this.samples.length === 0) return null;
    const best = this.samples.reduce((a, b) => (b.rttMs < a.rttMs ? b : a));
    const ageMs = now - this.lastAt;
    const uncertaintyMs = best.rttMs / 2;
    return {
      synced: ageMs <= this.maxAgeMs && uncertaintyMs <= this.maxUncertaintyMs,
      offsetMs: best.offsetMs,
      rttMs: best.rttMs,
      uncertaintyMs,
      ageMs
    };
  }

  /** Converts a coordinator time to this node's clock. Only meaningful while synced. */
  toNodeTime(coordMs: number, now: number): number | null {
    const st = this.status(now);
    return st ? coordMs + st.offsetMs : null;
  }
}
