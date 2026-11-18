# SWARM 0.3.11 — Restore communication during autonomous playback

**Date:** 2026-11-18  
**Status:** Built + host-tested. **Not OTAd. No physical motion.**  
**Baseline preserved:** Fleet remains on **0.3.10** (known working autonomy). Source/tree advanced to 0.3.11; 0.3.10 binary hash retained under `diagnostics/2026-11-18-fleet-ota-0.3.10/`.

## Goal

Keep autonomous motor execution independent of Mac Wi-Fi while allowing disconnect → reconnect → telemetry + STOP during an active run.

## Implementation

### Architecture

Smallest robust split for ESP32-S3 Arduino:

| Path | Core / task | Responsibility |
|------|-------------|----------------|
| Arduino `loop()` | Core 1 (default) | Endstop, home, planner steps, track, Wi-Fi manager, `ProtocolClient::serviceLocal()` |
| `swarm_net` FreeRTOS task | Core 0 | `ensureSocket`, `ws_.loop()`, outbound `sendTXT` |

Inbound WS frames are copied into a bounded FreeRTOS queue (plus a priority stop slot). The motor loop parses JSON and mutates planner/track/run state — network never calls `MotionPlanner` directly.

Outbound status/events/acks are serialized on the motor path and queued; only the net task performs blocking `WiFiClient::write`.

### Policy (`ws_reconnect_policy.h`)

- `networkIsolated=true` (0.3.11 device build): **never** defer WS I/O during autonomy.
- `networkIsolated=false` (0.3.10 cooperative baseline): defer `ws_.loop` / `sendTXT` while autonomy is active — preserved via `shouldDeferWsIoV0310` / host sims.

Build flag: `-D SWARM_NET_ISOLATED=1`, version `0.3.11`.

### Key files

- `firmware/src/net/net_isolation.h`, `ws_queues.h`, `net_task.{h,cpp}`
- `firmware/src/net/protocol.{h,cpp}` — `serviceLocal` / `serviceNetwork`
- `firmware/src/main.cpp` — `startNetworkTask`
- `firmware/src/net/ws_reconnect_policy.h` — isolation-aware gating + sims
- Coordinator status→finished reconcile (already in tree from stale-RUNNING fix) — no motor cmds on unlock

### Status telemetry additions

- `ws_net_isolated`
- `ws_io_deferred` / `ws_reconnect_deferred` now reflect isolation (false under 0.3.11 while linked)

## Test results

| Suite | Result |
|-------|--------|
| `pio test -e native_host` | **63/63 PASS** (incl. 7 new 0.3.11 scenarios + 0.3.10 baseline) |
| `pio run -e swarm_s3_4mb_ota` | **SUCCESS** — RAM 15.9%, Flash 50.9% |
| `npm test` (SWARM) | **65/65 PASS** (7 files) — includes status-reconcile unlock without motor cmds |

**0.3.11 image sha256:** `39a3bd6238b86a2a136d7aa54cab66c90ff1819e65721d958e2da0305612a936` (`firmware-0.3.11.sha256`)  
**0.3.10 baseline sha256:** `8513d57105bee65f927c7fc3b8358802db9bfe9494ef608e0b79e0a6d3d5d379` (fleet-ota-0.3.10)

Host scenarios covered:

1. Autonomy + telemetry allowed when isolated  
2. Abrupt Mac loss — motors keep stepping  
3. Autonomy continues while disconnected  
4. Reconnect during playback (paced WS allowed)  
5. STOP allowed after reconnect when linked  
6. Completion telemetry without `run_completed` event path  
7. Network block does not starve steps when isolated  
8. **0.3.10 baseline** still defers WS when not isolated  

## Remaining risks

1. **Cross-core races** on `linked_` / connect session fields — mitigated with volatile flags + queue handoff; not formally proven under stress.
2. **Outbound queue drop** under flood (depth 8) — status may skip a beat; next interval retries.
3. **Inbound queue full** — rare command drop; STOP uses a dedicated priority slot.
4. **Wi-Fi stack vs net task** — `ws_.loop` can still block the net task ~10 s; motors should continue, but reconnect latency after half-open TCP depends on TCP timeout / disconnect detection.
5. **Double-stop** if stop frame + later duplicate — idempotency cache should absorb.
6. **Physical unproven** — host sims do not exercise FreeRTOS + WiFiClient on hardware.

## Proposed physical acceptance (artist-authorized; not run here)

Do **not** start the 12 h endurance until this short gate passes on one module, then fleet.

1. **Flash one module** (USB or OTA) to 0.3.11; confirm status `firmware_version=0.3.11`, `ws_net_isolated=true`.
2. **HOME** → short autonomous Wave (`max_loops=2` or `max_runtime_ms` small).
3. **Telemetry live** during motion (`ws_io_deferred=false`, fresh `timestamp_ms` / `uptime_ms`).
4. **Abrupt Mac Wi-Fi off** mid-segment: motor continues; UI may show disconnect; no IncompleteStop storm on Serial.
5. **Mac Wi-Fi on**: module reconnects without interrupting motion; status resumes with actual `run_phase` / loop counters.
6. **STOP** from UI after reconnect → controlled stop promptly.
7. **Completion without event** (optional): mute/kill Mac until local `max_loops` done; restore link; coordinator unlocks via status reconcile **without** issuing moves; Perform unlocks only after confirmed completion.
8. If 1–7 pass on one, **fleet OTA 0.3.11**, repeat 3–6 once fleet-wide, then consider 12 h GO.

## Rollback

Keep OTAd **0.3.10** as autonomy baseline until 0.3.11 physical gate passes. Hash: `diagnostics/2026-11-18-fleet-ota-0.3.10/firmware-0.3.10.sha256`.
