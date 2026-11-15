# SWARM firmware

Firmware for the nine MauMau kinetic modules (`Mau01`–`Mau09`) in the Artificial Emotion **SWARM** installation.

**Version:** **0.3.5** (set by PlatformIO `-D SWARM_FW_VERSION=\"0.3.5\"`) — clock_sync_fin parses `t*_us` as `uint64_t` (0.3.4’s `| 0` truncated past ~35.7 min uptime and broke fleet sync); motion ceiling remains `SWARM_ABS_MAX_RPM` **15** with the 0.3.4 NVS migration; homing on `SWARM_ABS_MAX_HOME_RPM` **15**; remote `hard_*` writes stay blocked.  
 
 
**Protocol:** version **1** (additive fields for autonomous playback)  
**Installation entry:** [`../README.md`](../README.md)

Wi-Fi / identity commissioning: [`docs/COMMISSIONING.md`](docs/COMMISSIONING.md) and `tools/provision_module.py`.

This is a **dedicated Swarm application**. It is not a replacement for the generic Artificial Emotion Controller v1 motion-test firmware under [`../../artificial-emotion-controller-v1/`](../../artificial-emotion-controller-v1/). Do not mix the two binaries on modules intended for the nine-node install.

Baseline design intent (travel candidates, original assumptions) remains in [`../SWARM-v1.md`](../SWARM-v1.md). **Implemented limits and behaviour** are defined by this tree and [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

## Hardware target

| Item | Spec (from `src/board/pins.h` / config defaults) |
|---|---|
| MCU / board | ESP32-S3 Super Mini on Artificial Emotion Controller v1 PCB |
| Driver / motor | ULN2003A + 5 V 28BYJ-48 geared stepper |
| Motor GPIO | **10, 11, 12, 13** (`IN1`–`IN4`) |
| User button | **GPIO7** |
| Endstop | **GPIO1** — Sensor A1, mandatory **COM+NC** to GND, `INPUT_PULLUP` |
| Spool model | Constant **15 mm** core diameter; line diameter ignored in v1 |
| Steps model | `steps_per_mm` derived from geometry × `calibration_factor` (default `steps_per_output_rev` 4096) |
| Default speed | **15 RPM**; remote changes clamped by hard ceilings |
| Default `max_travel_mm` | **500** (commission upward; absolute compile-time max **1500**) |
| Absolute max RPM | **15** (`SWARM_ABS_MAX_RPM`) |

NC endstop polarity for Swarm **reverses** the optional COM+NO interpretation used by some generic Controller experiments. Do not change that generic firmware to “match” Swarm.

## PlatformIO environments

| Environment | Purpose |
|---|---|
| `swarm_s3_4mb_ota` | **Default** — 4 MB flash, dual OTA partitions |
| `swarm_s3_8mb_ota` | 8 MB boards only after `flash_id` confirms size |
| `native_host` | Host unit tests (no hardware) |

Pinned deps: `espressif32@6.9.0`, `ArduinoJson@7.3.0`, `WebSockets@2.4.1`.

## Firmware structure

```text
firmware/
├── platformio.ini
├── partitions/                 OTA partition tables
├── include/
│   ├── swarm_version.h         Protocol version; FW version override fallback
│   └── swarm_limits.h          Compile-time absolute maxima
├── src/
│   ├── board/                  GPIO init (`pins.h`)
│   ├── motor/                  Half-step driver + non-blocking planner
│   ├── sensing/                NC endstop debounce
│   ├── homing/                 Transition-proven home state machine
│   ├── position/               Estimated steps / mm
│   ├── config/                 NVS + derived steps_per_mm
│   ├── net/                    Wi-Fi + WebSocket protocol
│   ├── sync/                   Clock sync samples
│   ├── choreography/           Track load / player / run controller
│   ├── ota/                    HTTP OTA
│   ├── system/                 State + faults
│   └── main.cpp
├── docs/
│   ├── PROTOCOL.md
│   ├── COMMISSIONING.md
│   └── OTA.md
├── tools/
│   ├── mock_coordinator.py
│   └── provision_module.py     Interactive USB NVS provisioning
└── test/                       Host (native) tests
```

## Build

```bash
export PATH="$HOME/.platformio/penv/bin:$PATH"
cd SWARM/firmware
pio run -e swarm_s3_4mb_ota
```

## USB upload and serial monitor

```bash
pio run -e swarm_s3_4mb_ota -t upload
pio device monitor -b 115200
```

Confirm flash size before relying on OTA partitions ([`docs/OTA.md`](docs/OTA.md)).

## Module commissioning

Full checklist: [`docs/COMMISSIONING.md`](docs/COMMISSIONING.md).

Serial (examples):

```text
help
set_module_id Mau01
set_wifi <ssid> <password>
set_wifi "ssid with spaces" <password>
set_coordinator <mac-lan-ip> 8787
set_token <shared-secret>
save_config
status
home
stop
move_to_mm 50
```

Never log or commit the Wi-Fi password or auth token. Prefer the interactive helpers:

```bash
pip install pyserial
python3 tools/commission_next.py status
python3 tools/commission_next.py inspect
python3 tools/commission_next.py next          # Mau02–Mau09 sequential
# low-level NVS-only helper:
python3 tools/provision_module.py --module Mau0N --port /dev/cu.usbmodemXXXX
```

See [`docs/COMMISSIONING.md`](docs/COMMISSIONING.md) (Phase C.1).

- **Identity:** unique `Mau01` … `Mau09` in NVS. Duplicates are rejected by the Mac coordinator.
- **Wi-Fi / coordinator:** ESP32 is the WebSocket **client** to `ws://<host>:<port>/swarm`. Path `/swarm` is hard-coded.
- **Auth token:** must match Mac `SWARM_AUTH_TOKEN` in hardware mode. Never log tokens.
- **Ports:** NVS default coordinator port is **8765** (matches `tools/mock_coordinator.py`). **SWARM Control** defaults to **8787** — provision that port for the real app.

### Mock coordinator (bench)

```bash
pip install websockets
python3 tools/mock_coordinator.py --port 8765
```

## Homing and position

- No automatic motion at boot, Wi-Fi connect, or OTA reboot.
- Homing proves an endstop **transition**; NC HIGH at rest is **not** “already home”.
- Open-endstop recovery exists but is **disabled by default**.
- After reboot: **UNHOMED**, position invalid, autonomous authorization cleared.

## Motion limits

| Limit | Value | Notes |
|---|---|---|
| Default choreography travel | 500 mm | Spec candidate in SWARM-v1 was ~1000 mm; commission on install |
| Hard max travel (config ceiling) | ≤ 1500 mm | `SWARM_ABS_MAX_TRAVEL_MM` |
| Default / hard max RPM | 2 / ≤ 8 | Soft default vs absolute clamp |
| Track keyframes | ≤ 32 | Also max inbound WS message 2048 bytes |
| Legacy `start_at` delay | ≤ 120 s | Bench only; collective starts use `commit_run` + `start_at_us` |

## Firmware protocol

Authoritative contract: [`docs/PROTOCOL.md`](docs/PROTOCOL.md).  
Mac mapping: [`../FIRMWARE-INTEGRATION.md`](../FIRMWARE-INTEGRATION.md).

Summary: JSON over WebSocket; registration via `status`; privileged commands require `auth_token`; collective runs use clock sync + prepare/commit with coordinator-monotonic `start_at_us`.

## Autonomous playback

Firmware **0.3.0** supports opt-in autonomous full-track finish and bounded/continuous local looping after Mac disconnect. See [`../docs/AUTONOMOUS-OPERATION.md`](../docs/AUTONOMOUS-OPERATION.md).

Physical nine-module soak and drift measurement remain **pending**.

## OTA prerequisites

Verify flash size, use the matching partition env, and prove at least one OTA round-trip on the bench before ceiling install. See [`docs/OTA.md`](docs/OTA.md). Automatic app-level rollback is not claimed.

## Host tests

```bash
pio test -e native_host
```

Previously reported: **38/38** host tests. Host tests are **not** hardware validation.

## Spec deviations (vs SWARM-v1 baseline)

Relative to the historical specification:

1. Collective starts use **clock sync + `start_at_us`**. Legacy `start_at` + `delay_ms` remains for bench only.
2. Default `max_travel_mm` is **500** until commissioned; SWARM-v1 proposed ~1000 mm travel as a candidate.
3. Open-endstop recovery implemented but **off** by default.
4. Mac coordinator + Svelte UI live in `SWARM/` (Phase B) — not in this firmware tree.
5. OTA transfer is chunked; brief blocking on idle HTTP GET may still occur. See `docs/OTA.md`.
6. Version history: 0.1.x → **0.2.0** prepare/commit → **0.3.0** autonomous → **0.3.1** quoted `set_wifi` → **0.3.2** independent home RPM ceiling → **0.3.3** fleet home ceiling standardized at **15 RPM** → **0.3.4** normal-motion absolute ceiling **15 RPM** with NVS migration.

## Safety

- NC HIGH ≠ home.
- Gearbox is not a certified brake; `coil_hold_mode` is configurable.
- Software Stop is not an emergency power disconnect — use a physical cutoff.
- Do not claim physical validation until the nine installed modules are tested.
