# GO TO START 9/9 acknowledgment timeouts — diagnosis & fix

Evidence captured under this directory (coordinator not restarted for capture).

## Confirmed timeline (durable log)

| UTC | Event |
|---|---|
| 15:37:44 | Wave armed AUTONOMOUS → running |
| … | ~65 min; clock-sync RTT refusals suppressed in batches (up to 226/min) |
| 16:42:43 | Operator cancel → cancel+stop |
| 16:42:45–47 | GO TO START / stop: **all nine** `no acknowledgment within 1500 ms` |
| 16:45 | Modules report `track_infeasible` (separate from ack timeout) |

Live snapshot after capture: clocks recovering (9/9 Mac+node synced), **0 moving**, faults `track_infeasible`, not homed — UI “9/9 homed / 0 faults” was not the post-failure Mac truth at capture time.

## Root cause (confirmed)

1. **Synchronous durable logging** (`appendFileSync` to `Documents/.../coordinator-events.jsonl`) ran on the Node event loop. Under iCloud/Documents I/O stalls this blocks WebSocket ack handling past **1500 ms**, so *every* pending command (including `stop`) times out together.  
2. **Overlapping cancel/stop and goToStart** flooded nine links while clock sync kept probing, amplifying ack starvation on a busy LAN.  
3. **1500 ms itself** is not the primary defect: even `stop` (fast path on firmware) got zero matching acks — that pattern fits **Mac-side processing stall / congestion**, not modules needing a longer timeout. Clock fin “rtt out of range” shows Wi‑Fi delay spikes but not a measured need to raise the gate.

## Did motors move on GO TO START?

**No evidence they did.** Timeouts (not `busy with home/track` / `moving` acks) mean the Mac never received command acknowledgments. Firmware would nack promptly if `move_to_mm` were handled while a track was active. Treat GO TO START as **not executed** from the Mac’s point of view.

## Fix (coordinator-only; applied in tree)

1. Durable log writes are **async + queued** (no `appendFileSync` on the hot path).  
2. Fleet **clock probing pauses** while any command ack is pending.  
3. **`goToStart` / `stopAll` serialized** via `enqueueFleetIo` so cancel completes before positioning moves.

No timeout increase. No clock-sync bypass. No OTA / clear / home / auto GO TO START.

## Tests

- Durable log: non-blocking burst write + async persist (flush joins drain chain; mkdir/append errors swallowed)  
- Coordinator: cancel then immediate goToStart succeeds without acknowledgment errors  
- Software stop still reported ahead of score-speed errors after `enqueueFleetIo` readiness re-check  

## Verification

`npm test -- coordinator/test/durable-log.test.ts coordinator/test/coordinator.test.ts` → **27/27 passed** (includes cancel→goToStart regression and non-blocking durable write).  
`tsc -p coordinator --noEmit` run after the fix. Coordinator was **not** restarted here (evidence already under this directory). No GO TO START / home / clear / OTA performed by the agent.

## Recovery

Coordinator restarted **2026-11-15T17:46:54Z** (hardware `:8787`). Post-restart snapshot: `diagnostics/2026-11-15-goto-start-ack/post-restart-snapshot.json`.

Observed after reconnect (no clear/home/GO TO START/EXECUTE):

- **9/9 connected**, fw **0.3.5**, **0 moving**, run **idle**, stop **released**
- **9/9 clocks** Mac-synced + `clockSyncedFromNode`
- **9/9 FAULT `track_infeasible`**, `positionValid: false`, `homed: false`, `positionMm: null` (no positions to preserve)
- Durable JSONL active (`coordinator/data/coordinator-events.jsonl`); no `appendFileSync` in tree

**Still required before Wave:** clear fault + home on **Mau01–Mau09**, then GO TO START / EXECUTE (operator).
