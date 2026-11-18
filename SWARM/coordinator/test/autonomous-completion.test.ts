import { describe, expect, it } from 'vitest';
import {
  AUTONOMOUS_STATUS_FRESH_MS,
  statusIndicatesAutonomousCompletion,
  type AutonomousCompletionEvidence,
  type AutonomousRunExpectation
} from '../src/autonomous-completion';

const expectLoops: AutonomousRunExpectation = {
  runId: '27fb9395b1d644a0b639594eb81a111',
  maxLoops: 3,
  continuous: false
};

const baseOk = (now: number): AutonomousCompletionEvidence => ({
  moving: false,
  homing: false,
  faultCode: null,
  autonomous: false,
  completionReason: 'max_loops',
  completedPasses: 3,
  runId: '',
  telemetryAtMs: now
});

describe('statusIndicatesAutonomousCompletion', () => {
  it('accepts fresh idle max_loops status after autonomy ended (no run_completed event)', () => {
    const now = 1_000_000;
    expect(statusIndicatesAutonomousCompletion(baseOk(now), expectLoops, now)).toBe(true);
  });

  it('accepts matching runId on the status frame', () => {
    const now = 1_000_000;
    const ev = { ...baseOk(now), runId: expectLoops.runId };
    expect(statusIndicatesAutonomousCompletion(ev, expectLoops, now)).toBe(true);
  });

  it('rejects stale telemetry (must not unlock Perform)', () => {
    const now = 1_000_000;
    const ev = { ...baseOk(now), telemetryAtMs: now - AUTONOMOUS_STATUS_FRESH_MS - 1 };
    expect(statusIndicatesAutonomousCompletion(ev, expectLoops, now)).toBe(false);
  });

  it('rejects missing completion reason or still-autonomous / moving', () => {
    const now = 1_000_000;
    expect(
      statusIndicatesAutonomousCompletion({ ...baseOk(now), completionReason: null }, expectLoops, now)
    ).toBe(false);
    expect(
      statusIndicatesAutonomousCompletion({ ...baseOk(now), autonomous: true }, expectLoops, now)
    ).toBe(false);
    expect(statusIndicatesAutonomousCompletion({ ...baseOk(now), moving: true }, expectLoops, now)).toBe(
      false
    );
    expect(
      statusIndicatesAutonomousCompletion({ ...baseOk(now), completedPasses: 2 }, expectLoops, now)
    ).toBe(false);
  });

  it('rejects a different run id', () => {
    const now = 1_000_000;
    expect(
      statusIndicatesAutonomousCompletion({ ...baseOk(now), runId: 'other-run' }, expectLoops, now)
    ).toBe(false);
  });

  it('accepts max_runtime for continuous ceiling', () => {
    const now = 1_000_000;
    const expectRt: AutonomousRunExpectation = {
      runId: 'abc',
      continuous: true,
      maxRuntimeMs: 12 * 60 * 60 * 1000
    };
    const ev: AutonomousCompletionEvidence = {
      ...baseOk(now),
      completionReason: 'max_runtime',
      completedPasses: 40,
      runId: 'abc'
    };
    expect(statusIndicatesAutonomousCompletion(ev, expectRt, now)).toBe(true);
  });

  it('is idempotent for duplicate evidence (same inputs stay true)', () => {
    const now = 1_000_000;
    const ev = baseOk(now);
    expect(statusIndicatesAutonomousCompletion(ev, expectLoops, now)).toBe(true);
    expect(statusIndicatesAutonomousCompletion(ev, expectLoops, now)).toBe(true);
  });
});
