# Firmware 0.3.6 — Loop-boundary fix report

**Date:** 2026-11-16  
**Incident:** `REPORT.md` (Wave `4eef727e`, run `62e07807…`, ~5 h 02 m → 9× `track_infeasible` @ loop 74)  
**No commit / push. No home / move.**

---

## 1. Exact root cause (firmware)

In 0.3.5, `TrackPlayer::service()` on every loop restart (`passIndex_ > 0`) required **exact step equality**:

```text
position_->steps() != mmToSteps(frames[0].zMm)  →  FaultCode::TrackInfeasible
```

Wave is loop-compatible in millimetres (`first.z_mm == last.z_mm`), so a fully completed pass *should* land on the first-keyframe step count. Any residual — incomplete segment stop, planner finish off by ≥1 step, or rounding at the mm↔step boundary — tripped FAULT even when the mechanical error was well inside the existing `SWARM_LOOP_CLOSURE_MM` (1 mm) gate used for `track_not_loop_compatible`.

The coordinator correctly did **not** fleet-stop (autonomous disconnect / fault policy). Modules faulted independently on the shared score clock.

---

## 2. Why the fault appeared at loop 74

- Score duration 240 s × 74 completed passes ≈ **4 h 56 m** of score time; wall ~**5 h 02 m** including arm/start skew — matches first Mau03 stamp.
- Loop 74 is the **first observed pass** where planner position ≠ first-keyframe steps at boundary under the exact gate — not a magic counter in firmware.
- Eight modules faulted within ~1.2 s (shared epoch). Mau06 reported the same `loopIndex` / `completedPasses` after a brief disconnect.
- Earlier loops satisfied exact equality (or never reached the Playing restart check with a residual). The failure mode is **brittle exact-step validation**, not a Mac `failRun`.

Serial did not capture per-module `delta` at the incident (0.3.5 had no loop-boundary diagnostic). Residual was **≥ 1 step** (otherwise the exact gate would not fire).

---

## 3. Observed / calculated step delta

| Quantity | Value |
|---|---|
| Incident residual (wire) | Not logged; must be **\|Δ\| ≥ 1** step |
| Default geometry `stepsPerMm` | ≈ **43.46** |
| `SWARM_LOOP_CLOSURE_MM` | **1.0 mm** |
| Tolerance used by 0.3.6 | `ceil(1.0 × stepsPerMm)` ≈ **44 steps** |
| Wave first/last | Closed in mm (`dz = 0`) |

Harmless residuals (1 … 44 steps ≈ ≤1 mm) are now corrected; larger residuals still FAULT.

---

## 4. Correction strategy and justification

**Policy** (`autonomous_policy.h`):

- `loopClosureToleranceSteps(spm)` = ceil(`SWARM_LOOP_CLOSURE_MM` × `stepsPerMm`) — **same mechanical closure** already used for loop-compatible tracks. Not an invented looser gate.
- `decideLoopBoundary(actual, first, tol)`:
  - `Δ == 0` → `AtStart` (begin score segment)
  - `0 < \|Δ\| ≤ tol` → `CorrectivePrelude`
  - `\|Δ\| > tol` → `Fault` (`track_infeasible`)

**Action** (`track_player.cpp`):

- Corrective prelude calls `planner_->moveToSteps(first, …)` — **physical** return to the first keyframe.
- **No** `setSteps` / silent position-model snap.
- Pass 0 still uses prelude-to-start (unchanged behaviour).
- Travel limits, endstops, stop/FAULT, homing, clock sync, and autonomous-on-Wi-Fi-loss paths unchanged.

**Drift:** each in-tolerance residual is closed by a real move before the next pass starts, so small deltas cannot accumulate across loops.

**Diagnostics** (bounded `SWARM_LOG`, only on CORRECT / FAULT / prelude failure):

- `pass` (loop index), `expected`, `actual`, `delta`, `tol`

---

## 5. Regression and build results

| Check | Result |
|---|---|
| `pio test -e native_host` | **45 / 45 PASSED** (~3 s) |
| New: `test_loop_closure_tolerance_steps_matches_mm_gate` | PASSED |
| New: `test_loop_boundary_actions` (±1, edge, OOT) | PASSED |
| New: `test_loop_boundary_1000_transitions_wave_like` | PASSED (≥1000 transitions; ± residuals, rounding edges, far faults) |
| New: `test_loop_boundary_interrupted_equals_fault_when_far` | PASSED |
| Build `swarm_s3_4mb_ota` | SUCCESS; `firmware.bin` **929888** bytes; string **`0.3.6`** present |
| Version bump | `platformio.ini` / README → **0.3.6** |

---

## 6. OTA results (Mau01–Mau09)

**First attempt** failed fleet-wide: staging HTTP on `192.168.68.73:8000` died mid-run → modules reported `ota_failed` within ~0.5 s (download unreachable). No flash of 0.3.6.

**Retry** after restarting `python3 -m http.server 8000 --bind 0.0.0.0` on the built `ota_stage/`:

| Node | Status | After |
|---|---|---|
| Mau01 | success | connected, **0.3.6**, no fault, not moving |
| Mau02 | success | same |
| Mau03 | success | same |
| Mau04 | success | same |
| Mau05 | success | same |
| Mau06 | success | same |
| Mau07 | success | same (was `track_infeasible`) |
| Mau08 | success | same |
| Mau09 | success | same |

Evidence: `ota-0.3.6-results.jsonl`, `ota-0.3.6-summary.json`.  
NVS identity / connectivity / motion config preserved (OTA app slot only). **No homing or motor move** issued.

---

## 7. Remaining limitations

1. Modules are **unhomed** after OTA reboot (`homed: false`, `positionValid` cleared) — expected; next autonomous run still requires home / go-to-start as before.
2. Residuals **> 1 mm** still FAULT — intentional; incomplete/cancelled trajectories far from start are not auto-accepted.
3. Corrective prelude itself can FAULT if `moveToSteps` is rejected (travel limit, not idle, etc.) — safety preserved.
4. Loop-boundary logs are Serial/`SWARM_LOG` only; coordinator does not yet surface `delta` in telemetry.
5. Long-duration continuous Wave should be re-validated on hardware (≥ several hours) to confirm no further boundary classes remain.
6. Keep OTA staging server up for the full sequential window; a dead host URL produces immediate `ota_failed` on 0.3.5/0.3.6 alike.
