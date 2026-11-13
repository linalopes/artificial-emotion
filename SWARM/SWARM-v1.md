# SWARM v1 — Technical Architecture & Implementation Specification

**Project:** Artificial Emotion  
**Installation:** Swarm — 3 × 3 MauMau kinetic modules  
**Document type:** Implementation specification / source of truth for code assistant  
**Date:** 2026-11-13  
**Status:** Proposed architecture; implementation and physical calibration pending  
**Language:** English  

> **Document status (read first):** This file is the **historical / baseline** architecture and implementation specification. It records original design intentions, open physical questions, and proposed values (for example ~1000 mm choreography travel). It is **not** the current implementation manual. For what the software actually does today, use [`README.md`](README.md), [`firmware/README.md`](firmware/README.md), [`firmware/docs/PROTOCOL.md`](firmware/docs/PROTOCOL.md), [`FIRMWARE-INTEGRATION.md`](FIRMWARE-INTEGRATION.md), and [`docs/AUTONOMOUS-OPERATION.md`](docs/AUTONOMOUS-OPERATION.md). Do not silently rewrite proposed values in this document to match later firmware defaults.

> **Purpose:** Build and upload the same Swarm-capable firmware to nine ESP32-S3 Super Mini controllers **before ceiling installation**. After installation, use a local Wi-Fi web application to commission, home, control, tune, and choreograph nine suspended **lightweight hollow glass Christmas ornaments**. Normal experimentation must not require a USB cable or physical access to the ceiling. OTA firmware updating is required for code changes.

## 1. Scope and decisions

### Confirmed for Swarm v1

- Nine identical MauMau kinetic modules in a fixed **3 × 3 matrix**, identified **`Mau01` … `Mau09`** in row-major order (top-left to bottom-right in the interface; verify physical orientation during installation).
- One **ESP32-S3 Super Mini** per module, using the existing **Artificial Emotion Controller v1** PCB, **ULN2003A**, and **5 V 28BYJ-48** geared stepper motor.
- Each motor drives the existing 3D-printed **15 mm core-diameter spool**, via braided fishing line and guide pulley, with a **lightweight hollow glass sphere** attached at the end.
- The preferred line documented for MauMau is **0.16 mm braided fishing line** (earlier tests used 0.24 mm). **Swarm v1 intentionally ignores winding-layer growth** and uses constant effective spool diameter for positioning. This is a modelling choice, not a physical accuracy claim.
- Approximately **1.5 m line per module**; **1,000 mm proposed choreography travel**. Actual safe travel must be established during installed-system commissioning and is configurable **per module**.
- Dedicated **Swarm firmware**, separate from the generic Controller v1 test firmware.
- **Mandatory endstop for Swarm**, connected to **GPIO1** and **GND** as **COM + NC**, with `INPUT_PULLUP`. This **reverses the interpretation** used by the generic optional COM+NO firmware; **do not modify that generic firmware**.
- Web UI + coordinator run initially **on the user's Mac**, over a local Wi-Fi network; **no tenth ESP32, Raspberry Pi, cloud server, or internet connection required** for normal control.
- All motor timing and trajectories execute locally on each ESP32; Wi-Fi transports configuration, commands, schedules, and telemetry—not individual motor steps.
- **Three preset choreographies** initially. A graphical choreography editor is **out of scope** for v1; design the data model so it can be added later.
- Runtime parameters (speed, acceleration, travel bounds, timing, presets) configurable remotely; **OTA required** for software changes.
- **No automatic motion at power-on.** All devices boot into a safe, non-moving, unhomed state.

### Open physical/calibration questions (must remain configurable, not guessed)

- Which shaft direction actually **retracts** the line on the assembled units.
- Endstop physical actuation point, approach direction, release direction, backoff distance, and whether the switch is reliably actuated by the final ceiling assembly.
- Realistic top offset (endstop reference → usable zero), safe travel, maximum reliable speed and acceleration under the actual suspended load.
- Measured holding/drift behavior with motor coils off versus energized at rest (gearing provides resistance, **not a certified mechanical brake**).
- Reliable Wi-Fi coverage and motor-supply arrangement at the installation site.

