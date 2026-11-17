# SWARM ~5 h autonomous failure — 2026-11-16

**Mode:** diagnostics only. Coordinator left running. No clear-fault, home, move, reboot, OTA, restart, commit, or push.

**Evidence:** `SWARM/diagnostics/2026-11-16-5h-failure/`  
(durable `coordinator-events.jsonl`, live snapshot, terminal excerpt, `timeline-run.json`)

---

## Executive verdict

This stop was **not** a coordinator fleet-wide cancel/stop.

Eight modules independently entered firmware **`track_infeasible` within ~1.2 s**, all reporting **`loopIndex` / `completedPasses` = 74**, after ~5 h 02 m of continuous autonomous Wave. The Mac **did not** `failRun` / `cancel_stop`. Autonomous-disconnect handling **worked**. The sticky-fault firmware patch is **in source only** (fleet still **0.3.5**).

**Root cause (best supported):** firmware **loop-boundary exact-step check** after ~74 score passes — same mechanical class hypothesized on Nov 15, now proven with durable timestamps.

---

## Run identity

| Field | Value |
|---|---|
| Score | Wave (`4eef727e`), 240 000 ms |
| `runId` | `62e07807a5cb43c5a7b87092a6eda92` |
| Mode | `autonomous` + `autonomousLoop` + **`continuous: true`** (no maxLoops / maxRuntime) |
| Armed (UTC) | **2026-11-16T08:20:16.987Z** |
| Phase → running | 08:20:19.377Z |
| Expected Mac watch end | +43 204 000 ms (~12 h) from start — **not** the abort trigger |
| First fault (UTC) | **2026-11-16T13:22:20.685Z** |
| Elapsed to first fault | **5 h 02 m 04 s** ≈ 75.5 × 240 s |
| Live phase at capture | `finished` (Mac bookkeeping), `anyFault: true`, all `perNode` = `faulted` |
| Firmware on wire | **0.3.5** (all nine) |

---

## First confirmed failure

| | |
|---|---|
| **Timestamp** | **2026-11-16T13:22:20.685Z** |
| **Module** | **Mau03** |
| **Code** | **`track_infeasible`** |
| **Context** | `phase: running`, `positionValid: false`, **`loopIndex: 74`**, **`completedPasses: 74`** |
| **Coordinator reaction** | Log only: *“Mau03 faulted … during autonomous run — **other modules are not cancelled**.”* **No** `cancel_stop` / `failRun`. |

---

## Timeline (subsequent)

| UTC | Event |
|---|---|
| 08:19:51 | goToStart Wave |
| 08:20:16 | Wave armed AUTONOMOUS continuous |
| 08:20:19 | phase → running |
| 08:20 → 13:22 | No disconnect, no cancel, no fleet stop in durable log (clock RTT noise only) |
| **13:22:20.685** | **Mau03** `track_infeasible` @ loop **74** |
| 13:22:21.323 | Mau01 same @ 74 |
| 13:22:21.351 | Mau04 same @ 74 |
| 13:22:21.448 | Mau02 same @ 74 |
| 13:22:21.511 | Mau09 same @ 74 |
| 13:22:21.584 | Mau07 same @ 74 |
| 13:22:21.852 | Mau05 same @ 74 |
| 13:22:21.873 | Mau08 same @ 74 |
| 13:22:36 | Mau06 clock sync timeout (still no fault yet) |
| 13:26:26.189 | Mau06 disconnect (`autonomousStarted: true`) — **no fleet failRun** |
| 13:26:26.307 | Mau06 reconnect + reports `track_infeasible` @ loop **74** |
| 13:26:26.351 | Mac `run_complete` — “finished on Mac (some modules faulted/aborted locally; fleet was not cancelled)” |

**Initiator:** firmware on **Mau03** (first stamped fault).  
**Not initiator:** WebSocket disconnect (only Mau06, **after** the cascade), operator cancel, or coordinator `failRun`.

---

## What the previous fixes did / did not do

### Autonomous disconnect (coordinator) — **implemented and running**

