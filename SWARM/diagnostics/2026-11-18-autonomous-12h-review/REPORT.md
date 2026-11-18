# SWARM — 12-hour autonomous Wave review (firmware 0.3.7)

**Date of review:** 2026-11-18  
**Mode:** read-only (no STOP, home, clear-fault, OTA, restart, commit, or push)  
**Primary evidence:** `SWARM/coordinator/data/coordinator-events.jsonl`, live snapshot 2026-11-18T07:43:04Z, `pmset -g log`, firmware 0.3.7 source  
**Extract:** `run-summary.json` in this folder  

**Run ID:** `6de33fc3098a4020944771ab5456e42`

---

## Executive summary

This was a **continuous autonomous Wave** (score 240 s, `continuous: true`, `maxRuntimeMs: null`). It is **not** a clean “firmware reached 12 h and finished” success.

| Verdict | Detail |
|---|---|
| Wall runtime to Mac stop | **12 h 0 m** from phase `running` → Mac `failRun` |
| Who ended it | **Coordinator** `completion_watch` → `failRun` → cancel+stop — **not** firmware `run_completed` |
| Firmware 12 h self-stop | **Did not apply** — continuous with `maxRuntimeMs=0` loops without local runtime expiry |
| FAULT / `track_infeasible` | **None** observed for this run |
| Operator STOP | **None** |
| Modules at Mac stop | Still **moving / autonomous**, ~**174–176** completed passes, all `loop_boundary` **CONTINUE** |
| Now (review time) | Connected, **0.3.7**, **no faults**, **positionValid**, idle motors; Mac run phase **`failed`** |
| Mac sleep vs motion | Artist “stationary while Mac asleep” is **supported by loop-counter gaps**, not by video. Design says ESP32s should continue; **this run does not prove continuous physical motion through Deep Idle.** |

**Do not declare the test successful** solely because the installation is IDLE without a visible fault.

---

## Part A — Latest run reconstruction

### Timeline (exact)

| Event | UTC | Europe/Zurich (CET, UTC+1) |
|---|---|---|
| Wave armed (`run_start`) | 2026-11-17T17:30:59.237Z | 2026-11-17 **18:30:59** |
| Phase → `running` | 2026-11-17T17:31:01.728Z | 2026-11-17 **18:31:01** |
| First durable pass (fleet) | 2026-11-17T17:34:54.767Z | 2026-11-17 **18:34:54** |
| Last durable pass before stop | 2026-11-18T05:30:24.108Z | 2026-11-18 **06:30:24** |
| Mac `run_failed` + cancel+stop | 2026-11-18T05:31:05.538Z | 2026-11-18 **06:31:05** |

- **Elapsed (running → failRun):** **12 h 0 m 4 s** wall.  
- **Configured Mac wait:** `expectedMs = 43_200_000` (12 h) + `graceMs = 4000`.  
- **Mode:** autonomous + autonomousLoop + **continuous**; `maxLoops: null`; `maxRuntimeMs: null`.  
- **Score:** Wave, `durationMs: 240000` (4 min), fingerprint `4eef727e`.

### Termination reason

```
Completion was not confirmed by Mau01 … Mau09.
initiator: coordinator:completion_watch
```

Then durable `cancel_stop` (`cancel+stop after failRun`).

**Interpretation:** At the Mac’s 12 h watch deadline, **no module had reported `run_completed` / finished**. The coordinator treated that as failure and **issued cancel+stop**. Last pass events (~1 minute earlier) still show `moving: true`, `autonomous: true`.

### Firmware vs Mac 12 h ceiling

| Layer | Behavior for this config |
|---|---|
| Coordinator | Waits 12 h (`AUTONOMOUS_RUNTIME_CEILING_MS`), then fails if not finished |
| Firmware 0.3.7 | `runtimeExpired()` is false when `maxRuntimeMs == 0`; `mayStartNextLoop` for **continuous** returns **true** without applying the 12 h define as an active stop |

So the installation **did not** “reach the expected 12-hour firmware ceiling” as a local completion. The Mac **cut the run** at its watch bound while modules were still playing.

