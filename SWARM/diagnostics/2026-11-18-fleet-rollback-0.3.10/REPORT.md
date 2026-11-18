# SWARM — Fleet rollback to 0.3.10

**When:** 2026-11-18  
**Reason:** 0.3.11 confirmed unexpected reboot / homing-loss regression.  
**Scope:** Sequential OTA Mau01–Mau09 → **0.3.10**. No HOME / move / execute / STOP / commit / push.  
**0.3.11 source** left in working tree (`platformio.ini` still `0.3.11`); binary rebuilt from git commit `39c4214` in a detached worktree.

## Binary

| Item | Value |
|------|--------|
| Source | Git `39c4214` — *Ship firmware 0.3.10 still-linked WS deferral…* (unmodified) |
| Version string in image | **0.3.10** (no `0.3.11`, no `ws_net_isolated`) |
| Size | 932816 B (matches prior fleet-ota-0.3.10 size) |
| SHA-256 (this rebuild) | `b0db5277568de873a38d1e0b243af6c1ffdff792a811869141837cbc8b1fb1e9` |
| Historical OTA artifact SHA | `8513d571…` — **not on disk**; rebuild is bit-different (non-reproducible toolchain) but same commit/source |
| Served URL | `http://192.168.68.73:8787/firmware.bin` |
| Preserved 0.3.11 bin | `firmware-0.3.11-preserved.bin` (`39a3bd62…`) |

## OTA results

| Node | Result |
|------|--------|
| Mau01–Mau05 | success (first pass); NVS preserved |
| Mau06 | first attempt aborted at pre-config (no ack — 0.3.11 flaky); **resumed success** |
| Mau07–Mau09 | success on resume; NVS preserved |

Post-rollout: all nine **connected**, **fw 0.3.10**, **idle**, **no fault**, **unhomed** (expected after OTA).

## Stability observe (~75 s, no motor cmds)

- **Disconnect events:** 0  
- **wsAtt / wsDisc:** stable at `1` / `0` on all nine (no counter-reset reboot pattern)  
- Evidence: `post-rollback-observe.json`

## Notes

- Working-tree firmware **source** remains 0.3.11 for later investigation; served/deployed image is 0.3.10.  
- Artist still needs to **HOME** manually before any choreography (not done here).
