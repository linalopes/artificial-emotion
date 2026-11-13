# Autonomous operation (Phase B.2)

Firmware **0.3.0**. Protocol version remains **1** with additive fields.

This document describes **software** behaviour. Physical reliability and long-duration nine-node synchronisation are **not** claimed until measured on hardware.

Related: [`../firmware/docs/PROTOCOL.md`](../firmware/docs/PROTOCOL.md), [`../FIRMWARE-INTEGRATION.md`](../FIRMWARE-INTEGRATION.md), [`../README.md`](../README.md).

## What it supports

- Load a validated track on each ESP32, prepare/commit with a shared `start_at_us`.
- Opt-in **autonomous** policy on `prepare_run` for that `run_id` only.
- After local start, the Mac may disconnect: the module finishes the full track.
- Optional **local looping**:
  - **Finite:** `loop: true` with `max_loops ≥ 1` and/or `max_runtime_ms ≥ 1000`
  - **Bounded by runtime:** `max_runtime_ms` alone (within firmware ceiling)
  - **Continuous:** `continuous: true` (still subject to compile-time runtime ceiling and local faults)
- Epoch-relative scheduling for subsequent passes (no stacked inter-loop delays).
- Stop/Cancel while linked terminates current and future loops.
- Reboot never auto-resumes motion.

## What it does not do

- Keep nine modules perfectly synchronised for hours without a time master.
- Propagate Stop or faults from one module to the other eight when the Mac is offline.
- Auto-home or resume after power loss.
- Jump from last keyframe to first if positions differ (loop rejected instead: first/last `z_mm` must match within **1 mm**).

## Connected vs autonomous

| | Connected Live | Autonomous |
|---|---|---|
| Mac required after start | Yes (for loop re-arm / Stop over Wi‑Fi) | No |
| Disconnect before start | Cancel | Cancel |
| Disconnect after start | Finish segment / stop (config) | Continue track / loops |
| Preview / Live “Loop” checkbox | Mac re-arms each pass | Use **Autonomous on modules** + loop policy for on-module loops |

## Authorize a run (UI)

1. Live → Take control → Home all → Go to start.
2. Enable **Autonomous on modules**.
3. Optionally enable Loop + local loop count (or Continuous).
4. Execute → confirm dialog states Mac may disconnect and physical cut-off is required.

## Authorize a run (protocol)

`prepare_run` with `autonomous: true` (and loop bounds if looping). Then `commit_run` as usual.

Ack `ready_for_commit_autonomous` / `run_armed_autonomous`. Events echo accepted policy. Status telemetry may include `autonomous`, `autonomous_loop`, `autonomous_continuous`, `max_loops`, `max_runtime_ms`, `loop_index`, `completed_passes`, `track_loop_compatible`.

## Finite, bounded, and continuous looping

| Mode | Prepare fields | Behaviour |
|---|---|---|
| Single pass | `autonomous: true`, `loop: false` | Finish loaded track after disconnect |
| Finite loops | `loop: true`, `max_loops` and/or `max_runtime_ms` | Local re-arm at epoch boundaries until bound |
| Continuous | `continuous: true` | Keep looping until Stop (while linked), fault, runtime ceiling, or power cut |

Looping requires track closure (first/last `z` within `SWARM_LOOP_CLOSURE_MM`). Without `continuous`, looping needs `max_loops ≥ 1` and/or `max_runtime_ms ≥ 1000`.

## Start / stop / cancel

- **Start:** same collective sequence; wait for `run_started` before treating autonomy as active after disconnect.
- **Stop / Cancel while Mac linked:** Stop all / Cancel run / software stop — clears current and future autonomous loops.
- **Stop while Mac offline:** physical power cut-off only (software Stop cannot reach nodes).

## Disconnect / reconnect / reboot

| Situation | Behaviour |
|---|---|
| Disconnect **before** start (armed/prepared) | Cancel run; invalidate clock |
| Disconnect **after** autonomous start | Continue full track / authorized loops; clock invalidated |
| Disconnect during **non-autonomous** run | Finish-segment-then-stop or controlled stop (`disconnect_policy`) |
| Reconnect during autonomous run | Report status; **no** auto-restart / no duplicate arm |
| Reboot | UNHOMED; no motion; autonomous auth cleared |

## Local fault behaviour

A local FAULT stops that module, reports `run_failed` when applicable, and clears autonomous authorization on that node. Other modules are unaffected unless the Mac is online and the operator (or coordinator policy) stops them.

## Clock drift

Free-running ESP32 clocks diverge (order of tens of ppm typical). A single shared start can be tight; multi-hour relative phase will drift. Firmware does not claim multi-hour nine-node sync without the Mac. Measure on the installed nine modules before unattended shows.

## Safety

All existing travel, RPM, acceleration, endstop, stall and fault rules remain.

**Software Stop is not an emergency power disconnect.** Installations that use autonomous playback must retain a reachable **physical 5 V / mains cut-off**.

## Hardware validation procedure

Do not treat software tests as physical proof. Suggested bench / install sequence:

1. Connected collective Wave (all nine) with Mac linked — confirm arm, start, complete.
2. Autonomous **single pass**: authorize, Execute, wait for `run_started`, disconnect Mac (or kill coordinator); confirm track completes; reconnect and read status.
3. Autonomous **finite loops**: short track with matching first/last `z`; small `max_loops`; disconnect after start; confirm loop count and stop at bound.
4. **Stop while linked** during an autonomous loop — motion ceases; no further loops.
5. **Fault injection** on one module while Mac offline — that module stops; others continue until power cut or reconnect + operator Stop.
6. **Reboot** one module mid-run — no auto motion on boot.
7. Only then consider long-duration drift measurement with a physical cut-off ready.