### Interruptions during the run

| Class | Observed? |
|---|---|
| Operator / agent STOP | **No** |
| FAULT / `track_infeasible` | **No** (0 fault events for this `runId`) |
| Disconnect | **Yes** — 70 durable disconnects (batches around sleep/DarkWake), policy `autonomousStarted: true` |
| Reconnect | **Yes** — massive `reconnect_reconcile` volume (see observability note) |
| Trajectory replay on reconnect | **No** evidence of re-arm / new `run_start` |

### Did all nine end normally?

**No.** None reported completion. Mac stopped all via failRun. Final durable pass counts:

| Module | Last completedPasses (durable) | Last pass time (UTC) |
|---|---|---|
| Mau01 | 176 | 05:30:24Z |
| Mau02 | 175 | 05:30:17Z |
| Mau03 | 176 | 05:30:15Z |
| Mau04 | 176 | 05:30:18Z |
| Mau05 | 176 | 05:30:16Z |
| Mau06 | 174 | 05:30:16Z |
| Mau07 | 176 | 05:30:19Z |
| Mau08 | 176 | 05:30:17Z |
| Mau09 | 176 | 05:30:15Z |

Spread of **2 passes** (Mau06/Mau02 slightly behind) — consistent with mild free-run drift after clock invalidation, not a cascade fault.

### Current fleet (snapshot 07:43:04Z)

All nine: connected, **fw 0.3.7**, homed, **not moving**, **fault null**, **positionValid true**, clocks synced.  
`reportedRunId` still `6de33fc3…`; `autonomousReported: false`; `lastLoopBoundaryAction: CONTINUE`.  
Coordinator `run.phase`: **`failed`** (error text as above). Software stop **not** engaged.

---

## Part B — Per-module loop report

Source: durable `pass` events for this `runId` (1581 total) + live snapshot.  
**Firmware version:** 0.3.7 (connect logs + snapshot).  
**Run ID:** `6de33fc3098a4020944771ab5456e42` for all.

| Node | Passes (max) | First progress | Last progress | Boundary CONTINUE / CORRECT / FAULT | Disconnects | Final durable state |
|---|---|---|---|---|---|---|
| Mau01 | 176 | 17:34:58Z | 05:30:24Z | 176 / 0 / 0 | 7 | moving, auto, valid, CONTINUE |
| Mau02 | 175 | 17:34:57Z | 05:30:17Z | 175 / 0 / 0 | 8 | moving, auto, valid, CONTINUE |
| Mau03 | 176 | 17:34:55Z | 05:30:15Z | 176 / 0 / 0 | 8 | moving, auto, valid, CONTINUE |
| Mau04 | 176 | 17:34:55Z | 05:30:18Z | 176 / 0 / 0 | 8 | moving, auto, valid, CONTINUE |
| Mau05 | 176 | 17:34:54Z | 05:30:16Z | 176 / 0 / 0 | 8 | moving, auto, valid, CONTINUE |
| Mau06 | 174 | 17:34:55Z | 05:30:16Z | 174 / 0 / 0 | 8 | moving, auto, valid, CONTINUE |
| Mau07 | 176 | 17:34:54Z | 05:30:19Z | 176 / 0 / 0 | 7 | moving, auto, valid, CONTINUE |
| Mau08 | 176 | 17:34:57Z | 05:30:17Z | 176 / 0 / 0 | 8 | moving, auto, valid, CONTINUE |
| Mau09 | 176 | 17:34:58Z | 05:30:15Z | 176 / 0 / 0 | 8 | moving, auto, valid, CONTINUE |

- **Last Mac run phase (collective):** `failed` after `running` (per-node often stuck `reconnected` in UI state).  
- **Consistency:** Yes at fleet scale (174–176). No CORRECT/FAULT boundary labels in durable pass details.  
- **Score-time estimate:** 176 × 240 s ≈ **11.73 h** of Wave score time (if each pass were a full 240 s epoch).  
- **Unknown:** true motor mm traveled during Mac Deep Idle (no independent video).

