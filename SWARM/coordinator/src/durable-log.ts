import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type DurableEventKind =
  | 'run_start'
  | 'run_expected_end'
  | 'run_phase'
  | 'run_complete'
  | 'run_failed'
  | 'connect'
  | 'disconnect'
  | 'reconnect_reconcile'
  | 'fault'
  | 'cancel_stop'
  | 'completion'
  | 'pass'
  | 'info'
  | 'warn'
  | 'error';

export type DurableEvent = {
  at: string;
  atMs: number;
  kind: DurableEventKind;
  runId?: string | null;
  nodeId?: string | null;
  message: string;
  detail?: Record<string, unknown>;
};

/** Clock-sync chatter that previously filled the ring buffer and terminal capture. */
export function isClockSyncNoise(message: string): boolean {
  return /clock_sync_|clock sync timed out|clock sync reset|clock_sync_fin|clock_sync_resp|clock_sync_req/i.test(
    message
  );
}

/**
 * Append-only JSONL event log for long autonomous runs.
 *
 * Writes are asynchronous and queued so a slow disk (e.g. iCloud under Documents)
 * cannot stall the coordinator event loop past command-ack timeouts.
 *
 * Never write credentials — callers must not put tokens in `message`/`detail`.
 */
export class DurableLog {
  private lastClockLogAt = 0;
  private suppressedClock = 0;
  private queue: string[] = [];
  /** Single-flight drain chain so callers can await completion without early-return races. */
  private drain: Promise<void> = Promise.resolve();
  private dirReady: Promise<void> | null = null;

  constructor(
    private readonly filePath: string | null,
    private readonly clockMinIntervalMs = 60_000
  ) {}

  get path(): string | null {
    return this.filePath;
  }

  /** Returns false when the event should not enter the UI ring / console (rate-limited noise). */
  accept(level: 'info' | 'warn' | 'error', message: string): boolean {
    if (!isClockSyncNoise(message)) return true;
    const now = Date.now();
    if (now - this.lastClockLogAt >= this.clockMinIntervalMs) {
      this.lastClockLogAt = now;
      if (this.suppressedClock > 0) {
        this.write({
          kind: 'warn',
          message: `Suppressed ${this.suppressedClock} repetitive clock-sync diagnostic(s) in the last interval.`,
          detail: { suppressed: this.suppressedClock }
        });
        this.suppressedClock = 0;
      }
      return true;
    }
    this.suppressedClock++;
    return false;
  }

  write(partial: Omit<DurableEvent, 'at' | 'atMs'> & { atMs?: number }): void {
    if (!this.filePath) return;
    const atMs = partial.atMs ?? Date.now();
    const event: DurableEvent = {
      at: new Date(atMs).toISOString(),
      atMs,
      kind: partial.kind,
      message: partial.message,
      ...(partial.runId !== undefined ? { runId: partial.runId } : {}),
      ...(partial.nodeId !== undefined ? { nodeId: partial.nodeId } : {}),
      ...(partial.detail ? { detail: partial.detail } : {})
    };
    this.queue.push(`${JSON.stringify(event)}\n`);
    void this.flush();
  }

  /** Await pending disk writes (tests / shutdown). Always joins the in-flight drain. */
  async flush(): Promise<void> {
    if (!this.filePath) return;
    this.drain = this.drain.then(() => this.drainOnce(), () => this.drainOnce());
    await this.drain;
  }

  private async drainOnce(): Promise<void> {
    if (!this.filePath) return;
    while (this.queue.length) {
      const batch = this.queue.splice(0, this.queue.length).join('');
      try {
        if (!this.dirReady) {
          this.dirReady = mkdir(dirname(this.filePath), { recursive: true }).then(
            () => undefined,
            () => {
              this.dirReady = null;
            }
          );
        }
        await this.dirReady;
        await appendFile(this.filePath, batch, 'utf8');
      } catch {
        // Disk full / permissions / vanished temp dirs must not take down the coordinator.
      }
    }
  }
}

export function durableLogFromEnv(env: NodeJS.ProcessEnv = process.env): DurableLog {
  const raw = env.SWARM_EVENT_LOG;
  if (raw === undefined) {
    return new DurableLog('data/coordinator-events.jsonl');
  }
  if (raw === '' || raw === 'off' || raw === '0') return new DurableLog(null);
  return new DurableLog(raw);
}
