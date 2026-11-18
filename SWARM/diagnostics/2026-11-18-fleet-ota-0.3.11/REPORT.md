# SWARM — Fleet OTA 0.3.11

**When:** 2026-11-18  
**Scope:** Sequential OTA Mau01–Mau09 to firmware **0.3.11**. No home / move / execute / STOP / commit / push.

## OTA results

| Node | Result | Notes |
|------|--------|-------|
| Mau01 | success | NVS preserved; reconnect **0.3.11**, unhomed |
| Mau02 | success | NVS preserved |
| Mau03 | success | NVS preserved |
| Mau04 | success | NVS preserved |
| Mau05 | success | NVS preserved |
| Mau06 | success | NVS preserved |
| Mau07 | success | NVS preserved |
| Mau08 | success | NVS preserved |
| Mau09 | success | NVS preserved |

Binary: `firmware/.pio/build/swarm_s3_4mb_ota/firmware.bin`  
SHA-256: `39a3bd6238b86a2a136d7aa54cab66c90ff1819e65721d958e2da0305612a936`  
URL: `http://192.168.68.73:8787/firmware.bin` via `POST /api/fw-ota`

Preflight: all nine connected on **0.3.10**, not moving/homing, no fault (`run.phase=idle`).  
Post-OTA: all nine connected on **0.3.11**, **UNHOMED**, not moving, no fault (expected after OTA).

## Perform UI — ready for nine-module acceptance

Existing Perform panel already supports the full test (no UI/choreography changes):

| Setting | Where |
|---------|--------|
| Wave | Perform → Wave |
| Period **120 s** | Period slider (30–300, step 10) |
| Loop **ON** | Loop toggle |
| Autonomous **ON** | “Autonomous on modules…” |
| Continuous local loop **OFF** | Continuous checkbox unchecked |
| Local loop count **3** | Default `autonomousMaxLoops=3` |
| GO TO START → EXECUTE LIVE | Buttons when Live + operator |
| STOP RUN while active | “Stop run” → `cancelRun` |

Agent did **not** home, move, or start choreography.

## Artist physical acceptance (manual)

1. Take control · Live  
2. **HOME** all nine  
3. Perform → Wave · Period **120 s** · Autonomous **ON** · Loop **ON** · Continuous **OFF** · Local loop count **3**  
4. **GO TO START** · **EXECUTE LIVE**  
5. Confirm nine motors moving + telemetry updating  
6. Mac Wi-Fi off ~30 s → motors continue  
7. Mac Wi-Fi on → telemetry resumes, motors still moving  
8. **STOP RUN** → all nine physically stop  

Acceptance = real motion + reconnect + remote STOP — not UI RUNNING alone.
