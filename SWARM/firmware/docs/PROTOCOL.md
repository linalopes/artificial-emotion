# Swarm v1 — Node Protocol Contract

**Firmware:** 0.3.1 (protocol fields additive since 0.3.0)  
**Transport:** WebSocket client (ESP32) → Mac coordinator  
**Path:** `/swarm`  
**Encoding:** UTF-8 JSON  
**Protocol version:** `1` (additive fields only in 0.3.0)  
**Max inbound message:** 2048 bytes  

Phase B.1 / B.2 implement this contract in software. Physical ESP32 validation is separate. This is not the web UI. Source of truth for behaviour: `firmware/src/net/protocol.cpp`.

Mac mapping: [`../../FIRMWARE-INTEGRATION.md`](../../FIRMWARE-INTEGRATION.md). Autonomous semantics: [`../../docs/AUTONOMOUS-OPERATION.md`](../../docs/AUTONOMOUS-OPERATION.md).

## Message envelope

Every JSON object includes at least:

| Field | Role |
|---|---|
| `protocol_version` | Must be `1`; mismatch → nack |
| `message_id` | Unique per side-effecting command within a WS session; required for those commands |
| `type` | Command, `ack` / `nack`, `status`, `event`, or sync message type |
| `source` / `module_id` | Module identity on node → Mac messages |
| `auth_token` | Required on privileged Mac → node commands |

### Status fields useful for commissioning (0.3.1+)

| Field | Notes |
|---|---|
| `wifi_ssid` | Configured SSID only — **never** the Wi-Fi password |
| `wifi_connected` / `ip` / `rssi` | Association state |
| `coordinator_host` / `coordinator_port` | NVS target for `ws://host:port/swarm` |
| `ws_linked` | WebSocket session to the Mac |
| `firmware_version` / `provisioned` | Build and identity gate |

Acks/nacks echo `message_id` and carry a `detail` string. Events use generated `message_id` values (e.g. `evt-…`).

## Device registration

There is no separate `hello` / register command on the firmware wire. After connecting as a WebSocket client to `/swarm`, the node periodically sends `type: "status"`. The Mac registers the device from the first valid `status` whose `module_id` / `source` is in `Mau01`–`Mau09`. Duplicate identities are rejected by the coordinator.

## Authentication

Privileged commands (`home`, `move_to_mm`, `set_config`, trajectory / run control, OTA, etc.) require a matching `auth_token`. `stop` does not require auth. Tokens must not be logged.

## Security (local Wi-Fi)

- Privileged commands require `auth_token`.
- No TLS, secure boot, or device attestation in v1.
- Do not log tokens/passwords.

## Clock synchronization (Phase A.3)

Mac is the **monotonic clock authority** (microseconds since Mac process start, not wall calendar time).

### Message flow (four timestamps)

1. **`clock_sync_req`** (Mac → node)  
   `payload`: `{ "t1_us": <coord send>, "sync_seq": <u32> }`
2. **`clock_sync_resp`** (node → Mac)  
   `payload`: `{ "sync_seq", "t1_us", "t2_us": <node recv local>, "t3_us": <node send local>, "ref" }`
3. **`clock_sync_fin`** (Mac → node)  
   `payload`: `{ "sync_seq", "t1_us", "t2_us", "t3_us", "t4_us": <coord recv> }`

Node computes:

```text
RTT       = (t4 - t1) - (t3 - t2)
offset_us = ((t2 - t1) + (t3 - t4)) / 2     // local − coordinator
uncertainty_us ≈ RTT / 2
```

Samples with RTT > 200 ms are rejected. A rolling set of up to 8 samples is kept; offset uses the lowest-RTT samples.

`clock_synced` is true only when estimated `uncertainty_us ≤ clock_uncertainty_max_us` (default **20 000 µs**).  
**This is a software gate, not a claim of measured 20 ms accuracy on hardware.**

Sync is invalidated on reboot, WebSocket session change, disconnect, or staleness (>30 s without a valid sample).

### Telemetry fields

| Field | Unit | Meaning |
|---|---|---|
| `clock_synced` | bool | Uncertainty gate passed and not stale |
| `clock_offset_us` | µs | Estimated `local − coordinator` |
| `clock_rtt_us` | µs | Representative RTT of selected samples |
| `clock_uncertainty_us` | µs | Estimated sync uncertainty (null if unknown) |
| `last_sync_age_ms` | ms | Age of last accepted sample |
| `clock_uncertainty_max_us` | µs | Configurable gate (5–100 ms) |

## Collective choreography (prepare / commit)

Wi-Fi cannot deliver commits atomically. Practical two-phase protocol:

### Stage A — Load

`load_trajectory` / `load_preset` with optional `run_id`:

- Validates track, limits, identity-scoped track data.
- **No motion.**

### Stage B — Prepare

`prepare_run` payload:

```json
{
  "run_id": "...",
  "auth_token": "...",
  "autonomous": false,
  "loop": false,
  "continuous": false,
  "max_loops": 0,
  "max_runtime_ms": 0
}
```

