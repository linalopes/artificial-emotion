# SWARM — Autonomous playback during Mac sleep + 12 h completion mismatch

**Date:** 2026-11-18  
**Firmware under review:** 0.3.7 (source)  
**Related:** `REPORT.md` (12 h run `6de33fc3…`)  
**Mode:** investigation only — no OTA, motor commands, coordinator restart, commit, or push  

Architectural requirement: after autonomous start, all nine ESP32s must continue independently of Mac sleep, Wi‑Fi loss to the Mac, and coordinator shutdown.

---

## 1. Confirmed causes vs hypotheses

### Issue A — Suspected stall / slowdown while Mac sleeps

| Claim | Status |
|---|---|
| TrackPlayer / RunController **intentionally pause** when clock_sync is lost | **Not supported** — disconnect invalidates clock; Case C continues on local `millis()` epoch |
| Autonomous policy cleared on WS disconnect | **Not supported** — `shouldSurviveDisconnect` + Case C; unit test `test_wifi_disconnect_keeps_autonomous_policy` |
| Missing durable pass telemetry ⇒ motors stopped | **Not valid alone** — Mac sleep freezes logging; must not equate log gaps with motion |
| Pass Δ≈1 over 30–50 min Deep Idle windows | **Supported (indirect)** — consistent with severe under-progress vs 4 min/pass |
| ~90 s pass clusters after DarkWake | **Supported (indirect)** — consistent with epoch catch-up after motors lagged `millis()` |
| Artist “stationary while asleep” | **Independent observation** — aligns with stall hypothesis; not video-proof |
| **WS reconnect can starve the motion loop** | **Confirmed code defect** (see §3) — highest-priority cause |

### Issue B — 12 h completion mismatch

| Claim | Status |
|---|---|
| Mac `completion_watch` called `failRun` → cancel+stop at ~12 h | **Confirmed** (durable log) |
| Firmware had already self-completed at 12 h | **False** — still `moving` / `autonomous`, no `run_completed` |
| `continuous` + `maxRuntimeMs` null/0 applies firmware 12 h stop | **False in code** — `runtimeExpired()` false when `maxRuntimeMs==0`; continuous `mayStartNextLoop` always true |
| Docs claim continuous is subject to runtime ceiling | **Doc/code mismatch** (`docs/AUTONOMOUS-OPERATION.md` vs `autonomous_policy.h` / `track_player.cpp`) |
| UI copy “until stopped or faulted” vs Mac hard stop at 12 h | **Product mismatch** |

---

## 2. Does firmware playback depend on coordinator availability?

**By design: no** (after autonomous start).

Evidence in 0.3.7:

- `TrackPlayer::onCoordinatorDisconnected` Case C: autonomous + started + Playing/SegmentActive → **continue**.
- `RunController::shouldSurviveDisconnect`: Running + autonomous.
- Epoch scheduling uses `millis()` / `epochStartMs_`, not Mac clock after start.
- `PROTOCOL.md`: disconnect after autonomous start → continue; clock invalidated.

**In practice on this codebase: yes, indirectly** — not because TrackPlayer waits for messages, but because **failed coordinator reconnect attempts run on the same cooperative `loop()` as the stepper**, and can block long enough to trigger planner stall aborts.

So: **logical dependency = none; scheduling/I/O dependency = yes (bug).**

---

## 3. Blocking operations that can prevent motion progress

### Main loop (cooperative, single-threaded)

```text
loop():
  endstop → home → planner ×2 → wifi → track → ota → protocol (ensureSocket + ws.loop + run) → planner
```

`MotionPlanner`: **at most one step per `service()`**. Stall abort if no service for **`SWARM_STALL_ABORT_US` = 100 ms** while Moving/Stopping → `IncompleteStop` (position kept; target not reached). TrackPlayer 0.3.7 then **resumes** the absolute target — motion does not FAULT, but progress becomes stop/resume choppy.

### Confirmed defect: WebSocket reconnect vs motor loop

`ProtocolClient::ensureSocket()` / `service()`:

1. On `WStype_DISCONNECTED`: `socketStarted_ = false` (allows retry).
2. Pacing intended as “5 s between attempts” only runs when `socketStarted_` is already true:

```cpp
if (socketStarted_ && elapsedMs(now, lastConnectAttemptMs_) < 5000) return;
```

   After disconnect, `socketStarted_` is **false**, so this guard **does not apply**. `begin()` can run every loop.