**Implementation rule:** expose these as named, bounded, persistent settings with conservative defaults and commissioning controls. Never silently invent physical dimensions, timing, or validated speed limits.

## 2. Existing repository references (read before coding)

- [Controller v1 firmware](../artificial-emotion-controller-v1/firmware/artificial-emotion-controller-v1/artificial-emotion-controller-v1.ino) — existing half-step sequencer, GPIO mapping, `micros()`-based nonblocking stepping, button/limit monitoring. **Reference and reuse, not overwrite.**
- [Controller v1 hardware README](../artificial-emotion-controller-v1/README.md) — PCB, power-jumper and connector details.
- [MauMau README](../kinetic-module-maumau/README.md) — enclosure, spool and module history.
- [MauMau spool study](../Site/content/studies/2026-09-21-maumau-spool-first-parametric-prototype.md) — 15 mm core, 24 mm flange and line anchoring.
- [Fishing line study](../Site/content/studies/2026-10-01-fishing-line-as-a-mechanical-linkage.md) — 0.16 mm preferred line, swivel and knots.
- [28BYJ-48 technical note](../Site/content/notes/2026-11-11-inside-the-28byj-48-stepper-motor.md) — gear reduction, magnetic operation and uncertainties across motor variants.

**Do not rewrite dated historical studies.** Their historical statements may differ from current Swarm hardware choices.

## 3. Hardware / pin contract

| Function | Controller v1 PCB | Swarm v1 behavior |
|---|---|---|
| Motor phases IN1–IN4 | GPIO10, GPIO11, GPIO12, GPIO13 | ULN2003A; preserve wiring and phase order from tested firmware |
| USER button | GPIO7 | Optional local service/commissioning input; **must not** trigger an unattended choreography on boot |
| Endstop through sensor A1 | GPIO1 | **Required**; `INPUT_PULLUP`, **COM+NC** contacts to GND |
| Power | Regulated 5 V, PCB jumpers JP1/JP2 | Follow existing PCB power-path precautions; check actual PCB polarity/silkscreen |

### Swarm NC endstop truth table

| GPIO1 reading | Electrical meaning | Firmware treatment |
|---|---|---|
| `LOW` | NC contact closed; switch normally at rest | Sensor circuit closed; may seek home under guarded procedure |
| `HIGH` | NC contact opened **or disconnected wire** | **Do not assume valid home**; halt upward travel, enter triggered/ambiguous condition until a valid transition is observed |

A switch alone cannot distinguish an intentionally opened NC contact from a disconnected cable. Homing must prove state transitions, enforce travel/time bounds, and fail safely if they cannot be demonstrated. **Not a certified safety circuit / emergency stop.** Provide a physically accessible power-disconnect mechanism for the installation.

## 4. Coordinate convention

- **One-dimensional vertical axis per module**: `z_mm` measured as **downward travel from a calibrated upper usable reference**.
- `z_mm = 0`: upper **usable zero**, slightly away from the activated switch if required by the mechanism (not necessarily switch trip point).
- Positive `z_mm`: sphere **descends** / line extends.
- `max_travel_mm`: configurable **per module**; candidate 1,000 mm, never assumed safe without commissioning.
- A distinct `home_switch_reference_steps` and `home_offset_steps`/`home_offset_mm` define the relationship between switch event and usable zero.
- Maintain **signed integer step position** for precise motion planning; expose millimetres (estimated) in UI and telemetry.
- Position is **estimated from commanded steps after successful homing**. No encoder, load cell, or independent glass-sphere position sensor is present; do not present estimated position as measured physical feedback.

### First-pass geometry

Assume `spool_diameter_mm = 15.0`, `steps_per_output_rev = 4096` half-steps (firmware approximation; gearbox ratios vary by specimen):