### Pass-timing anomaly (important)

Mau01 inter-pass Δt (durable receive times):

- Early window (~18:34–20:31 CET): **~240 s** — matches Wave duration.  
- Many later intervals: **~89–90 s** (109 of 175 gaps &lt; 120 s).  
- Long gaps: up to **~48 min** with only **+1** pass.

So “completedPasses advanced” is evidenced, but **not always at 4 min/pass**. The 90 s clusters are **unresolved** (possible catch-up after epoch/scheduling effects during flaky link/DarkWake — not proven). They prevent treating every pass increment as a clean 4-minute physical Wave cycle.

### Observability note

~**170 883** `reconnect_reconcile` lines for this run — after `perNode === 'reconnected'`, **every** status frame re-logs reconcile. That floods the JSONL and must be fixed later; it does not by itself prove 170k physical reconnects (disconnect count is ~70).

---

## Part C — Mac sleep investigation

### Sleep/wake during the run (CET)

Run window: **18:31 CET 17 Nov → 06:31 CET 18 Nov**.

| Kind | Role in this night |
|---|---|
| **Idle Sleep** | Rare in-window (e.g. 20:32:20, 05:16:34) — brief, then maintenance cycle |
| **Maintenance / Sleep Service** | Dominant — repeated ~5–17 min Deep Idle segments; **~4.9 h** summed sleep-duration fields in-window |
| **DarkWake** | Frequent brief/long wakes (Wi‑Fi/SMC/rtc); coordinator can run intermittently |
| **User full wake** | **04:10:55 CET** (UserActivity); later morning wake **08:25 CET** (after Mac stop) |

(Pre-run Idle Sleep 17:32–17:46 CET on 17 Nov belongs to the **previous** session, not this `runId`.)

### Loop progress vs sleep

Example (Mau01):

| From pass → to | Wall gap | Pass Δ | Expected Δ if 4 min/pass |
|---|---|---|---|
| 30 → 31 | **44.3 min** | 1 | ~11 |
| 31 → 32 | **48.0 min** | 1 | ~12 |
| 32 → 33 | **33.1 min** | 1 | ~8 |
| 78 → 79 | **32.8 min** | 1 | ~8 |

These gaps align with overnight Maintenance Sleep clusters. **If** ESP32s had continued Wave at full rate while the Mac was in Deep Idle, durable logs after wake should show **multi-pass jumps** (or a large single jump). Instead the next observed counter is typically **+1**.

**Evidence classes:**

| Class | This run |
|---|---|
| Direct physical observation during sleep | Artist report of **stationary** spheres — not instrumented |
| Indirect loop counters across sleep | **Supports stall / near-stall** during Deep Idle windows |
| Post-reconnect RUNNING / moving flags | Present — **insufficient** alone to prove motion *during* sleep |
| Design (firmware Case C) | Disconnect after start → **continue**; clock invalidate → local `millis()` epoch |

### Firmware dependency check (0.3.7)

- WebSocket loss after start: **continue** autonomous (`TrackPlayer::onCoordinatorDisconnected` Case C).  
- Missing clock_sync: invalidates sync; playback uses **local epoch**, not Mac heartbeats.  
- Reconnect: status/reconcile only — **no** trajectory reload in coordinator.  
- Continuous + `maxRuntimeMs=0`: **no** local 12 h stop (Mac watch is the bound that fired).

**Conclusion for Part C:** Architecture still intends independence; **this overnight dataset does not demonstrate uninterrupted physical autonomy through Mac Deep Idle.** It is compatible with the artist’s stationary observation. Root cause of stall (Wi‑Fi/radio side effects, power, planner, or something else) is **not identified** from Mac logs alone.

---

## Part D — Proposed controlled autonomy test (do not auto-execute)

**Goal:** Prove or refute physical motion while the Mac cannot coordinate.

### Setup

