# Swarm v1 — Node Protocol Contract

**Firmware:** 0.2.0  
**Transport:** WebSocket client (ESP32) → Mac coordinator  
**Path:** `/swarm`  
**Encoding:** UTF-8 JSON  
**Protocol version:** `1`  
**Max inbound message:** 2048 bytes  

Phase B must implement this contract. This is not the web UI.

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

`prepare_run` `{ "run_id", "auth_token" }`

Node checks: READY + position valid, track loaded, **clock_synced**, no fault/OTA/busy/homing.  
Ack detail: `ready_for_commit` or specific nack.

Legacy `prepare_start` remains (unsynchronized; no clock gate).

### Stage C — Commit

`commit_run` `{ "run_id", "start_at_us", "auth_token" }`

- `start_at_us` = **coordinator monotonic microseconds** (absolute shared time).
- Must be 200 ms … 120 s ahead of estimated coordinator now.
- Expired / too-near / too-far / unsynced → **nack**; **never silent late start**.
- On success: ack `run_armed` + event `run_armed`.

### Stage D — Execute

Local motion starts at converted local time via existing non-blocking planner.  
No step catch-up burst. Reports `run_started` with `start_error_us`, then `run_completed` / `run_failed`.

`cancel_run` cancels prepare/arm or stops a run.

### Failure / disconnect

| Situation | Behavior |
|---|---|
| Node not ready at prepare | nack; Mac must not commit |
| Commit lost | node never arms; Mac sees missing ack |
| Sync lost before start | arm cancelled / fail; no start |
| Disconnect before start | cancel armed/prepared run; invalidate clock |
| Disconnect during run | existing segment disconnect policy |
| Operator stop | cancel run + stop motors; home → UNHOMED |
| FAULT during run | `run_failed`; stop |
| Reconnect | **no auto-resume** |

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

## Phase B requirements checklist

- [ ] Maintain coordinator monotonic µs clock
- [ ] Drive sync until all nine report `clock_synced`
- [ ] Detect duplicate `module_id`
- [ ] Wait for nine prepare acks before commit
- [ ] Choose `start_at_us` with adequate lead
- [ ] Wait for nine arm acks or cancel
- [ ] Unique `message_id` / `run_id`
- [ ] Never use `delay_ms` for collective starts