Optional autonomous fields (Phase B.2). Defaults preserve pre-B.2 behaviour.

Node checks: READY + position valid, track loaded, **clock_synced**, no fault/OTA/busy/homing.  
If `autonomous`+`loop`: track first/last `z_mm` must match within **1 mm** (`SWARM_LOOP_CLOSURE_MM`); otherwise nack `track_not_loop_compatible`.  
Looping without `continuous` requires `max_loops ≥ 1` and/or `max_runtime_ms ≥ 1000`.  
Ack detail: `ready_for_commit` or `ready_for_commit_autonomous`. Event: `run_prepared` (echoes accepted policy).

Legacy `prepare_start` remains (unsynchronized; no clock gate; not autonomous).

### Stage C — Commit

`commit_run` `{ "run_id", "start_at_us", "auth_token" }`

- `start_at_us` = **coordinator monotonic microseconds** (absolute shared time).
- Must be 200 ms … 120 s ahead of estimated coordinator now.
- Expired / too-near / too-far / unsynced → **nack**; **never silent late start**.
- On success: ack `run_armed` / `run_armed_autonomous` + event `run_armed`.

### Stage D — Execute

Local motion starts at converted local time via existing non-blocking planner.  
No step catch-up burst. Reports `run_started` with `start_error_us`, then `run_completed` / `run_failed`.

Autonomous looping (if authorized): subsequent passes are scheduled from the **same local epoch** (`pass * duration + keyframe_time`), not by stacking delays. No WebSocket commands between loops.

`cancel_run` / `stop` terminate autonomous playback including future loops.

### Failure / disconnect

| Situation | Behavior |
|---|---|
| Node not ready at prepare | nack; Mac must not commit |
| Commit lost | node never arms; Mac sees missing ack |
| Sync lost before start | arm cancelled / fail; no start |
| Disconnect before start | cancel armed/prepared/loaded run; invalidate clock |
| Disconnect during **non-autonomous** run | finish-segment-then-stop or controlled stop (config) |
| Disconnect during **autonomous** run (already started) | **continue** full track / authorized loops; clock invalidated |
| Operator stop (while linked) | cancel run + stop motors |
| FAULT during run | `run_failed`; stop; clear autonomous auth |
| Reconnect during autonomous run | report status; **no** auto-restart / no duplicate arm |
| Reboot | no motion; position invalid; autonomous auth cleared |

### Status telemetry (additive)

| Field | Meaning |
|---|---|
| `autonomous` | Policy flag for current run |
| `autonomous_loop` / `autonomous_continuous` | Policy |
| `max_loops` / `max_runtime_ms` | Policy bounds |
| `loop_index` | 0-based current pass |
| `completed_passes` | Finished passes |
| `track_loop_compatible` | First/last z within 1 mm |
| `loop_boundary` | Optional last diagnostic object (bounded; seq bumps on boundary CORRECT/FAULT and incomplete-segment resume/fault only): `seq`, `loop_index`, `run_id`, `expected_steps`, `actual_steps`, `delta_steps`, `delta_mm`, `tol_steps`, `action` (`CONTINUE`/`CORRECT`/`FAULT`), `segment_result` (`reached`/`incomplete_resumed`/`incomplete_fault`) |

### Clock drift (autonomous)

After disconnect there is **no time master**. Nodes free-run on local monotonic clocks. Relative phase will drift over long installations. Firmware does not claim multi-hour nine-node sync without the Mac.

### Legacy relative start (not collective)

`start_at` + `delay_ms` remains for bench use only. Ack: `armed_start_unsynchronized`.  
**Phase B collective starts must use `commit_run` + `start_at_us`.**

## Idempotency

Side-effecting commands require unique `message_id`. Retransmits within a WS session replay the same ack without re-executing. Cache clears on new WS session.

## Example nine-node sequence

```text
Mac:  repeated clock_sync_req/fin until all clock_synced
Mac:  load_trajectory target=MauNN run_id=wave-42 track=[...]
Mac:  prepare_run broadcast run_id=wave-42
Nodes: ack ready_for_commit (×9)
Mac:  commit_run broadcast run_id=wave-42 start_at_us=<now+1s>
Nodes: ack run_armed + event run_armed
… local start …
Nodes: event run_started { start_error_us }
Nodes: event run_completed
```

## Phase B coordinator checklist

Software in `SWARM/coordinator` is expected to:

- [x] Maintain coordinator monotonic µs clock
- [x] Drive sync until nodes report `clock_synced` (gate before prepare)
- [x] Detect duplicate `module_id`
- [x] Wait for prepare acks before commit
- [x] Choose `start_at_us` with adequate lead
- [x] Wait for arm acks or cancel
- [x] Unique `message_id` / `run_id`
- [x] Never use `delay_ms` for collective starts
- [x] Pass autonomous policy on prepare when authorized (B.2)

Physical nine-node confirmation of the same checklist remains pending.
