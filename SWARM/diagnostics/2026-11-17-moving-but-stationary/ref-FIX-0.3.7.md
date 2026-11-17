# Firmware 0.3.7 — Incomplete segment completion fix

**Date:** 2026-11-17  
**Incident:** overnight Wave failure @ loop 103 (`REPORT.md`)  
**No OTA / clear / home / move / commit / push.**

---

## Confirmed defect

In 0.3.6 `TrackPlayer::service()`, when `phase_ == SegmentActive` and the planner became **idle**, the player advanced to the next keyframe or called `finishPass()` **without checking `MotionPlanner::targetReached()`**.

`MotionPlanner` already distinguishes:

- `finishIdle(true)` → `targetReached_ = true` (arrived)
- `IncompleteStop` / controlled stop → `finishIdle(false)` → `targetReached_ = false` (position estimate retained)

So an incomplete last segment could be treated as complete → next loop started from the wrong steps → loop-boundary `track_infeasible` once residual exceeded the 1 mm gate (or prelude/`beginSegment` failed). That matches the synchronized loop-103 cascade after ~7 h on 0.3.6.

Tolerance was **not** increased. Default geometry remains ≈ **86.92 steps/mm** → tol ≈ **87 steps** (1 mm).

---

## Exact code changes

| Area | Change |
|---|---|
| `autonomous_policy.h` | `decideSegmentIdleAction`, labels `CONTINUE`/`CORRECT`/`FAULT`, segment result labels |
| `track_player.cpp/.h` | Track `activeTargetSteps_`; on idle + `!targetReached()` → **resume** `moveToSteps(activeTarget)` (no snap); only then advance/finishPass; `BoundaryDiag` for telemetry |
| `protocol.cpp` | Status field `loop_boundary` (last event only; seq bumps on boundary CORRECT/FAULT and incomplete resume/fault) |
| `PROTOCOL.md` / codec | Document + map `loop_boundary` |
| Version | **0.3.7** (`platformio.ini`, README) |

Preserved: 1 mm corrective prelude, soft limits, endstops, stop/FAULT, clock sync, autonomous-on-Wi‑Fi-loss.

---

## Tests / build

| Check | Result |
|---|---|
| `pio test -e native_host` | **49 / 49 PASSED** |
| New: segment idle / incomplete→1000 loops / Wi‑Fi disconnect / continuous long-run | PASSED |
| `pio run -e swarm_s3_4mb_ota` | **SUCCESS** (~931 KB flash used) |

---

## Rollout warranted?

**Yes — Wi‑Fi OTA of 0.3.7 to Mau01–Mau09** after operator clears faults / re-homes as usual (not done in this pass). Without this fix, multi-hour continuous Wave can still lose closure when IncompleteStop is mis-classified as segment complete.

---

## Remaining limits

- Chronic stall that never reaches target will keep resuming until `moveToSteps` fails → FAULT (intentional).
- ESP Serial still useful; status now carries last `loop_boundary` for Mac-side diagnosis.
- Long soak after OTA still required to confirm multi-hour stability.