Live process started **2026-11-16T08:13:26Z** with the fixed tree. Terminal evidence at fault time:

- Each module: *“faulted … — **other modules are not cancelled**.”*
- Mau06 link loss: durable `autonomousStarted: true`; **no** `cancel_stop`.

Nov 15 abort (`Mau07 disconnected` → fleet cancel+stop) **did not recur**.

### Sticky CLEAR FAULT (firmware) — **source only, not on ESP32**

- Modules still advertise **`fwVersion: 0.3.5`**.
- `module_state.cpp` / `operatorStop` fixes exist in the Mac tree but were **not OTA’d**.
- Today’s faults are **real `state === FAULT`** during playback (codec correctly surfaces them). Sticky-desync is a **recovery** issue, not this stop’s cause.

---

## Comparison with 2026-11-15 ~4 h failure

| | **2026-11-15** | **2026-11-16 (this)** |
|---|---|---|
| Durable JSONL | Missing / flooded; first fault time **unknown** | **Complete** |
| Mac abort reason | **`Mau07 disconnected` → `failRun` → cancel+stop** | **None** — no fleet cancel |
| Final UI | 9× `track_infeasible`, unhomed | Same end state |
| Fault timing | Unknown vs disconnect | **8 modules ≤1.2 s**, all **loop 74**; Mau06 +4 min |
| Continuous loops | Hypothesized | **Confirmed** (`completedPasses: 74`) |
| Policy bug (disconnect stops fleet) | **Yes (then)** | **Fixed; verified** |

**Same end symptom** (`track_infeasible` ×9). **Different Mac-side story:** yesterday the coordinator **also** fleet-stopped on disconnect; today the fleet **kept going** until firmware loop-boundary faults.

---

## Root cause (supported)

Firmware `TrackPlayer::service()` (0.3.5), loop restart path:

```text
passIndex_ > 0 && position_->steps() != first_keyframe_steps
  → enterFault(TrackInfeasible)
```

After **74** completed 4‑minute Wave passes (~4 h 56 m of score time; ~5 h 02 m wall including start skew), modules were **not exactly** on the first keyframe step count when the next loop began. Eight nodes hit that gate nearly together (shared score clock). Mau06 lagged / briefly dropped, then reported the same loop index.

This is **not** explained by an unnecessary coordinator stop (none occurred).

Serial logs were not collected (restricted); the exact step error magnitude is therefore not measured, but the **loopIndex lockstep** makes the loop-boundary path far more likely than unrelated per-module `moveToSteps` failures.

---

## Smallest correction to prevent recurrence

**Firmware (required for multi-hour continuous loops):**

1. At loop boundary (`passIndex_ > 0`), replace **exact step equality** with a **bounded tolerance** (mm or steps derived from mechanics), **or** allow a short prelude re-seek to the first keyframe when within soft limits — instead of immediate `track_infeasible`.
2. Log pass index, current steps, target first steps, and delta on that path (Serial + optional status field) so the next incident is conclusive without USB guesswork.
3. **OTA** that build to Mau01–Mau09 (sticky-fault clear fix can ride along).

**Coordinator:** no change required for this stop. Keep autonomous local-fault policy. Optional: durable-log `loopIndex` on periodic status during long runs (not strictly needed if firmware logs the boundary).

**Do not** treat CLEAR FAULT / re-home as a fix for recurrence — that only recovers after the fact.

---

## Instrumentation gaps (if logs were insufficient)

For this incident they were **sufficient** for Mac-side causality. Still useful next time:

1. Firmware Serial (or status) line at loop boundary with step delta.  
2. Per-module `run_completed` / pass events in durable JSONL (today Mac only saw faults + final `run_complete`).  
3. Explicit `track_phase` / `passIndex` in a low-rate durable sample during continuous runs.

---

## Live state at capture (do not clear / home here)

- 9/9 connected, fw 0.3.5  
- 9/9 `track_infeasible`, unhomed, position invalid  
- Software stop released; run phase `finished` with all `faulted`  
- Clocks still syncing (RTT refusals continue)
