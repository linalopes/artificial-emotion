# SWARM — Fleet OTA 0.3.10

**When:** 2026-11-18  
**Scope:** Sequential OTA Mau01–Mau09 to firmware **0.3.10**. No home / move / execute / STOP / commit / push.

## OTA results

| Node | Result | Notes |
|------|--------|-------|
| Mau01 | success | NVS preserved; reconnect ~0.3.10 |
| Mau02 | success | NVS preserved |
| Mau03 | success | NVS preserved |
| Mau04 | success | NVS preserved |
| Mau05 | success | NVS preserved |
| Mau06 | success | NVS preserved |
| Mau07 | success | NVS preserved |
| Mau08 | success | NVS preserved |
| Mau09 | success | NVS preserved |

Binary: `firmware/.pio/build/swarm_s3_4mb_ota/firmware.bin`  
SHA-256: `8513d57105bee65f927c7fc3b8358802db9bfe9494ef608e0b79e0a6d3d5d379`  
URL: `http://192.168.68.73:8787/firmware.bin` via `POST /api/fw-ota`

Preflight: all nine connected, not moving/homing, no fault (`run.phase=finished`).  
Post-OTA: all nine connected on **0.3.10**, **UNHOMED**, not moving, no fault (expected after OTA).

## UI — stale telemetry during autonomous WS suppress (inspect only)

With 0.3.10, while an autonomous run is `Running`, modules stop `ws_.loop()` / `sendTXT` but may keep the TCP session open → coordinator often still shows **`connected: true`**.

| Surface | Behavior |
|---------|----------|
| Stage / 3D spheres | Continues plotting last `positionMm`; CSS transition still smooths. **Looks live while frozen.** |
| `positionText` | Appends `(last known)` **only when offline**. While connected, shows bare mm with no stale marker. |
| ControlPanel note | “No telemetry…” **only if `!connected`**. Connected + silent → normal “estimated from step count” copy. |
| SystemTable “Last telemetry” | Uses `agoText(lastTelemetryAtMs)`: **“just now” for &lt;60 s**, then “N min ago”. First minute of silence is especially misleading. |
| Status / moving | Last `moving`/`state` stick until a new status arrives or the socket drops. |

**Verdict:** Yes — stale positions can misleadingly appear live during autonomy (and during half-open Mac Wi-Fi loss while the link flag stays true). No UI redesign in this pass. Artist validation must use **physical motion / ULN LEDs**, not Stage positions alone.

## Artist 3-loop Wave (manual)

1. Take control · Live  
2. **HOME** all nine (manual)  
3. Perform → Wave · Period **240 s** · Autonomous **ON** · Loop **ON** · Continuous **OFF** · Local loop count **3**  
4. **GO TO START** · **EXECUTE LIVE**  
5. After motion is visible: Mac Wi-Fi off for several minutes — expect **physical motion to continue**  
6. Physical cutoff remains emergency stop (remote STOP unavailable while autonomy defers WS I/O)

Agent did **not** home, move, or start choreography.
