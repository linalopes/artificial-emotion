# SWARM overnight failure — 2026-11-17 (firmware 0.3.6)

**Mode:** diagnosis only. Coordinator left running. No clear-fault, home, move, reboot, OTA, firmware edit, commit, or push.

**Evidence:** `SWARM/diagnostics/2026-11-17-overnight-failure/`  
(durable `coordinator-events.jsonl`, live snapshot, process info, terminal greps, `timeline-run.json`, `steps-per-mm-analysis.json`)

---

## Executive verdict

The installation did **not** stop at ~03:35 Zurich. That time matches a **post-mortem reconnect storm** while the Mac UI still showed FAULT.

**Actual first failure:** **2026-11-16T22:08:00.463Z** = **2026-11-16 23:08:00 CET**, **Mau06**, `track_infeasible`, **loopIndex / completedPasses = 103**, after **~7 h 07 m** wall / **~6 h 52 m** score time on firmware **0.3.6**.

Coordinator **did not** `failRun` / `cancel_stop`. Eight modules cascaded within ~1.0 s; Mau01 reported the same loop index ~9.5 min later; then Mac `run_complete`.

**0.3.6’s ≤1 mm corrective prelude was not sufficient to prevent another synchronized loop-boundary `track_infeasible`.** This is the same *fault class* as Nov 16 (loop restart / track player), not a Mac disconnect abort — but **not** the old exact-step bug (fleet already past loop 74; ran to 103).

Serial `LoopBoundary CORRECT/FAULT` lines were **not** available on the Mac, so the exact branch (Δ>tol vs prelude/`beginSegment` reject) is not wire-proven. Best-supported: **loop restart with residual outside the 1 mm gate and/or `moveToSteps`/`beginSegment` rejection**, shared across the fleet on the common epoch.

---

## Preserved state (capture ~2026-11-17T02:37Z)

| Item | Value |
|---|---|
| Coordinator | PID **88036**, started **2026-11-16 09:13:29** local, `src/main.ts`, port **8787** |
| Health | `fleet=hardware`, ok |
| Live run | `phase=finished`, `runId=799d3539875246879e711fc190257aa`, Wave `4eef727e`, autonomous+loop |
| Fleet | **9/9 connected**, fw **0.3.6**, **9/9 `track_infeasible`**, `homed=false`, `positionMm=null` |
| Travel since home | ~**97.9–98.2 km·mm** (~98 m) — consistent with ~103 Wave passes |

`enterFault()` always clears `positionValid` — UI “invalid positions” is a **consequence** of FAULT, not a separate wipe.

---

## Exact timeline

| UTC | Zurich (CET) | Event |
|---|---|---|
| 2026-11-16T15:00:52Z | 16:00:52 | `goToStart Wave` |
| 2026-11-16T15:01:19.107Z | 16:01:19 | Wave **armed** AUTONOMOUS continuous (`799d3539…`) |
| 2026-11-16T15:01:21.594Z | 16:01:21 | phase → **running** |
| 15:01 → 22:08 | — | No fleet cancel; clock RTT noise only in durable log |
| **2026-11-16T22:08:00.463Z** | **23:08:00** | **First fault: Mau06 `track_infeasible` @ loop 103** |
| 22:08:00.990 → 22:08:01.474Z | 23:08:00–01 | Mau09,05,07,04,03,08,02 same @ **103** (~1.0 s cascade) |
| 22:17:00.260Z | 23:17:00 | Mau09 clock sync timeout (after cascade) |
| **2026-11-16T22:17:36.049Z** | **23:17:36** | **Mau01** same fault @ **103** (late report) |
| 2026-11-16T22:17:36.074Z | 23:17:36 | Mac `run_complete` — fleet **not** cancelled |
| 2026-11-17T02:35:39Z≈ | **03:35:39** | Reconnect burst (UI observation window) |

**Elapsed to first fault:** **7 h 06 m 38 s** wall; **103 × 240 s = 6 h 52 m** score time at boundary.

**How the other eight stopped:** independent firmware `track_infeasible` at the same loop index (shared score clock). No coordinator stop. Mau01 lagged in *reporting* only; same `completedPasses`.

---

## steps/mm discrepancy

| Source | steps/mm |
|---|---|
| Live / SWARM-v1 commissioning estimate | **≈ 86.92** |
| Firmware **default** geometry (`spool_diameter_mm=15`, `steps_per_output_rev=4096`, cal=1) | **≈ 86.91982** |
| 0.3.6 FIX report / host test illustrative value | **≈ 43.46** (implies ~30 mm spool — **wrong for defaults**) |

**Runtime policy uses `config_->stepsPerMm()`**, so tolerance is `ceil(1.0 × live_spm)` ≈ **87 steps ≈ 1 mm** on default geometry. The 43.46 figure did **not** loosen or tighten the millimetre gate; it was a documentation/test geometry mistake. **Increasing loop tolerance is not justified by this discrepancy alone.**

---

## Did 0.3.6’s correction work?

**Partially.**