3. `ws_.setReconnectInterval(0)` disables the library’s own spacing after a failed connect.
4. `WebSocketsClient::loop()` (links2004 2.4.1), when not connected, calls:

```cpp
_client.tcp->connect(_host.c_str(), _port, WEBSOCKETS_TCP_TIMEOUT);
```

   with **`WEBSOCKETS_TCP_TIMEOUT = 5000` ms** (library default).

5. That **`WiFiClient::connect(..., 5000)` blocks the Arduino `loop()`** for up to **5 seconds** while the Mac is unreachable (typical during Idle/Maintenance sleep: Wi‑Fi to AP stays up, TCP to Mac times out).

**Effect while Mac is asleep and SSID still associated:**

| Mechanism | Result |
|---|---|
| Up to 5 s blocked in `ws_.loop()` | No `planner.service()` → step stream stops |
| Block ≫ 100 ms | `IncompleteStop` on next service |
| Epoch `millis()` keeps advancing | Keyframes become overdue → catch-up bursts when loop briefly runs → irregular / ~90 s pass telemetry |
| Repeated connect attempts | Near-continuous starvation → spheres **appear stationary** |

Wi‑Fi manager itself is non-blocking (phased connect/backoff). The **blocking TCP connect to the coordinator** is the critical path.

### What does *not* appear to stop autonomy on disconnect

- Clock invalidate alone.
- Case C TrackPlayer path.
- Default `DisconnectPolicy::FinishSegmentThenStop` planner branch: if busy, logs “finishing… then hold” and returns **without** `requestControlledStop` (autonomous track does not set `disconnectPendingStop_` in Case C).

(`ControlledStop` NVS policy would call `requestControlledStop` on disconnect — bad for autonomy if selected; default is FinishSegment.)

---

## 4. Root cause of the 12-hour completion mismatch

### Chain of events (confirmed)

1. UI Execute continuous autonomous → `maxRuntimeMs` **omitted** / null.  
2. Coordinator `prepare` sends continuous with **no** `max_runtime_ms` (0 on wire).  
3. Firmware accepts continuous; **never arms** `SWARM_AUTONOMOUS_MAX_RUNTIME_MS` as an active stop.  
4. Coordinator `expectedRunDurationMs` still uses **12 h ceiling** for continuous.  
5. At 12 h + 4 s grace, modules still Playing → Mac `failRun` → **cancel+stop**.

### Root cause (precise)

**Three parties disagree on “continuous”:**

| Layer | Meaning of continuous + null runtime |
|---|---|
| UI text | Until stopped or faulted |
| Coordinator watch | Expect finish by 12 h; else **stop the fleet** |
| Firmware | Loop forever (`mayStartNextLoop` / `runtimeExpired`) |

Docs say continuous is “subject to compile-time runtime ceiling,” but **prepare does not apply that ceiling when `max_runtime_ms` is 0**.

This is not fixed by “waiting longer.” It needs a **single finite completion contract**.

---

## 5. Pass-counter timestamps vs sleep (logging vs execution)

From run `6de33fc3…` (Mau01):

- Early linked window: **~240 s**/pass — healthy Wave.  
- Deep Idle–aligned gaps: **30–50 min** wall, **+1** pass — not explained by logging freeze alone (a freeze would usually show a **multi-pass jump** on wake).  
- DarkWake clusters: many **~89–90 s** intervals — compatible with **epoch catch-up** after motors lagged during WS-block stalls.

**Supported:** something slowed or interrupted physical progress during Mac-unreachable periods.  
**Not proven without video:** absolute stillness vs micro-jitter resume.  
**Not proven:** that every sleep second was blocked (DarkWake briefly runs the Mac; connect may fail fast or succeed).

---

## 6. Smallest recommended corrections (do not deploy in this pass)

### A — Unblock motion during coordinator loss (firmware — defect)

Priority order, smallest first:

1. **Pace reconnect when unlinked:** treat “not linked” like a backoff window (e.g. ≥5–30 s) **even when `socketStarted_` is false**; never call blocking `connect` every `loop()`.  
2. **Set `setReconnectInterval` to the same backoff** (not `0`) so the library cannot tight-loop connect.  
3. **Prefer non-blocking connect** (or very short timeout ≪ `SWARM_STALL_ABORT_US`, e.g. 20–50 ms) **or** move WS I/O off the stepper core / call `planner.service()` from a high-rate task.  
4. Optional belt-and-suspenders: while `RunController::shouldSurviveDisconnect()`, **skip `ensureSocket` / `ws.loop` connect attempts** entirely until a timer elapses (autonomy-first). Status can wait.

