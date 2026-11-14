# Swarm — Commissioning (nine ESP32 modules)

Perform **all electrical, identity, Wi-Fi, and OTA checks on the bench before ceiling installation.**

Firmware **0.3.1** (quoted SSID Serial support). Same binary for all nine modules; identity lives in NVS.

**Do not put Wi-Fi passwords or auth tokens in source, docs, commits, or shared logs.**

## Recommended method

1. Verify flash size → flash **one** PlatformIO environment of firmware 0.3.1.  
2. Provision NVS over USB with `tools/provision_module.py` (or Serial by hand).  
3. Confirm Wi-Fi + identity + coordinator settings **without** homing or motor moves.  
4. Start SWARM Control in hardware mode and confirm `ws_linked`.  
5. Repeat for Mau02–Mau09 with the **same** binary and a **unique** module id.

## Hardware checklist (each MauMau)

- [ ] Artificial Emotion Controller v1 PCB + ESP32-S3 Super Mini seated  
- [ ] ULN2003A + 28BYJ-48 connected  
- [ ] Power jumpers JP1/JP2 and polarity verified against the PCB silkscreen  
- [ ] Endstop wired **COM+NC** between Sensor A1 **Signal (GPIO1)** and **GND** (do not short to 3V3)  
- [ ] Confirm GPIO1 reads **LOW** when NC is at rest, **HIGH** when switch opened or cable unplugged  
- [ ] Physically accessible master 5 V cutoff available for the installation  

## Mac LAN IP (do not invent)

The ESP32 connects to `ws://<mac-lan-ip>:8787/swarm`. On macOS:

```bash
ipconfig getifaddr en0    # typical Wi-Fi
ipconfig getifaddr en1    # alternate interface
# or:
cd SWARM/firmware
python3 tools/provision_module.py --show-lan
```

Use the address on the **same** LAN/SSID as the modules.

## Detect serial port

```bash
ls /dev/cu.usb* /dev/cu.wch* /dev/cu.SLAB* 2>/dev/null
# or:
python3 tools/provision_module.py --list-ports
```

## Check flash size

```bash
cd SWARM/firmware
export PATH="$HOME/.platformio/penv/bin:$PATH"
pio pkg exec -p tool-esptoolpy -- esptool.py flash_id
```

| Flash | Environment |
|---|---|
| 4 MB (common) | `swarm_s3_4mb_ota` (default) |
| 8 MB | `swarm_s3_8mb_ota` only after confirmation |

See [`OTA.md`](OTA.md).

## Build and flash the first module

```bash
cd SWARM/firmware
export PATH="$HOME/.platformio/penv/bin:$PATH"
pio run -e swarm_s3_4mb_ota
pio run -e swarm_s3_4mb_ota -t upload --upload-port /dev/cu.usbmodemXXXX
```

Open Serial Monitor (optional; close it before the provision helper uses the port):

```bash
pio device monitor --baud 115200 --port /dev/cu.usbmodemXXXX
```

Confirm boot banner: version **0.3.1**, coils safe, **no auto motion**. Type `help` if using the monitor interactively.

## Provision Mau01 (helper)

```bash
cd SWARM/firmware
pip install pyserial          # once
python3 tools/provision_module.py --module Mau01 --port /dev/cu.usbmodemXXXX
```

The helper:

- defaults SSID to the installation network name  
- prompts for **Wi-Fi password** and **SWARM auth token** (hidden input)  
- detects or asks for Mac LAN IP  
- sets coordinator port **8787**  
- writes NVS via Serial (`set_module_id`, `set_wifi`, `set_coordinator`, `set_token`, `save_config`)  
- never prints password or token  

Optional flags: `--coordinator <ip>`, `--ssid "…"`, `--yes`, `--wait 40`.

### Manual Serial (equivalent)

SSIDs with spaces **must** be quoted (firmware 0.3.1+):

```text
set_module_id Mau01
set_wifi "Your SSID Here" <password>
set_coordinator <mac-lan-ip> 8787
set_token <shared-secret>
save_config
status
```

(`set_module_id` / `set_wifi` / `set_coordinator` / `set_token` already persist; `save_config` confirms.)

## Start the Mac coordinator (hardware)

Same token as provisioned on the modules — via environment, not source:

