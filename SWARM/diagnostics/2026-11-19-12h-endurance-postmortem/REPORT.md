# SWARM — 12-Hour Endurance Postmortem

**Run ID:** `2d448b2d51c644b897547f61649dc7f`  
**Firmware:** 0.3.10 (fleet)  
**Score:** Wave — 120 mm / 120 s / 40° diagonal / 240 s loop / continuous autonomous / 12 h ceiling  
**Wall clock:** 2026-11-18 20:29:28Z → 2026-11-19 08:30:06Z (~12.01 h)  
**Investigation:** read-only (durable log + firmware 0.3.10 source). No OTA, motor commands, restarts, or code changes.

Supporting extract: [`evidence.json`](./evidence.json)

---

## 1. Endurance results

### Timeline

| When (UTC) | Event |
|---|---|
| 20:29:28 | Armed continuous Wave, `maxRuntimeMs=43200000`, expected 180 passes |
| 20:29:30 | Phase → running |
| 20:32:54–20:36:26 | All nine WS links drop (0.3.10 autonomy defers WS I/O — expected mute) |
| 02:10:38 | **Mau08** reconnects in FAULT `unexpected_endstop_open` after **84** passes (~5.7 h) |
| 05:13:38 | **Mau09** reconnects in FAULT `unexpected_endstop_open` after **124** passes (~8.7 h) |
| 08:30:06 | Coordinator watch ends (`Wave watch ended without fleet stop`) |
| 08:30:07–12 | Seven survivors reconnect; each reports **completedPasses=180**, `positionValid=true` |

### Completed passes / outcomes

| Node | Passes | Outcome | Notes |
|---|---:|---|---|
| Mau01 | 180 | IDLE / max runtime | Model z at reconnect 297.3 mm |
| Mau02 | 180 | IDLE / max runtime | Model z 215.4 mm |
| Mau03 | 180 | IDLE / max runtime | Model z 149.6 mm |
| Mau04 | 180 | IDLE / max runtime | Model z 215.4 mm |
| Mau05 | 180 | IDLE / max runtime | Model z 149.6 mm |
| Mau06 | 180 | IDLE / max runtime | Model z 130.8 mm |
| Mau07 | 180 | IDLE / max runtime | Model z 149.6 mm |
| Mau08 | 84 | **FAULT** `unexpected_endstop_open` | First seen 02:10:38Z; held through later reconnects |
| Mau09 | 124 | **FAULT** `unexpected_endstop_open` | First seen 05:13:38Z; later `homing_recovery_disabled` during post-run home attempt |

`completionReason` was empty on faulted reconnect payloads; for the seven survivors it is inferred as **`max_runtime`** (exact 180 = 12 h / 240 s). Pass events at reconnect show `loopBoundaryAction: CONTINUE`, `autonomous: false` (policy cleared on completion/fault).

### IncompleteStop / loop-boundary / reboot

| Signal | Availability | Finding |
|---|---|---|
| Mid-run `incomplete_stop_count` | **Unavailable** | WS muted for ~12 h on survivors; counter not in durable log |
| Loop-boundary δ series | **Unavailable** | Only last-boundary label on reconnect (`CONTINUE`); no δ/mm history |
| Unexpected reboot | **No evidence** | Faulted nodes kept stable `completedPasses` / same `runId` across reconnects; survivors reached exactly 180 without RAM reset |

0.3.10 `shouldDeferWsIo(autonomy)` is designed to avoid the IncompleteStop/coil-release storm from blocking Wi-Fi writes during autonomy. That does **not** prove IncompleteStop count was zero — only that it was not observed.

---

## 2. Cumulative physical position drift

### What the logs prove vs what the artist saw

At reconnect after 12 h, firmware **model** positions for all seven survivors still lie inside the nominal 130–370 mm band. Artist observation at ~11 h was that several spheres had walked **outside** that band (some lower, Mau06 higher / near endstop; Mau08/09 on the switch).

**Conclusion:** the open-loop step counter and the physical string/sphere diverged. The controller continued to believe it was on-score until (on Mau08/09) a retract step found the endstop open while the model still thought z > 0.

End-of-run model z values are **not** first-keyframe rest poses (e.g. Mau01 297 vs first KF 250). That is consistent with starting a 181st pass microseconds before the 12 h gate and then stopping mid-pass on `max_runtime` — not by itself proof of model arithmetic drift.

