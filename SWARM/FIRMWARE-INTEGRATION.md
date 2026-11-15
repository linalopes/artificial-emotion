# Firmware integration (Phase B.1 + B.2)

The coordinator speaks SWARM firmware **v0.3.0** (protocol **1**, additive autonomous fields) when `SWARM_FLEET=hardware`.

Authoritative contract: [`firmware/docs/PROTOCOL.md`](firmware/docs/PROTOCOL.md) and `firmware/src/net/protocol.cpp`.  
Autonomous playback: [`docs/AUTONOMOUS-OPERATION.md`](docs/AUTONOMOUS-OPERATION.md).  
Operator entry: [`README.md`](README.md).

Earlier Phase A / simulator-only work used `sim-codec.ts` (`swarm-sim/0`). That path remains the default for development and regression; it is **not** the hardware wire format.

## Codecs

| Mode | Codec | Wire |
|---|---|---|
| `SWARM_FLEET=simulator` (default) | `devices/sim-codec.ts` | `swarm-sim/0` — simulator / regression |
| `SWARM_FLEET=hardware` | `devices/firmware-codec.ts` | JSON envelope, `protocol_version: 1` |

Hardware mode **requires** `SWARM_AUTH_TOKEN` (non-empty). The value is never logged.

## Connection

- ESP32 is the WebSocket **client**.
- Path: `/swarm` (firmware hard-coded).
- Host/port: provisioned with Serial `set_coordinator <host> <port>` — typically the Mac LAN IP and `SWARM_PORT` (default `8787`).
- Identity: first `type: "status"` with `source` / `module_id` in Mau01–Mau09. Duplicate identities are rejected.
- There is no simulator `hello` event on the firmware wire.

## Commands (internal → firmware)

| Internal | Firmware `type` | Notes |
|---|---|---|
| `home` | `home` | Ack = accepted/started, not completed |
| `move` | `move_to_mm` | `position_mm` |
| `stop` | `stop` | No auth |
| `set_params` | `set_config` | `speed_rpm`, `acceleration_mm_s2` |
| `clear_fault` | `clear_fault` | Re-home required after |
| `get_config` | `get_config` | |
| `load_trajectory` | `load_trajectory` | `track[{time_ms,z_mm}]`, ≤32 frames, ≤2048 bytes |
| `prepare` | `prepare_run` | Requires node `clock_synced`; optional `autonomous` / `loop` / `max_loops` / `max_runtime_ms` / `continuous` |
| `commit` | `commit_run` | **`start_at_us`** coordinator monotonic µs (shared) |
| `cancel` | `cancel_run` | |

Clock: `clock_sync_req` → `clock_sync_resp` → `clock_sync_fin` in **microseconds**. The node applies offset on **fin**.

Collective starts must **not** use legacy `start_at` / `delay_ms`.

## Limits mirrored in the app

- Max keyframes per track: 32 (`FW_MAX_KEYFRAMES`)
- Max inbound WS message: 2048 bytes
- UI RPM max: 15 (`SWARM_ABS_MAX_RPM`); device `hardMaxRpm` may be lower; remote `hard_*` ceilings are not writable
- Default travel assumption when a node has not reported: 0–500 mm

## Implemented in B.2 (software)

- Finish entire loaded track after coordinator disconnect when the run was prepared with `autonomous: true` and local start has occurred
- Onboard looping without Mac re-arm when loop / continuous policy was authorized at prepare
- Status telemetry for autonomous policy and loop progress

Still **not** provided by firmware alone:

- Cross-node fault or Stop propagation without the coordinator
- Position retention or auto-resume across reboot
- Guaranteed multi-hour nine-node sync while offline (no time master after disconnect)

## Practical start

```bash
cd SWARM
npm install && npm run build
SWARM_FLEET=hardware SWARM_AUTH_TOKEN='…' npm run start
```

Provision modules so `coordinator_host` / `coordinator_port` / `auth_token` match this process. See the hardware checklist in [`README.md`](README.md) and [`firmware/docs/COMMISSIONING.md`](firmware/docs/COMMISSIONING.md).
