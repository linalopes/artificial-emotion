# Discrepancy analysis — FinishSegment vs ControlledStop vs physical test

**Date:** 2026-11-18  
**Mode:** evidence only — no OTA, home, move, restart, or config change.

## 1. Exact 0.3.8 motor action: FinishSegment + autonomous Wave already running

Fleet NVS: `disconnect_policy=0` → `FinishSegmentThenStop`.

**0.3.8 `handleDisconnectPolicy()` sequence:**

| Step | Action when autonomy already running (`shouldSurviveDisconnect()`) |
|------|---------------------------------------------------------------------|
| Clock | `invalidate()` (sync lost; does **not** stop planner) |
| RunController | Log “autonomous run survives”; **no** `onDisconnectBeforeStart` |
| TrackPlayer | `policy_.autonomous && started_ && (Playing\|SegmentActive)` → **return**; does **not** set `disconnectPendingStop_` |
| Homing | Skipped if not active |
| Planner busy + FinishSegment | Log “finishing current bounded motion, then hold” → **`return`** |
| ControlledStop branch | **Not entered** (`finish == true`) |

**Net motor effect under FinishSegment + autonomous + busy planner:**  
**No** `requestControlledStop()`, **no** `setStopping()`, **no** coil release from this handler. Trajectory / planner / local scheduling are left alone. Subsequent segments are **not** blocked by `disconnectPendingStop_`.

(The ControlledStop hole is real only when `disconnect_policy=1`.)

## 2. Can FinishSegment still stop / release coils / block later segments?

| Path | Autonomous + started | Non-autonomous SegmentActive |
|------|----------------------|------------------------------|
| TrackPlayer `disconnectPendingStop_` | **Not set** (early continue) | **Set** → after current segment reaches target, track **Stops**, policy cleared, **no next segment** |
| ProtocolClient FinishSegment | Early return; planner keeps current move | Same; relies on TrackPlayer for “then hold” |
| Coil release | Not requested by disconnect handler | After stop + idle: `applyRestPolicy()` with `coil_hold=0` → **release** (LEDs dark) |

So FinishSegment **can** stop motion and release coils for **non-autonomous** playback after the current segment. It **must not** do that for an already-started autonomous run — and 0.3.8 TrackPlayer already skips that for autonomy.

## 3. Telemetry from today’s Wave — actual stop mechanism?

Only autonomous Wave in durable log after fleet OTA:

| Field | Value |
|-------|--------|
| `runId` | `f91b4f4072954428a9fbabb417ff95f` |
| Start | `2026-11-18T10:37:08Z` armed → `10:37:11Z` running |
| Config | `autonomous=true`, `maxLoops=3`, `continuous=false`, `durationMs=240000` |
| Expected | ~12 min (3 × 240 s) |
| Pass markers | ~10:41 pass1, ~10:45 pass2, ~10:49 complete — **all nine** |
| Completion | All nine `run_completed` / `reason=max_loops`; `anyFault=false` |
| Disconnects during run | **None** |

Coordinator kept receiving live `pass` events on schedule for ~12 minutes → **Mac remained reachable** for this logged run. There is **no durable evidence** of a coordinator-link drop or ControlledStop/FinishSegment disconnect stop during the test.

**Additional anomaly (not disconnect):** every recorded pass event for this run has `segmentResult: "incomplete_resumed"` (IncompleteStop then resume at loop boundaries). That can briefly idle the planner and, with `coil_hold=0`, **release coils** (LEDs dark) before resuming — without Mac disconnect.

**Conclusion on “what stopped the motors”:** logs **do not identify** a disconnect-policy stop for this run. They show a **successful 3-loop completion**. The physical “stopped when Mac Wi-Fi died” report is **not corroborated** by `coordinator-events.jsonl` for this Wave.

## 4. Does 0.3.9 cover the real failure under BOTH policies?

| Policy | 0.3.8 autonomous+busy | 0.3.9 autonomous+busy |
|--------|----------------------|------------------------|
| FinishSegment (fleet today) | Continue (no ControlledStop call) | Continue (explicit `ContinueAutonomous`) — **behaviourally same** |
| ControlledStop | **BUG:** still `requestControlledStop` + `setStopping` | **Fixed:** `ContinueAutonomous` |

**0.3.9 is necessary hardening for ControlledStop**, but under the fleet’s **FinishSegment** NVS it does **not** change the disconnect motor path that already continued. It therefore **cannot alone explain or prove** a fix for a FinishSegment-linked physical stop that logs never recorded as a disconnect.

## 5. Do regression tests cover the full production disconnect path?

**Covered (host):**

- `decideDisconnectMotorAction` (incl. busy + autonomy + both NVS policies)
- `decideDisconnectAction` (TrackPlayer-level)
- WS deferral / no `ws_.loop` while autonomous + unlinked

**Not covered:**

- `ProtocolClient::handleDisconnectPolicy` itself (Arduino/WebSockets dependencies)
- Real `TrackPlayer` + `MotionPlanner` + coil `applyRestPolicy` integration
- End-to-end “Mac Wi-Fi off” on hardware

So tests validate the **decision helpers** wired into 0.3.9, not a full device disconnect integration test.

## Other defect (proposed, not implemented)

**IncompleteStop at every loop boundary** during the successful Wave (`incomplete_resumed` on all pass events). Likely separate from disconnect policy; can produce fleet-wide pauses and dark ULN LEDs without Mac disconnect.

**Smallest next correction (proposal only):** investigate why Wave segment completion reports IncompleteStop at loop boundaries (planner target-reached vs early idle); fix only after a focused repro with one-module serial. Do **not** treat 0.3.9 disconnect hardening as that fix.

## Before repeating the physical Mac Wi-Fi test

1. Confirm with the artist the wall-clock of the Wi-Fi toggle vs run `f91b4f40…` (10:37–10:49Z).  
2. On one module, capture Serial during disconnect (`Disconnect: …` lines).  
3. Optionally bench **ControlledStop** NVS on a single module to prove 0.3.9 vs 0.3.8 for that policy.  
4. Film LEDs + note whether motion later resumed or completed — logs say this Wave **did** complete three passes.
