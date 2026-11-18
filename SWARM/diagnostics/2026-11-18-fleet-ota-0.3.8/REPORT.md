# SWARM — Fleet OTA 0.3.8 + nine-module Perform UI prep

**When:** 2026-11-18  
**Scope:** Sequential OTA Mau02–Mau09 to 0.3.8. Mau01 left on 0.3.8. No home / move / execute / STOP.

## OTA results

| Node | Result | Notes |
|------|--------|-------|
| Mau01 | untouched | already 0.3.8, homed @ 0 mm |
| Mau02 | success | NVS keys preserved |
| Mau03 | success | NVS keys preserved |
| Mau04 | success | NVS keys preserved |
| Mau05 | success | NVS keys preserved |
| Mau06 | success | NVS keys preserved |
| Mau07 | success | NVS keys preserved |
| Mau08 | success | NVS keys preserved |
| Mau09 | success | NVS keys preserved |

Binary: `firmware/.pio/build/swarm_s3_4mb_ota/firmware.bin`  
SHA-256: `08afaea6a96b8cc60ff26031cb6820fb0ffbb671fac29cc1332c82d31eb2d910`  
URL: `http://192.168.68.73:8787/firmware.bin` via `POST /api/fw-ota`

Post-OTA: Mau02–Mau09 connected, **UNHOMED**, not moving, no fault (expected).

## Artist run (existing Perform UI only)

1. Take control · Live  
2. **HOME** all nine (manual)  
3. Perform → Wave · Period **240 s** · Autonomous **ON** · Loop **ON** · Continuous **OFF** · Local loop count **3**  
4. **GO TO START** · **EXECUTE LIVE**

No terminal pilot script. Agent does not start motion.