### Firmware mechanisms audited (0.3.10 source)

#### Motor sequence and position counter

- Half-step table is the fixed 8-phase sequence; each `MotorDriver::step()` advances `phaseIndex_` and energizes that pattern.
- `MotionPlanner::issueOneStep()` always `position_->addSteps(moveSign_)` after issuing the electrical step — **counted steps assume every pulse produced shaft motion**.
- There is **no encoder / stall detect / current sense**. Missed steps are invisible to software.

#### Acceleration / IncompleteStop / resume

- Position moves use accel/decel; controlled stop or schedule stall (`SWARM_STALL_ABORT_US=100 ms`) yields `IncompleteStop` with **estimated position retained** and `targetReached=false`.
- Track player **resumes the absolute segment target** instead of advancing (0.3.6 regression fix). That preserves model consistency; it does **not** correct physical under-travel.

#### Coil release and half-step phase

- Fleet config: `coil_hold_mode=0` → **Release** after every segment (`applyRestPolicy`).
- `release()` de-energizes all coils but **leaves `phaseIndex_` unchanged**; next move re-applies that electrical angle then steps.
- Wave uses **31 segments/pass × 180 passes ≈ 5580 release/re-energize cycles** per module.
- While released, gravity, string elasticity, and spool friction can move the load **without updating `steps_`**. Re-energizing onto a drifted rotor can also land on the wrong detent for one or more electrical steps.

**Order-of-magnitude slip budget (illustrative, not measured):** 1 counted-step of physical disagreement per segment ≈ 0.012 mm; if biased in one direction every segment → ~0.36 mm/pass → **~64 mm over 180 passes**. That is enough to explain “significantly out of range” and early endstop contact. Actual slip is unlikely to be exactly 1 step every segment, but the budget shows release cadence is in the right scale.

#### Loop closure / rounding

- Score sampler forces last z = first z; with `steps_per_mm≈86.92`, `mmToSteps` first/last closure is **0 steps** for every node.
- Targets are **absolute** `mmToSteps(z)`, not incremental relative moves, so `lroundf` quantization does **not** accumulate over passes.
- Loop-boundary corrective prelude only runs for residual ≤ `SWARM_LOOP_CLOSURE_MM` (1 mm); larger model error would FAULT `TrackInfeasible` — which did **not** happen on the seven survivors.

**Confirmed software arithmetic result:** there is **no systematic step-counter bias that grows with pass count** in the 0.3.10 trajectory math. Drift of physical spheres while the model stays in-range is therefore **not explained by keyframe rounding or loop-closure snap**.

#### Spool calibration

- NVS/fleet: `spool_diameter_mm=15`, `steps_per_output_rev=4096`, `calibration_factor=1` → constant `steps_per_mm`.
- Real wound diameter changes with layering; constant-D open loop maps the same step count to different string lengths over a long wind/unwind history. That is a **mechanical/calibration** effect, not a firmware counter bug.

### Mapping faults to the model/physical gap

`unexpected_endstop_open` is raised only when commanding **retract** (`moveSign_ < 0`) and the NC endstop is already open. Meaning: **physical sphere reached home while the step model still believed it was below home**.

That matches: missed downward steps, wind-up slip while coils released, and/or effective payout shorter than calibrated — all produce **physical z < model z**.

Bidirectional artist observations (some lower, Mau06 higher) imply **module-specific** mechanics (friction, string path, spool wind state), not one global signed software error.

---

## 3. Periodic re-homing (evaluation only)

| Interval | Passes @ 240 s | Role |
|---|---:|---|
| 1 h | 15 | Aggressive safety net; high choreographic interruption |
| 2 h | 30 | Middle ground |
| 4 h | 60 | Would have preceded Mau08’s fault (~5.7 h) once; may still miss faster walkers |

**What re-homing does:** resets the open-loop datum to the endstop so accumulated *effect* of slip is cleared.

**What it does not do:** remove coil-release backdrive, missed steps under load, or spool-diameter mismatch. Drift rate between homes would remain.

