# CLEAR FAULT acknowledged but FAULT persists

## Root cause (confirmed)

1. After `track_infeasible`, a fleet **stop** called `operatorStop()` → `setStopping()` even while `state_ == Fault`, leaving **`fault_ = track_infeasible`** while state became **STOPPING → UNHOMED**.
2. Firmware `clearFault()` only ran when `state_ == Fault`, so it was a **no-op** on the desynced modules.
3. The handler still **ACK’d** `fault cleared; re-home required`.
4. UI treated ACK as success (`…: acknowledged`) while status kept advertising `fault=track_infeasible` → sticky FAULT, HOME disabled.

ACK ≠ cleared. Telemetry still showed the latched fault string.

## Fix

**Firmware (source; needs OTA to land on ESP32):**
- `clearFault()` clears whenever `fault_ != None` (or state FAULT) → always **UNHOMED**, never validates position.
- `setStopping()` refuses to leave FAULT; `operatorStop()` leaves FAULT alone.

**Coordinator (live now on `:8787`):**
- `telemetryFromStatus`: surface `faultCode` only when `state === 'FAULT'` (masks 0.3.5 sticky fault after stop desync).
- `clearFault` intent waits for telemetry with no fault and not homed before reporting success.
- UI copy: `confirmed UNHOMED (re-home required)`.

## Verification (2026-11-16)

- Unit: firmware-codec + coordinator tests **34/34** (incl. sticky-fault codec + clear→UNHOMED).
- Live after coordinator restart: **Mau01–Mau09** report **no fault**, **unhomed**, position invalid — **HOME selectable**.
- No automatic home / GO TO START / clear-all. Browser held operator so remote clear Mau01 was skipped; UI recovery already UNHOMED via codec mask.
- Firmware 0.3.5 on modules still has the source bug until OTA of this tree.

## Mau02–Mau09

Same cause. Coordinator mask recovers all nine for HOME. Full on-module `fault_` clear still wants the firmware patch (or a successful home, which calls `setReady()` and clears `fault_`).
