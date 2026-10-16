# Artificial Emotion Controller v1

A modular, ESP32-S3-based motor controller designed for the **Artificial Emotion** project by Lina Lopes.

The controller drives one 5V 28BYJ-48 stepper motor and provides sensor connections for interactive kinetic experiments.

## Hardware

### Microcontroller
- ESP32-S3 SuperMini
- Project-local symbol and footprint libraries
- USB-C for programming
- Battery integration reserved for a future revision

### Motor Control
- ULN2003A, DIP-16
- One 28BYJ-48 5V stepper motor
- 5-pin JST-XH motor connector
- Four optional motor-phase indicator LEDs

### Sensor Interfaces
- **Bank A:** 3 × 3-pin headers, 5V supply, analog/digital inputs through 10kΩ / 15kΩ voltage dividers
- **Bank B:** 2 × 3-pin headers, 3.3V supply
- **Bank C:** 1 × 4-pin I²C header, 3.3V
- 2.54mm male pin headers for prototyping

The ESP32-S3 GPIOs are not 5V tolerant. Bank A's resistor dividers are intended for 0–5V signals, not arbitrary digital protocols.

### User Interface
- USER pushbutton on GPIO7, using internal pull-up
- Power indicator LED
- Four optional motor-phase LEDs

### Power
- External regulated 5V input through a screw terminal
- JP1: external 5V to ESP32
- JP2: external 5V to motor
- 100µF bulk capacitor
- 100nF ceramic capacitor

**Important:** USB-C and external 5V must not be connected simultaneously with JP1 closed until the power-path behavior has been validated.

Battery charging and 5V boost conversion are not implemented in v1.

## Construction

The first revision prioritizes through-hole (THT) components for manual assembly, repair, and experimentation.

- Two-layer PCB
- Through-hole resistors, LEDs, capacitors, connectors, and button
- DIP-16 ULN2003A
- ESP32-S3 SuperMini module

## KiCad Libraries

The project uses KiCad 10.

The ESP32-S3 SuperMini uses project-local custom libraries:

- `esp32-s3-supermini.kicad_sym`
- `esp32-s3-supermini.pretty/`

Other components use standard KiCad symbol and footprint libraries.

The original custom library `AE.kicad_sym` may be removed **after confirming that no symbols in the current schematic reference `AE:`**.

## Before Fabrication

- [ ] Run ERC and resolve relevant errors and warnings
- [ ] Run PCB DRC and verify all connections
- [ ] Verify footprint-to-component compatibility
- [ ] Confirm motor connector pin order
- [ ] Verify power distribution and USB/external power isolation
- [ ] Inspect Gerber and drill files
- [ ] Review silkscreen and mounting holes

## Project

**Artificial Emotion Controller v1**
Designed by Lina Lopes
2026

Part of the Artificial Emotion research project.
