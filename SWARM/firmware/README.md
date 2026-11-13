# Swarm v1 Firmware

Firmware for nine identical MauMau kinetic modules (`Mau01`–`Mau09`) in the Artificial Emotion **Swarm** installation.

**Source of truth:** [`../SWARM-v1.md`](../SWARM-v1.md)  
**PCB / pins:** Artificial Emotion Controller v1 (ESP32-S3 Super Mini, ULN2003A, GPIO10–13 motor, GPIO1 NC endstop, GPIO7 button)

This project is standalone under `SWARM/firmware/`. It does **not** modify the generic Controller v1 motion-test sketch.

## Properties

- One shared binary; identity stored in NVS  
- No automatic motor motion at boot, Wi-Fi connect, or OTA reboot  
- Non-blocking half-step driver + motion planner + NC homing  
- WebSocket **client** to a Mac coordinator (Phase B builds the UI)  
- Constant 15 mm spool diameter model; line diameter ignored in v1  
- Authoritative `steps_per_mm` derived from geometry × `calibration_factor`  
- Default speed 2 RPM; remote changes within firmware hard ceilings  

## Directory layout

```text
firmware/
├── platformio.ini
├── partitions/          # OTA tables (verify flash size first)
├── include/swarm_version.h
├── src/                 # modular firmware
├── docs/PROTOCOL.md
├── docs/COMMISSIONING.md
├── docs/OTA.md
└── tools/mock_coordinator.py
```

## Build

Requires PlatformIO Core:

```bash
export PATH="$HOME/.platformio/penv/bin:$PATH"
cd SWARM/firmware
pio run -e swarm_s3_4mb_ota
```

Upload:

```bash
pio run -e swarm_s3_4mb_ota -t upload
pio device monitor -b 115200
```

**Hardware-specific:** confirm flash size before relying on OTA partitions (`docs/OTA.md`). Default env assumes **4 MB**.

### Dependencies (pinned)

- `espressif32@6.9.0` (Arduino)  
- `bblanchon/ArduinoJson@7.3.0`  
- `links2004/WebSockets@2.4.1`  

## Serial commissioning

```text
help
set_module_id Mau01
set_wifi MySSID MyPassword
set_coordinator 192.168.1.20 8765
set_token swarm-local
save_config
status
home
stop
move_to_mm 50
```

## Mock coordinator

```bash
pip install websockets
python3 tools/mock_coordinator.py --port 8765
```

## Module map

| Area | Responsibility |
|---|---|
| `board/` | GPIO init |
| `motor/` | Half-step driver + planner |
| `sensing/` | NC endstop debounce |
| `homing/` | Transition-proven home SM |
| `position/` | Estimated steps/mm |
| `config/` | NVS + derived steps/mm |
| `net/` | Wi-Fi + WebSocket protocol |
| `choreography/` | Data-driven tracks |
| `ota/` | HTTP OTA |
| `system/` | State + faults |

## Spec deviations (explicit)

Relative to `SWARM-v1.md`:

1. **`start_at` uses `delay_ms`** from message receipt (local `millis()`), not a shared absolute wall clock. Cap: 120 s.  
2. **Default `max_travel_mm` is 500** (conservative) until commissioned; spec candidate remains 1000.  
3. **Open-endstop recovery** is implemented but **disabled by default**.  
4. **No web UI / full Mac coordinator** in this tree (Phase B). Mock coordinator only.  
5. OTA body transfer is chunked; initial HTTP GET may still block briefly while idle. Automatic app-level rollback is **not** claimed — see `docs/OTA.md`.  
6. Firmware **0.1.1** remediates C1–C2 and H1–H7.  
7. Firmware **0.1.2** remediates M1–M10 / L1–L5.  
8. Firmware **0.2.0** adds collective clock sync + prepare/commit/arm (`docs/PROTOCOL.md`).
9. Firmware **0.3.0** adds opt-in autonomous full-track / local loop after Mac disconnect (see `../docs/AUTONOMOUS-OPERATION.md`).

## Host tests

```bash
pio test -e native_host
```

Host tests cover step scheduling, config ceilings, idempotency, delay_ms validation, timer rollover, and message bounds. They are **not** hardware validation.

## Commissioning before Phase B

See `docs/COMMISSIONING.md` and `docs/OTA.md`. Flash over USB, assign `Mau01`–`Mau09`, verify Wi-Fi + mock coordinator, then one OTA round-trip on bench hardware.

## Safety reminders

- NC HIGH ≠ home.  
- Gearbox is not a certified brake; `coil_hold_mode` is configurable.  
- Not a certified e-stop; use a physical power cutoff.  
- Do not claim physical validation until the nine modules are tested.  
