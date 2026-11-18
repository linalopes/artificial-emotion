# SWARM — Firmware 0.3.8: True Autonomous Playback

**Date:** 2026-11-18  
**Evidence:** `SLEEP-AUTONOMY-INVESTIGATION.md`, `REPORT.md`  
**Scope:** firmware 0.3.8 + coordinator/UI corrections  
**Not done in this pass:** OTA, physical motor/homing/choreography, commit, push  

---

## Exact changes

### Firmware 0.3.8

| Area | Change |
|---|---|
| Version | `SWARM_FW_VERSION=0.3.8`; `WEBSOCKETS_TCP_TIMEOUT=50` (was library default 5000 ms) |
| Limits | `SWARM_WS_RECONNECT_MIN_MS=5000`, `SWARM_WS_TCP_TIMEOUT_MS=50` in `swarm_limits.h` |
| Policy | `ws_reconnect_policy.h` — defer reconnect while autonomous + unlinked; paced attempts after |
| Protocol | `ensureSocket` / `service`: no `ws_.loop()` while deferred; backoff even after disconnect clears `socketStarted_` |
| Continuous runtime | `normalizeAutonomousPolicy`: `continuous && maxRuntimeMs==0` → `SWARM_AUTONOMOUS_MAX_RUNTIME_MS` (12 h) |
| Completion | `TrackPlayer` `completion_reason`; echoed on `run_completed` + status |
| Diagnostics | Bounded: `ws_*` counters, `ws_reconnect_deferred`, `incomplete_stop_count`, paced IncompleteStop logs |

**Tradeoff (explicit):** while an autonomous run is active and the link is down, the module **does not** attempt WebSocket reconnection. Remote software STOP cannot be delivered until the run ends (or power/endstop/FAULT). Physical cut-off remains the emergency path.

### Coordinator / UI

| Area | Change |
|---|---|
| Prepare | `resolveAutonomousMaxRuntimeMs` injects 12 h for continuous when unset; durable `run_start` records the accepted value |
| Watch | Autonomous Mac completion watch **no longer** `failRun` → cancel+stop when modules are still healthy; emits `run_watch_expired` and waits for local `run_completed` or operator Stop |
| Reconcile | One `reconnect_reconcile` per reconnect (status advances out of `disconnected`/`reconnected`) |
| UI | Continuous confirm copy: “up to 12 hours (or until Stop / fault)” |
| Docs | `AUTONOMOUS-OPERATION.md`, `PROTOCOL.md` aligned |

---

## Remaining limitations

1. **Remote STOP while deferred reconnect** — unavailable by design until autonomy ends.  
2. **Nine-node phase sync without Mac** — still free-run clocks; long-run relative drift unchanged.  
3. **Watch expiry with held modules** — Mac stays `running` until local completion or operator Stop (intentional).  
4. **Physical proof** — host/unit tests do not prove stepper timing on hardware through Mac sleep.  
5. **OTA not performed** — fleet remains on prior flashed version until supervised deploy.

---

## Tests run (this pass)

| Suite | Result |
|---|---|
| `pio test -e native_host` | **52/52 passed** (incl. WS defer/pace + continuous 12 h normalize) |
| `pio run -e swarm_s3_4mb_ota` | **SUCCESS** (firmware 0.3.8 binary built; not flashed) |
| `npm test` (vitest) | **72/72 passed** (incl. continuous 12 h inject, watch expiry without cancel/stop, STOP after expiry) |

---

## Supervised physical validation (before OTA / live deploy)

Do **not** start motors until the operator explicitly authorizes each step.

1. **Flash 0.3.8** to one module first (USB), confirm `firmware_version` / status fields (`ws_reconnect_deferred`, `max_runtime_ms` after continuous prepare).  
2. **Bench autonomy (short):** HOME → GO TO START → EXECUTE continuous with `maxRuntimeMs` ≈ 10–15 min. Confirm prepare echo shows that runtime.  
3. **Coordinator loss during run:** after `run_started`, sleep Mac / disable Wi‑Fi / stop coordinator for ≥15 min.  
   - Expect: motion continues at score pace; **no** multi-second stalls; pass counters advance while offline.  
   - Expect: `ws_reconnect_deferred` true while autonomous + unlinked (when status can be read via serial).  
4. **Reconnect after completion:** let runtime expire → `run_completed` / `completion_reason=max_runtime` → then restore Mac link; confirm reconcile without cancel/stop.  
5. **STOP after reconnect:** start another short autonomous run, disconnect, reconnect while still running (or after deferral ends), engage software STOP — all linked modules must ACK and stop.  
6. **Fleet roll-out:** OTA remaining eight only after single-module pass.  
7. **Long pilot:** optional finite continuous ≤1 h with phone video + wall clock before any overnight 12 h attempt.

**Pass criteria:** losing the Mac must not slow, pause, or interrupt choreography; IncompleteStop must not cluster during offline windows; continuous runs self-complete at the agreed runtime without Mac `cancel_stop` of healthy modules.
