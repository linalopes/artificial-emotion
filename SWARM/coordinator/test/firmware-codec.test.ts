import { describe, expect, it } from 'vitest';
import { NODE_IDS, generateWave, DEFAULT_PARAMS, isValidFirmwareRunId, newFirmwareRunId } from '@swarm/shared';
import {
  FW_MAX_KEYFRAMES,
  FW_MAX_MESSAGE_BYTES,
  FW_PROTOCOL_VERSION,
  FW_WIRE,
  createFirmwareCodec,
  estimateLoadTrajectoryBytes,
  telemetryFromStatus
} from '../src/devices/firmware-codec';

const TOKEN = 'test-token-not-for-logging';
const codec = createFirmwareCodec({ authToken: TOKEN });

describe('firmware codec', () => {
  it('is tagged as the real firmware wire and refuses an empty token', () => {
    expect(codec.name).toBe(FW_WIRE);
    expect(codec.speaksFirmware).toBe(true);
    expect(() => createFirmwareCodec({ authToken: '' })).toThrow(/auth token/i);
  });

  it('encodes privileged commands with auth_token and firmware type names', () => {
    const home = JSON.parse(codec.encodeCommand('m1', { name: 'home' }, 'Mau03'));
    expect(home).toMatchObject({
      protocol_version: FW_PROTOCOL_VERSION,
      message_id: 'm1',
      target: 'Mau03',
      type: 'home',
      payload: { auth_token: TOKEN }
    });

    const move = JSON.parse(codec.encodeCommand('m2', { name: 'move', targetMm: 400 }, 'Mau01'));
    expect(move.type).toBe('move_to_mm');
    expect(move.payload.position_mm).toBe(400);
    expect(move.payload.auth_token).toBe(TOKEN);

    const stop = JSON.parse(codec.encodeCommand('m3', { name: 'stop' }, 'Mau01'));
    expect(stop.type).toBe('stop');
    expect(stop.payload.auth_token).toBeUndefined();

    const params = JSON.parse(codec.encodeCommand('m4', { name: 'set_params', rpm: 4, accelMmS2: 20 }, 'Mau02'));
    expect(params.type).toBe('set_config');
    expect(params.payload).toMatchObject({ speed_rpm: 4, acceleration_mm_s2: 20, auth_token: TOKEN });

    const clear = JSON.parse(codec.encodeCommand('m5', { name: 'clear_fault' }, 'Mau01'));
    expect(clear.type).toBe('clear_fault');

    const cancel = JSON.parse(codec.encodeCommand('m6', { name: 'cancel', runId: 'run-1' }, 'Mau01'));
    expect(cancel.type).toBe('cancel_run');
    expect(cancel.payload.run_id).toBe('run-1');
  });

  it('encodes prepare_run and commit_run with absolute coordinator microseconds', () => {
    const prep = JSON.parse(codec.encodeCommand('p1', { name: 'prepare', runId: 'wave-1' }, 'Mau05'));
    expect(prep.type).toBe('prepare_run');
    expect(prep.payload).toMatchObject({ run_id: 'wave-1', auth_token: TOKEN });
    expect(prep.payload.autonomous).toBeUndefined();

    const prepAuto = JSON.parse(
      codec.encodeCommand(
        'p2',
        { name: 'prepare', runId: 'wave-1', autonomous: true, loop: true, maxLoops: 3 },
        'Mau05'
      )
    );
    expect(prepAuto.payload).toMatchObject({
      autonomous: true,
      loop: true,
      max_loops: 3,
      auth_token: TOKEN
    });

    const commit = JSON.parse(
      codec.encodeCommand('c1', { name: 'commit', runId: 'wave-1', startAtCoordUs: 1_500_000 }, 'Mau05')
    );
    expect(commit.type).toBe('commit_run');
    expect(commit.payload.start_at_us).toBe(1_500_000);
    expect(commit.payload.startAtNodeMs).toBeUndefined();
    expect(commit.payload.delay_ms).toBeUndefined();
    expect(() => codec.encodeCommand('c2', { name: 'commit', runId: 'wave-1', startAtNodeMs: 99 }, 'Mau05')).toThrow(
      /startAtCoordUs/
    );
  });

  it('encodes load_trajectory with time_ms/z_mm and enforces keyframe and size caps', () => {
    const frames = [
      { tMs: 0, zMm: 100, ease: 'linear' as const },
      { tMs: 1000, zMm: 200, ease: 'linear' as const },
      { tMs: 2000, zMm: 100, ease: 'linear' as const }
    ];
    const load = JSON.parse(
      codec.encodeCommand('l1', { name: 'load_trajectory', runId: 'r1', durationMs: 2000, keyframes: frames, presetId: 'Wave' }, 'Mau01')
    );
    expect(load.type).toBe('load_trajectory');
    expect(load.payload.track).toEqual([
      { time_ms: 0, z_mm: 100 },
      { time_ms: 1000, z_mm: 200 },
      { time_ms: 2000, z_mm: 100 }
    ]);
    expect(Buffer.byteLength(JSON.stringify(load), 'utf8')).toBeLessThanOrEqual(FW_MAX_MESSAGE_BYTES);

    const tooMany = Array.from({ length: FW_MAX_KEYFRAMES + 1 }, (_, i) => ({
      tMs: i * 100,
      zMm: 100,
      ease: 'linear' as const
    }));
    expect(() =>
      codec.encodeCommand('l2', { name: 'load_trajectory', runId: 'r2', durationMs: 1, keyframes: tooMany }, 'Mau01')
    ).toThrow(/keyframes/);
  });

  it('encodes the four-timestamp clock exchange in microseconds', () => {
    const req = JSON.parse(codec.encodeClockRequest(7, 123456789, 'Mau04'));
    expect(req.type).toBe('clock_sync_req');
    expect(req.payload).toEqual({ sync_seq: 7, t1_us: 123456789 });

    const fin = JSON.parse(codec.encodeClockFin!(7, { t1: 1, t2: 2, t3: 3, t4: 4 }, 'Mau04'));
    expect(fin.type).toBe('clock_sync_fin');
    expect(fin.payload).toEqual({ sync_seq: 7, t1_us: 1, t2_us: 2, t3_us: 3, t4_us: 4 });
  });

  it('decodes ack/nack, status registration payload, clock_sync_resp and run events', () => {
    const ack = codec.decode(
      JSON.stringify({
        protocol_version: 1,
        message_id: 'x',
        source: 'Mau01',
        target: 'swarm-controller',
        type: 'ack',
        payload: { ref: 'm1', ok: true, detail: 'homing started' }
      })
    );
    expect(ack).toEqual({ type: 'ack', messageId: 'm1', ok: true });

    const nack = codec.decode(
      JSON.stringify({
        protocol_version: 1,
        message_id: 'x',
        source: 'Mau01',
        type: 'nack',
        payload: { ref: 'm2', ok: false, detail: 'auth failed' }
      })
    );
    expect(nack).toEqual({ type: 'ack', messageId: 'm2', ok: false, error: 'auth failed' });

    const status = codec.decode(
      JSON.stringify({
        protocol_version: 1,
        message_id: 1,
        source: 'Mau07',
        type: 'status',
        payload: {
          module_id: 'Mau07',
          firmware_version: '0.2.0',
          state: 'READY',
          fault: 'none',
          position_valid: true,
          z_mm_est: 120.5,
          endstop_debounced_closed: false,
          rssi: -55,
          speed_rpm: 2,
          max_travel_mm: 500,
          clock_synced: true
        }
      })
    );
    expect(status?.type).toBe('status');
    if (status?.type === 'status') {
      expect(status.nodeId).toBe('Mau07');
      expect(status.fwVersion).toBe('0.2.0');
      expect(status.simulated).toBe(false);
      expect(status.telemetry.homed).toBe(true);
      expect(status.telemetry.positionMm).toBe(120.5);
      expect(status.telemetry.clockSynced).toBe(true);
      expect(status.telemetry.limitMaxMm).toBe(500);
    }

    const sync = codec.decode(
      JSON.stringify({
        protocol_version: 1,
        source: 'Mau01',
        type: 'clock_sync_resp',
        payload: { sync_seq: 3, t1_us: 10, t2_us: 20, t3_us: 21 }
      })
    );
    expect(sync).toEqual({ type: 'clock_reply', seq: 3, t1: 10, t2: 20, t3: 21, units: 'us' });

    const started = codec.decode(
      JSON.stringify({
        protocol_version: 1,
        source: 'Mau01',
        type: 'run_started',
        payload: { run_id: 'r', start_error_us: 100 }
      })
    );
    expect(started).toEqual({ type: 'run_status', runId: 'r', state: 'running' });

    const failed = codec.decode(
      JSON.stringify({
        protocol_version: 1,
        source: 'Mau01',
        type: 'run_failed',
        payload: { run_id: 'r', detail: 'sync_lost_before_start' }
      })
    );
    expect(failed).toEqual({ type: 'run_status', runId: 'r', state: 'aborted', reason: 'sync_lost_before_start' });
  });

  it('maps unhomed status without claiming a position', () => {
    const t = telemetryFromStatus({
      state: 'UNHOMED',
      fault: 'none',
      position_valid: false,
      z_mm_est: null,
      clock_synced: false
    });
    expect(t.homed).toBe(false);
    expect(t.positionMm).toBeNull();
    expect(t.faultCode).toBeNull();
  });

  it('surfaces fault only while firmware state is FAULT (ignores sticky fault after stop desync)', () => {
    const stuck = telemetryFromStatus({
      state: 'UNHOMED',
      fault: 'track_infeasible',
      position_valid: false,
      z_mm_est: null,
      clock_synced: true
    });
    expect(stuck.faultCode).toBeNull();
    expect(stuck.homed).toBe(false);

    const real = telemetryFromStatus({
      state: 'FAULT',
      fault: 'track_infeasible',
      position_valid: false,
      z_mm_est: 120,
      clock_synced: true
    });
    expect(real.faultCode).toBe('track_infeasible');
    expect(real.homed).toBe(false);
    expect(real.positionMm).toBeNull();
  });

  it('keeps default generator tracks within firmware keyframe and message limits', () => {
    const score = generateWave(DEFAULT_PARAMS.wave);
    const runId = newFirmwareRunId();
    expect(isValidFirmwareRunId(runId)).toBe(true);
    for (const id of NODE_IDS) {
      expect(score.tracks[id].length).toBeLessThanOrEqual(FW_MAX_KEYFRAMES);
      const bytes = estimateLoadTrajectoryBytes({
        messageId: 'm1',
        target: id,
        runId,
        presetId: 'Wave',
        keyframes: score.tracks[id],
        authToken: TOKEN
      });
      expect(bytes).toBeLessThanOrEqual(FW_MAX_MESSAGE_BYTES);
      const body = JSON.parse(
        codec.encodeCommand(
          'm1',
          { name: 'load_trajectory', runId, durationMs: score.durationMs, keyframes: score.tracks[id], presetId: 'Wave' },
          id
        )
      );
      expect(body.payload.run_id).toBe(runId);
      expect(body.payload.run_id.length).toBeLessThan(32);
    }
  });

  it('ignores wrong protocol versions and simulator frames', () => {
    expect(codec.decode(JSON.stringify({ protocol_version: 99, type: 'status', source: 'Mau01', payload: {} }))).toBeNull();
    expect(codec.decode(JSON.stringify({ v: 'swarm-sim/0', event: { type: 'hello', nodeId: 'Mau01' } }))).toBeNull();
  });
});
