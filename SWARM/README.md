# SWARM Control

Local control application for SWARM, the nine-module MauMau kinetic installation in Artificial Emotion.
A Node.js coordinator runs on the Mac; the interface runs in any browser on the same network.

```text
Browser (Svelte 5 + Vite)  <-- WebSocket + HTTP -->  Mac coordinator (Node.js + TypeScript)  <-- WebSocket -->  nine nodes
```

## Status, read this first

| | State |
|---|---|
| Frontend, coordinator, shared code | Implemented, type-checked, production build succeeds |
| Coordinator logic against nine **simulated** nodes | 32 automated tests pass |
| Communication with SWARM firmware v0.2.0 | **Not implemented** |
| Tested against real firmware | No |
| Tested with physical MauMau modules | No |

This build drives **simulated nodes only**. It cannot talk to an ESP32 yet, because the firmware and
`firmware/docs/PROTOCOL.md` were not available when it was written (they are not in the public GitHub
repository, and the local project folder could not be reached). Starting with `SWARM_FLEET=hardware`
stops with an explanation instead of pretending. See [FIRMWARE-INTEGRATION.md](FIRMWARE-INTEGRATION.md).

The interface always shows whether it is looking at simulated nodes or hardware.

## Layout

```text
SWARM/
├── firmware/                  existing ESP32 firmware, untouched by this application
├── shared/                    score model, preset generators, validation, message and state types
├── coordinator/               device connections, clock sync, commands, run orchestration, HTTP server
│   └── src/sim/               nine simulated nodes
├── web/                       Svelte 5 interface
├── package.json               npm workspace root
├── README.md                  this file
└── FIRMWARE-INTEGRATION.md    what is needed to connect real modules, and open firmware questions
```

Two structural choices differ from a conventional setup:

- `shared/` is consumed as TypeScript source by both sides, and the coordinator runs through `tsx`.
  There is no compile step for the coordinator, so there is one less thing to keep in sync.
- The root holds `package.json`, `tsconfig.base.json` and `vitest.config.ts` for the workspace.

## Requirements

Node.js 20 or newer (developed on 22). No internet connection is needed after `npm install`; fonts are bundled.

## Commands

Run all of these from the `SWARM/` folder.

```bash
npm install        # once
npm run dev        # development: coordinator on :8787 with auto-restart, Vite on :5173 with hot reload
npm run build      # type-check everything and build the frontend into web/dist
npm run start      # production-style: the coordinator serves web/dist on :8787
npm test           # unit and integration tests (simulated nodes)
```

- **Development:** open `http://localhost:5173`. Vite forwards `/ws` and `/api` to the coordinator.
  Editing coordinator code restarts it, which drops and reconnects the simulated nodes.
- **Production-style:** run `npm run build` once, then `npm run start`, and open `http://localhost:8787`.
  The coordinator prints the addresses to use from other devices.

## Configuration

Environment variables, all optional:

| Variable | Default | Meaning |
|---|---|---|
| `SWARM_PORT` | `8787` | HTTP and WebSocket port |
| `SWARM_HOST` | `0.0.0.0` | Interface to listen on. `127.0.0.1` restricts access to this Mac |
| `SWARM_FLEET` | `simulator` | `hardware` is refused in this build |
| `SWARM_DEVICE_PATH` | `/device` | WebSocket path the nodes connect to |
| `SWARM_COORDINATOR` | `http://localhost:8787` | Development only: where Vite forwards to |

Example: `SWARM_PORT=9000 npm run start`.

## Using it from a tablet or phone

1. Put the Mac and the device on the same Wi-Fi network.
2. Start the coordinator and note the "Same network" address it prints, for example `http://192.168.1.20:8787`.
3. Open that address on the device.
4. The first time, macOS asks whether Node may accept incoming connections. Allow it. If the page does not
   load, check System Settings › Network › Firewall.

The network is trusted: there is no login. Anyone on that Wi-Fi can open the interface and press Stop.
Use a dedicated router for the installation, not a shared or guest network.

## Operating model

- **Preview** plays a score in the browser. It never sends anything.
- **Live** enables commands to the nodes. The stage turns dark.
- **One browser holds control.** Others monitor. "Take control" claims it when it is free; closing or
  reloading the controlling browser frees it. Any browser can press Stop at any time.
- **Stop all motors** is a software stop. It asks every connected node to stop, blocks motion commands
  until released by the controlling browser, and reports any node that did not confirm. It does not cut motor power.
- **Running a choreography** is two explicit steps: *Go to start* moves the spheres to their first
  positions; *Execute live* loads, prepares and commits the run after a confirmation, and never repositions anything.
- **Results are acknowledgments.** A command shows as done only after each node confirms it. Timeouts and refusals are shown per node.
- **Loop** in a live run means the coordinator re-arms the score after each pass. It needs the Mac running
  and leaves a short pause between passes.

Closing every browser changes nothing for the coordinator or the nodes. Stopping the coordinator does:
see below.

## Restarting the coordinator safely

1. Stop any running choreography and wait until all modules are idle.
2. Press Ctrl+C in the coordinator's terminal.
3. Start it again with `npm run start`. Browsers reconnect by themselves; control must be taken again.

What real nodes do when the coordinator disappears mid-motion is a firmware question that has not been
answered yet (see FIRMWARE-INTEGRATION.md). Until it is, do not restart the coordinator while modules move.

Nothing is configured to start automatically with macOS. Run it in a terminal; redirect output to keep a log:
`npm run start >> swarm.log 2>&1`.

## What is not done

- Communication with real firmware, and everything that depends on it.
- The firmware compatibility report and the autonomous-playback handoff. Both require reading the firmware.
- OTA management (entry point only).
- Travel limits are displayed, not edited.
- Acceleration is not part of score validation; only travel range and speed are checked.
- The approved wireframe lives on its own canvas and is not copied into this folder. The interface was rebuilt in Svelte from it.
