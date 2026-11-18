# SWARM 0.3.11 — HOME / connectivity regression (diagnostic)

**When:** 2026-11-18 ~17:00–17:02 UTC  
**Mode:** Read-only. No HOME / move / OTA / code changes / commit / push.

## Confirmed findings

### 1. Modules are rebooting (not merely dropping WebSocket)

Live snapshot watch (`live-watch.json`) captured multiple cycles where a module was **homed at 0 mm**, went **offline**, then came back **`position_valid=false` / NOT HOMED**.

RAM counters that only reset on firmware restart also reset:

| Event | Before offline | After reconnect |
|-------|----------------|-----------------|
| Mau02 @ 17:01:25→28 | `homed=true`, `wsAtt=2`, `wsFail=1`, `wsDisc=0` | `homed=false`, `wsAtt=1`, `wsFail=0`, `wsDisc=0` |
| Mau08 @ 17:02:21→25 | `homed=true`, `wsAtt=1`, `wsDisc=0` | `homed=false`, `wsAtt=1`, `wsDisc=0` |
| Mau03 @ 17:02:23→27 | same pattern | NOT HOMED after reconnect |
| Mau04 @ 17:00:04→05 | `homed=true` → offline → | `homed=false` |

A pure WebSocket drop **without reboot** would **increment** `ws_disconnects` and would **not** reset `ws_connect_attempts` / `ws_connect_failures` to a fresh-boot pattern. Observed resets ⇒ **process restart**.

### 2. Homing loss is the expected consequence of reboot

Position validity lives in RAM. Boot path leaves modules **UNHOMED** (same as post-OTA). Coordinator mapping (`homed = position_valid && state ∉ {UNHOMED,BOOT,CONNECTING}`) correctly reflects firmware status — **not** a UI-only misrepresentation.

### 3. Disconnect storm after 0.3.11 OTA

Durable log (`coordinator/data/coordinator-events.jsonl`): after fleet OTA (~16:55Z), spontaneous disconnect→reconnect gaps ≈ **1.3–5 s** across Mau01–Mau09, migrating between modules (matches artist report).

### 4. Not explained as endstop / HOME mechanism failure

- No durable `fault` events in this window.
- Modules that stay up remain IDLE at 0 mm.
- Loss correlates with **offline → reconnect**, not with a failed home transition on a continuously linked module.

### 5. 0.3.11 delta vs working 0.3.10

New in 0.3.11: FreeRTOS `swarm_net` task (core 0), large FreeRTOS queues (`WsInboundMsg` / `WsOutboundMsg` ≈ 2 KB × 8 each), WS callbacks → queue → motor-loop drain. 0.3.10 kept WS on the cooperative loop and muted it during autonomy.

## Hypotheses (mechanism of reboot — not yet proven on Serial)

1. **Net-task stack overflow** (priority): 8 KB task stack + ~2 KB `WsInboundMsg` on callback stack + WebSocketsClient internals.
2. **Heap pressure / corruption** from large by-value queue elements.
3. **Cross-core WiFi / WebSocket** use (net task vs `WifiManager::service` on Arduino loop) → panic.
4. **TWDT** if a core path wedges (less evidenced than counter-reset reboot).
5. Secondary (would clear home **without** counter reset): `main.cpp` `Connecting` + WiFi up → `setUnhomed()`. **Does not explain** the observed counter resets; may still matter for Wi-Fi blips without full restart.

Serial panic/backtrace was **not** captured (no USB attach this session).

## Answers to investigation checklist

| Question | Verdict |
|----------|---------|
| 1. Rebooting unexpectedly? | **Yes — confirmed** (counter reset + UNHOMED after reconnect) |
| 2. WS loss without reboot? | **Not for the observed home-loss cycles** |
| 3. Firmware state transition clearing home without reboot? | Possible secondary path; **not** the primary evidenced path |
| 4. Coordinator misrepresentation? | **No** — telemetry matches firmware after reconnect |
| 5. FreeRTOS / isolation defect in 0.3.11? | **Strong leading hypothesis** for *why* reboots; reboot itself confirmed |

## Smallest safe recovery

**Immediate:** Fleet rollback OTA to **0.3.10** (known working autonomy baseline; hash `8513d571…` in `diagnostics/2026-11-18-fleet-ota-0.3.10/`). Then HOME all nine on 0.3.10 before any endurance / Wi-Fi interrupt test.

**Do not** continue artist HOME cycling on 0.3.11 as the reliability path.

**After rollback:** optional USB Serial on one module if 0.3.11 is re-tried in lab — capture panic reason before any redesign (stack size / cooperative WS / core pinning).

## Evidence files

- `live-watch.json` — 90 s live conn/homed/ws-counter transitions  
- Durable log: `SWARM/coordinator/data/coordinator-events.jsonl` (post-16:50Z disconnect/connect pairs)
