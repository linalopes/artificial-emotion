# Long-running autonomous reliability fix (coordinator)

Preserves evidence in this folder. No OTA / clear-fault / re-home performed on the live fleet.

## 1. Root causes vs hypotheses

| Item | Status |
|---|---|
| Mac `failRun` + fleet cancel/stop on **any** node disconnect during active run | **Confirmed** cause of collective Mac abort (`Mau07 disconnected during running`) |
| Firmware already continues autonomous after WS drop | **Confirmed** (`shouldSurviveDisconnect` / Case C) — mismatch with Mac policy |
| `track_infeasible` set by cancel/stop | **Ruled out** (see `TRACK_INFEASIBLE-ANALYSIS.md`) |
| Exact-step loop closure after hours of motion | **Hypothesis** for nine-wide firmware FAULT — no Serial proof; **no tolerance change** |
| Clock-sync spam wiping diagnostics | **Confirmed** (terminal ~1 MB filled; 200-line ring) |

## 2. Coordinator changes (this iteration)

- **`autonomousStarted()` gate:** once phase is `running` and `autonomous`, link loss marks `perNode` `disconnected` and **does not** `failRun`/cancel/stop the fleet.
- **Pre-start / non-autonomous:** disconnect or fault still fleet-fails (unchanged safety).
- **Firmware FAULT during autonomous:** log + mark `faulted`/`aborted`; **do not** cancel peers.
- **Reconnect:** mark `reconnected`, durable reconcile from status (`run_id`, loop/passes, position validity); **no trajectory replay**.
- **Watch:** disconnected modules excluded from completion requirement; deadline without connected stragglers ends Mac watch **without** fleet stop.
- **Durable JSONL** (`data/coordinator-events.jsonl` or `SWARM_EVENT_LOG`): run start/expected end, connect/disconnect, faults, cancel/stop + initiator, completions. Set `SWARM_EVENT_LOG=off` to disable.
- **Rate-limit** clock-sync diagnostics (1 / 60 s + suppression count) so they cannot overwrite meaningful events.
- **Sim:** finish events while offline are replayed on reconnect; mid-run reconnect re-announces `running`.

## 3. Firmware (separate iteration — not applied)

- Consider mm tolerance at loop boundary **only after** Serial confirms exact-step closure faults.
- Optional: richer `run_failed` detail string for which `moveToSteps` error fired.
- Motor/endstop safety paths unchanged and should stay unchanged for this Wi‑Fi issue.

## 4. Tests

`npm test -- coordinator/test/durable-log.test.ts coordinator/test/run-duration.test.ts coordinator/test/coordinator.test.ts`

**29/29 passed**, including: single-node autonomous disconnect + reconnect; autonomous local fault without fleet cancel; all-nine drop during autonomous; disconnect before autonomous start still fails; multi-loop completion; non-autonomous disconnect still fails fleet.

## 5. Recovery of the nine modules (operator)

Live modules remain FAULT / invalid position until you choose to recover (not done by this fix):

1. Restart **only** the Mac coordinator to load this build (or let `tsx watch` reload). Confirm `data/coordinator-events.jsonl` starts receiving events.
2. In the UI: **Clear fault** on all nine (leaves UNHOMED).
3. **Home all** (required after `track_infeasible`; endstops already closed may make homes short).
4. Go to start → supervised short autonomous test → then long run with durable log watched.

Do not OTA for this fix. Do not skip home after FAULT.
