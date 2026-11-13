import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { NODE_IDS, SCORE_SCHEMA, type Intent, type NodeId, type Score, type ServerMessage } from '@swarm/shared';
import { createApp, type App } from '../src/app';
import { loadConfig } from '../src/config';
import { SIM_WIRE } from '../src/devices/sim-codec';

/**
 * These tests run the real coordinator against nine SIMULATED nodes over local WebSockets.
 * They exercise the coordinator's logic. They say nothing about the ESP32 firmware.
 */
const OP = 'operator';
let app: App;

const until = async (cond: () => boolean, ms = 6000, what = 'condition') => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};
const node = (id: NodeId) => app.coordinator.fleet.get(id);
const run = () => app.coordinator.snapshot(OP).run;
const send = (intent: Intent, client = OP) => app.coordinator.handle(client, intent);

function shortScore(durationMs = 800, from = 100, to = 102): Score {
  const tracks = Object.fromEntries(NODE_IDS.map((id, i) => [id, [
    { tMs: 0, zMm: from + i, ease: 'linear' as const },
    { tMs: durationMs / 2, zMm: to + i, ease: 'linear' as const },
    { tMs: durationMs, zMm: from + i, ease: 'linear' as const }
  ]])) as Score['tracks'];
  return { schema: SCORE_SCHEMA, name: 'Test', durationMs, loop: true, tracks };
}

async function homeAll() {
  expect((await send({ type: 'home', nodes: [...NODE_IDS] })).ok).toBe(true);
  await until(() => NODE_IDS.every((id) => node(id).homed && !node(id).moving), 8000, 'homing');
}
async function positioned(score: Score) {
  expect(await send({ type: 'goToStart', score })).toEqual({ ok: true });
  await until(() => run().phase === 'positioned', 8000, 'start positions');
}

beforeEach(async () => {
  const cfg = { ...loadConfig({}), port: 0, host: '127.0.0.1', ackTimeoutMs: 300, clockIntervalMs: 100, clockMaxAgeMs: 800, startLeadMs: 500, snapshotIntervalMs: 50 };
  app = await createApp(cfg, { speedFactor: 150, telemetryMs: 40, tickMs: 10, reconnectMs: 100 });
  app.coordinator.clientJoined(OP);
  await send({ type: 'claimOperator' });
  await until(() => NODE_IDS.every((id) => node(id).connected && node(id).lastTelemetryAtMs !== null && app.coordinator.device.clockStatus(id)?.synced === true), 6000, 'nine synced nodes');
});
afterEach(async () => {
  await app.close();
});

describe('connections', () => {
  it('registers nine simulated nodes, marks them simulated, and estimates their clocks', () => {
    const snap = app.coordinator.snapshot(OP);
    expect(snap.fleet).toBe('simulator');
    expect(snap.nodes.every((n) => n.connected && n.simulated && n.fwVersion === 'sim-0.2.0')).toBe(true);
    // Simulated node clocks are skewed by up to 10 s; a synced status means the offset was recovered.
    expect(snap.nodes.every((n) => n.clock!.synced && n.clock!.uncertaintyMs < 25)).toBe(true);
    expect(snap.nodes.some((n) => Math.abs(n.clock!.offsetMs) > 100)).toBe(true);
  });

  it('rejects a second device claiming an identity that is already connected', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/device`);
    const got: string[] = [];
    ws.on('message', (d) => got.push(d.toString()));
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ v: SIM_WIRE, event: { type: 'hello', nodeId: 'Mau01', fwVersion: 'x', simulated: true } }));
    await new Promise((r) => ws.on('close', r));
    expect(got.join()).toContain('duplicate_identity');
    expect(node('Mau01').connected).toBe(true);
    expect(app.coordinator.snapshot(OP).log.some((l) => l.level === 'error' && l.message.includes('Duplicate identity'))).toBe(true);
  });

  it('rejects unknown identities and notices a node dropping and returning', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/device`);
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ v: SIM_WIRE, event: { type: 'hello', nodeId: 'Mau10', fwVersion: 'x', simulated: true } }));
    await new Promise((r) => ws.on('close', r));
    app.sim!.scenario('disconnect', 'Mau07');
    await until(() => !node('Mau07').connected);
    expect(app.coordinator.snapshot(OP).nodes[6].clock).toBeNull();
    expect(NODE_IDS.filter((id) => node(id).connected)).toHaveLength(8);
    app.sim!.scenario('reconnect', 'Mau07');
    await until(() => node('Mau07').connected);
  });
});

