# SWARM 0.3.9 — Autonomous disconnect motor-stop regression

**Date:** 2026-11-18  
**Trigger:** Nine-module autonomous Wave; Mac Wi-Fi disconnected after ~1 min → all spheres stopped, ULN driver LEDs dark, boards still powered.  
**Scope:** Firmware fix only. No OTA / home / move / execute. No commit / push.

## Confirmed cause

In firmware **0.3.8** `ProtocolClient::handleDisconnectPolicy()`:

1. Autonomous survival was recognized (`shouldSurviveDisconnect` / log).
2. `TrackPlayer::onCoordinatorDisconnected()` correctly **returned without stopping** when autonomous + started.
3. The same function then decided motor behaviour from **NVS disconnect policy + planner busy alone**, without re-checking autonomy:

```text
if planner busy && disconnect_policy == ControlledStop:
    requestControlledStop()
    setStopping()   → decel → applyRestPolicy → coil release (LEDs dark)
```

So TrackPlayer could preserve the run while the protocol layer still stopped the planner.

Fleet NVS currently reports `disconnect_policy=0` (FinishSegmentThenStop), which skips that ControlledStop branch; the fix still closes the hole for ControlledStop and makes motor action **explicitly** ContinueAutonomous whenever autonomy survives (both NVS policies).

## Exact fix (0.3.9)

| File | Change |
|------|--------|
| `autonomous_policy.h` | Add `decideDisconnectMotorAction()` — autonomy survives ⇒ `ContinueAutonomous` before any stop/home action |
| `protocol.cpp` | `handleDisconnectPolicy` uses that decision; no `requestControlledStop` / `setStopping` when autonomy survives |
| `platformio.ini` | `SWARM_FW_VERSION=0.3.9` |
| `test_autonomous.cpp` | Regression: busy+autonomy never ControlledStop; WS deferral paired with motor Continue |

Preserved: non-autonomous ControlledStop / FinishSegment, homing abort, FAULT/stall/STOP, WS reconnect deferral while autonomous + unlinked.

## Tests / build

| Check | Result |
|-------|--------|
| `pio test -e native_host -f test_autonomous` | **22/22 passed** (incl. new disconnect motor + WS path tests) |
| `pio run -e swarm_s3_4mb_ota` | **SUCCESS** — binary strings contain `0.3.9` |

## Rollout (not performed)

1. Artist authorizes OTA of **0.3.9** (sequential Mau01–Mau09 or single-module first).  
2. HOME → GO TO START → EXECUTE autonomous Wave (finite loops).  
3. After motion is clearly running, disconnect **only Mac Wi-Fi** for several minutes.  
4. Expect: spheres keep moving; ULN LEDs stay active while stepping; no fleet-wide stop.  
5. Restore Mac Wi-Fi after a pass boundary or after run completes; confirm reconcile without cancel of healthy modules.

**Do not** treat remote software STOP as available while autonomy + unlinked (by design).