1. HOME all nine; GO TO START; EXECUTE LIVE Wave, autonomous + loop + continuous (or a **short** finite `maxRuntimeMs` e.g. 20–30 min for a pilot).  
2. Confirm all moving; record `completedPasses` / positions / `runId` for each module.  
3. Start **phone video** of at least three modules (tripod, continuous recording, wall-clock visible).  
4. Keep **physical motor-power cutoff** reachable independent of the Mac.  
5. Either: (A) put Mac into **Idle Sleep**, or (B) disable Mac Wi‑Fi only (prefer A to match gallery behavior).  
6. Leave undisturbed **10–15 minutes** (supervised).  
7. Wake / reconnect Mac **without** STOP, home, or re-EXECUTE.  
8. Compare: video motion during outage; `completedPasses` before vs after; durable pass Δ vs expected (~outage_min / 4).

### Pass criteria

- Video shows ongoing motion through the outage, **and**  
- Pass counters advance by ≈ expected count (±1), **and**  
- No FAULT; positions remain valid; no trajectory replay.

### Fail / investigate

- Video still while counters flat → autonomy stall (matches this night’s suspicion).  
- Video still but counters jump on wake → logging-only illusion (unlikely given +1 gaps).  
- Video moves but counters flat → telemetry path bug.

### Safety

Software STOP is best-effort. **Physical cutoff is mandatory** for this test. No OTA, no unattended first attempt.

---

## Part E — Faults, interruptions, recovery

| Item | Finding |
|---|---|
| FAULT | None this run |
| Operator STOP | None |
| Mac-initiated stop | Yes — completion_watch at 12 h |
| Disconnect/reconnect | Yes — correlated with sleep/DarkWake; autonomous policy kept |
| Recovery | Modules accepted post-wake telemetry; no replay; Mac eventually stop-all via failRun |
| End state | Idle, valid, no fault; Mac phase `failed` |

---

## Confirmed vs unresolved

### Confirmed

1. Latest long run is `6de33fc3…`, continuous Wave, ~12 h wall.  
2. Ended by **coordinator completion_watch**, not firmware completion.  
3. No `track_infeasible` / sticky FAULT this run.  
4. Pass counters reached **~174–176** with **CONTINUE** only.  
5. Continuous + null `maxRuntimeMs` does **not** engage firmware 12 h runtime expiry.  
6. Deep Idle sleep was extensive overnight; pass gaps with Δ≈1 contradict full-rate autonomy during those windows.  
7. Present fleet is healthy (connected, 0.3.7, valid, no fault).

### Unresolved

1. Why physical/counter progress appears to **stall in Deep Idle** despite Case C.  
2. Why many awake/DarkWake pass intervals are **~90 s** instead of 240 s.  
3. Exact physical motion during unobserved hours (no video).  
4. Whether Mac DarkWake intervals fully explain residual progress.  
5. Product intent: should continuous UI always send `max_runtime_ms = 12h` into prepare?

---

## Assessment of 0.3.7 long-run reliability

**Positive:** Multi-hour continuous Wave without `track_infeasible` (unlike 0.3.5/0.3.6 overnight faults). Loop-boundary path stayed on **CONTINUE**. Positions remained valid through Mac stop.

**Negative / incomplete:** Run did not self-complete cleanly; Mac failRun stopped still-moving modules; autonomy-through-sleep is **not** validated; pass-timing anomalies and reconcile log flood remain.

**Overall:** Best long-run mechanical result so far on 0.3.7, but **not** a verified 12 h autonomous success, and **not** proof of Mac-independent motion during sleep.

---

## Recommended next test

1. **Supervised sleep/Wi‑Fi outage test** (Part D) with phone video — highest priority.  
2. For the next long run: set explicit **`maxRuntimeMs = 12h`** (or finite loops) so firmware and Mac agree on completion; confirm `run_completed` before declaring success.  
3. Coordinator follow-ups (separate change set): stop re-logging `reconnect_reconcile` every status; treat continuous completion without forcing failRun-stop if modules still legally playing under firmware ceiling policy.  
4. Keep physical cutoff procedures unchanged.

---

*Evidence files: this `REPORT.md`, `run-summary.json`, live durable log path above. No motors commanded during this review.*