describe('operator model and message validation', () => {
  it('lets only the operator move, but lets anyone stop', async () => {
    app.coordinator.clientJoined('guest');
    expect((await send({ type: 'home', nodes: ['Mau01'] }, 'guest')).ok).toBe(false);
    expect((await send({ type: 'claimOperator' }, 'guest')).ok).toBe(false);
    expect((await send({ type: 'engageStop' }, 'guest')).ok).toBe(true);
    expect(app.coordinator.snapshot('guest').stop.engaged).toBe(true);
    expect((await send({ type: 'releaseStop' }, 'guest')).ok).toBe(false);
    expect((await send({ type: 'releaseStop' })).ok).toBe(true);
    app.coordinator.clientLeft(OP);
    expect((await send({ type: 'claimOperator' }, 'guest')).ok).toBe(true);
  });

  it('answers malformed browser messages with an error instead of acting on them', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
    const results: ServerMessage[] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMessage;
      if (m.type === 'result') results.push(m);
    });
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ id: '1', intent: { type: 'move', nodes: ['Mau99'], targetMm: 5 } }));
    ws.send(JSON.stringify({ id: '2', intent: { type: 'spin', nodes: ['Mau01'] } }));
    ws.send(JSON.stringify({ id: '3', intent: { type: 'home', nodes: ['Mau01'] } }));
    await until(() => results.length === 3);
    expect(results.map((r) => r.type === 'result' && r.ok)).toEqual([false, false, false]);
    expect(results[2].type === 'result' && results[2].error).toContain('Another browser holds control');
    expect(node('Mau01').homing).toBe(false);
    ws.close();
  });
});

describe('commands', () => {
  it('refuses to move an unhomed module, then homes and moves it with real acknowledgments', async () => {
    const refused = await send({ type: 'move', nodes: ['Mau02'], targetMm: 200 });
    expect(refused.ok).toBe(false);
    expect(refused.outcomes![0].error).toContain('not homed');
    await homeAll();
    expect(node('Mau02').positionMm).toBe(0);
    expect(node('Mau02').endstop).toBe(true);
    expect(node('Mau02').lastHomedAtMs).not.toBeNull();
    expect((await send({ type: 'move', nodes: ['Mau02'], targetMm: 5000 })).ok).toBe(false);
    expect((await send({ type: 'move', nodes: ['Mau02', 'Mau03'], targetMm: 200 })).ok).toBe(true);
    await until(() => node('Mau02').positionMm === 200 && !node('Mau02').moving);
    expect(node('Mau02').travelSinceHomeMm).toBeGreaterThan(190);
    expect(node('Mau01').positionMm).toBe(0);
  });

  it('applies speed changes only after the node confirms them, and rejects out-of-range values', async () => {
    expect((await send({ type: 'setParams', nodes: ['Mau04'], rpm: 40 })).ok).toBe(false);
    expect((await send({ type: 'setParams', nodes: ['Mau04'], rpm: 8 })).ok).toBe(true);
    await until(() => node('Mau04').rpm === 8);
    expect(node('Mau05').rpm).toBe(12);
  });

  it('reports a per-node failure for a disconnected module and a timeout for a silent one', async () => {
    app.sim!.scenario('disconnect', 'Mau09');
    await until(() => !node('Mau09').connected);
    const r = await send({ type: 'home', nodes: ['Mau08', 'Mau09'] });
    expect(r.ok).toBe(false);
    expect(r.outcomes).toEqual([{ node: 'Mau08', ok: true }, { node: 'Mau09', ok: false, error: 'is not connected' }]);

    // A device that registers as Mau09 but never acknowledges anything.
    const mute = new WebSocket(`ws://127.0.0.1:${app.port}/device`);
    await new Promise((res) => mute.on('open', res));
    mute.send(JSON.stringify({ v: SIM_WIRE, event: { type: 'hello', nodeId: 'Mau09', fwVersion: 'mute', simulated: true } }));
    await until(() => node('Mau09').connected);
    const t = await send({ type: 'home', nodes: ['Mau09'] });
    expect(t.ok).toBe(false);
    expect(t.outcomes![0].error).toContain('no acknowledgment');
    const stop = await send({ type: 'stopAll' });
    expect(stop.ok).toBe(false);
    expect(stop.error).toContain('NOT confirmed by: Mau09');
    mute.close();
  });

  it('blocks motion while the software stop is engaged and stops moving modules', async () => {
    await homeAll();
    await send({ type: 'setParams', nodes: ['Mau01'], rpm: 1 });
    await send({ type: 'move', nodes: ['Mau01'], targetMm: 900 });
    await until(() => node('Mau01').moving);
    expect((await send({ type: 'engageStop' })).ok).toBe(true);
    await until(() => !node('Mau01').moving);
    expect(node('Mau01').positionMm).toBeLessThan(900);
    expect((await send({ type: 'move', nodes: ['Mau01'], targetMm: 100 })).error).toContain('Software stop');
    expect((await send({ type: 'goToStart', score: shortScore() })).error).toContain('Software stop');
    await send({ type: 'releaseStop' });
    expect((await send({ type: 'move', nodes: ['Mau01'], targetMm: 100 })).ok).toBe(true);
  });
});

