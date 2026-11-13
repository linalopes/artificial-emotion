# Firmware integration (Phase B.1)

The coordinator speaks SWARM firmware v0.2.0 when `SWARM_FLEET=hardware`.

Authoritative contract: `firmware/docs/PROTOCOL.md` and `firmware/src/net/protocol.cpp`.

## Codecs

| Mode | Codec | Wire |
|---|---|---|
| `SWARM_FLEET=simulator` (default) | `devices/sim-codec.ts` | `swarm-sim/0` — regression only |
| `SWARM_FLEET=hardware` | `devices/firmware-codec.ts` | JSON envelope, `protocol_version: 1` |

Hardware mode **requires** `SWARM_AUTH_TOKEN` (non-empty). The value is never logged.

## Connection

- ESP32 is the WebSocket **client**.
- Path: `/swarm` (firmware hard-coded).
- Host/port: whatever was provisioned with Serial `set_coordinator <host> <port>` — typically the Mac LAN IP and `SWARM_PORT` (default `8787`).
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
| `prepare` | `prepare_run` | Requires node `clock_synced` |
| `commit` | `commit_run` | **`start_at_us`** coordinator monotonic µs (shared) |
| `cancel` | `cancel_run` | |

Clock: `clock_sync_req` → `clock_sync_resp` → `clock_sync_fin` in **microseconds**. The node applies offset on **fin**.

Collective starts must **not** use legacy `start_at` / `delay_ms`.

## Limits mirrored in the app

- Max keyframes per track: 32 (`FW_MAX_KEYFRAMES`)
- Max inbound WS message: 2048 bytes
- UI RPM max: 8 (`SWARM_ABS_MAX_RPM`); device `hardMaxRpm` may be lower
- Default travel assumption when a node has not reported: 0–500 mm

## Still out of scope (next phase)

- Finish entire loaded track after coordinator disconnect
- Onboard loop without Mac re-arm
- Cross-node fault stop without coordinator
- Position retention across reboot

## Practical start

```bash
cd SWARM
npm install && npm run build
SWARM_FLEET=hardware SWARM_AUTH_TOKEN='…' npm run start
```

Provision modules so `coordinator_host` / `coordinator_port` / `auth_token` match this process. See README hardware checklist.