```text
travel_per_revolution_mm = PI * spool_diameter_mm ≈ 47.124 mm
steps_per_mm = steps_per_output_rev / travel_per_revolution_mm ≈ 86.92
steps_for_1000_mm ≈ 86,920
linear_speed_mm_s = rpm * PI * spool_diameter_mm / 60
```

Use configurable `steps_per_mm`/calibration factor rather than hardcoding the estimate throughout the codebase. **Ignore line diameter and layer buildup by explicit v1 decision**; record observed position error during commissioning, but do not prematurely add a multilayer winding model.

## 5. Node firmware architecture

Firmware is identical across all nine nodes. Assign a **unique persistent node ID** (`Mau01`–`Mau09`) through a provisioning command or initial setup portal before hanging. Do not require nine separate source branches or hardcoded binaries.

Suggested modules (can be refactored to suit chosen Arduino toolchain):

- `MotorDriver`: existing eight-state half-step sequence, coil control, stepping schedule, signed step count.
- `MotionPlanner`: nonblocking `moveTo`/velocity scheduling, speed and acceleration limits, handling of reversals and stops.
- `HomeController`: NC switch debouncing, seek/backoff/re-reference, time/step ceilings, error recovery.
- `NetworkClient`: Wi-Fi reconnection and coordinator messaging; node identity and protocol.
- `CommandProcessor`: schema validation, acknowledgements, idempotency, safe command gating.
- `ConfigStore`: NVS persistence of node ID, calibration, network settings, allowed limits, firmware version.
- `OTAService`: secure network firmware update and version reporting.
- `StatusReporter`: heartbeats, state, estimated position, active configuration, fault codes.

Use `micros()`/`millis()` rollover-safe timing, a suitable stepper library or existing state sequencer, and cooperative servicing / tasks. **Do not use blocking `delay()` or long `while` loops for homing, stepping, Wi-Fi reconnection or choreography execution.** If using RTOS tasks, document timing and shared-state safety.

### State model

`BOOT` → `CONNECTING` → `UNHOMED` → `HOMING` → `READY` → `MOVING` → `READY`

Additional explicit states: `STOPPING`, `PAUSED` (only if semantics defined), `FAULT`, `UPDATING`.

- Boot: output motor coils in defined safe state; **no automatic motion**; `position_valid=false`.
- Only successfully homed nodes can perform absolute `move_to_mm` or participate in a preset.
- `FAULT` inhibits choreographies; stop/clear-fault/re-home are separate explicit actions.
- Power interruption, reset, watchdog restart, or uncertain step integrity invalidates position. `position_valid=false` until re-home.
- A heartbeat means firmware is responsive, **not** that the motor or sphere is physically moving.

## 6. Homing strategy (required, nonblocking)

**Proposed procedure; tune direction, search limits, and mechanical offset only after verifying actual assembly.**

1. Enter `HOMING` only from an allowed safe state and following an explicit operator request.
2. Read/debounce GPIO1. If `HIGH` at start, treat it as **ambiguous** (pressed endstop or disconnected wire). Allow at most a strictly bounded, slow release-direction probe **only if mechanically verified safe**; otherwise fault and require operator intervention.
3. When the contact is confirmed closed (`LOW`), seek slowly in the verified **retract** direction toward the switch. Enforce both **maximum steps** and **timeout**.
4. On a confirmed `LOW → HIGH` transition, **stop retracting immediately**. Capture switch reference. Never keep pulling against the upper stop.
5. Move back slowly a bounded distance until a confirmed `HIGH → LOW` release transition. Apply a configurable additional offset to establish the **usable zero** away from the switch.
6. Set signed position to zero **only after both required switch transitions are confirmed** and final geometry/offset checks pass; set `position_valid=true`, state `READY`.
7. Report measured step counts, duration, raw/filtered switch state, and any fault. Any failed transition, timeout, exceeded search travel or unexpected switch activation → `FAULT`, position invalid.

