#!/usr/bin/env node
/**
 * Mau01-only autonomous Wave pilot (15 min finite maxRuntimeMs).
 * Interactive: waits for Enter before each motion intent. Does nothing if you Ctrl-C.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import WebSocket from 'ws';
import { generateWave, DEFAULT_PARAMS } from '@swarm/shared';

const WS = process.env.SWARM_WS ?? 'ws://127.0.0.1:8787/ws';
const MAX_RUNTIME_MS = 15 * 60 * 1000;
const NODES = ['Mau01'];

const rl = createInterface({ input, output });
const pause = async (label) => {
  await rl.question(`\n→ ${label}\n  Press Enter to send (Ctrl-C to abort)… `);
};

const ws = new WebSocket(WS);
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});

let snap = null;
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.type === 'snapshot') snap = m.snapshot;
  if (m.type === 'result') console.log('result', m);
});

await new Promise((r) => setTimeout(r, 300));
const mau01 = () => snap?.nodes?.find((n) => n.id === 'Mau01');
console.log('Mau01 now:', {
  fw: mau01()?.fwVersion,
  connected: mau01()?.connected,
  homed: mau01()?.homed,
  moving: mau01()?.moving,
  fault: mau01()?.faultCode,
  completionReason: mau01()?.completionReason,
  wsReconnectDeferred: mau01()?.wsReconnectDeferred,
  incompleteStopCount: mau01()?.incompleteStopCount
});

if (mau01()?.fwVersion !== '0.3.8') {
  console.error('Abort: Mau01 is not on firmware 0.3.8');
  process.exit(1);
}

const send = (intent) => {
  const id = `pilot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  ws.send(JSON.stringify({ id, intent }));
  return id;
};

await pause('claimOperator');
send({ type: 'claimOperator' });
await new Promise((r) => setTimeout(r, 200));

await pause('HOME Mau01 only');
send({ type: 'home', nodes: NODES });

await pause('Wait until Mau01 is homed, then GO TO START (Wave, Mau01 only)');
const score = generateWave(DEFAULT_PARAMS.wave);
send({ type: 'goToStart', score, nodes: NODES });

await pause('Wait until positioned, then EXECUTE autonomous Wave 15 min (Mau01 only)');
console.log(`maxRuntimeMs=${MAX_RUNTIME_MS} (finite — not continuous)`);
console.log('After motion is visible: sleep Mac / drop Wi-Fi; keep physical cutoff ready.');
send({
  type: 'execute',
  score,
  confirmed: true,
  repeat: false,
  autonomous: true,
  autonomousLoop: true,
  maxRuntimeMs: MAX_RUNTIME_MS,
  nodes: NODES
});

console.log('\nIntents issued. Monitor Mau01; reconnect after ~15 min and check completionReason=max_runtime.');
await rl.question('Press Enter to exit this helper (does not STOP)… ');
rl.close();
ws.close();
