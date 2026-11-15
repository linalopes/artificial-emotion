import { describe, expect, it } from 'vitest';
import { FW_RUN_ID_MAX_LEN, isValidFirmwareRunId, newFirmwareRunId } from '../src/ids';

/**
 * Mirrors firmware RunController::loadRun:
 *   strlen(runId) >= SWARM_RUN_ID_MAX (32) → "invalid run_id"
 */
function firmwareWouldReject(runId: string): boolean {
  return !runId || runId.length >= 32;
}

describe('firmware run_id length gate', () => {
  it('rejects a dashed UUID the way firmware 0.3.5 does (regression)', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(uuid.length).toBe(36);
    expect(firmwareWouldReject(uuid)).toBe(true);
    expect(isValidFirmwareRunId(uuid)).toBe(false);
  });

  it('accepts compact ids from newFirmwareRunId', () => {
    for (let i = 0; i < 20; i++) {
      const id = newFirmwareRunId();
      expect(id.length).toBe(FW_RUN_ID_MAX_LEN);
      expect(id.includes('-')).toBe(false);
      expect(firmwareWouldReject(id)).toBe(false);
      expect(isValidFirmwareRunId(id)).toBe(true);
    }
  });

  it('truncates a provided UUID to the firmware max', () => {
    const id = newFirmwareRunId('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(id).toBe('f'.repeat(31));
    expect(id.length).toBe(31);
    expect(isValidFirmwareRunId(id)).toBe(true);
  });
});