For regular motion, the NC switch is an **upper hard-limit indicator**. Unexpected switch opening during upward motion must stop that motion and invalidate position as appropriate. Lower travel is enforced in software using configured `max_travel_mm`; this is **not** an independent lower endstop.

**Important:** `Go to Zero` is a normal positional command once homed; `Home` deliberately searches for the mechanical reference. Changing preset must **not** automatically re-home all modules if their positions remain valid.

## 7. Wi-Fi and coordinator

### Preferred v1 arrangement

```text
Mac running Swarm local server + browser UI
                 ⇅ (local Wi-Fi)
           Wi-Fi access point
                 ⇅
       Mau01 … Mau09 ESP32-S3
```

- No internet or cloud dependency for operating Swarm.
- The **Mac process must stay running** for live interaction and new commands. Nodes complete only locally scheduled work under the defined disconnect policy.
- Recommend **WebSocket-based** bidirectional node/server messaging for v1; the coding assistant may propose a documented alternate if it is simpler and comparably robust. Browser talks to the server, **not directly to nine independent ESP hosts**.
- Server stores presets and orchestrates readiness, groups, status, parameter edits and starts. Each ESP executes its own steps independently of message latency.
- Network reconnect uses backoff, not a blocking reconnect loop. Identify nodes via persistent IDs, not IP addresses; report duplicate IDs explicitly.
- Provide a secure, recoverable initial Wi-Fi provisioning mechanism **before ceiling installation** (and a documented fallback if credentials change).
- Restrict control to the trusted local network with operator authentication/token controls as appropriate; never expose unauthenticated OTA or motor commands to the public internet.

### Synchronization

For coordinated starts, coordinator sends a choreography revision, each node validates and replies `READY_FOR_START`; coordinator then sends a **future start timestamp** in a shared monotonic timebase or an equivalent documented synchronization scheme. Track sync error and acknowledgements. Do not assume simultaneous delivery of a Wi-Fi broadcast.

### Disconnection policy

- Temporary loss of Wi-Fi: no runaway motion. Initial conservative policy: **finish current bounded movement segment and stop; do not begin the next segment while disconnected**. This is configurable only within safety constraints.
- Reconnection does not silently restart a paused or failed choreography; require explicit operator resumption.
- Coordinator distinguishes `offline`, `online/unhomed`, `homing`, `ready`, `moving`, `fault`, `updating`.

## 8. V1 control protocol (logical contract)

Specify versioned JSON messages (WebSocket transport). Required envelope: `protocol_version`, `message_id`, `source`, `target`, `type`, optional `timestamp`, and `payload`. Node replies include `ack`/`nack` with the referenced `message_id`, and telemetry carries local state. Reject out-of-range or unsafe commands even if the UI sends them.

Required commands:

| Command | Intent | Conditions |
|---|---|---|
| `get_status` | Retrieve node telemetry | Always |
| `get_config` / `set_config` | Inspect/change allowed parameters | Validate ranges; some edits only while idle |
| `home` | Run guarded homing | Explicit action; safe state |
| `move_to_mm` | Move to absolute downward position | Position valid; bounds checked |
| `stop` | Controlled stop | Always prioritized |
| `stop_all` | Coordinator sends priority stop to all nodes | Operator control; no claim of certified E-stop |
| `load_preset` | Distribute preset / node-specific tracks | Validate version, bounds and capacity |
| `prepare_start` / `start_at` | Ready barrier / synchronized start | Homed and all required nodes ready |
| `clear_fault` | Acknowledge a recoverable fault | Must not automatically validate position |
| `ota_update` | Firmware maintenance | Only via authenticated workflow; no motion during update |

Example **illustrative** payload (not final protocol schema):

