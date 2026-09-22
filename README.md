# Artificial Emotion — Kinetic Module

This repository documents **Mau Mau**, the first kinetic research unit of *Artificial Emotion*: a physical prototype for studying how a small computational system might express itself through movement, rhythm, hesitation, and material tension rather than through screens or language.

It is a working prototype, not the finished installation.

## About Artificial Emotion

*Artificial Emotion* is an artistic research project by **Lina Lopes**, developed during her artist residency at the [Institute for Future Technologies (IFT), De Vinci Higher Education](https://ift.devinci.fr/about), in Paris.

The project investigates the space between artificial intelligence, physiological sensing, mechanical behavior, embodied interaction, and material systems — and what humans interpret as emotional or living behavior.

A broader question behind the work is:

> What happens when a computational system is not only represented through screens, data, or language, but begins to express itself through physical rhythm, movement, hesitation, repetition, tension, and bodily behavior?

The heart and heartbeat belong to that wider research context. The project is also looking at ways of listening to and measuring the heart — including modalities such as ECG, PPG, PCG, pulse, and HRV — and at how physiological signals might later be translated into physical or kinetic behavior.

**This repository does not implement heartbeat sensing.** The kinetic module is not currently heartbeat-controlled. Physiological sensing belongs to the broader *Artificial Emotion* research and may later become an input to the kinetic system.

## Why a Kinetic Module?

The final physical architecture of *Artificial Emotion* is still open.

One current hypothesis is an installation made from approximately 6–8 independent kinetic modules. That is a research direction, not a decision. The eventual work could instead use several independent motorized units, coordinated repeated actuators, fewer motors controlling multiple lines, a more centralized mechanical architecture, or another arrangement discovered through prototyping.

This repository exists to develop **one reproducible mechanical module** first:

1. build a physical research unit
2. understand its movement
3. solve its fabrication
4. understand line management
5. test homing and limits
6. prototype electronics and control
7. learn from the physical behavior
8. only then decide how a larger installation should scale

## Current Prototype

The current module investigates a simple vertical actuation chain.

```text
28BYJ-48 stepper motor
        ↓
   custom spool
        ↓
 braided fishing line
        ↓
    guide pulley
        ↓
 vertical moving / suspended element
        ↓
   home / endstop
```

The spool attaches directly to the 28BYJ-48 shaft. The guide pulley redirects the fishing line into the vertical path. A microswitch provides a mechanical home / endstop reference. A future sliding-tube / flange mechanism is intended to interact with that switch for homing; that mechanism is not finished in this repository.

## Repository Structure

```text
kinetic-module-maumau/
├── box-lasercutting.3dm
├── box-lasercutting.gh
├── spool-3dprinting.3dm
├── spool-3dprinting.gh
├── spool.stl
└── ELECTRONICS/
    ├── Arduino-motor-test/
    │   └── Arduino-motor-test.ino
    └── PCB mau-mau/
        ├── mau-mau.kicad_pro
        ├── mau-mau.kicad_sch
        ├── mau-mau.kicad_pcb
        ├── fp-lib-table
        ├── esp32-s3-supermini.kicad_sym
        └── esp32-s3-supermini.pretty/
            └── ESP32-S3_SuperMini_THT.kicad_mod
```

Mechanical design is authored in **Rhino 8** and **Grasshopper**. Electronics include bench-test firmware and an experimental KiCad project.

## Mechanical Design

### Enclosure

Sources: `box-lasercutting.3dm`, `box-lasercutting.gh`

The Grasshopper definition develops a parametric laser-cut enclosure for the kinetic module.

Current prototype dimensions are approximately:

| | |
|---|---|
| Width | 100 mm |
| Height | 80 mm |
| Depth | 60 mm |
| Material | 3 mm sheet |

The enclosure is designed without glue, using mechanical joints and captive-nut T-slot construction.

Current parts:

- Top
- Bottom
- Left
- Right
- Internal Divider
- Microswitch Bracket

There is no external Back panel in the current design. The front and rear remain open.

The Top is designed to sit flush against a ceiling and includes four M5 clearance holes for ceiling attachment.

The Internal Divider is the mounting plane for the motor and guide pulley. Viewed from the open front:

- the 28BYJ-48 body sits behind the Divider
- the shaft projects through the Divider toward the front
- the spool sits on the shaft in front of the Divider

The definition also contains a fabrication pipeline: assembled 3D preview, 2D laser-cut profiles, CUT / ENGRAVE separation, part IDs, parametric laser-bed dimensions, multi-sheet placement, and experimental true-outline nesting. Current bed presets include 600 × 400 mm, 900 × 600 mm, and Custom.

**The repository currently contains the Rhino / Grasshopper sources only.** Ready-to-cut SVG or DXF exports are not committed.

The Bottom includes a parametric guide-hole for a future sliding-tube mechanism. That relationship is still being tuned and should not be treated as a finished mechanical assembly.

### Spool

Sources: `spool-3dprinting.3dm`, `spool-3dprinting.gh`  
Export: `spool.stl`

The spool is a custom parametric part designed to attach directly to the 28BYJ-48 output shaft using a double-flat profile.

Current approximate dimensions:

| | |
|---|---|
| Core diameter | 15 mm |
| Core width | 5 mm |
| Flange diameter | 24 mm |
| Flange thickness | 1.8 mm |
| Exported STL envelope | approximately 24 × 24 × 8.6 mm |

The Grasshopper definition also includes shaft tolerance, insertion depth, motor-side flange transition, fishing-line diameter, and a parametric line-anchor hole (radial and angular position). The current line used during prototyping is approximately 0.24 mm braided fishing line. The anchor is a localized through-hole in the flange opposite the motor-side flange.

`spool.stl` is older than the current Rhino / Grasshopper sources (export dated 2026-09-18; sources updated 2026-09-22). Regenerate the STL from the current definition before treating the mesh as the latest version.

## Electronics

The project currently contains two related electronics approaches. They should not be confused.

### 1. Prototype wiring

The currently tested prototype uses a ready-made ULN2003 driver module with:

- ESP32-S3 Super Mini
- ULN2003 driver module
- 28BYJ-48 5 V stepper
- KW11-style microswitch
- 5 V power

Tested pin mapping:

| ESP32-S3 | Function |
|---|---|
| GPIO4 | ULN2003 IN1 |
| GPIO5 | ULN2003 IN2 |
| GPIO6 | ULN2003 IN3 |
| GPIO7 | ULN2003 IN4 |
| GPIO8 | home switch (INPUT_PULLUP, active LOW) |

This is the wiring assumed by the bench-test firmware.

### 2. Experimental custom PCB

`kinetic-module-maumau/ELECTRONICS/PCB mau-mau/` is a KiCad experiment named **mau-mau**. It explores integrating the ESP32-S3 Super Mini, a bare ULN2003 DIP-16, a +5 V / GND screw-terminal input, and a power-indicator LED with series resistor onto a small custom board (approximately 40 × 42 mm).

The board includes a custom symbol and through-hole footprint for the ESP32-S3 Super Mini. Silkscreen on the layout reads *Kinetic Module / Mau Mau / by Lina Lopes*.

**This PCB is not a production controller.** In the current KiCad files:

- ULN2003 outputs are not brought to a motor connector
- GPIO8 / the home-switch input is not exposed
- Gerbers, drill files, and a BOM export are not present

Treat it as an experimental alternative to the ready-made ULN2003 module, still in progress.

## Firmware

File: [`kinetic-module-maumau/ELECTRONICS/Arduino-motor-test/Arduino-motor-test.ino`](kinetic-module-maumau/ELECTRONICS/Arduino-motor-test/Arduino-motor-test.ino)

This is bench-test firmware for the prototype wiring above. It is not installation firmware.

It currently tests:

- 28BYJ-48 movement through a ULN2003
- half-step coil sequencing
- motion in both directions (8 seconds each way, with a pause between)
- home-switch detection on GPIO8
- motor release when idle or when the switch is triggered

Pin map in the sketch:

```text
IN1      = GPIO4
IN2      = GPIO5
IN3      = GPIO6
IN4      = GPIO7
HOME_PIN = GPIO8
```

## Current Hardware

| Item | Role in the current prototype |
|---|---|
| ESP32-S3 Super Mini | microcontroller |
| 28BYJ-48, 5 V | geared stepper motor |
| ULN2003 | motor driver (ready-made module in the tested prototype; DIP-16 on the experimental PCB) |
| KW11-style microswitch | mechanical home / endstop |
| V-groove guide pulley (~3 mm bore, 12 mm OD, 4 mm width) | redirects the line into the vertical path |
| 5 V power supply | motor and logic supply |
| Braided fishing line (~0.24 mm) | actuation line |
| 3 mm sheet material | laser-cut enclosure and microswitch bracket |
| Custom 3D-printed spool | couples the motor shaft to the line |

Motor dimensions currently used as mechanical reference: body Ø28 × ~19 mm; mounting holes Ø4 mm at 35 mm centers; shaft/boss axis offset 8 mm from the mounting-ear / body centerline; boss Ø9 mm; nominal shaft Ø5 mm with an approximately 3 mm flat.

The guide pulley is mounted on the front of the Internal Divider with an M3 screw. Its exact position remains parametric.

The microswitch bracket is laser-cut from the same 3 mm sheet. Current assembly, from the open front: bracket → microswitch body → Internal Divider. The roller remains accessible to a future vertical sliding mechanism.

## Fabrication

### 3D printing

The spool is the 3D-printed part. Sources are `spool-3dprinting.3dm` and `spool-3dprinting.gh`. An STL export is present as `spool.stl`; re-export from the current definition before printing if you need the latest geometry.

### Laser cutting

The enclosure and microswitch bracket are designed for 3 mm sheet. Sources are `box-lasercutting.3dm` and `box-lasercutting.gh`. Cut-ready SVG or DXF files are not currently in the repository; they need to be exported from the Grasshopper definition.

### PCB

The experimental `mau-mau` KiCad project can be opened from `kinetic-module-maumau/ELECTRONICS/PCB mau-mau/`. Production fabrication outputs (Gerbers, drill files, BOM) are not committed.

## Status

**Current status: active research prototype.**

Represented now:

- parametric laser-cut enclosure
- parametric 3D-printed spool
- motor-test firmware
- experimental KiCad PCB

Still evolving:

- sliding-tube / flange homing mechanism
- final pulley, guide-hole, and switch relationship
- fabrication exports (laser SVG/DXF; current spool STL)
- production firmware
- finalized controller PCB
- physiological sensing / heartbeat interface
- module count
- larger installation architecture

## Design Philosophy

The repository uses parametric fabrication and modular prototyping on purpose. Motor offset, line path, pulley position, switch placement, and enclosure joints are treated as relationships that can still move as the artistic research develops. One physical unit is being made understandable before the larger work is locked.

## Credits

**Lina Lopes**  
Artist / researcher

*Artificial Emotion*

Artist residency:  
[Institute for Future Technologies (IFT)](https://ift.devinci.fr/about)  
De Vinci Higher Education  
Paris, France

[De Vinci Foundation](https://foundation.devinci.fr/)
