# Still-linked WebSocket block — confirmed mechanism (0.3.10)

**Date:** 2026-11-18  
**Scope:** Evidence + host regression + smallest source fix. No OTA / motion / commit / push.

## Physical observation (accepted as evidence)

Nine MauMau modules on FW **0.3.8**, autonomous 3-loop Wave. After ~1 min of motion, Mac Wi-Fi off → **all nine motors stopped immediately**, ULN2003 activity LEDs dark, ESP32 boards still powered. Watched **≥40 s**: no resume, no driver activity. No prior comparable sustained pause.

## Confirmed mechanism

Not FinishSegment / ControlledStop disconnect policy (fleet NVS `disconnect_policy=0`; autonomy already continues on clean `WStype_DISCONNECTED`).

**Path while `linked_` is still true:**

1. Mac Wi-Fi drops → TCP to `192.168.68.73:8787` becomes **half-open**.
2. `tcp->connected()` often stays true for a long time → `linked_` stays true → **0.3.8 reconnect deferral never engages** (`shouldDeferWsReconnect` requires `!linked`).
3. `shouldServiceWsClient(…, linked=true, autonomy=true)` returns **true** on 0.3.8/0.3.9 → `ws_.loop()` still runs.
4. Periodic `sendStatus` (1 s) and IncompleteStop-forced `sendStatus(true)` call `ws_.sendTXT` → `WebSockets::write` → **`WiFiClient::write`**.
5. Arduino-ESP32 `WiFiClient::write` (framework):
   - `WIFI_CLIENT_MAX_WRITE_RETRY = 10`
   - `WIFI_CLIENT_SELECT_TIMEOUT_US = 1_000_000` (1 s)
   - Worst case **≈ 10 seconds** blocked inside a single `write()` when the send buffer cannot drain.
6. `WEBSOCKETS_TCP_TIMEOUT=50` only fences the outer WebSockets loop **between** `tcp->write` calls; it does **not** bound one nested `WiFiClient::write`.
7. Cooperative loop order (`planner×2 → track → protocol → planner×1`): a multi-second block in protocol starves stepping.
8. `MotionPlanner` stall abort **100 ms** → `IncompleteStop` → `finishIdle` → `applyRestPolicy` with `coil_hold=0` → **`MotorDriver::release()`** (ULN LEDs dark).
9. IncompleteStop is **not** a FAULT; TrackPlayer resumes; run stays **RUNNING**. Next status write blocks again → **coil-dark thrash for the entire half-open interval** (matches ≥40 s with no sustained motion).

### Why all nine stop together

Common-cause: every module’s outbound TCP to the Mac dies at the same wall-clock. Disconnect-policy ControlledStop is per-callback and was already wrong for FinishSegment fleet NVS; simultaneous LED-dark fits **shared write starvation**, not NVS policy divergence.

## Telemetry contradiction (resolved)

Logged Wave `f91b4f4072954428a9fbabb417ff95f` (coordinator `data/coordinator-events.jsonl`):

| Fact | Value |
|------|--------|
| Arm / run | 10:37:08Z / 10:37:11Z |
| Pass 1 / 2 | ~10:41 / ~10:45 (all `incomplete_resumed`) |
| Completions | ~10:49 `max_loops`, all nine |
| Disconnects during run | **None** (only pre-run OTA reconnects 10:31–10:33) |

Pass/completion events require the Mac to **receive** module WS frames. A Mac Wi-Fi-off window of ≥40 s during this run would have produced reconnect noise and broken the 4/8/12 min cadence. **This durable log is a clean Wave with Mac reachable; it does not record the artist’s Wi-Fi-off observation.** Pass events are not proof of continuous physical motion (`incomplete_resumed` already marks stall/resume at loop boundaries even with Mac up).

**Do not use coordinator pass events alone as proof of physical movement.**

## Regression (host)

`pio test -e native_host -f test_autonomous` — **24/24**:

- `test_esp32_wificlient_write_exceeds_stall_abort` — framework write worst-case 10 s ≫ 100 ms stall.
- `test_abrupt_unreachable_coordinator_keeps_stepping` — cooperative-loop sim with **abrupt unreachable** (still-linked blocking write, not clean disconnect callback):
  - **0.3.8 gating:** IncompleteStop + coil-dark storm, run still active, no FAULT.
  - **0.3.10 gating:** sustained steps, zero IncompleteStops, coils stay driven.

## Smallest justified correction (0.3.10 source — not OTAd)

While `autonomyActive()` (`RunPhase::Running` + autonomous policy):

- **Do not** call `ws_.loop()`.
- **Do not** emit `sendTXT` (`shouldEmitWsTraffic`).

Same emergency model as unlinked autonomy: remote STOP unavailable; physical cutoff remains. `run_completed` still emits after phase leaves Running. Status/pass telemetry pauses for the autonomous interval (acceptable vs physical stop).

Files: `ws_reconnect_policy.h`, `protocol.cpp` (`sendJson` + `service`), `swarm_limits.h` (WiFiClient constants), `platformio.ini` → `0.3.10`, tests above.

### If a larger architecture is needed later

WebSocketsClient cannot guarantee bounded execution while linked. Prefer **isolating networking off the stepper cooperative loop** (FreeRTOS task / other core + non-blocking queue) rather than raising stall thresholds. 0.3.10 avoids that by simply not touching the socket during autonomy.

## Before next physical Mac Wi-Fi test

1. Artist-authorized OTA of **0.3.10** (not done here).
2. Film LEDs during Wi-Fi-off; acceptance = **physical motion continues**, not merely status `RUNNING`.
3. Optional one-module Serial: expect no `Planner IncompleteStop` storm while autonomy holds after Wi-Fi-off.