```bash
cd SWARM
npm run build
SWARM_FLEET=hardware SWARM_AUTH_TOKEN='…' SWARM_PORT=8787 npm run start
```

Open the printed `http://<mac-lan-ip>:8787` URL. Take control → Live. Mau01 should appear connected (`simulated: false`).

## Phase C.1 — Sequential Mau02–Mau09 (`commission_next.py`)

Keep **one** SWARM Control process in **hardware** mode on port **8787**. Do not start a second coordinator. Do not switch to simulator.

Local state (gitignored under `tools/.local/`):

| File | Contents |
|---|---|
| `credentials.json` | SSID + Wi-Fi password + auth token (never print / never commit) |
| `commissioning_manifest.json` | Mau0N ↔ ESP32 MAC, flash size, firmware |
| `swarm_auth_token` | Legacy token file for coordinator launch helpers |

### Operator commands

```bash
cd SWARM/firmware
pip install pyserial          # once

# Overview
python3 tools/commission_next.py status

# Read-only probe of whatever is on USB (no NVS write, no flash)
python3 tools/commission_next.py inspect

# After disconnecting Mau01 and connecting the next ESP32:
python3 tools/commission_next.py next
# or explicitly:
python3 tools/commission_next.py commission --module Mau02
```

`next` / `commission` will:

1. Require hardware coordinator health on `:8787`  
2. Detect USB port, chip, **MAC**, flash size → PlatformIO env  
3. Ask which free identity (Mau02–Mau09)  
4. **Confirm before flashing** (or allow NVS-only refresh)  
5. Reuse local Wi-Fi + token when present (otherwise secure prompt once)  
6. Refuse to re-id **Mau01** / overwrite another module’s MAC silently  
7. Provision NVS, close Serial, verify registration via coordinator snapshot  
8. Append the local commissioning manifest  
9. Prompt you to unplug and connect the next board  

Exact first Mau02 command (board must be the **new** ESP32, not Mau01):

```bash
python3 tools/commission_next.py commission --module Mau02 --coordinator 192.168.68.73
```

Then for Mau03–Mau09:

```bash
python3 tools/commission_next.py next
```

Low-level Serial-only helper (still valid): `tools/provision_module.py`. Prefer `commission_next.py` for Phase C.1.

## Verification checklist (no motor motion)

After provision (and again after a USB/power reboot):

- [ ] `module_id` is the intended Mau0N  
- [ ] `wifi_ssid` matches the installation SSID  
- [ ] `wifi_connected` true  
- [ ] `ip` is a LAN address  
- [ ] `coordinator_host` / `coordinator_port` = Mac IP / `8787`  
- [ ] `firmware_version` is `0.3.1` (or later 0.3.x with quoted Wi-Fi)  
- [ ] Boot showed no unexpected motion; `position_valid` false until home  
- [ ] After reboot, the same identity / SSID / coordinator values remain  
- [ ] With SWARM Control hardware mode running: `ws_linked` true  

Do **not** run `home` or `move_to_mm` during this Wi-Fi commissioning pass.

## Ports note

| Service | Port |
|---|---|
| SWARM Control (`SWARM_PORT`) | **8787** (use this for install) |
| `tools/mock_coordinator.py` default | 8765 (bench protocol only) |
| Firmware NVS default before provision | 8765 |

WebSocket path is always `/swarm`.

## Homing safety (later — not part of Wi-Fi provision)

- Default: `home_open_recovery_enabled = false`.  
- If endstop is HIGH at home start, firmware faults until mechanics are validated.  
- First homes: low search steps / seek RPM; no ornament risk if possible.

## Pre-ceiling gate

- [ ] All nine unique IDs online  
- [ ] No duplicate IDs  
- [ ] OTA round-trip proven on each board (or at least one per flash-size class)  
- [ ] `stop` priority verified  
- [ ] Power cycle → UNHOMED, no auto spin  
- [ ] Endstop open cable test → not treated as home  

## After ceiling install

1. Power on: all online, UNHOMED, still.  
2. Map physical grid one module at a time.  
3. Home individually, then as a group.  
4. Expand `max_travel_mm` gradually toward commissioned safe travel (candidate ~1000 mm in the baseline spec).  
5. Only then load presets at small amplitude.

Physical validation of speed, drift, and switch geometry is **not** claimed by this firmware release.
