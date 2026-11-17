# SWARM — Mac sleep/wake vs autonomous playback (2026-11-17)

**Mode:** log/telemetry investigation only for this note.  
**No** further stop / home / clear-fault / OTA / power-setting changes performed for this sleep analysis.

Evidence folder: `SWARM/diagnostics/2026-11-17-moving-but-stationary/`  
Artifacts: `pmset-sleep-wake-excerpt.txt`, `macos-power-status.txt`, `sleep-window-coordinator-events.json`, prior snapshots / position deltas.

---

## Executive verdict

**macOS Idle Sleep is confirmed** and lines up with the “UI says MOVING / spheres look still / motion resumes after wake” observation.

Best-supported explanation:

1. The Mac slept (~14 minutes). The coordinator process **froze** (same PID), so the **UI held a stale MOVING snapshot**.
2. Firmware **0.3.7 autonomous Wave was authorized to continue without the Mac**. There is **no durable evidence of a fleet cancel or FAULT** during sleep.
3. After wake, physical motion was visible again and telemetry again showed **live open-loop position change** — consistent with modules that **kept playing**, not with a Mac-driven pause/resume of trajectories.
4. **0.3.7 incomplete-segment resume is not implicated** as the cause of the sleep illusion (no `track_infeasible`, run still `running` after wake).
5. **`caffeinate` is not running.** System idle sleep is enabled (`sleep 1`).

The earlier “motors stationary while MOVING” diagnosis that assumed a motor-control stall is **superseded** by this sleep evidence for the ~17:47 Zurich observation window.

---

## 1. macOS sleep / wake timestamps (Europe/Zurich)

From `pmset -g log` (`pmset-sleep-wake-excerpt.txt`):

| Local (CET) | Event |
|---|---|
| **17:32:23** | `PreventUserIdleSystemSleep` (“display is on”) **released** |
| **17:32:29** | **Entering Sleep** — cause **`Idle Sleep`** (AC, TCPKeepAlive active) |
| 17:32:36 | Brief **DarkWake** (~45 s) |
| **17:33:21** | **Maintenance Sleep** (~798 s scheduled) |
| **17:46:39** | **Full Wake** from Deep Idle — user activity / dock IRQ (`MTP.DOCK…`, `UserActivity Assertion`) |

Observation reported ~**17:47** local — **immediately after this wake**.

Boot has accumulated many sleep/wake cycles; this afternoon cycle is the one that matches the report.

### Power policy (current)

- **`caffeinate`:** **not active** (no process).
- `pmset`: `sleep 1`, `displaysleep 60`, `powernap 1`, `networkoversleep 0`, `ttyskeepawake 1`.
- At capture time, idle sleep was only temporarily prevented by normal UI/Handoff assertions (Cursor Electron, etc.) — **not** by an intentional SWARM keep-awake.

---

## 2. Correlation with coordinator / clock / run

Run under investigation:

| Field | Value |
|---|---|
| `runId` | `21133e3756d74d1bb81b0660712151e` |
| Score | Wave `4eef727e` |
| Mode | `autonomous: true`, `autonomousLoop: true` |
| Armed | `2026-11-17T09:24:16.470Z` |
| Phase → running | `2026-11-17T09:24:18.911Z` |
| Firmware | **0.3.7** on all nine (pre-stop snapshots) |
| Coordinator | PID **15934**, started **09:34:32 local**, still alive after wake |

### Durable log in the sleep window (UTC = local − 1 h)

Window `16:20Z`–`16:55Z` → `sleep-window-coordinator-events.json`:

| UTC | Local | What |
|---|---|---|
| 16:32:36 | 17:32:36 | Clock-sync noise suppress (1) — coincides with DarkWake |
| **16:32–16:46** | **17:32–17:46** | **No disconnect / FAULT / cancel / re-arm events** |
| **16:46:39** | **17:46:39** | Clock-sync suppress **31** — **exact full-wake second** |
| 16:47–16:51 | 17:47–17:51 | Large clock-sync storms (106 → 286 / minute) |
| 16:51:46 | 17:51:46 | Mau06 disconnect + reconnect_reconcile (still `phase: running`) |
| 16:52:07 | 17:52:07 | Software stop engaged (diagnostic session — separate from sleep) |

Interpretation:

- While sleeping, the Mac coordinator **does not process** WS disconnects or append durable events (process suspended).
- On wake, **clock resync storms** dominate — not a choreography restart.
- Only **Mau06** shows an explicit disconnect/reconnect in this window; reconcile detail: `wasInRun: true`, `phase: running`, fw `0.3.7`. Coordinator policy: **reconcile from module status, no trajectory replay**.

---

## 3. Did ESP32s stop during Mac sleep?