- Fleet ran **103** completed passes vs **74** on 0.3.5 (Nov 16) — longer continuous operation, so exact-step FAULT is **not** the remaining stopper.
- Failure is still **`track_infeasible` at loop restart** with synchronized cascade — same *family* as Nov 16.
- Mac Serial has **no** `LoopBoundary CORRECT` / `FAULT` / `prelude failed` lines (ESP logs not mirrored). We **cannot** prove whether any in-tolerance prelude executed earlier in the night.
- After FAULT, positions are invalid by design — not evidence that correction “lost” the reference mid-run without FAULT.

**Best-supported mechanism (code + logs):** at `passIndex==103` after `finishPass`, `TrackPlayer` entered `Playing` and hit one of:

1. `decideLoopBoundary` → **Fault** (`|Δ| > loopClosureToleranceSteps`)  
2. **CorrectivePrelude** `moveToSteps(first)` rejected (invalid position / busy / soft limits)  
3. **`beginSegment(0)`** rejected after AtStart or after prelude  

All three raise the same `track_infeasible`. Given 8-module sync at one loop index, (1) or a shared (3) on first segment of the new pass is most plausible. Blindly raising `SWARM_LOOP_CLOSURE_MM` would only help if measured `|Δ|` is slightly above 1 mm — **unknown without Serial delta**.

**Important code note:** `TrackPlayer` advances when the planner is **idle**, and does **not** require `targetReached()`. An `IncompleteStop` mid-segment retains estimated steps but still allows the score to proceed; a large miss on the **last** segment of a pass becomes the next loop-boundary residual. That can exceed 1 mm even with 0.3.6’s prelude gate.

---

## Comparison: Nov 15 / 16 / 17

| | **Nov 15 (~4 h)** | **Nov 16 (~5 h)** | **Nov 16→17 overnight** |
|---|---|---|---|
| Firmware | 0.3.5 | 0.3.5 | **0.3.6** |
| Wall to stop | ~4 h (poor Mac log) | **5 h 02 m** | **7 h 07 m** |
| First module | unknown / Mac saw Mau07 disconnect | **Mau03** | **Mau06** |
| Loop index | unknown | **74** | **103** |
| Fault | 9× `track_infeasible` (end state) | 9× `track_infeasible` | 9× `track_infeasible` |
| Coordinator | **`failRun` + cancel/stop** on disconnect | **No** fleet cancel | **No** fleet cancel |
| Position invalid | yes (post-FAULT) | yes | yes |
| Loop-boundary correction | none (exact step) | none (exact step) | **present; still faulted** |
| Mechanism | Mac abort **plus** firmware faults (order unclear) | Exact-step loop residual | Loop-boundary / segment reject **beyond** 1 mm gate (or prelude/`beginSegment` fail) |

**Recurrence:** same end symptom and synchronized loop-boundary signature as Nov 16, on **newer** firmware that already survived past loop 74. **Not** a return of the coordinator disconnect fleet-stop bug. **Not** proven identical to the exact-step bug.

---

## Root cause (evidence-supported)

1. **Primary:** Firmware `TrackPlayer` raised `track_infeasible` at autonomous loop restart after **103** completed Wave passes on **0.3.6**.  
2. **Not primary:** Coordinator cancel/stop, OTA, operator clear, or Wi-Fi fleet abort.  
3. **0.3.6 gap:** Corrections only cover residuals **≤ 1 mm**; larger residuals or `moveToSteps`/`beginSegment` failures still FAULT. Exact Δ unlogged.  
4. **Contributing design risk:** segment completion ignores `targetReached()`, so incomplete last-segment stops can present a large boundary residual.

---

## Smallest recommended fix (do not implement yet)

1. **Instrument first (smallest diagnostic fix):** surface last loop-boundary `expected/actual/delta/tol/action` in telemetry (or ensure Serial `LoopBoundary` lines are captured once). Without Δ, widening tolerance is guesswork.  
2. **Likely smallest *corrective* firmware change:** before `finishPass` / loop restart, if `!planner->targetReached()` on the last segment, either complete a bounded physical move to the last/first keyframe under the existing 1 mm policy or FAULT with an explicit incomplete-closure code — **and/or** refuse to advance the score on `IncompleteStop` without handling the residual. Prefer fixing incomplete-segment handling over raising `SWARM_LOOP_CLOSURE_MM`.  
3. **Do not** treat “increase loop tolerance” as the default fix until a measured delta shows the residual is a harmless closure error just above 1 mm.  
4. Correct the 0.3.6 docs/tests that cite **43.46** steps/mm; defaults are **≈86.92**.

---

## Missing evidence

- ESP Serial `LoopBoundary FAULT|CORRECT|prelude failed` at pass 103 (delta/tol).  
- Whether any module executed successful CORRECT preludes earlier in the run.  
- Why Mau01’s fault telegram arrived ~9.5 min later with the same loop index (link delay vs local stall).  
- Per-module live `steps_per_mm` in the post-fault snapshot (field not present on node UI object; travel counters only).

---

## Artifacts

| File | Content |
|---|---|
| `coordinator-events.jsonl` | Durable events (preserved copy) |
| `timeline-run.json` | Structured overnight timeline |
| `snapshots/snapshot-live.json` | Full live snapshot |
| `steps-per-mm-analysis.json` | 86.92 vs 43.46 analysis |
| `terminal-overnight-excerpt.txt` | Coord lines for arm/fault/finish |
| `coordinator-process.txt` | PID 88036 / sockets |
