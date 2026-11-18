# SWARM 0.3.7 — Forensic analysis: partial autonomous stop

**Mode:** forensic investigation only. No firmware/code changes. No home / clear-fault / OTA / motor commands issued for this note.  
**Evidence root:** `SWARM/diagnostics/2026-11-17-partial-autonomous-stop/`  
**Related prior capture:** `SWARM/diagnostics/2026-11-17-moving-but-stationary/` (snapshots, stop-attempt, sleep/wake report)

---

## Executive verdict

This event is **not** a new `track_infeasible` loop-boundary failure.

It is a **partial software STOP**:

1. Continuous autonomous Wave on firmware **0.3.7** ran ~**7 h 28 m** wall-clock without a fleet FAULT.
2. At **2026-11-17 16:52:07 UTC / 17:52:07 CET**, a **software stop** was engaged (diagnostic session on the Mac).
3. **Mau01–07 and Mau09 acknowledged STOP** and became physically/telemetry IDLE.
4. **Mau08 did not acknowledge within 1500 ms** and **continued moving** afterward (position later changed; artist then stopped it manually).
5. Mac sleep (**17:32–17:46 CET**) was a **telemetry/UI freeze**, not the cause of the eight-module stop.

**Classification:** operator/diagnostic **partial stop** (8/9 ACK) — **malfunction of stop delivery to Mau08**, not autonomous early completion and not loop-boundary FAULT.

---

## 1. Evidence preserved

| Artifact | Path |
|---|---|
| Durable log copy | `logs/coordinator-events.jsonl` |
| Run-filtered timeline | `run-timeline.json` |
| Live read-only snapshot | `snapshots/snapshot-live-*.json` |
| Pre/post stop series | `module-snapshot-series.json` |
| Stop ACK matrix | `stop-ack-matrix.json` / `ref-prior-stop-attempt.json` |
| Sleep/wake cross-ref | `ref-SLEEP-WAKE-REPORT.md`, `ref-pmset-sleep-wake-excerpt.txt` |

No services restarted; coordinator PID **15934** left running.

---

## 2. Full timeline (UTC and Europe/Zurich CET)

### Run identity

| Field | Value |
|---|---|
| `runId` | `21133e3756d74d1bb81b0660712151e` |
| Score | Wave (`4eef727e`), `durationMs` **240000** (4 min) |
| Firmware | **0.3.7** (all nine at capture) |
| Autonomous | `true` |
| Loop | `true` (`autonomousLoop`) |
| Continuous | **`true`** |
| `maxLoops` | **null / none** |
| `maxRuntimeMs` | **null / none** (firmware/coordinator use **12 h** ceiling) |
| Expected Mac watch window | **+43 204 000 ms** from start (~12 h + 4 s grace) |

From durable `run_start` detail:

```text
autonomous: true, autonomousLoop: true, continuous: true,
maxLoops: null, maxRuntimeMs: null,
expectedMs: 43200000, graceMs: 4000
```

### Chronology

| UTC | CET | Event | Source |
|---|---|---|---|
| 09:23:49 | 10:23:49 | `goToStart Wave` | durable |
| **09:24:16.470** | **10:24:16** | Wave **armed** (continuous autonomous) | durable |
| **09:24:18.911** | **10:24:18** | phase → **running** | durable |
| 09:24 → 16:32 | 10:24 → 17:32 | No FAULT / cancel for this `runId` | durable silence |
| 16:32:29 | **17:32:29** | Mac **Idle Sleep** | pmset |
| 16:46:39 | **17:46:39** | Mac **full wake** | pmset |
| 16:46–16:51 | 17:46–17:51 | Clock-sync storms; run still `running` | durable + snapshots |
| 16:50:06 | 17:50:06 | Live sample: **7 MOVING**, Mau06/08 briefly not; **no FAULT** | prior snapshots |
| 16:51:46 | 17:51:46 | Mau06 disconnect/reconnect; status **`loopIndex=107`, `completedPasses=107`**, `moving=true`, `autonomous=true` | durable reconcile |
| 16:51:xx | 17:51:xx | 10 s sample: **8 modules changing `positionMm`**, Mau08 **stale** (dpos 0, telemAge ~155 s) | prior delta |
| **16:52:07.955** | **17:52:07** | **Software stop engaged** | durable `cancel_stop` |
| 16:52:10.958 | 17:52:10 | **Stop all requested** | durable |
| 16:52:07–16:52:16 | 17:52:07–16 | **Stop ACK: 8 OK; Mau08 timeout 1500 ms** | `stop-attempt.json` |
| 16:52:16 | 17:52:16 | Post-stop: **all `moving=false` in snapshot**; Mau01–07/09 positions frozen; Mau08 pos still **369.98** (stale telem) | prior post-stop |
| **16:53:36** | **17:53:36** | Mau08 disconnect + reconnect (`phase: cancelled`) | durable |
| ~after | ~after | Artist reports Mau08 still moving then **manual stop**; Mau08 live pos now **211.19** (changed) | live snapshot + artist |
| 17:05:30 | 18:05:30 | Forensic capture: STOP engaged, run `cancelled`, **all nine IDLE**, no FAULT | live snapshot |