**Do not** “fix” by raising stall abort alone — that masks starvation and worsens timing.

### B — Agree finite runtime (coordinator + firmware + UI)

Recommended contract:

1. **Continuous ⇒ effective `max_runtime_ms = 12 h`** (or operator-selected ≤ ceiling) at prepare on **both** sides.  
   - Firmware: if `continuous && maxRuntimeMs==0`, set `maxRuntimeMs = SWARM_AUTONOMOUS_MAX_RUNTIME_MS` before arm.  
   - Coordinator/UI: always send that value for continuous Execute.  
2. Firmware stops at ceiling → `run_completed`.  
3. Coordinator watch waits for `finished` / `run_completed`.  
4. **Never `failRun`→cancel+stop solely because the Mac clock hit the watch** while modules still report healthy autonomous Playing; if past deadline without completion, emit durable **`run_watch_expired`** and leave motors alone (operator Stop or physical cutoff). Hard Mac stop remains available via explicit Stop.

Update UI copy to match (“continuous up to 12 h or Stop”).

### C — Tests (before OTA)

1. Host/unit: reconnect pacing never allows `connect` more often than backoff; continuous+0 runtime becomes ceiling.  
2. Firmware integration / HIL: during autonomous Playing, force coordinator unreachable for N seconds; assert planner service cadence (or step count) does not collapse; no FAULT required.  
3. Coordinator vitest: continuous prepare includes `maxRuntimeMs`; watch expiry without settlement does **not** call stop when policy = observe-only (once implemented).

### D — Observability

Fix `reconnect_reconcile` spam (log once per reconnect, not every status). Optional: durable counter of IncompleteStop during autonomous (rate-limited).

---

## 7. Supervised validation procedure (do not auto-run)

**Goal:** Prove physical autonomy while Mac cannot serve `/swarm`.

### Safety

- Physical motor-power cutoff at hand.  
- One operator eyes-on.  
- Prefer short Wave / finite `maxRuntimeMs` (e.g. 15–20 min) for the pilot.

### Procedure

1. HOME → GO TO START → EXECUTE autonomous continuous (or finite loops).  
2. Record `runId`, per-module `completedPasses`, `positionMm`, wall clock.  
3. Start **phone video** (3+ modules, continuous, clock in frame).  
4. **Test A — Wi‑Fi off on Mac only** (AP still up): 10 minutes.  
5. **Test B — Mac Idle Sleep**: 10–15 minutes (separate run or after A).  
6. Wake/reconnect **without** Stop / re-Execute / home.  
7. Compare:

| Check | Pass |
|---|---|
| Video | Clear ongoing motion through outage |
| Passes | Δ ≈ outage_s / 240 (±1) for Wave |
| FAULT | None |
| Replay | No new arm/load |

### Fail signatures

| Observation | Likely cause |
|---|---|
| Video still; passes flat | Motion starved (WS connect block) or power |
| Video still; passes jump on wake | Telemetry-only illusion (unlikely with Δ=1 gaps) |
| Video moves; passes flat | Logging path only |
| Jerky motion; IncompleteStop bursts | Partial starvation / 100 ms stall loop |

Serial on one module during Test A (if safe): watch for rapid `WS connecting` / disconnect without motion FAULT.

---

## 8. Deliverable summary

1. **Causes:** Issue A — **confirmed reconnect/TCP-blocking defect** + strong alignment with sleep pass gaps; Issue B — **confirmed policy/code mismatch** (Mac stops; firmware continuous unbound).  
2. **Coordinator dependence:** Not required by TrackPlayer logic; **yes via blocking WS reconnect on the stepper loop**.  
3. **Blocking ops:** `WiFiClient::connect(..., 5000)` inside `WebSocketsClient::loop()`; broken ensureSocket pacing after disconnect.  
4. **12 h root cause:** continuous + `maxRuntimeMs=0` never expires on node; coordinator still failRun-stops at 12 h.  
5. **Smallest fixes:** pace/nonblock WS reconnect; apply shared 12 h `max_runtime_ms` for continuous; Mac must not cancel healthy autonomy on watch expiry.  
6. **Validation:** supervised video + Wi‑Fi-off / sleep tests above.

**Until A is fixed and video-validated, do not treat Mac sleep as a safe unattended autonomy mode**, despite Case C design intent.
