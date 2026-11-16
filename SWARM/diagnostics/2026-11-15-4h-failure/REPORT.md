# SWARM collective failure after ~4 h — diagnostic report

**Mode:** diagnostics only. Coordinator left running. No clear-fault, home, move, reboot, OTA, or code changes.

**Evidence captured under** `SWARM/diagnostics/2026-11-15-4h-failure/`  
(live snapshot, terminal log copy, greps, notes).

---

## Confirmed facts

### Live coordinator / fleet state (captured ~2026-11-15T13:40Z)

| Field | Value |
|---|---|
| `run.phase` | `failed` |
| `run.scoreName` | **Wave** |
| `run.durationMs` | **240000** (4 min score) |
| `run.autonomous` / `autonomousLoop` | **true** / **true** |
| `run.pass` | 1 |
| `run.error` | **`Mau07 disconnected during running.`** |
| `run.runId` | `4285db64e5634a1595b8e6f7052a96f` |
| `perNode` | all nine still `"running"` (no `finished` / `aborted`) |
| Modules | **9/9 connected**, fw **0.3.5** |
| Fault | **9/9 `track_infeasible`** |
| Homing / position | **9/9 `homed: false`, `positionMm: null`** |
| Endstop (debounced) | **9/9 `true` (closed)** |
| Software stop | not engaged |

### Coordinator behaviour (code)

On any node WebSocket disconnect while `run.phase` is active (`armed`/`running`/…):

→ `failRun("… disconnected during …")` → **`cancel` + `stop` to every still-connected module**.

That matches the retained `run.error`. The **coordinator initiated the fleet-wide cancel/stop** after Mau07’s link drop. It did **not** record `run.error` as a `track_infeasible` fault (so the Mac-side abort trigger was disconnect, not the first fault string).

### Firmware meaning of `track_infeasible` (0.3.5)

`FaultCode::TrackInfeasible` is raised only from `TrackPlayer::service()` when:

1. **Loop restart (`passIndex_ > 0`)** and current steps **≠** first keyframe steps exactly → refuse silent jump; or  
2. **`moveToSteps` / `beginSegment` fails** (e.g. position invalid, planner busy, target outside soft limits).

`enterFault()` always sets **`positionValid_ = false`** and state **FAULT**. UI therefore shows FAULT + unknown position / no homing reference. That alone explains “positions unknown” once each module entered this fault — **not** a separate homing wipe from the Mac.

`TrackPlayer::stop()` / cancel does **not** set `track_infeasible`; it only controlled-stops and clears autonomous policy. So **nine identical `track_infeasible` codes imply each module’s track player hit one of the firmware paths above while still playing**, not merely “Mac sent stop.”

### Durable Mac log timeline (terminal `755315`)

| UTC | Event |
|---|---|
| 06:37:45 | Wave armed AUTONOMOUS |
| 06:49:44 | Wave **finished** — all nine completion confirmed (~12 min ≈ 240 s × 3 loops) |
| 07:03:34 | Breathing armed AUTONOMOUS |
| 07:03→10:37 | Almost exclusively `clock_sync_fin refused: rtt out of range` |
| — | **No** later `armed` / `finished` / `Run failed` / `reports fault` / `disconnected during` in this file |

Terminal capture is **~1 048 563 bytes / 12 195 lines** and ends at **10:37:30Z** while the process kept running (mtime ~13:44Z). After Breathing arm, the file has **zero** non-clock operational lines. **The failure window is missing from the terminal log** (buffer effectively filled with clock-sync spam; coordinator in-memory log is only ~200 lines and was also overwritten).

### What `track_infeasible` is not (from this log)

No terminal line contains `track_infeasible`. Earlier faults in the same terminal (OTA / invalid run_id / premature completion) are **unrelated** morning issues, not this ~4 h stop.

---

## Missing evidence (do not invent)