For long installations, treat periodic synchronized home as a **mitigation layer**, not a root-cause fix. Prefer pairing it with hold-while-resting (or shorter release windows), better spool calibration / single-layer wind, and eventually mid-run observability (0.3.11-class telemetry without starving steps).

---

## 4. Postmortem separation

### Confirmed findings

1. Seven modules completed exactly **180** passes and returned; two faulted on **`unexpected_endstop_open`** (Mau08 @ 84, Mau09 @ 124).
2. 0.3.10 autonomy **muted WS** within minutes; durable mid-run telemetry (IncompleteStop, loop-boundary δ, positions) does not exist for this run.
3. Firmware position is **open-loop**; every issued half-step increments the counter whether or not the shaft moved.
4. Fleet ran with **coil Release** between segments (~5.6k cycles / module / 12 h).
5. Trajectory math **closes loops with 0 step residual**; absolute targeting prevents pass-to-pass roundoff accumulation in software.
6. End-of-run **model** z remained inside 130–370 mm for survivors while **physical** placement (artist) did not — model/physical divergence.
7. No durable evidence of unexpected reboot during the run.
8. Post-run homing cleared faults; live drifted positions are gone.

### Likely causes

1. **Open-loop step counting + coil release** allowing physical motion (or missed shaft steps) that the model never sees — primary drift engine at this duration.
2. **Module-asymmetric** friction / string / spool layering explaining different drift directions.
3. Mau08/09 endstop faults as the extreme of **physical-high vs model** divergence on retract.

### Mechanical hypotheses

- Gravity or elastic recoil while coils released (direction depends on geometry and residual torsion).
- String slip on the spool hub or multilayer diameter change over hundreds of wind cycles.
- Load asymmetry (diagonal Wave phase → different duty near soft limits per module).
- Missed steps under torque (more plausible on lift against gravity; early endstop needs the opposite bias or payout shortfall).

### Software hypotheses

- **Rejected as primary cumulative bias:** keyframe `lroundf` accumulation; loop-closure snap; continuous-pass index math (survivors hit 180 cleanly).
- **Contributing / unmeasured:** IncompleteStop + resume leaving rare physical shortfalls (counter still “correct”); release/re-energize onto a drifted rotor producing occasional ineffective steps that are still counted.
- **Operational gap:** 0.3.10 WS defer prevented catching drift live; UI planned ghosts also freeze after one score duration (separate viz bug, not causal for motors).

### Evidence no longer available after homing

- Physical z at fault / at 11 h / at 12 h for comparison to model.
- Per-module `incomplete_stop_count`, last `loop_boundary` δ/mm, `ws_*` counters from the autonomous window.
- Whether survivors’ final physical poses matched their last model z (297 / 215 / …).
- Spool layer state and string stretch at end of run.

### Prioritized recommendations

1. **P0 — Measure before the next long run:** log (or retain on module until reconnect) `incomplete_stop_count`, last loop-boundary δ, and a sparse position breadcrumb even under autonomy; photograph / tape-measure physical z at planned checkpoints without clearing home until recorded.
2. **P0 — Coil policy trial:** compare Release vs Hold (or Hold between segments, Release only when idle long) on a multi-hour subset; Hold should reduce gravity walk if release backdrive dominates.
3. **P1 — Periodic synchronized re-home** as a safety net (start at **2 h**, tighten to 1 h if walk remains large); document it as *resetting accumulation*, not fixing the mechanism.
4. **P1 — Spool / string audit:** verify single-layer wind, diameter vs `spool_diameter_mm=15`, and slip at the hub on the modules that walked most (Mau01–03, 05, 06) and that hit the switch (08, 09).
5. **P2 — Soft endstop margin / retract guard:** earlier warning when retract approaches home with unexpected switch state; optional mid-run “touch home” only if choreography allows.
6. **P2 — Viz wrap** for continuous `runT` (separate from drift; needed so operators can see planned motion past 4:00).

---

## 5. Bottom line

The 12 h Wave run **succeeded as an autonomy endurance test** (7/9 finished 180 passes on 0.3.10 without Mac telemetry). It **failed as a geometric endurance test**: open-loop counting plus coil release let physical spheres walk while software still believed the bounded trajectory. Mau08/09’s unexpected endstop faults are the hard stop of that divergence. Fix the mechanical/hold path and add observability; use periodic homing only as a bounded reset of residual error.