describe('collective run', () => {
  it('refuses to position or execute when a module is not ready', async () => {
    const r = await send({ type: 'goToStart', score: shortScore() });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Mau01 is not homed');
  });

  it('refuses an infeasible score', async () => {
    await homeAll();
    const r = await send({ type: 'goToStart', score: shortScore(800, 100, 900) });
    expect(r.error).toContain('mm/s');
    expect(run().phase).toBe('idle');
  });

  it('positions, then loads, prepares, commits and completes with confirmation from all nine', async () => {
    await homeAll();
    const score = shortScore();
    expect((await send({ type: 'execute', score, confirmed: true, repeat: false })).error).toContain('Go to start');
    await positioned(score);
    expect(node('Mau03').positionMm).toBeCloseTo(102, 0);
    const changed = shortScore(800, 100, 103);
    expect((await send({ type: 'execute', score: changed, confirmed: true, repeat: false })).ok).toBe(false);
    expect(await send({ type: 'execute', score, confirmed: true, repeat: false })).toEqual({ ok: true });
    expect(run().phase).toBe('armed');
    expect(Object.values(run().perNode)).toEqual(Array(9).fill('armed'));
    expect((await send({ type: 'move', nodes: ['Mau01'], targetMm: 50 })).error).toContain('run is in progress');
    await until(() => run().phase === 'running', 3000, 'running');
    await until(() => run().phase === 'finished', 5000, 'finished');
    expect(NODE_IDS.every((id) => run().perNode[id] === 'finished')).toBe(true);
  });

  it('repeats a looping score until cancelled, and cancel stops the modules', async () => {
    await homeAll();
    const score = shortScore(600);
    await positioned(score);
    await send({ type: 'execute', score, confirmed: true, repeat: true });
    await until(() => run().pass >= 2 && run().phase === 'running', 8000, 'second pass');
    expect((await send({ type: 'cancelRun' })).ok).toBe(true);
    expect(run().phase).toBe('cancelled');
    await new Promise((r) => setTimeout(r, 300));
    expect(NODE_IDS.every((id) => !node(id).moving)).toBe(true);
  });

  it('fails the run and stops everyone when a module faults during playback', async () => {
    await homeAll();
    const score = shortScore(3000);
    await positioned(score);
    await send({ type: 'execute', score, confirmed: true, repeat: false });
    await until(() => run().phase === 'running', 3000);
    app.sim!.scenario('homingFault', 'Mau06');
    await until(() => run().phase === 'failed', 3000, 'failure');
    expect(run().error).toContain('Mau06');
    await until(() => node('Mau06').faultCode === 'HOMING_FAILED');
    expect((await send({ type: 'home', nodes: ['Mau06'] })).outcomes![0].error).toContain('clear it first');
    expect((await send({ type: 'clearFault', nodes: ['Mau06'] })).ok).toBe(true);
  });

  it('fails the run when a module disconnects during playback', async () => {
    await homeAll();
    const score = shortScore(3000);
    await positioned(score);
    await send({ type: 'execute', score, confirmed: true, repeat: false });
    await until(() => run().phase === 'running', 3000);
    app.sim!.scenario('disconnect', 'Mau07');
    await until(() => run().phase === 'failed', 3000, 'failure');
    expect(run().error).toContain('Mau07 disconnected');
  });

  it('refuses to execute when a clock is no longer synchronised', async () => {
    await homeAll();
    const score = shortScore();
    await positioned(score);
    app.sim!.scenario('clockFault', 'Mau05');
    await until(() => app.coordinator.device.clockStatus('Mau05')?.synced === false, 3000, 'stale clock');
    const r = await send({ type: 'execute', score, confirmed: true, repeat: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Mau05 clock is not synchronised');
    expect(run().phase).toBe('positioned');
  });
});
