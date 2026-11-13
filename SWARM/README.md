# SWARM Control

Local control application for SWARM, the nine-module MauMau kinetic installation in Artificial Emotion.
A Node.js coordinator runs on the Mac; the interface runs in any browser on the same network.

```text
Browser (Svelte 5 + Vite)  <-- WebSocket + HTTP -->  Mac coordinator (Node.js + TypeScript)  <-- WebSocket /swarm -->  nine ESP32 nodes
                                                                                         \-- or simulated peers
```

## Status

| | State |
|---|---|
| Frontend, coordinator, shared code | Implemented; type-check and production build required after `npm install` |
| Coordinator logic against nine **simulated** nodes | Automated tests (sim codec) |
| Communication with SWARM firmware v0.3.0 | **Implemented** (`firmware-codec.ts`, hardware fleet mode) |
| Tested against real ESP32 hardware | **Not claimed here** — use the hardware checklist below |
| Autonomous playback after Mac disconnect | **Implemented in software** — see `docs/AUTONOMOUS-OPERATION.md`; physical validation required |

The interface always shows whether it is looking at simulated nodes or hardware (`fleet` in the snapshot).

## Layout

```text
SWARM/
├── firmware/                  ESP32-S3 firmware v0.2.0 (PROTOCOL.md)
├── shared/                    score model, preset generators (≤32 keyframes), validation
├── coordinator/               device connections, clock sync, commands, run orchestration
│   ├── src/devices/sim-codec.ts       simulator wire (swarm-sim/0)
│   └── src/devices/firmware-codec.ts  firmware v0.2.0 wire
├── web/                       Svelte 5 interface
├── package.json
├── README.md                  this file
└── FIRMWARE-INTEGRATION.md    commissioning and protocol notes
```

## Requirements

Node.js 20 or newer. No internet connection is needed after `npm install`; fonts are bundled.

## Commands

Run all of these from the `SWARM/` folder.

```bash
npm install        # once
npm run dev        # development: coordinator on :8787, Vite on :5173 (simulator by default)
npm run build      # type-check everything and build the frontend into web/dist
npm run start      # production-style: coordinator serves web/dist on :8787 (simulator by default)
npm test           # unit and integration tests
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SWARM_PORT` | `8787` | HTTP and WebSocket **port** the Mac listens on |
| `SWARM_HOST` | `0.0.0.0` | Interface to listen on |
| `SWARM_FLEET` | `simulator` | `hardware` selects the firmware codec |
| `SWARM_DEVICE_PATH` | `/swarm` | WebSocket **path** nodes connect to (firmware hard-codes `/swarm`) |
| `SWARM_AUTH_TOKEN` | _(required for hardware)_ | Must match each module’s NVS `auth_token` (never logged) |
| `SWARM_COORDINATOR` | `http://localhost:8787` | Development only: where Vite forwards to |

**Port vs path:** The ESP32 stores `coordinator_host` + `coordinator_port` (the Mac’s LAN IP and `SWARM_PORT`). The WebSocket path is always `/swarm` in firmware. Changing `SWARM_PORT` does **not** require a firmware rebuild if you re-provision the port over Serial (`set_coordinator`).

## Hardware mode

```bash
cd SWARM
npm run build
SWARM_FLEET=hardware SWARM_AUTH_TOKEN='your-shared-token' SWARM_PORT=8787 npm run start
```

Open `http://localhost:8787` (or the printed LAN URL). Take control, switch to **Live**.

### Commission each MauMau module (Serial)

With the module on USB Serial (see `firmware/docs/COMMISSIONING.md`):

```text
set_module_id Mau01          # through Mau09 — unique
set_wifi <ssid> <password>
set_coordinator <mac-lan-ip> 8787
set_token <same-as-SWARM_AUTH_TOKEN>
```

Reboot. The module connects as a WebSocket **client** to `ws://<mac-lan-ip>:8787/swarm` and sends `status`.

## Operating model

- **Preview** plays a score in the browser. It never sends anything.
- **Live** enables commands to the nodes. The stage turns dark.
- **One browser holds control.** Anyone can press Stop.
- **Collective runs** use `load_trajectory` → `prepare_run` → `commit_run` with absolute coordinator-monotonic `start_at_us` (never legacy `delay_ms`).
- **Loop** in Live still means the coordinator re-arms each pass (Mac must stay on). Onboard autonomy is a later phase.
- Preset generators emit **≤32 keyframes** per module so Preview matches what firmware can load.

## Hardware verification checklist

Software tests passing ≠ physical success. On the bench or installed:

1. **Connect** — all nine Mau01–Mau09 appear connected, `simulated: false`, firmware version shown.
2. **Home** — Home all; wait until each reports homed (ack means *started*, telemetry means *done*).
3. **Move** — Move one module a short distance; confirm position estimate updates.
4. **Stop** — Stop all / software stop; motion ceases; confirmation or explicit failure listed.
5. **Sync** — System / clocks show synchronised; node `clock_synced` true before Execute.
6. **Collective** — Go to start → Execute a short Wave; all nine arm; `run_started` / completion (or clear failure + stop).

## What is not done

- Autonomous looping / finish-full-track after Mac power-off (next implementation phase).
- OTA management UI.
- Travel limits editing (displayed from nodes only).
- Physical soak / ceiling validation of timing accuracy.
