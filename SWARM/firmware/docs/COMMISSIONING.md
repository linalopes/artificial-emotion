# Swarm v1 — Commissioning (nine ESP32 modules)

Perform **all electrical, identity, Wi-Fi, and OTA checks on the bench before ceiling installation.**

## Hardware checklist (each MauMau)

- [ ] Artificial Emotion Controller v1 PCB + ESP32-S3 Super Mini seated  
- [ ] ULN2003A + 28BYJ-48 connected  
- [ ] Power jumpers JP1/JP2 and polarity verified against the PCB silkscreen  
- [ ] Endstop wired **COM+NC** between Sensor A1 **Signal (GPIO1)** and **GND** (do not short to 3V3)  
- [ ] Confirm GPIO1 reads **LOW** when NC is at rest, **HIGH** when switch opened or cable unplugged  
- [ ] Physically accessible master 5 V cutoff available for the installation  

## Flash and identity

1. Verify flash size (`docs/OTA.md`).
2. Upload:

```bash
cd SWARM/firmware
export PATH="$HOME/.platformio/penv/bin:$PATH"
pio run -e swarm_s3_4mb_ota -t upload --upload-port <port>
pio device monitor --baud 115200
```

3. Confirm boot banner: coils safe, no motion.
4. Assign identity (USB Serial):

```text
set_module_id Mau01
save_config
status
```

Repeat for `Mau02` … `Mau09`. Never duplicate IDs.

5. Configure network:

```text
set_wifi <ssid> <password>
set_coordinator <mac-lan-ip> 8765
set_token <shared-secret>
save_config
```

6. Run mock coordinator on the Mac (`tools/mock_coordinator.py`) and confirm `status` heartbeats for each module id.

## Homing safety (bench)

- Default: `home_open_recovery_enabled = false`.
- If endstop is HIGH at home start, firmware faults until mechanics and release direction are validated.
- Only after validating retract direction and a safe probe distance, enable open recovery via `set_config` and **Save**.
- First homes: low `home_search_max_steps`, low seek RPM, no glass sphere risk if possible.

## Pre-ceiling gate

- [ ] All nine unique IDs online  
- [ ] No duplicate IDs  
- [ ] OTA round-trip proven on each board (or at least one per flash-size class, preferably all)  
- [ ] `stop` priority verified  
- [ ] Power cycle → UNHOMED, no auto spin  
- [ ] Endstop open cable test → not treated as home  

## After ceiling install

1. Power on: all online, UNHOMED, still.  
2. Identify physical grid mapping one module at a time.  
3. Home individually, then as a group.  
4. Expand `max_travel_mm` gradually toward the commissioned safe travel (candidate 1000 mm).  
5. Only then load presets at small amplitude.  

Physical validation of speed, drift, and switch geometry is **not** claimed by this firmware release.