**Wall duration arm→software stop:**  
`16:52:07.955 − 09:24:18.911` = **7 h 27 m 49 s** (~**7.46 h**).

**Expected continuous end (12 h ceiling):** ~**21:24:18 UTC / 22:24:18 CET** — **not reached**.

Do **not** treat the Mac sleep gap as an ESP32 stop: autonomous policy continues on disconnect; no fleet cancel logged at sleep; post-wake samples still showed progressing positions before STOP.

---

## 3. Per-module comparison

### What is available vs missing

| Telemetry | Available in Mac fleet snapshot? | Available in this incident? |
|---|---|---|
| `moving` / `positionMm` / `homed` / FAULT | Yes | Yes (series) |
| `runId` / `loopIndex` / `completedPasses` / `autonomous` | On wire in status; **not stored on `NodeState`** except briefly in durable **reconnect_reconcile** / fault detail | **Only Mau06** at 16:51:46Z (`107` / `107`) |
| `loop_boundary` / segment result / planner busy / steps | Firmware status; **not mapped into fleet UI state** | **Not preserved** for this run |
| Historical per-loop completion for all nine | No | **Missing** |

### Snapshot comparison (evidenced)

| Module | Pre-stop motion (16:50–16:51) | Software STOP ACK | Immediately after STOP | Later position change | Live now (18:05 CET) |
|---|---|---|---|---|---|
| Mau01 | Moving (dpos large) | **OK** | IDLE, pos frozen 341.38 | No | IDLE 341.38 |
| Mau02 | Moving | **OK** | IDLE 322.33 | No | IDLE 322.33 |
| Mau03 | Moving | **OK** | IDLE 244.75 | No | IDLE 244.75 |
| Mau04 | Moving | **OK** | IDLE 315.84 | No | IDLE 315.84 |
| Mau05 | Moving | **OK** | IDLE 254.41 | No | IDLE 254.41 |
| Mau06 | Moving by 10 s sample; **passes=107** on reconnect | **OK** | IDLE 138.09 | No | IDLE 138.09 |
| Mau07 | Moving | **OK** | IDLE 244.62 | No | IDLE 244.62 |
| **Mau08** | **Stale telem** (dpos 0, age ~155 s) at 369.98 | **NO ACK (1500 ms)** | Snapshot said not moving @ 369.98 (stale) | **Yes → 211.19** | IDLE 211.19 |
| Mau09 | Moving | **OK** | IDLE 189.65 | No | IDLE 189.65 |

### Interpretation of IDLE vs MOVING

- **Eight modules IDLE after 16:52:07:** they **accepted STOP** (controlled stop → READY/idle). Not autonomous “completed all loops” (continuous run; no `run_completed` cascade; expected 12 h not reached).
- **Mau08 still MOVING (physical):** STOP **not confirmed**; open-loop autonomous segment could continue until a later local stop / link event / artist action. Position **369.98 → 211.19** proves continued step progress after the fleet stop.
- Mau08’s pre-stop “idle/stale” telem does **not** prove it had finished; it proves **status updates were lagging** (high `telemAge`), which also explains ACK timeout.

---

## 4. Loop counters — what 0.3.7 code means

### Firmware (`track_player`)

| Counter | When it changes |
|---|---|
| `passIndex_` | Set to `0` at `startAt`; after each finished pass that starts another loop, set to `completedPasses_` (0-based index of current pass) |
| `completedPasses_` | Incremented in `finishPass()` when the last segment of a pass completes (`targetReached` path → advance → last keyframe done) |

Survives:

- Mid-pass STOP? **`stop()`** does not clear counters immediately, but run/policy teardown and later reload/`startAt` reset them to 0.
- Reconnect during autonomous run: counters **remain in RAM** and are published on status (`loop_index`, `completed_passes`).
- After FAULT / new load / new start: reset.

`completedPasses` means: **number of full track passes finished** under the player — not “Mac UI loops,” and not incremented on IncompleteStop resume.

### Coordinator / UI

- Codec **parses** `loop_index` / `completed_passes`.
- Fleet **`NodeState` does not retain them**; UI snapshot therefore usually **shows no live loop count**.
- Durable log records them mainly on **fault** and **reconnect_reconcile** details.
- Coordinator `run.pass` stayed **1** for this continuous run (Mac bookkeeping pass, not firmware loop index).

### What we can conclude

| Claim | Status |
|---|---|
| Mau06 had finished **107** passes by 16:51:46Z | **Evidenced** |
| All nine were at 107 | **Not evidenced** — do not invent |
| Score-time lower bound from Mau06 | 107 × 240 s = **7.133 h** (consistent with ~7.46 h wall) |
| UI “pass” field equals firmware loops | **No** |

