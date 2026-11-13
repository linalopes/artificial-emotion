import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp, type App } from '../src/app';
import { loadConfig } from '../src/config';
import { FW_PROTOCOL_VERSION } from '../src/devices/firmware-codec';

/**
 * Exercises the coordinator against a minimal firmware-protocol peer.
 * This is not a physical ESP32 and must not be reported as hardware verification.
 */
const TOKEN = 'bench-token';
const OP = 'operator';

let app: App;

const until = async (cond: () => boolean, ms = 5000, what = 'condition') => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

function status(moduleId: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    protocol_version: FW_PROTOCOL_VERSION,
    message_id: Date.now(),
    source: moduleId,
    target: 'swarm-controller',
    type: 'status',
    timestamp_ms: Date.now(),
    payload: {
      module_id: moduleId,
      firmware_version: '0.2.0',
      state: 'UNHOMED',
      fault: 'none',
      position_valid: false,
      z_mm_est: null,
      endstop_debounced_closed: false,
      rssi: -60,
      speed_rpm: 2,
      max_travel_mm: 500,
      clock_synced: false,
      ...extra
    }
  });
}

describe('hardware fleet (firmware protocol peer)', () => {
  afterEach(async () => {
    await app?.close();
  });

  it('refuses hardware mode without an auth token', async () => {
    await expect(createApp({ ...loadConfig({}), fleet: 'hardware', authToken: null, port: 0, host: '127.0.0.1' })).rejects.toThrow(
      /SWARM_AUTH_TOKEN/
    );
  });

  it('registers from status, syncs clocks with fin, accepts home, and nacks bad auth', async () => {
    app = await createApp({
      ...loadConfig({}),
      fleet: 'hardware',
      authToken: TOKEN,
      port: 0,
      host: '127.0.0.1',
      ackTimeoutMs: 500,
      clockIntervalMs: 80,
      clockMaxAgeMs: 2000,
      helloTimeoutMs: 2000,
      snapshotIntervalMs: 50
    });
    expect(app.sim).toBeNull();
    expect(app.codec.speaksFirmware).toBe(true);

    app.coordinator.clientJoined(OP);
    await app.coordinator.handle(OP, { type: 'claimOperator' });

    const inbound: string[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/swarm`);
    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.on('message', (d) => inbound.push(d.toString()));
    ws.send(status('Mau01'));

    await until(() => app.coordinator.fleet.get('Mau01').connected, 3000, 'status registration');
    expect(app.coordinator.fleet.get('Mau01').simulated).toBe(false);
    expect(app.coordinator.fleet.get('Mau01').fwVersion).toBe('0.2.0');

    // Answer clock_sync_req with resp so the coordinator can send clock_sync_fin.
    await until(() => inbound.some((m) => m.includes('clock_sync_req')), 3000, 'clock req');
    const req = JSON.parse(inbound.find((m) => m.includes('clock_sync_req'))!);
    const t2 = Number(req.payload.t1_us) + 500;
    const t3 = t2 + 200;
    ws.send(
      JSON.stringify({
        protocol_version: 1,
        message_id: 'sync-1',
        source: 'Mau01',
        target: 'swarm-controller',
        type: 'clock_sync_resp',
        payload: {
          sync_seq: req.payload.sync_seq,
          t1_us: req.payload.t1_us,
          t2_us: t2,
          t3_us: t3,
          ref: req.message_id
        }
      })
    );
    await until(() => inbound.some((m) => m.includes('clock_sync_fin')), 3000, 'clock fin');
    const fin = JSON.parse(inbound.find((m) => m.includes('clock_sync_fin'))!);
    expect(fin.payload.t4_us).toBeGreaterThan(fin.payload.t1_us);
    expect(typeof fin.payload.t1_us).toBe('number');

    // Report synced + ready after fin (what firmware status would do).
    ws.send(status('Mau01', { state: 'READY', position_valid: true, z_mm_est: 0, clock_synced: true, endstop_debounced_closed: true }));
    await until(() => app.coordinator.fleet.get('Mau01').clockSyncedFromNode === true, 2000, 'node clock flag');
    await until(() => app.coordinator.device.clockStatus('Mau01')?.synced === true, 3000, 'mac clock');

    // Home: peer must ack with matching message_id ref.
    const homePromise = app.coordinator.handle(OP, { type: 'home', nodes: ['Mau01'] });
    await until(() => inbound.some((m) => {
      try {
        const j = JSON.parse(m);
        return j.type === 'home';
      } catch {
        return false;
      }
    }), 2000, 'home command');
    const homeCmd = JSON.parse(inbound.filter((m) => JSON.parse(m).type === 'home').at(-1)!);
    expect(homeCmd.payload.auth_token).toBe(TOKEN);
    ws.send(
      JSON.stringify({
        protocol_version: 1,
        source: 'Mau01',
        type: 'ack',
        payload: { ref: homeCmd.message_id, ok: true, detail: 'homing started' }
      })
    );
    expect(await homePromise).toEqual({ ok: true, outcomes: [{ node: 'Mau01', ok: true }] });

    // Mark homed so coordinator allows the move; node then nacks (e.g. auth / not ready).
    app.coordinator.fleet.telemetry(
      'Mau01',
      {
        positionMm: 0,
        targetMm: 0,
        homed: true,
        homing: false,
        moving: false,
        endstop: true,
        faultCode: null,
        rssiDbm: -60,
        rpm: 2,
        accelMmS2: 20,
        limitMinMm: 0,
        limitMaxMm: 500,
        clockSynced: true
      },
      Date.now()
    );
    const movePromise = app.coordinator.handle(OP, { type: 'move', nodes: ['Mau01'], targetMm: 100 });
    await until(() => inbound.some((m) => {
      try {
        return JSON.parse(m).type === 'move_to_mm';
      } catch {
        return false;
      }
    }), 2000, 'move');
    const moveCmd = JSON.parse(inbound.filter((m) => JSON.parse(m).type === 'move_to_mm').at(-1)!);
    expect(moveCmd.payload.position_mm).toBe(100);
    ws.send(
      JSON.stringify({
        protocol_version: 1,
        source: 'Mau01',
        type: 'nack',
        payload: { ref: moveCmd.message_id, ok: false, detail: 'auth failed' }
      })
    );
    const moved = await movePromise;
    expect(moved.ok).toBe(false);
    expect(moved.outcomes![0].error).toContain('auth failed');

    // Commit encoding uses shared start_at_us (verified via encode path after prepare sequence units).
    const commitMsg = app.codec.encodeCommand(
      'cid',
      { name: 'commit', runId: 'run-x', startAtCoordUs: 9_000_000 },
      'Mau01'
    );
    expect(JSON.parse(commitMsg).payload.start_at_us).toBe(9_000_000);

    // Missing acknowledgment times out.
    const stopPromise = app.coordinator.handle(OP, { type: 'stopNodes', nodes: ['Mau01'] });
    await until(() => inbound.some((m) => {
      try {
        return JSON.parse(m).type === 'stop';
      } catch {
        return false;
      }
    }), 2000, 'stop');
    const stopped = await stopPromise;
    expect(stopped.ok).toBe(false);
    expect(stopped.outcomes![0].error).toContain('no acknowledgment');

    ws.close();
  });

  it('rejects a duplicate Mau identity on the firmware path', async () => {
    app = await createApp({
      ...loadConfig({}),
      fleet: 'hardware',
      authToken: TOKEN,
      port: 0,
      host: '127.0.0.1',
      helloTimeoutMs: 2000
    });
    const a = new WebSocket(`ws://127.0.0.1:${app.port}/swarm`);
    await new Promise<void>((r) => a.on('open', () => r()));
    a.send(status('Mau02'));
    await until(() => app.coordinator.fleet.get('Mau02').connected);

    const got: string[] = [];
    const b = new WebSocket(`ws://127.0.0.1:${app.port}/swarm`);
    b.on('message', (d) => got.push(d.toString()));
    await new Promise<void>((r) => b.on('open', () => r()));
    b.send(status('Mau02'));
    await new Promise<void>((r) => b.on('close', () => r()));
    expect(got.join()).toContain('duplicate_identity');
    expect(app.coordinator.fleet.get('Mau02').connected).toBe(true);
    a.close();
  });
});
