# SWARM

**SWARM** is a nine-module kinetic installation in **Artificial Emotion**: a fixed 3 × 3 matrix of MauMau units that raise and lower lightweight hollow glass ornaments on braided line.

Each module is an **Artificial Emotion Controller v1** board (ESP32-S3 Super Mini, ULN2003A, 28BYJ-48) running dedicated **Swarm firmware**. A Mac on the same local Wi-Fi runs the **coordinator** and serves a **Svelte** control interface. Collective motion is scheduled on the modules; Wi-Fi carries commands, clock sync, scores and telemetry—not individual motor steps.

This folder is the software and documentation for that installation. Mechanical design of the MauMau unit lives in [`../kinetic-module-maumau/`](../kinetic-module-maumau/). The generic Controller v1 motion-test firmware remains separate under [`../artificial-emotion-controller-v1/`](../artificial-emotion-controller-v1/).

## System architecture

```text
                    ┌─────────────────────────────────────┐
                    │  Browser (Svelte 5 + Vite)          │
                    │  Preview / Live / Perform / System  │
                    └───────────────┬─────────────────────┘
                                    │  HTTP + WebSocket (/api, /ws)
                    ┌───────────────▼─────────────────────┐
                    │  Mac coordinator (Node.js + TS)     │
                    │  fleet sync · load → prepare → commit│
                    │  monitoring · Stop / Cancel         │
                    └───────────────┬─────────────────────┘
                                    │  WebSocket path /swarm
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
        ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
        │ ESP32     │   …×7…  │ ESP32     │         │ Simulator │
        │ Mau01–09  │         │ Mau09     │         │ (default) │
        │ firmware  │         │           │         │ nine peers│
        │ 0.3.0     │         │           │         │           │
        └───────────┘         └───────────┘         └───────────┘
```

| Layer | Role |
|---|---|
| Physical installation | Nine MauMau modules, endstops, power cutoff, ceiling mount |
| MauMau mechanics | Spool, line, ornament; design files outside this folder |
| ESP32 firmware | Homing, motion, track player, clock sync, autonomous playback |
| Mac coordinator | Device registry, sync, choreography orchestration, UI API |
| Svelte interface | Operator control on any browser on the LAN |
| Simulator | Nine in-process peers for development without hardware |

## Operating modes

### Connected operation

The Mac coordinator manages connections, clock synchronisation, commands, monitoring and collective execution (`load_trajectory` → `prepare_run` → `commit_run` with shared `start_at_us`). Live **Loop** in the UI re-arms each pass from the Mac; the coordinator must stay reachable for Stop over Wi-Fi and for non-autonomous looping.

### Autonomous operation

The Mac loads a track and starts an **explicitly authorized** autonomous run (`prepare_run` with `autonomous: true`). After local playback has begun, each ESP32 can finish the track and any authorized local loops **without** the coordinator.

**Limitations (by design):**

- After disconnect there is **no time master**; nine-node phase will drift over long free-running periods.
- Global **Stop** over Wi-Fi requires the Mac. Offline, use a **physical power cut-off**.
- A local fault stops **that** module only when the coordinator is absent; it does not propagate to the other eight.
- Reboot clears autonomous authorization, invalidates position, and never auto-resumes motion.

Details: [`docs/AUTONOMOUS-OPERATION.md`](docs/AUTONOMOUS-OPERATION.md).

## Implementation status

| Area | State |
|---|---|
| Firmware **v0.3.0** (protocol **1**) | Implemented in software |
| Phase **B.1** firmware ↔ coordinator integration | Implemented (`firmware-codec.ts`, hardware fleet) |
| Phase **B.2** autonomous playback / local looping | Implemented in software |
| Application type-check, production build, automated tests | Previously reported successful (46/46 app; firmware host 38/38; PlatformIO build) — not re-run in this documentation pass |
| Physical ESP32 / nine-module installed validation | **Pending** — not claimed |

The UI snapshot always shows whether the fleet is `simulator` or `hardware`.

## Project structure

```text
SWARM/
├── SWARM-v1.md                 Historical baseline specification
├── FIRMWARE-INTEGRATION.md     Coordinator ↔ firmware wire mapping
├── docs/
│   └── AUTONOMOUS-OPERATION.md Autonomous authorization and limits
├── firmware/                   ESP32-S3 firmware v0.3.0
│   ├── docs/PROTOCOL.md
│   ├── docs/COMMISSIONING.md
│   └── docs/OTA.md
├── shared/                     Score model, Wave / Breathing / Drift generators
├── coordinator/                Device server, sync, run orchestration
│   ├── src/devices/sim-codec.ts
│   └── src/devices/firmware-codec.ts
├── web/                        Svelte 5 control interface
├── package.json
└── README.md                   this file
```

