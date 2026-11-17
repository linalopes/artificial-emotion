# SWARM OTA deployment — firmware 0.3.7

**When:** 2026-11-17T09:18–09:20Z  
**Binary:** `firmware.bin` 931472 bytes, string `0.3.7`, fits OTA slot `0x1C0000`  
**Staging:** `http://192.168.68.73:8000/firmware.bin`  
**No home / move / clear-fault / NVS erase / commit / push.**

## Preflight

- All nine connected on **0.3.6**, `track_infeasible`, idle, telemetry RPM **15**
- Coordinator codec maps `loop_boundary` (`firmware-codec.ts` / `protocol.ts`)
- OTA allowed from FAULT (`canOta`); prior `track_infeasible` not auto-cleared by `/api/fw-ota`

## Results

| Node | OTA | fw | connected | fault | homed | moving | rpm | NVS speed / home_seek |
|---|---|---|---|---|---|---|---|---|
| Mau01 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |
| Mau02 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |
| Mau03 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |
| Mau04 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |
| Mau05 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |
| Mau06 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |
| Mau07 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |
| Mau08 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |
| Mau09 | success | 0.3.7 | true | none | false | false | 15 | 15 / 15 |

Evidence: `ota-0.3.7-results.jsonl`, `ota-0.3.7-summary.json`.

## Notes

- Post-OTA reboot leaves modules **unhomed** (expected); leave stationary until operator clear + single home cycle.
- `steps_per_mm` remains **86.91982** (15 mm spool) on sampled NVS.
- `loop_boundary` telemetry is in firmware and mapped by the running coordinator codec (field appears once a boundary/incomplete event is recorded).
