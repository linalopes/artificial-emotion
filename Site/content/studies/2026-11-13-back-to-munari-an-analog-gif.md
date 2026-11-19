---
title: Back to Munari — An Analog GIF
subtitle: From a hacked clock to a standalone kinetic animation instrument
date: 2026-11-13
slug: back-to-munari-an-analog-gif
lede: Revisiting rotational slit animation through the reusable mechanical framework of MauMau, a stepper motor and a battery-powered Arduino Uno.
status: prototype
threads:
  - kinetic-studies
tags:
  - barrier-grid-animation
  - slit-animation
  - rotational-animation
  - anatomical-heart
  - kinetic-mechanisms
  - stepper-motor
  - 28byj-48
  - arduino
  - maumau
  - paper
  - laser-cutting
related:
  - references/ora-x-bruno-munari
  - references/bruno-munari
  - studies/heartbeat-slit-animation
cover: https://res.cloudinary.com/da1flkgyb/video/upload/so_0/v1794917046/IMG_9918.jpg
gallery:
  - type: video
    src: https://res.cloudinary.com/da1flkgyb/video/upload/v1794917046/IMG_9918.mp4
    poster: https://res.cloudinary.com/da1flkgyb/video/upload/so_0/v1794917046/IMG_9918.jpg
    caption: The standalone rotational heartbeat animation prototype in motion.
draft: false
---

## Question — Back to Munari

Back to Bruno Munari, once again.

The first [Heartbeat Slit Animation](/studies/heartbeat-slit-animation/) experiment began with [Ora X](/references/ora-x-bruno-munari/), a clock that becomes a generator of visual compositions rather than simply an instrument for reading time.

My earlier prototype used the seconds axis of an ordinary quartz wall clock to reveal successive states of an interlaced anatomical heart. I also experimented with a DC motor. This time, I am no longer hacking a clock or relying on a DC motor. I am returning to the same optical principle with a mechanism developed within Artificial Emotion itself: the MauMau framework.

What happens when the speed of a physical animation becomes a parameter that I can program, rather than a property inherited from a clock?

## Setup — From the clock to MauMau

The optical principle remains the same: a stationary image contains interlaced states of an anatomical heart, while a rotating slit mask selectively reveals them. The heart does not physically contract. The movement emerges from the alignment of two layers.