```json
{
  "protocol_version": 1,
  "message_id": "cmd-1042",
  "source": "swarm-controller",
  "target": "Mau03",
  "type": "move_to_mm",
  "payload": { "position_mm": 120, "speed_rpm": 5.0 }
}
```

## 9. Parameters to tune over Wi-Fi

Expose in UI, transmit to nodes, validate on-device and persist only on explicit **Save** (avoid flash wear from slider movement):

| Setting | Scope | Notes |
|---|---|---|
| `module_id` | Per node | `Mau01`–`Mau09`, unique |
| `retract_direction` | Per node | Calibrate from physical winding direction |
| `spool_diameter_mm` | Per node / global default | Initial 15.0; constant diameter model |
| `steps_per_output_rev` | Per node / global default | Initial 4096 half-steps, approximate |
| `steps_per_mm` calibration | Per node | Optional correction of geometric estimate |
| `max_travel_mm` | Per node | Initial candidate <= 1000; conservative commissioning cap until verified |
| `speed_rpm` | Global / per-node override | Adjustable; hard ceiling enforced in firmware |
| `acceleration` | Global / per-node override | Use physical units (steps/s² or mm/s²); no invented validated value |
| `home_seek_speed`, `home_backoff_speed` | Per node | Conservative, separately limited |
| `home_search_max_steps`, `home_timeout_ms` | Per node | Guard rails before first home |
| `home_offset_mm` | Per node | Usable zero away from switch |
| `coil_hold_mode` | Per node | Off/hold at rest, subject to glass-sphere load test and thermal limits |
| `disconnect_policy` | Installation | Safe bounded completion then stop by default |

Do **not** treat 10 or 15 RPM as a verified maximum. The existing test firmware uses **2 RPM**; higher achievable speeds depend on load, supply, torque, and ramp profile. Use a conservative software maximum at first and allow deliberate adjustment after observation without code changes, within firmware-imposed limits.

## 10. Initial web interface

A simple locally hosted responsive page with:

1. **3×3 visual matrix:** `Mau01`–`Mau09`, each with connectivity, homed/position-valid, estimated `z_mm`, state, target, fault, firmware version, and last heartbeat.
2. **Group controls:** `Home All`, `Stop All`, `Go to Zero`, start/stop preset, speed and amplitude controls; disable unsafe actions when nodes are unready.
3. **Individual controls:** select a Mau, issue home/stop/move-to, inspect fault details and edit its calibration.
4. **Three presets:** `Wave`, `Breathing`, `Drift` as **initial working labels**; choreography trajectories and names remain editable in source/config, not via a timeline editor yet.
5. **Configuration panel:** network/OTA/firmware information, online count, node IDs, persistence state, per-node travel and calibration.
6. **Visualization:** animate **estimated** vertical sphere positions from telemetry, clearly indicating disconnected, unhomed and simulated/unverified states.

A browser refresh must **not** stop node motors or erase persisted settings. Server should explicitly own choreography state and persist preset definitions.

## 11. Preset choreography data model

Presets are data, not separate compiled firmware modes. Each consists of a revision, name, per-node trajectories and bounded parameters. Start with a minimal time/position representation and support ease/ramp parameters as physically realizable by the planner.

```json
{
  "preset_id": "wave",
  "revision": 1,
  "name": "Wave",
  "tracks": {
    "Mau01": [{ "time_ms": 0, "z_mm": 0 }, { "time_ms": 15000, "z_mm": 100 }],
    "Mau02": [{ "time_ms": 1000, "z_mm": 0 }, { "time_ms": 16000, "z_mm": 100 }]
  }
}
```

Illustrative only. Complete tracks for all nine modules and make durations feasible based on configured RPM, acceleration and travel limits. **Validate feasibility before playback**; do not allow a timeline to demand impossible motion.

## 12. OTA / installation readiness

**Required before mounting all nine modules:**

