# SWARM 0.3.10 — 12-hour continuous Wave preflight

**Date:** 2026-11-18  
**Mode:** Audit / preparation only. No OTA, home, move, STOP, start, cancel, commit, or push.

## Verdict: **GO** (with operational caveats)

No critical firmware/UI blocker requiring a code change before start. Proceed only if physical motor-power cutoff is reachable for all nine modules for the full 12 hours.

---

### Preflight checklist

| # | Item | Result |
|---|------|--------|
| 1 | Local 12 h runtime in FW 0.3.10 | **PASS** — `normalizeAutonomousPolicy` sets `maxRuntimeMs = 12h` when `continuous && maxRuntimeMs==0`; `RunController::prepare` always normalizes; `TrackPlayer::runtimeExpired` / `mayStartNextLoop` enforce it on-module |
| 2 | Safe end, no auto-restart | **PASS** — expires → `Completed` + `completion_reason=max_runtime`; policy cleared; no reboot loop / no auto re-arm |
| 3 | Coordinator auto STOP/cancel/timeout | **PASS** — autonomous Mac watch expiry logs `run_watch_expired` and **does not** cancel/stop; disconnect/fault of one module does not fleet-cancel after start |
| 4 | Perform Continuous → policy | **PASS** — UI sends `autonomous`, `autonomousLoop`, `continuous` (no `maxRuntimeMs`); coordinator `resolveAutonomousMaxRuntimeMs` injects **12 h** on `prepare_run` |
| 5 | WS cannot block planner during autonomy | **PASS** — 0.3.10 `shouldDeferWsIo` / `shouldEmitWsTraffic`: no `ws_.loop()` / no `sendTXT` while Running+autonomous (artist Wi-Fi interrupt already validated) |
| 6 | Reboot / outage / stall / coord restart | **PASS** — boot: coils released, no auto motion; Wi-Fi outage: continue; IncompleteStop resumes target (not FAULT); coord restart does not replay trajectory |
| 7 | Telemetry after / during run | **SEE BELOW** — mid-run WS mute by design; completion events resume when autonomy ends **if** Mac reachable |
| 8 | Wave period 120 s, loop + limits | **PASS** — loop-compatible; travel ~130–370 mm within 0–500; peak ~6.3 mm/s ≪ 15 RPM capability (cycles 1 → 120 s score, cycles 2 → 240 s score; both OK) |

### Caveats (not NO-GO)

1. **Software Stop is unavailable during autonomy on 0.3.10**  
   Modules do not service the WebSocket while the autonomous run is active, even if the Mac stays linked. Perform’s “Stop while connected” wording is misleading. **Emergency path = physical power cutoff only.**

2. **Live Stage positions go stale** during the run (last known while often still “connected”). Trust physical motion / LEDs, not the Stage.

3. **Mid-run pass telemetry** will largely be absent while WS I/O is deferred. Expect durable `run_start` / `run_expected_end` at arm; sparse or no `pass` events until after local completion + reconnect/status if the Mac was away.

4. **After 12 h**, modules emit `run_completed` (`max_runtime`) once WS I/O resumes. If the Mac/coordinator is down at that moment, confirm later via reconnect + Serial / status (`completion_reason`, `completed_passes`). Mac watch may already show finished/expired without having cancelled the fleet.

5. **Known residual:** loop-boundary `incomplete_resumed` was seen on the earlier 3-loop Wave (brief coil release). Wi-Fi interrupt test still passed. Watch for brief LED dark flickers at loop seams; not treated as a start blocker.

6. **At audit time** several modules showed `connected=false` in the coordinator snapshot (homed, fw 0.3.10). **Do not arm until all nine are connected** and clocks sync for go-to-start / execute.

---

## Artist procedure — 12-hour continuous Wave

**Before start**

1. Confirm physical **motor-power cutoff** accessible for the whole night/day.  
2. Perform UI · Take control · **Live**.  
3. All Mau01–Mau09: firmware **0.3.10**, connected, **HOME**ed, no faults.  
4. Score: **Wave** · Period **120 s** (default amplitude/center/phase OK; cycles 1 or 2 both valid — leave default **2** unless you want a 120 s score length).  
5. Preview: Valid / feasible (green).  
6. **Autonomous ON** · **Loop ON** (preview loop button) · **Continuous local loop ON**.  
7. Confirm UI copy mentions up to **12 hours**.

**Arm**

8. **1. Go to start** — wait until all nine at start.  
9. **2. Execute live…** → confirm → **Start autonomous run**.  
10. Wait until motion is clearly running on all nine.  
11. Optional: brief Mac Wi-Fi off (~20–30 s) as a sanity check; motors must keep moving.  
12. Mac may sleep / leave Wi-Fi; modules continue locally until **12 h** from their start epoch.

**During**

- Do **not** rely on software Stop.  
- Do not OTA, home, or re-execute over the live run.  
- Coordinator restart is OK for observation; it must not be used as a stop mechanism.

**End / recovery**

- At ~12 h modules should stop locally (`max_runtime`), coils follow rest policy (`coil_hold=0` → release).  
- Restore Mac Wi-Fi / wake coordinator; wait for reconnect.  
- Check durable log / UI for `run_completed` / `max_runtime` when status returns.  
- Re-home before the next live score if positions show UNHOMED/invalid.

**Do not** change Continuous off mid-prep; do not set unbounded runtime by hand.
