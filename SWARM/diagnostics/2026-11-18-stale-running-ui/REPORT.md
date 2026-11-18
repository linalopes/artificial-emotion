# Stale Perform `Wave: running` after completed 3-loop autonomous Wave

**Date:** 2026-11-18 ~16:15 UTC+1  
**Mode:** Read-only investigation. No STOP / HOME / OTA / clear / motor commands.

## Verdict

**Safe to clear Mac run state.** Modules are idle and already finished locally. The UI lock is a **coordinator bookkeeping stall**, not live motion.

## Evidence

| Field | Value |
|-------|--------|
| Mac `run.phase` | **`running`** (locks Perform) |
| `runId` | `27fb9395b1d644a0b639594eb81a111` |
| Score | Wave · `durationMs=240000` · autonomous · loop · **maxLoops=3** (not continuous) |
| Armed | `2026-11-18T14:49:18.401Z` |
| Expected end | +720 s (+4 s grace) → watch expired `15:01:24.877Z` |
| Durable settlement | **`run_watch_expired` only** — **zero** `completion` / `run_complete` for this runId |
| Disconnects during run | 11 disconnect + 22 reconnect_reconcile (Wi-Fi interrupt test) |

**Live module status (all nine, fw 0.3.10):**

- `moving=false`, `homing=false`, no fault  
- `autonomousReported=false`  
- `completedPasses=3`, `loopIndex=2`  
- `completionReason=max_loops`  
- `reportedRunId=""` (run cleared on modules)  
- Fresh telemetry (~1 s)

Physical “no motion” matches firmware; Mac `perNode` still all `"running"`.

UI `77:38 / 4:00` = wall elapsed since `startAtMs` while phase stuck `running`, over a **4:00** score length (one Wave pass).

## Cause

1. **0.3.10** mutes WebSocket I/O for the whole autonomous run → Mac often never receives `run_completed`.
2. After local `max_loops`, modules resume status with `completion_reason=max_loops` / `autonomous=false` / `!moving`.
3. Coordinator finish path requires `perNode === 'finished'` from **`run_completed` events** (`onRunStatus`).
4. `reconcileAutonomousTelemetry` **intentionally does not** promote status → `finished` (comment: wait for explicit finished).
5. Autonomous watch expiry (0.3.8+) **does not cancel/stop** and also **does not mark the Mac run finished** — it waits forever.

Result: modules done; Mac forever `running` → Perform locked; only Stop run (which would fan out cancel/stop — unnecessary here).

## Safe recovery (no code yet — choose one)

**Preferred now (no motor commands):** restart the coordinator/dev process only. In-memory `run` resets; modules stay as they are (already idle).

**Avoid for this case:** operator **Stop run** — safe-ish while idle, but sends cancel/stop contrary to “do not STOP” and is the wrong semantic.

**Do not** HOME/OTA/execute until Mac phase is no longer active.

## Proposed fix (prevent recurrence) — report only

Smallest coordinator change (no firmware required):

When Mac autonomous phase is `running` and a node’s **status** shows local completion, e.g.:

- `!moving` and `!homing` and no fault, and  
- `completionReason` in `{max_loops, max_runtime, …}` and/or `autonomous === false` with `completedPasses` consistent with the armed policy  

→ set `perNode[node] = 'finished'` (and durable `completion` from status). When all participants settled → `phase = 'finished'` **without** device cancel/stop.

Optional belt-and-suspenders: on `run_watch_expired`, if every **connected** node already matches that idle-completed fingerprint, finish the Mac run immediately.

Also: UI Stop during 0.3.10 autonomy still cannot reach modules mid-run; separate caveat from this stale-finished lock.

**Not changing code until you approve.**
