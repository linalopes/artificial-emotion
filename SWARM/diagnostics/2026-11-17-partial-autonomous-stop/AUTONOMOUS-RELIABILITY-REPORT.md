# SWARM — Autonomous reliability, Mac sleep/wake, STOP ALL (2026-11-17)

Firmware **0.3.7**. Evidence from durable logs, prior diagnostics, firmware/coordinator source, and this session’s agent records.  
**No claim that the Mac must stay awake** — autonomy is designed to continue on the ESP32s.

---

## 1. Origin of the 17:52 CET STOP — confirmed

| Question | Answer |
|---|---|
| Exact time | **2026-11-17T16:52:07.955Z** = **17:52:07 CET** (`cancel_stop` / “Software stop engaged.”) |
| Fan-out | Immediate `stop` (+ prior `cancel` when `runId` set) to connected nodes; then “Stop all requested.” at 16:52:10Z |
| Initiator | **Cursor/agent diagnostic WebSocket client**, not a browser Live panel, not sleep/wake, not automatic completion watch |

**Proof chain:**

1. Durable log `detail.initiator` was only the generic `"operator_or_stop"` (ambiguous by itself).
2. `stop-attempt.json` records RPC ids `diag-mwkxjzbl-…` / `diag-mwkxk1n2-…` with intents `engageStop` then `stopAll`, and outcomes **8 OK / Mau08 ACK timeout**.
3. Agent transcript for this chat shows the same sequence: after sleep/wake forensics, a Node script claimed control (failed — another browser held it) then still issued **`engageStop` + `stopAll`** via `ws://127.0.0.1:8787/ws` (OPEN_INTENTS allow anyone to stop).

**Not the cause:** Mac wake (17:46:39 CET), reconnect reconcile, completion watchdog, or `failRun`.

**Gap fixed in coordinator (this change set):** durable `cancel_stop` now records `clientId`, `intentType`, and a precise `initiator` string.

---

## 2. Autonomous independence from the Mac — architectural yes

Firmware/docs/`TrackPlayer`/`RunController`:

- After autonomous **start**, disconnect → **continue** track/loops; clock sync **invalidated**, epoch scheduling uses **local `millis()`**.
- Playback does **not** require heartbeats, browser presence, or ongoing clock_sync.
- Reconnect → status only; **no** trajectory replay / re-arm.
- Coordinator offline or process exit: modules keep authorized autonomous policy until Stop (if linked), local FAULT, runtime ceiling, or **physical power cut**.

**Tests:** simulator covers disconnect-during-autonomous continuation; hardware long-run continuity during Mac sleep is **supported by design + post-wake progress**, not by a continuous physical observer during sleep.

---

## 3. What sleep/wake evidence actually proves

| Proven | Not proven |
|---|---|
| Mac Idle Sleep **17:32:29–17:46:39 CET** | Continuous *visual* motion during the entire sleep window |
| Coordinator PID suspended (no durable events mid-sleep) | That every module stepped every second while asleep |
| Post-wake: run still `running`, Mau06 `completedPasses=107`, live `positionMm` deltas before STOP | That sleep *caused* any module to stop |
| UI can show stale MOVING while Mac slept | That ESP32s “paused and resumed” because of wake |

**Sufficient inference:** autonomy did **not** require the Mac; sleep explains **stale UI**, not the 17:52 eight-module IDLE (that was STOP).

**Do not use `caffeinate` as the product fix** — optional operator convenience only.

---

## 4. Mau08 missed STOP — narrowed root cause

| Hypothesis | Evidence |
|---|---|
| STOP never sent to Mau08 | Weak — fan-out included all **connected** ids; Mau08 listed connected |
| STOP sent, ACK lost / not processed in time | **Strong** — coordinator `ackTimeoutMs=1500`; Mau08 had **~155 s telemAge** and frozen `positionMm` just before STOP (congested/stale link) |
| STOP processed, ACK lost, motion stopped | Weak — Mau08 **position later changed** 369→211 mm |
| Autonomous transition blocked STOP | Unlikely — firmware `stop`/`stop_all` calls `operatorStop()` **without auth**, high priority |
| Clock traffic interference | Possible contributor after wake (sync storms); DeviceServer already pauses new clock probes while command acks inflight |

**Root cause (best supported):** **unreliable link / stale Mau08 session** → **ACK timeout** → coordinator reported partial failure but **did not retry or verify `!moving` with fresh telemetry** → Mau08 kept executing.

Software STOP ≠ physical cutoff. Docs already require power cut when software Stop cannot reach nodes.

---

## 5. Per-module loop observability gaps (before this change)

| Field | On wire (status) | Fleet/UI snapshot | Durable history |
|---|---|---|---|
| runId / loopIndex / completedPasses | Yes | **Dropped** | Only on fault / reconnect_reconcile |
| loop_boundary | Yes (bounded) | Dropped | No |
| moving / position | Yes | Yes | Indirect |
| STOP origin | — | — | Vague `operator_or_stop` |
| last progress time | via status cadence | `lastTelemetryAtMs` only | No pass timeline |

**Why we only know Mau06=107:** sole reconnect_reconcile detail with counters during the run.

---

## 6. Risks that can interrupt a healthy autonomous run

1. **Partial STOP** (this incident) — operator/agent Stop with incomplete ACK.
2. **Local `track_infeasible`** (0.3.5/0.3.6 class) — improved in 0.3.7 (107+ passes) but still possible at loop boundary.
3. **Single-module FAULT** — others continue when autonomous; Mac must Stop remaining if desired.
4. **Mac sleep** — monitoring/Stop delivery degraded; modules should continue.
5. **Coordinator process exit** — same as disconnect; autonomy continues; Stop unavailable until restart+reconnect.
6. **Wi-Fi module drop** — that module’s fate depends on disconnect policy / whether already started.
7. **12 h continuous ceiling** — expected local completion bound when `maxRuntimeMs` unset.

---

## 7. Proposed fixes (priority, smallest first)

| # | Fix | Layer | Status |
|---|---|---|---|
| 1 | Durable STOP origin (`clientId`, intent) | Coordinator | **Implemented** |
| 2 | Bounded STOP **retry** + require **fresh `!moving` telemetry** before `ok: true` | Coordinator | **Implemented** |
| 3 | Persist `loopIndex` / `completedPasses` / `runId` on `NodeState` + durable `pass` events on increase | Coordinator | **Implemented** |
| 4 | UI: show telem age / unconfirmed STOP warning | Web | Optional follow-up |
| 5 | Firmware: STOP command idempotent status even if WS buffer full | Firmware | **Not required for #1–3**; only if field proves RX loss without ACK |

Firmware change is **not** required to fix coordinator false confidence or missing loop history.

---

## Safety distinction (preserved)

- **Software STOP:** best-effort over Wi-Fi; must report incomplete confirmation explicitly; retry bounded.
- **Physical motor-power cutoff:** only guaranteed emergency stop when links fail.
