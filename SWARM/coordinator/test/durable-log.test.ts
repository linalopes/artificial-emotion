import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DurableLog, isClockSyncNoise } from '../src/durable-log';

describe('durable log', () => {
  let dir: string;
  let log: DurableLog | null = null;

  afterEach(async () => {
    if (log) await log.flush();
    log = null;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('classifies clock-sync chatter as noise', () => {
    expect(isClockSyncNoise('Mau01 clock_sync_fin refused: rtt out of range')).toBe(true);
    expect(isClockSyncNoise('Mau07 disconnected.')).toBe(false);
    expect(isClockSyncNoise('Run failed: Mau07 disconnected during running.')).toBe(false);
  });

  it('rate-limits clock noise and persists structured run events asynchronously', async () => {
    dir = mkdtempSync(join(process.cwd(), 'tmp-dlog-'));
    const path = join(dir, 'events.jsonl');
    log = new DurableLog(path, 60_000);

    expect(log.accept('warn', 'Mau01 clock_sync_fin refused: rtt out of range')).toBe(true);
    expect(log.accept('warn', 'Mau02 clock_sync_fin refused: rtt out of range')).toBe(false);
    expect(log.accept('error', 'Mau05 reports fault track_infeasible.')).toBe(true);

    log.write({
      kind: 'run_start',
      runId: 'abc',
      message: 'Wave armed',
      detail: { durationMs: 240000, maxLoops: 3 }
    });
    log.write({
      kind: 'disconnect',
      runId: 'abc',
      nodeId: 'Mau07',
      message: 'Mau07 disconnected'
    });
    log.write({
      kind: 'cancel_stop',
      runId: 'abc',
      message: 'should not appear for autonomous link loss',
      detail: { initiator: 'test' }
    });
    await log.flush();

    const lines = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { kind: string; runId?: string; nodeId?: string });
    expect(lines.some((e) => e.kind === 'run_start' && e.runId === 'abc')).toBe(true);
    expect(lines.some((e) => e.kind === 'disconnect' && e.nodeId === 'Mau07')).toBe(true);
    expect(lines.every((e) => !JSON.stringify(e).includes('auth') && !JSON.stringify(e).includes('token'))).toBe(
      true
    );
  });

  it('write() returns immediately even if the filesystem is slow (no event-loop stall)', async () => {
    dir = mkdtempSync(join(process.cwd(), 'tmp-dlog-slow-'));
    const path = join(dir, 'events.jsonl');
    log = new DurableLog(path, 60_000);
    const t0 = Date.now();
    for (let i = 0; i < 50; i++) {
      log.write({ kind: 'info', message: `burst ${i}`, detail: { i } });
    }
    const elapsed = Date.now() - t0;
    // Sync appendFileSync to a stalled volume previously blocked > ackTimeout (1500 ms).
    expect(elapsed).toBeLessThan(200);
    await log.flush();
    const n = readFileSync(path, 'utf8').trim().split('\n').length;
    expect(n).toBe(50);
  });
});
