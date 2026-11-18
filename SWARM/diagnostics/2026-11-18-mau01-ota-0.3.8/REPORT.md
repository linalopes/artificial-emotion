# SWARM — Mau01 OTA 0.3.8 + autonomous pilot preparation

**When:** 2026-11-18  
**Scope:** Mau01 only. No Mot02–Mau09 OTA. No automatic home / move / execute. No commit / push.

## Phase 1 — OTA result

| Item | Value |
|---|---|
| Target | Mau01 |
| Pre firmware | 0.3.7 |
| Post firmware | **0.3.8** |
| Binary | `SWARM/firmware/.pio/build/swarm_s3_4mb_ota/firmware.bin` (932656 B, magic `0xE9`, fits `0x1C0000` slot) |
| SHA-256 | `08afaea6a96b8cc60ff26031cb6820fb0ffbb671fac29cc1332c82d31eb2d910` |
| Staging URL | `http://192.168.68.73:8787/firmware.bin` (coordinator-hosted) |
| OTA API | `POST /api/fw-ota` `{ node: "Mau01", url }` → `ota started` |
| Reconnect | disconnected then returned on **0.3.8** (~14 s wall) |
| Mau02–Mau09 | remain **0.3.7**, connected, untouched |

Evidence: `pre-ota-snapshot.json`, `ota-http-response.json`, `ota-poll-log.json`, `post-ota-snapshot.json`, `firmware-0.3.8.sha256`.

### NVS / configuration preservation

Pre vs post `/api/fw-config?node=Mau01`: **no field diffs**.

Preserved samples: `module_id=Mau01`, `wifi_ssid=School of AI`, `coordinator_host=192.168.68.73`, `coordinator_port=8787`, `steps_per_mm=86.91982`, `speed_rpm=15`, `home_seek_rpm=15`, `max_travel_mm=500`, `config_revision=10`.

MAC `28:84:85:68:C9:AC` is not reported in NVS/status by the current firmware path; identity confirmed as connected `module_id` / `fwVersion` Mau01.

### Post-OTA module state

Mau01: connected, **UNHOMED**, `positionValid=false`, not moving, fault null — expected after OTA.

### Diagnostic telemetry (0.3.8)

Present in firmware status / binary strings: `ws_reconnect_deferred`, `ws_connect_attempts`, `ws_connect_failures`, `ws_disconnects`, `incomplete_stop_count`, `completion_reason`.

Coordinator codec + `NodeState` now map these fields. Live snapshot after reload (Mau01):

- `wsReconnectDeferred: false` (linked, idle)
- `wsConnectAttempts: 22`, `wsConnectFailures: 12`, `wsDisconnects: 9`
- `incompleteStopCount: 0`
- `completionReason: ""` (no completed run yet)

Mau02–Mau09 (0.3.7) correctly report `null` for these fields.

## Phase 2 — Single-module autonomous support

**Before this prep:** Live `goToStart` / `execute` always commanded all nine modules — **not** safe for a Mau01-only Wave.

**Prep change (coordinator + shared intents only):** optional `nodes` on `goToStart` and `execute`, with readiness / load / prepare / commit / watch scoped to that subset. Default remains all nine.

**Pilot recipe:** Wave, autonomous + loop, **`maxRuntimeMs = 900000` (15 min)**, `nodes: ["Mau01"]`, **not continuous**.

Firmware local ceiling remains 12 h for continuous; this pilot uses an explicit finite runtime.

## Phase 3 — Artist-run procedure

See `ARTIST-TEST.md` and interactive helper `mau01-pilot-intents.mjs`.

**Blocker before disconnected test:** physical motor-power cutoff must be accessible (remote STOP unavailable while autonomy + link deferred).

Agent did **not** home, move, STOP, or start choreography.

## Phase 4 — Readiness summary

| Item | Status |
|---|---|
| Mau01 on 0.3.8 | Ready |
| Fleet others untouched | Ready |
| NVS preserved | Ready |
| Diagnostic fields in firmware | Ready |
| Mau01-only goToStart/execute | Ready in source (confirm after coordinator hot-reload) |
| Automatic motion | **Not started** — artist-controlled |
| Physical observations | Pending artist run |

## Do not

- OTA Mau02–Mau09 yet  
- Run continuous / indefinite autonomy for this pilot  
- Rely on software STOP while Mac is asleep / Wi‑Fi down  
