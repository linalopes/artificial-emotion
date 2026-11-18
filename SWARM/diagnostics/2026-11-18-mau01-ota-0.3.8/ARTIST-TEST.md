# Mau01 firmware 0.3.8 — artist supervised autonomous pilot

**Do not start until a physical motor-power cutoff for Mau01 is within reach.**  
While disconnected, firmware **defers WebSocket reconnect** — remote software STOP cannot reach Mau01.

## Preflight (already done by agent)

| Check | Result |
|---|---|
| Mau01 OTA 0.3.8 | **SUCCESS** |
| Mau02–Mau09 | still **0.3.7**, untouched |
| NVS on Mau01 | preserved (identity, Wi‑Fi, coordinator `192.168.68.73:8787`, calibration) |
| Mau01 state after OTA | **UNHOMED**, not moving, no fault |

## Test parameters

- Module: **Mau01 only** (`nodes: ["Mau01"]`)
- Score: Wave (loop-compatible)
- Mode: autonomous + loop + **finite** `maxRuntimeMs = 900000` (15 minutes) — **not** continuous / indefinite
- Physical cutoff: required before Wi‑Fi sleep / Mac disconnect

## Operator steps (manual)

1. Confirm physical power cutoff for Mau01 is accessible.  
2. In Live UI or via the helper script below: **Home Mau01 only** (do not home the fleet).  
3. **Go to start** for Wave with `nodes: ["Mau01"]` only.  
4. Confirm visible sphere motion to start, then **Execute** autonomous Wave with:
   - `autonomous: true`
   - `autonomousLoop: true`
   - `maxRuntimeMs: 900000`
   - `nodes: ["Mau01"]`
   - do **not** enable continuous  
5. Confirm visible Wave motion.  
6. Disconnect Mac Wi‑Fi or sleep the Mac.  
7. Phone-record Mau01 continuously; confirm pace continues.  
8. Let local runtime end the run (~15 min).  
9. Wake / reconnect Mac.  
10. Verify:
    - `completionReason` / durable completion ≈ `max_runtime`
    - no FAULT
    - `positionValid` true (or re-home if you stopped mid-travel with cutoff)

## Helper script (does not auto-run motion)

Prepared intent recipe (artist runs when ready):

```bash
cd SWARM
node diagnostics/2026-11-18-mau01-ota-0.3.8/mau01-pilot-intents.mjs
```

The script only prints the exact intents and waits for Enter before each step so you stay in control.

## Safety

- Remote STOP unavailable while Mau01 is autonomous + unlinked (0.3.8 deferral).  
- Prefer the physical cutoff over waiting if motion looks wrong.  
- Do not OTA or command Mau02–Mau09 during this pilot.
