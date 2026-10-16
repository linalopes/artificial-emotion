# Artificial Emotion Controller v1

A modular, ESP32-S3-based motor controller designed by Lina Lopes for the **Artificial Emotion** research project.

The controller drives one 28BYJ-48 5V stepper motor and provides sensor interfaces for interactive kinetic experiments.

The first version prioritizes manual assembly, prototyping, and repairability.

## 1. Hardware Architecture

### Microcontroller

- ESP32-S3 SuperMini
- USB-C programming interface
- Integrated onboard LEDs
- Removable module mounted on pin sockets
- Battery functionality reserved for a future revision

### Motor Control

- ULN2003A, DIP-16
- One 28BYJ-48 5V unipolar stepper motor
- 5-pin JST-XH motor connector
- Four optional motor-phase indicator LEDs, each with a 2.2kΩ resistor

The motor-phase LEDs are independent indication circuits. The motor operates normally if the LEDs and their resistors are not installed.

## 2. Sensor Interfaces

The controller provides five general-purpose sensor connections organized into two banks, plus a dedicated I²C interface.

### Bank A — 3.3V Sensors

Four 3-pin male headers, 2.54mm pitch.

| Port | GPIO | Connections |
|---|---|---|
| A1 | GPIO1 | Signal / 3V3 / GND |
| A2 | GPIO2 | Signal / 3V3 / GND |
| A3 | GPIO4 | Signal / 3V3 / GND |
| A4 | GPIO5 | Signal / 3V3 / GND |

These inputs support analog and digital sensors operating with 3.3V-compatible signals.

### Bank B — 5V Sensor

One 3-pin male header, 2.54mm pitch.

| Port | GPIO | Connections |
|---|---|---|
| B1 | GPIO6 | Signal / 5V / GND |

The signal is connected to the ESP32-S3 through a voltage divider:

- 10kΩ series resistor
- 15kΩ resistor to GND
- 5V input signal reduced to approximately 3V

This interface is intended for 0–5V analog signals and suitable digital inputs, not arbitrary 5V digital communication protocols.

### Bank C — I²C

One 4-pin male header, 2.54mm pitch.

| Function | Connection |
|---|---|
| SDA | GPIO8 |
| SCL | GPIO9 |
| Power | 3V3 |
| Ground | GND |

## 3. GPIO Assignment

| GPIO | Function |
|---|---|
| GPIO1 | Sensor A1 |
| GPIO2 | Sensor A2 |
| GPIO4 | Sensor A3 |
| GPIO5 | Sensor A4 |
| GPIO6 | Sensor B1 (5V sensor signal via divider) |
| GPIO7 | USER button |
| GPIO8 | I²C SDA |
| GPIO9 | I²C SCL |
| GPIO10 | Motor IN1 |
| GPIO11 | Motor IN2 |
| GPIO12 | Motor IN3 |
| GPIO13 | Motor IN4 |

GPIO3 is not assigned. TX and RX remain unused.

## 4. User Interface

### USER Button

- Momentary normally-open tactile switch
- Connected between GPIO7 and GND
- Uses the ESP32-S3 internal pull-up resistor
- Silkscreen label: `BTN · IO7`

### Indicator LEDs

- Four optional motor-phase LEDs
- One external 5V power indicator LED
- ESP32-S3 onboard LEDs remain available

## 5. Power Architecture

The first revision uses an external regulated 5V DC supply.

### External Power

- Two-position screw terminal
- Shared GND
- JP1: external 5V to ESP32
- JP2: external 5V to motor
- 100µF electrolytic bulk capacitor
- 100nF ceramic decoupling capacitor

The jumpers allow the motor and ESP32 to be powered independently during testing.

**USB-C and external 5V must not be connected simultaneously with JP1 closed until the power-path behavior is verified.**

### Battery — Future Revision

The ESP32-S3 SuperMini includes battery connection pads, but battery operation is not implemented in this revision.

A future version may include:

- JST battery connection
- 1S LiPo battery
- 5V boost converter for the motor
- Power-source selection and protection

## 6. Construction

Version 1 uses predominantly through-hole technology (THT) to support manual soldering and experimentation.

- THT resistors
- 3mm THT LEDs
- THT capacitors
- THT tactile button
- DIP-16 motor driver
- Male pin headers for sensors and jumpers
- Four PCB mounting holes

## 7. KiCad Project

Project name: `artificial-emotion-controller-v1`

Designed in KiCad 10.

### Project Libraries

The ESP32-S3 SuperMini uses project-local symbol and footprint libraries:

- `esp32-s3-supermini.kicad_sym`
- `esp32-s3-supermini.pretty/`

All other components use standard KiCad libraries.

The project retains:

- `sym-lib-table`
- `fp-lib-table`

The earlier custom `AE.kicad_sym` library is no longer required, provided no remaining schematic symbols reference it.

## 8. Fabrication

The controller is designed as a two-layer PCB for manual component assembly.

Before each manufacturing release:

- [ ] Run ERC
- [ ] Run PCB DRC
- [ ] Check for unconnected nets
- [ ] Confirm footprints and component dimensions
- [ ] Verify motor connector pin order
- [ ] Review silkscreen, polarity markings, and mounting holes
- [ ] Inspect Gerber and Excellon drill files

The first version does not include battery circuitry or the 5V boost converter.

---

**Artificial Emotion Controller v1**
Designed by Lina Lopes
2026

Part of the Artificial Emotion research project.