**No positive evidence that the fleet stopped executing.**

Supporting points:

1. **Autonomous contract** (`docs/AUTONOMOUS-OPERATION.md` + firmware): after start, disconnect → **continue track/loops**; reconnect → **report only, no auto-restart**.
2. `TrackPlayer::onCoordinatorDisconnected`: if `policy_.autonomous && started_` → log *“autonomous run continues”* and return.
3. `RunController::shouldSurviveDisconnect()`: `Running && autonomous`.
4. Disconnect invalidates **clock sync**, not the running track epoch (`millis()`-based player continues).
5. After wake (16:50Z snapshots, before the diagnostic stop): **7–8 modules still `moving`**, positions changing ~3–12 mm/s over 5–10 s samples — planner step accounting active.
6. Travel since home ~**102–103 m** after ~7.4 h — consistent with continued Wave playback, not a long parked stall.

What the UI showed during/just after sleep is **not** a reliable physical motion sensor: the browser held a **frozen** last snapshot (`moving: true`) while the Mac was asleep.

User report that **motion was visible again after wake** matches **modules that never stopped**, plus UI/network catching up — not Mac “resuming” a paused score.

---

## 4. Reconnect / clock sync — pause, resume, or restart?

| Mechanism | Effect on autonomous playback |
|---|---|
| WS disconnect after start | Continue (Case C); clock invalidated |
| WS reconnect | Status + idempotency session; **no** auto `prepare`/`commit` replay |
| Coordinator `onConnect` during run | `perNode = reconnected`; durable `reconnect_reconcile`; **no** trajectory reload |
| Clock sync after wake | Restores Mac↔module time for *future* linked commands; **does not** re-arm Wave |

**No evidence** in this window of inadvertent run restart.  
**No evidence** that clock sync paused motors.

---

## 5. “Autonomous on modules” vs intended behaviour

Intended (docs + code): **playback continues independently after Mac disconnect.**

This incident is consistent with that design:

- Mac slept → link effectively dead from Mac’s perspective.
- Fleet remained in coordinator `run.phase = running` after wake (until later software stop).
- No fleet-wide cancel on sleep.

Operational gap (not a firmware bug): **Mac sleep freezes the control UI and durable logging**, which can look like “MOVING but still” and can delay Stop delivery. Docs already say: while Mac offline, **physical cut-off** is the emergency stop.

---

## 6. Firmware 0.3.7 incomplete-segment recovery

Involved only if planner goes idle with `!targetReached` → `resumeActiveTarget()` / possible `track_infeasible`.

For this sleep window:

- No fleet `track_infeasible` in durable log.
- Post-wake motion samples show normal progressive `positionMm` change, not a stuck resume/FAULT loop.
- Idle/MOVING mix (e.g. Mau06/Mau08 briefly idle) matches **inter-segment wait** in `TrackPlayer` (`elapsedEpochMs < due` → READY), not a 0.3.7 resume pathology.

**Conclusion:** 0.3.7 segment-resume is **not** the explanation for the sleep-time observation.

---

## 7. Why seven MOVING / two IDLE (pre-stop)

Not a separate sleep bug. Wave phase offsets: modules mid-segment report MOVING; modules between keyframes report IDLE while the autonomous run continues. After wake, which nodes are idle vs moving shifts over seconds (see 5 s vs 10 s samples).

---

## 8. `caffeinate`

**Not active** at investigation time.  
With `sleep 1`, the Mac can idle-sleep within about a minute after display-related preventions drop — exactly what happened at 17:32.

---

## 9. Immediate operational notes (no settings changed)

- For unattended autonomous runs: keep the Mac awake **or** accept that UI/Stop are unavailable during sleep; rely on **physical power cut-off**.
- Optional operator practice (manual): `caffeinate -dims` / prevent sleep while a show runs — **not applied** by this investigation.
- Note: a **software stop** was engaged at **16:52:07Z** during the earlier diagnostic session (8/9 ACK; Mau08 late/no ACK). That is **after** wake and **after** the sleep illusion window; it is not what caused the 17:32 sleep.

---

## Summary answers

| Question | Answer |
|---|---|
| Sleep/wake timestamps? | Idle Sleep **17:32:29** CET → Wake **17:46:39** CET |
| Correlate with coordinator? | Clock-sync storms at wake; no sleep-time FAULT/cancel; Mau06 reconnect only later |
| Did ESP32s stop? | **No evidence they stopped**; autonomous continue + post-wake live deltas |
| Reconnect/clock pause/restart? | **No restart**; sync recovery only |
| Autonomous-on-modules correct? | **Yes**, matches continue-after-disconnect |
| 0.3.7 incomplete resume involved? | **No** |
| `caffeinate` active? | **No** |