---

## 5. Divergence: why eight IDLE, one MOVING

### Ruled out

| Hypothesis | Why not |
|---|---|
| Per-module different `maxLoops` / `maxRuntimeMs` | Same prepare for fleet; arming detail shows continuous / unbounded for the run |
| Normal autonomous completion | Continuous + 12 h ceiling; stop at 7.46 h; no completion events |
| `track_infeasible` / 0.3.7 incomplete-segment FAULT | No FAULT in durable log for this `runId`; positions remained valid on Mau06 reconcile |
| Mac sleep stopped eight modules | Sleep earlier; post-wake samples still showed motion; stop ACKs are the idle transition |

### Supported mechanism

1. Diagnostic/operator **`engageStop` + `stopAll`** at 16:52:07–10Z.
2. DeviceServer waits ~**1500 ms** for ACK.
3. **Mau08** (already showing **stale status**) **misses ACK**.
4. Coordinator still marks run **`cancelled`** / STOP engaged; UI shows eight IDLE.
5. Mau08 firmware **may not have applied stop** → continues autonomous motion until later disconnect (16:53:36) / artist intervention.

This matches the artist UI: **STOP engaged**, **Mau08 MOVING**, others IDLE.

### 0.3.7 incomplete-segment retry

Can keep a module in MOVING while resuming a target, but would not selectively idle eight healthy modules. No `incomplete_fault` / FAULT telemetry was logged for this stop window.

---

## 6. Comparison to prior incidents

| Incident | FW | End mode | Loops evidenced | Cause class |
|---|---|---|---|---|
| Nov 16 ~5 h | **0.3.5** | Fleet **`track_infeasible`** | **74** (all fault details) | Loop-boundary exact/gate failure |
| Nov 16–17 overnight | **0.3.6** | Fleet **`track_infeasible`** | **103** | Loop-boundary residual / prelude failure |
| **This event** | **0.3.7** | **Software STOP** (8/9 ACK) | **Mau06 = 107** only | **Partial stop / Mau08 ACK failure** |

**New failure mode relative to 0.3.5/0.3.6:** not loop-boundary FAULT.  
**Related only in that** continuous Wave again exceeded prior fault loop counts (**107 > 103 > 74**) **without** FAULTing — i.e. **0.3.7 survived past the old death loops**, then was **externally stopped**.

---

## 7. Answers to the required questions

1. **How many hours?**  
   **7 h 27 m 49 s** wall from running → software stop (~**7.46 h**). Score-time ≥ **7.13 h** from Mau06’s 107 passes (other modules unknown).

2. **How many loops each module?**  
   **Only Mau06 evidenced: 107 completed passes.** Others: **unknown** (not in durable/UI state).

3. **Which stopped first, when?**  
   The eight that ACK’d STOP transitioned at **16:52:07–16:52:16 UTC (17:52 CET)**. No earlier coordinated idle event is logged. Mau08 **did not** stop with them.

4. **Why eight IDLE?**  
   They **received and ACK’d software STOP**, not because the continuous run completed.

5. **Why Mau08 still MOVING?**  
   **STOP not acknowledged** (1500 ms timeout) while telem was already stale; motion continued (position later changed); artist then stopped it manually.

6. **Completed / partial / malfunction?**  
   **Incomplete continuous run, externally cancelled.** Fleet outcome = **partial stop malfunction** (1/9 missed STOP), **not** choreography completion, **not** loop-boundary FAULT.

7. **Missing evidence**  
   - Per-module `loopIndex` / `completedPasses` for Mau01–05,07–09 during this run  
   - `loop_boundary` / segment_result / planner busy / steps time series  
   - ESP serial logs  
   - Exact artist manual-stop timestamp for Mau08 (only disconnect 16:53:36Z as nearby link event)  
   - Whether Mau08 ever applied stop locally before artist action  

8. **Smallest next diagnostic / corrective action (no code change required to conclude forensics)**  
   - **Diagnostic:** On next run, periodically durable-log (or UI-surface) `loop_index` / `completed_passes` / `moving` for **all nine**, and treat STOP ACK failure as a first-class alarm with retry.  
   - **Operational:** Before long autonomous shows, keep Mac awake **or** accept Stop may be partial; physical cut-off remains the emergency path for non-ACK modules.  
   - **Corrective (later, if desired):** Retry STOP to non-ACK nodes; surface firmware loop counters in fleet snapshot — only after agreeing this forensics.

---

## Bottom line

**0.3.7 carried continuous Wave past the old 74 / 103 FAULT generations to at least Mau06 loop 107, then a Mac software stop halted eight modules while Mau08 kept going because it did not ACK.**  

That is the partial autonomous stop — distinct from prior loop-boundary failures.