1. **Exact UTC timestamp of the first `track_infeasible`** on any module — not in terminal; not in the 200-line ring buffer at capture time.  
2. **Exact UTC of `Mau07 disconnected during running`** — retained only as `run.error` string, not as a stamped log line in durable storage.  
3. **Whether continuous mode / high `maxLoops` / `maxRuntimeMs` was used** on the failing Wave — `RunState` does not store `continuous` / `maxLoops`; UI defaults are finite 3 loops / continuous off, but the operator may have changed them.  
4. **Per-module Serial / ESP logs** (pass index, “Loop boundary violated”, move errors) — not collected (would need USB; restricted).  
5. **Whether Breathing (07:03) completed, was cancelled, or was superseded by a later Wave arm** — not in truncated terminal; live state only remembers the **Wave** that failed.  
6. **Order between Mau07 disconnect vs first firmware fault** — only know Mac abort reason was disconnect.

---

## Best-supported sequence (facts + tight inference)

1. A long autonomous session ran for on the order of hours after the morning Wave success / Breathing arm (operator report ~4 h; Mac durable log cannot confirm end time).  
2. The run the coordinator still holds is **Wave**, autonomous looping, still `perNode: running` when it aborted.  
3. **Mau07’s WebSocket dropped** while Mac phase was `running` → coordinator **`failRun` → cancel/stop fleet**.  
4. Independently or around the same period, **all nine firmwares entered `track_infeasible`**, clearing position validity → UI FAULT + unknown positions.  
5. Most plausible firmware mechanism for **identical faults on all nine after long looping**: at a **loop boundary**, `position_->steps() != first` (exact step match) after cumulative step/ mechanica error — especially likely after hours of motion. Soft-limit / move failures are possible but less explanatory for a clean nine-wide same code.  
6. Clock-sync RTT refusals were chronic noise; they did **not** by themselves stop motion, but they **destroyed log forensic value**.

---

## Answers to the deliverable questions

1. **First fault + timestamp** — **Unknown from durable logs.** Present on all nodes now: `track_infeasible`. First stamped occurrence not preserved.  
2. **Initiating Mac event** — **`Mau07 disconnected during running`** (coordinator `run.error`).  
3. **Why the fleet stopped (Mac side)** — Coordinator **failRun on single-node disconnect** while the run was active → cancel + stop to connected modules. Firmware faults also stop each module locally.  
4. **Is ~4 h relevant?** — **Yes as a stress factor** for exact-step loop closure and link flaps; **not** because of a hard 4 h watchdog in 0.3.5 (autonomous ceiling is 12 h). Finite default 3×Wave is only ~12 min (seen succeeding at 06:37–06:49); a multi-hour run implies **continuous / large loop bound / repeated executes** not visible in truncated logs.  
5. **Why positions unknown** — Firmware **`enterFault` → `positionValid_ = false`**; codec reports `positionMm: null` / not homed. Expected after `track_infeasible`.  
6. **Smallest corrections to prevent recurrence** (diagnosis only — not applied):  
   - **Coordinator:** during **autonomous** `running`, do **not** treat a single-node disconnect as fleet `failRun`/`stop` (align with “Mac may disconnect; modules continue”); still surface the drop. Persist **disk logs** (and rate-limit clock-sync warnings) so the next 4 h failure is reconstructible.  
   - **Firmware (if loop-boundary theory confirmed on Serial):** compare loop closure with a **mm tolerance** (same spirit as 1 mm score loop check), not exact steps.  
7. **Resume without unnecessary re-homing** — With current 0.3.5 semantics, **clear fault leaves UNHOMED and still invalid position**; **homing is required** after `track_infeasible` before another collective run. Endstops reading closed on all nine *may* make home cycles short if carriages are already at the switch — still must clear + home; do not skip. No safe “resume mid-track” without position validity.

---

## Hypotheses (not confirmed)

| Hypothesis | Status |
|---|---|
| Exact-step loop closure after long Wave/Breathing loops caused nine `track_infeasible` | Plausible; fits code; **unproven** without ESP logs / first-fault time |
| Transient Wi‑Fi drop on Mau07 alone aborted a healthy fleet via coordinator policy | **Confirmed policy**; disconnect time unlogged |
| Chronic clock RTT issues caused the motion stop | **Unlikely** as direct cause; confirmed as log pollution |
| Soft-limit / “target outside soft limits” on a segment | Possible alternate `track_infeasible` path; no per-node error string retained on Mac |
| Authorized duration completed normally then idle-faulted | **Contradicted** by `perNode: running` + failed disconnect error |

---

## Coordinator left as-is

Process on **:8787** not restarted. Faults and positions left untouched for further inspection (e.g. Serial on Mau05/Mau07).