- Flash Swarm firmware with a flash partition scheme compatible with the actual Super Mini flash size and OTA, verify successful boot and network connectivity.
- Assign and persist all nine unique IDs; verify no duplicates.
- Confirm that GPIO1 reads LOW when the NC switch is normally closed and HIGH when opened/unplugged, on the actual assembled PCB. **Current generic firmware expects the opposite COM+NO logic.**
- Verify each device responds to web status and can accept allowed settings.
- Perform at least one **complete OTA update and reboot** on representative hardware, and check the recovery path before ceiling mounting. OTA availability does **not** guarantee recovery from a bad flash; document physical fallback.
- Verify motor power/board polarity, PCB jumpers, and availability of a physically accessible master power cutoff. Check power restoration yields `UNHOMED`, no autonomous spin.
- Confirm the intended switch mechanism physically actuates in the final assembly and choose safe initial home-search ceilings.

**Commissioning after ceiling installation:**

1. Power up all nine: online and `UNHOMED`, no movement.
2. Confirm naming and physical grid mapping by identifying/commanding nodes one at a time.
3. Verify each sensor state remotely and visually; run controlled homing, first individually, then `Home All`.
4. Establish usable zero and maximum travel per node; use short test moves, then increase range gradually toward the 1,000 mm goal.
5. Tune speed/acceleration and assess lost steps, drift with coils off, winding behavior and repeatability under the real lightweight glass-sphere load.
6. Run presets at small amplitude; expand once nine-node coordination and recovery are reliable.
7. Test Wi-Fi loss, duplicate ID, power cycling, endstop disconnection, homing timeout, stop priority, OTA maintenance, and post-reboot position invalidation.

All nine modules can be installed as the test environment, as requested, **but electrical/connection/OTA checks before mounting are still necessary** to reduce ceiling access for recoverable faults.

## 13. Acceptance criteria

- [ ] One common Swarm firmware binary supports nine independently configured `MauNN` identities.
- [ ] No unintended movement on boot, reset, Wi-Fi connection, or OTA completion.
- [ ] COM+NC switch logic works on GPIO1 and rejects unverified/failed homing.
- [ ] Position remains invalid across reboot until successful homing.
- [ ] Nodes can receive status/config, safe move, stop and preset commands without blocking step generation.
- [ ] Configured speed, acceleration, travel and offsets are adjustable remotely and validated/persisted.
- [ ] Three initial presets run through the nine-node coordinator using a ready barrier and documented clock synchronization.
- [ ] Web matrix shows all `Mau01`–`Mau09`, estimated positions, connectivity, and faults.
- [ ] Loss of Wi-Fi does not cause indefinite or uncontrolled motion.
- [ ] OTA updates are demonstrated and documented before ceiling installation.
- [ ] Existing generic Controller v1 firmware, KiCad files, and historical research notes remain unchanged.

## 14. Recommended implementation sequence for the code AI

1. **Repository audit / design review:** read the references in §2, inspect current flash/board tooling, identify missing facts; produce a concise design and file tree. **Do not code against assumptions about the physical switch mechanism.**
2. **Node skeleton:** new `swarm/firmware/` project; tested motor stepping, config, state machine, NC sensor, identity and nonblocking serial diagnostics.
3. **Network/OTA:** provisioning, heartbeat, commands, persistent settings and a verified remote-update path.
4. **Homing + positional motion:** bounded homing, coordinate conversion, acceleration, soft limits, faults and tests.
5. **Mac coordinator + web UI:** local service, protocol, module matrix and controls.
6. **Preset engine:** three simple choreography tracks, barrier start and clock synchronization.
7. **Commissioning tools + documentation:** explicit pre-install checklist, recovery and traceable test logs.

Do not silently modify historical notes or the shared Controller v1. Deliver reviewable increments and explain any proposed deviations from this specification before implementation.

---

## Change log

- **2026-11-13 — v1 draft:** Nine-node Swarm architecture, mandatory NC home reference, constant-diameter positioning, Mac coordinator, remote calibration and OTA, three preset choreographies, ceiling-installation workflow.