## Requirements

Node.js **20** or newer. No internet is required after `npm install`; fonts are bundled.

Firmware builds use **PlatformIO** (see [`firmware/README.md`](firmware/README.md)).

## Commands

Run these from the `SWARM/` directory.

```bash
npm install        # once
npm run dev        # development: coordinator :8787, Vite :5173 (simulator by default)
npm run build      # type-check + build web into web/dist
npm run start      # serve web/dist from the coordinator on :8787 (simulator by default)
npm test           # Vitest unit and integration tests
```

### Simulator (default)

```bash
cd SWARM
npm install
npm run dev
```

Open the printed Vite URL (typically `http://localhost:5173`). The coordinator also listens on `http://localhost:8787`.

### Hardware mode

```bash
cd SWARM
npm run build
SWARM_FLEET=hardware SWARM_AUTH_TOKEN='your-shared-token' SWARM_PORT=8787 npm run start
```

Open `http://localhost:8787` or the printed LAN URL (`http://<mac-lan-ip>:8787`). Take control, switch to **Live**.

Provision each module over USB Serial so `coordinator_host`, `coordinator_port` and `auth_token` match this process (see [`firmware/docs/COMMISSIONING.md`](firmware/docs/COMMISSIONING.md)):

```text
set_module_id Mau01
set_wifi <ssid> <password>
set_coordinator <mac-lan-ip> 8787
set_token <same-as-SWARM_AUTH_TOKEN>
save_config
```

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SWARM_PORT` | `8787` | HTTP / WebSocket port on the Mac |
| `SWARM_HOST` | `0.0.0.0` | Listen interface |
| `SWARM_FLEET` | `simulator` | `hardware` selects the firmware codec |
| `SWARM_DEVICE_PATH` | `/swarm` | Path ESP32 clients connect to (firmware hard-codes `/swarm`) |
| `SWARM_AUTH_TOKEN` | _(required for hardware)_ | Must match each module’s NVS `auth_token` (never logged) |
| `SWARM_COORDINATOR` | `http://localhost:8787` | Dev only: Vite proxy target |

Firmware NVS defaults still use coordinator port **8765** (mock coordinator). For SWARM Control, provision **8787** (or your `SWARM_PORT`).

## Operator model

- **Preview** plays a score in the browser only; it never commands nodes.
- **Live** enables commands; one browser holds control; anyone may press Stop.
- Collective runs use absolute coordinator-monotonic `start_at_us` — not legacy `delay_ms`.
- Preset generators (Wave, Breathing, Drift) emit **≤32 keyframes** per module so Preview matches firmware load limits.
- **Autonomous on modules** (Perform) is the opt-in for B.2 local continuation / looping.

## Hardware verification checklist

Software green ≠ physical success.

1. **Connect** — Mau01–Mau09 connected, `simulated: false`, firmware version shown.
2. **Home** — Home all; wait for telemetry (ack means *started*).
3. **Move** — Short move; position estimate updates.
4. **Stop** — Stop all; motion ceases or failure is explicit.
5. **Sync** — Clocks synchronised before Execute.
6. **Collective** — Short Wave; nine arm acks; `run_started` / completion (or clear failure + stop).
7. **Autonomous (optional bench)** — Authorize autonomous, start, disconnect Mac after `run_started`; confirm track/loops continue; recover with physical cut-off if needed.

## Documentation map

| Document | Role |
|---|---|
| [`SWARM-v1.md`](SWARM-v1.md) | Original architecture / baseline specification (historical) |
| [`firmware/README.md`](firmware/README.md) | Firmware build, flash, commissioning entry |
| [`firmware/docs/PROTOCOL.md`](firmware/docs/PROTOCOL.md) | Wire protocol for firmware 0.3.0 |
| [`firmware/docs/COMMISSIONING.md`](firmware/docs/COMMISSIONING.md) | Bench commissioning before ceiling install |
| [`firmware/docs/OTA.md`](firmware/docs/OTA.md) | OTA partitions and prerequisites |
| [`FIRMWARE-INTEGRATION.md`](FIRMWARE-INTEGRATION.md) | How the Mac maps internal commands to firmware |
| [`docs/AUTONOMOUS-OPERATION.md`](docs/AUTONOMOUS-OPERATION.md) | Autonomous authorization, loops, disconnect, safety |

Parent project: [`../README.md`](../README.md).
