# Autonomous operation (Phase B.2)

Firmware **0.3.0**. Protocol version remains **1** with additive fields.

This document describes software behaviour. Physical reliability and long-duration nine-node synchronisation are **not** claimed until measured on hardware.

## What it supports

- Load a validated track on each ESP32, prepare/commit with a shared `start_at_us`.
- Opt-in **autonomous** policy on `prepare_run` for that `run_id` only.
- After local start, the Mac may disconnect: the module finishes the full track.
- Optional **local looping** with finite `max_loops`, `max_runtime_ms`, or explicit `continuous`.
- Epoch-relative scheduling (no stacked inter-loop delays).
- Stop/Cancel while linked terminates current and future loops.
- Reboot never auto-resumes motion.

## What it does not do

- Keep nine modules perfectly synchronised for hours without a time master.
- Propagate Stop or faults from one module to the other eight when the Mac is offline.
- Auto-home or resume after power loss.
- Jump from last keyframe to first if positions differ (loop rejected instead).

## Connected vs autonomous

| | Connected Live | Autonomous |
|---|---|---|
| Mac required after start | Yes (for loop re-arm / Stop over Wi‑Fi) | No |
| Disconnect before start | Cancel | Cancel |
| Disconnect after start | Finish segment / stop (config) | Continue track / loops |
| Preview “Loop” checkbox | Mac re-arms | Ignored for Mac; use Autonomous + Loop for on-module loops |

## Authorize a run (UI)

1. Live → Take control → Home all → Go to start.
2. Enable **Autonomous on modules**.
3. Optionally enable Loop + local loop count (or Continuous).
4. Execute → confirm dialog states Mac may disconnect and physical cut-off is required.

## Authorize a run (protocol)

`prepare_run` with `autonomous: true` (and loop bounds if looping). Then `commit_run` as usual.

Ack `ready_for_commit_autonomous` / `run_armed_autonomous`.

## Start / stop

- **Start:** same collective sequence; wait for `run_started`.
- **Stop while Mac linked:** Stop all / Cancel run / software stop.
- **Stop while Mac offline:** physical power cut-off only (software Stop cannot reach nodes).

## Disconnect / reconnect / reboot

- Disconnect before start → cancel.
- Disconnect after autonomous start → continue.
- Reconnect → status shows real phase; no auto restart.
- Reboot → UNHOMED, no run, no motion until commissioned/homed/synced again.

## Clock drift

Free-running ESP32 clocks diverge (order of tens of ppm typical). A single shared start can be tight; multi-hour relative phase will drift. Measure on the installed nine modules before unattended shows.

## Safety

All existing travel, RPM, acceleration, endstop, stall and fault rules remain. Local fault stops that module only when the coordinator is absent.

**Software Stop is not an emergency power disconnect.**