For this iteration, I reused the mechanical framework of [MauMau](https://github.com/linalopes/artificial-emotion/tree/main/kinetic-module-maumau), originally developed as a modular kinetic actuator. Rather than winding and unwinding a line, the rotational movement is used to drive an optical animation.

All my available Artificial Emotion Controller PCBs had been used for [SWARM](https://github.com/linalopes/artificial-emotion/tree/main/SWARM), so I reused an Arduino Uno instead. The motor is a 5 V 28BYJ-48 geared stepper driven by a ULN2003 module. A power bank supplies the prototype, making it independent of a wall outlet during operation.

### Fabrication and mechanical assembly

The earlier printed transparency mask did not provide enough opacity. For this version, I used black 300 gsm cardstock with physically cut radial slits. My vinyl cutter could not handle the material, so I cut the mask with the laser cutter instead.

The assembly is deliberately simple:

- **Fixed heart layer:** I made a 10 mm diameter hole at the center of the encoded image to leave the motor shaft free. I attached the base with hot glue at the motor's mounting screws so that it remains stationary.
- **Rotating black mask:** I cut the central opening to match the shaft profile of the 28BYJ-48 directly. The mask fits onto the motor shaft and rotates above the fixed heart image.
- **Orientation:** The instrument sits at a slight incline. In this configuration, the simple direct-fit attachment has worked well without requiring a more elaborate retaining mechanism.

The two central openings have different functions: the 10 mm hole in the fixed base provides clearance, while the shaped opening in the black mask transmits rotation. Only the upper layer moves.

### Heartbeat Slit Animation Lab

The existing digital lab remains the design and fabrication tool. It separates the frame encoding from the mechanism that drives the mask, allowing the same geometry to be explored with either clock or motor actuation.

::lab{src="/lab/heartbeat-slit-animation/" title="Heartbeat Slit Animation Lab"}

I used the default optical configuration from the lab for this physical prototype: six animation frames and twenty slices per frame. The two central openings were adapted during fabrication to fit the stepper motor.

| Parameter | Lab configuration used |
| --- | --- |
| Animation frames | 6 |
| Slices per frame | 20 |
| Total encoded radial positions | 120 |
| Angular interval between encoded positions | 3° |
| Disc diameter | 120 mm |
| Axle guide diameter | 2 mm (lab default; adapted for the physical mounting) |
| Uncut central bridge diameter | 16 mm |
| Motor preview speed | 2 RPM |
| Heart color | `#C8102E` |

With this geometry at 2 RPM, a full mechanical revolution takes 30 seconds. The pattern repeats 20 times per revolution, giving a theoretical 40 visual animation cycles per minute (one cycle every 1.5 seconds). These are theoretical values for the confirmed encoding and nominal motor speed, not a measured heartbeat rate from the recorded prototype.

The earlier quartz mechanism advanced in discrete 6° ticks. A stepper motor makes it possible to move through much smaller angular increments and to adjust the temporal behavior without redesigning the printed image.

### Firmware — A minimal standalone rotation

The Arduino sketch preserves the motor pin numbering used by the Artificial Emotion Controller v1 and the eight-phase half-step approach. It removes the need for network communication, homing, an endstop and movement choreography: this instrument only needs continuous rotation in one direction.

| ULN2003 | Arduino Uno |
| --- | --- |
| IN1 | D10 |
| IN2 | D11 |
| IN3 | D12 |
| IN4 | D13 |
| GND | Common GND |

The essential configuration of the standalone sketch is:

```cpp
const uint8_t motorPins[] = {10, 11, 12, 13};
const float RPM = 2.0;
const long STEPS_PER_REV = 4096;
const bool CLOCKWISE = true;

const unsigned long STEP_INTERVAL =
    60000000.0 / (RPM * STEPS_PER_REV);
```

The motor advances through an eight-phase half-step sequence. A non-blocking `micros()` timer determines when the next phase is applied:

```cpp
if (now - lastStep >= STEP_INTERVAL) {
  lastStep = now;

  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(motorPins[i], sequence[phase][i]);
  }

  phase = CLOCKWISE ? (phase + 1) % 8 : (phase + 7) % 8;
}
```

These are excerpts rather than a complete sketch. The nominal configuration uses 4096 half-steps per revolution; actual shaft speed depends on the motor's gearbox and timing. The direction flag can be inverted if the physical mounting requires it.

The important change is that the driver now produces a continuous, programmable rotation at a nominal 2 RPM, automatically starting when powered, without a computer or network connection.

## Observation — An analog GIF

<video
  src="https://res.cloudinary.com/da1flkgyb/video/upload/v1794917046/IMG_9918.mp4"
  poster="https://res.cloudinary.com/da1flkgyb/video/upload/so_0/v1794917046/IMG_9918.jpg"
  autoplay muted loop playsinline controls preload="metadata"
></video>

It is working surprisingly well with the power bank, and it is genuinely fun to watch. It feels like an analog GIF.

A GIF usually stores a sequence of images and delegates their playback to a screen. Here, the sequence is encoded spatially into a single physical image. The rotating mask becomes the playback mechanism. Electronics control the tempo, but the image itself is generated optically, without a display.

The repetition is particularly interesting in the context of Artificial Emotion. A mechanical system does not need to reproduce the anatomy or physiology of a heart in order to suggest a living behavior. Here, a single rotational movement is enough to create the perception of contraction and release.

This iteration also reveals something about the value of building reusable mechanisms. MauMau, developed for one kind of movement, can become the basis of a very different instrument. The actuator is no longer tied to a single visual or physical outcome.

## Next

- Explore how different motor speeds change the perceived heartbeat and the character of the animation.
- Test the repeatability of the mechanical alignment, mask opacity and spacing between the two layers.
- Measure the operating time on a single power-bank charge.
- Explore other physical animation loops using the same rotational framework.

The objective is not necessarily to simulate a medically accurate heartbeat. It is to explore how a simple mechanical rule can become a perceptual behavior.

## Acknowledgment

Many thanks to [Ben Anderman](https://www.happyspork.com/home) for helping me get the prototype ready for the open studio: getting it running on the Arduino Uno and setting it up to operate independently from a power bank.

## Sources and related documentation

- [Ora X — Bruno Munari](/references/ora-x-bruno-munari/), Artificial Emotion research notebook.
- [L’Ora X Clock — Museum of Modern Art](https://www.moma.org/collection/works/3696).
- [Heartbeat Slit Animation — first prototype](/studies/heartbeat-slit-animation/).
- [Heartbeat Slit Animation Lab — source parameters](https://github.com/linalopes/artificial-emotion/blob/main/Site/src/lib/slit-animation/types.ts).
- [MauMau kinetic module](https://github.com/linalopes/artificial-emotion/tree/main/kinetic-module-maumau).
- [Artificial Emotion Controller v1](https://github.com/linalopes/artificial-emotion/tree/main/artificial-emotion-controller-v1).
- [Prototype video — studio documentation](https://res.cloudinary.com/da1flkgyb/video/upload/v1794917046/IMG_9918.mp4).
