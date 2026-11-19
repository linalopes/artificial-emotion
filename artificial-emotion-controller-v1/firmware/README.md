# Artificial Emotion Controller v1 — Firmware

Two standalone Arduino sketches for the same controller hardware. No Wi-Fi or external Arduino libraries are required. The SWARM network firmware is maintained separately.

## Structure

```text
artificial-emotion-controller-v1/
└── firmware/
    ├── README.md
    ├── motion-test/
    │   └── motion-test.ino
    └── maumau/
        └── maumau.ino
```

Each sketch uses a matching folder and filename for Arduino IDE compatibility.

## Hardware

ESP32-S3 Super Mini, ULN2003A and 5 V 28BYJ-48 geared stepper motor. Both sketches use the eight-phase half-step sequence and a nominal 4096 half-steps per output revolution.

| Function | GPIO |
|---|---|
| ULN2003 IN1–IN4 | 10, 11, 12, 13 |
| USER button (active LOW) | 7 |
| Endstop signal (internal pull-up) | 1 |

Connect the switch between signal and GND only; leave the middle supply pin unused. Consult the PCB silkscreen and schematic before wiring. Use a suitable 5 V motor supply and common ground.

## Motion Test V2

General-purpose bench and kinetic experiments. The original sketch is unchanged. It starts in continuous CW at 2 RPM when the optional normally-open switch is inactive. USER cycles through the three motion modes. Serial at 115200 baud: `1` continuous CW, `2` continuous CCW, `3` alternating 360° legs, `0` stop/release, `?` menu. The optional COM+NO switch stops motion when closed; a disconnected switch is not detected.

## MauMau v1.0.0 — commissioning firmware

Dedicated standalone module firmware. COM+NC endstop is mandatory: LOW means closed; HIGH means open, triggered or disconnected. Automatic homing on power-up is allowed only with a closed contact. An open contact at boot inhibits movement; inspect wiring and manually restore a safe position before retrying.

Homing seeks the switch at 1 RPM, stops on opening, confirms the open contact, moves a bounded distance away until the contact closes, then adds clearance. It waits in READY for a USER press. Normal motion oscillates within a bounded step-count range at 2 RPM; no continuous rotation modes are enabled. USER starts, pauses, resumes, aborts homing, or retries homing from FAULT. Serial at 115200 baud: `h` home/retry (only when stationary), `1` start/resume, `0` pause/abort, `?` status. Faults require explicit recovery.

| Parameter | Commissioning default |
|---|---|
| HOME_DIR | -1 (CW mapping inherited from Motion Test; verify physically) |
| MAX_HOME_STEPS | 4096 |
| HOME_TIMEOUT_MS | 70000 |
| MAX_BACKOFF_STEPS | 256 |
| HOME_CLEARANCE_STEPS | 32 |
| TRAVEL_STEPS | 512 (nominal 1/8 output revolution) |

These are uncalibrated starting values, not validated mechanical limits. Verify direction, spool travel, switch clearance and load before use. The output phase remains energized on pause/fault if already energized, to avoid intentionally releasing a suspended load; this does not guarantee load retention and can heat the motor. Power loss releases electrical holding torque. Use independent mechanical retention and accessible power isolation; do not rely on firmware alone for overhead safety. Position is open-loop and can be lost through missed steps or manual movement; re-home after any such event. During homing, an open wire and a triggered switch are indistinguishable until the bounded backoff succeeds or faults. A jumper is not a substitute for the NC switch in MauMau: it prevents homing completion. For bypass experiments use Motion Test with the NO input disconnected.

## Commissioning

1. Select the correct ESP32-S3 board and USB settings in Arduino IDE; upload the selected sketch.
2. Test on a bench without a suspended load. Verify NC reads closed at rest and open when actuated or disconnected.
3. Verify HOME_DIR with a safe starting position and accessible power cutoff. Correct it before normal operation if needed.
4. Test switch activation, backoff, clearance, startup with open input, unplugging during movement, and homing timeout/step limit. Confirm faults do not automatically restart.
5. Measure actual travel and calibrate step limits for the mechanism; test pause/hold temperature and mechanical retention before installing.

Status: Motion Test behavior is documented from the existing source. MauMau is a new draft and has not been compiled for the ESP32-S3 or tested on hardware.
