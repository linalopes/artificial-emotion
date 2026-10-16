---
title: MauMau — First Parametric Enclosure
subtitle: From an intuitive cardboard box to a laser-cut kinetic module
date: 2026-09-26
slug: maumau-first-parametric-enclosure
lede: The first fabricated MauMau enclosure translated an intuitive cardboard prototype into a parametric, laser-cut acrylic module with removable mechanical joints and dedicated mounting for the kinetic system.

status: prototype

threads:
  - kinetic-studies
tags:
  - maumau
  - kinetic-module
  - laser-cutting
  - acrylic
  - parametric-design
  - grasshopper
  - raven
  - t-slot
  - mechanical-connections
  - 28byj-48
  - rapid-prototyping
  - m3
  - braided-line
related:
  - studies/two-hours-to-a-first-kinetic-prototype
  - studies/maumau-spool-first-parametric-prototype
  - notes/raven

cover: https://res.cloudinary.com/da1flkgyb/image/upload/v1791875303/IMG_6052.webp
gallery:
  - type: image
    src: https://res.cloudinary.com/da1flkgyb/image/upload/v1791873734/Screenshot_2026-09-26_at_15.49.31.webp
    alt: MauMau enclosure geometry being prepared digitally for laser cutting
    caption: Preparing the first parametric MauMau enclosure for fabrication.
  - type: video
    src: https://res.cloudinary.com/da1flkgyb/video/upload/v1791875262/IMG_6042.mp4
    caption: Assembling the laser-cut acrylic enclosure with mechanical joints.
  - type: video
    src: https://res.cloudinary.com/da1flkgyb/video/upload/v1791875306/IMG_6051.mp4
    caption: Testing the assembled MauMau enclosure and internal component placement.
  - type: image
    src: https://res.cloudinary.com/da1flkgyb/image/upload/v1791875303/IMG_6052.webp
    alt: First assembled laser-cut acrylic MauMau kinetic module enclosure
    caption: The first assembled MauMau enclosure.
  - type: image
    src: https://res.cloudinary.com/da1flkgyb/image/upload/v1791875304/IMG_6053.webp
    alt: Detail of the first MauMau acrylic enclosure and internal mounting structure
    caption: Detail of the internal structure and mounting arrangement.

draft: false
---

## Question

How can the intuitive cardboard MauMau prototype become a repeatable fabricated module without losing the speed and flexibility of the first experiment?

The first MauMau enclosure had been made almost directly from the material at hand.

Two strips of cardboard were folded into opposing U-shaped profiles, joined into a box and adjusted by eye. Its dimensions emerged from the cardboard itself rather than from a predefined drawing.

That was useful for discovering the mechanism.

The next step was different: I wanted a version that could be **fabricated again, disassembled, modified and eventually combined with other modules**.

## From cardboard to a fabrication system

The acrylic version began by translating the cardboard box into a more explicit mechanical structure.

Instead of folding a sheet around the mechanism, the enclosure became a set of laser-cut faces joined mechanically.

I wanted to avoid glue.

The module needed to be something I could open again, replace a motor inside, change a bracket, adjust a pulley or remake only one face without rebuilding the whole object.

This led to **T-slot joints with captive nuts and screws** as the main construction logic.

The internal divider also became more deliberate. It provided a mounting plane for the **28BYJ-48 stepper motor** and for the elements that would eventually guide the fishing line and establish the mechanical end of travel.

At this point, the enclosure was no longer only a box around a motor.

It was beginning to organise relationships between components.

## Drawing before parametrising

I first worked through the enclosure on paper.

The drawing was useful for understanding the sequence of faces, where the internal divider should sit, how parts should overlap and where removable connections would be necessary.

Only after that did I move into **Grasshopper**, using **Raven** to help construct and revise the parametric definition.

This changed the nature of the design.

Dimensions, offsets, tabs, joints and component positions could become relationships rather than fixed coordinates.

The enclosure could now be adjusted without redrawing every face independently.

That was especially important because MauMau was still changing.

The motor, spool, guide pulley, endstop and line path were all being developed at the same time.

A parametric enclosure meant the container could change with the mechanism rather than becoming a constraint too early.

## Designing for assembly

Several decisions in this first version were already shaped by assembly rather than appearance.

The enclosure used separate laser-cut faces.

Mechanical joints replaced permanent glue.

The motor was mounted on an internal divider rather than directly on the outside shell.

Dedicated brackets were introduced for components such as the endstop.

Open access to the mechanism remained important because this was still a research prototype.

This made the object visibly different from the cardboard version.

The cardboard prototype had been designed through immediate manipulation.

The acrylic prototype was designed through **relationships, tolerances and assembly logic**.

Both were rapid prototypes, but they answered different questions.

## Fabrication

The Grasshopper geometry was baked into Rhino and exported as SVG for laser cutting.

For this first fabrication pass, the parts were arranged manually for the available sheet material before being sent to the **xTool P2S**.

The laser-cut faces were then assembled using the T-slot connections.

This was the first moment when MauMau existed as a reproducible fabricated object rather than as a one-off cardboard construction.

The enclosure could be taken apart again.

Individual faces could be modified.

The same parametric definition could generate another version.

::model{src="kinetic-module-maumau/DESIGNS/archive/box-3d-assembly.glb" title="MauMau Acrylic Enclosure" caption="First parametric 3D assembly of the laser-cut MauMau kinetic module."}

**Design files:**

- **3D assembly — Grasshopper:** [View / download definition](https://github.com/linalopes/artificial-emotion/blob/main/kinetic-module-maumau/DESIGNS/archive/box-3d-assembly.gh)
- **Laser-cut enclosure — SVG:** [View / download cutting file](https://github.com/linalopes/artificial-emotion/blob/main/kinetic-module-maumau/DESIGNS/archive/box-lasercutting.svg)

## Observation — 26 September 2026

By the end of this fabrication session, the first MauMau enclosure was physically assembled.

The motor and internal structure could be positioned as intended, and the transition from the cardboard study to a laser-cut parametric module was working mechanically.

One important element was still missing:

**the guide pulley had not arrived yet.**

Without it, I could not complete the intended path from the motor-mounted spool to the vertically moving line.

So this version could already test:

- enclosure fabrication;
- T-slot assembly;
- access to internal components;
- motor placement;
- divider geometry;
- removable mechanical connections;
- the relationship between the parametric definition and the physical object.

But it could not yet test the complete kinetic chain.

That distinction mattered.

The enclosure existed.

The movement system was not yet complete.

## What this prototype established

The first acrylic MauMau module established a fabrication language for the kinetic system.

The project had moved from an intuitive cardboard volume toward a structure that could be described, regenerated and altered parametrically.

It also made clear that the enclosure was not secondary to the mechanism.

The positions of the motor, spool, pulley, line and endstop depend on the enclosure, while the enclosure itself has to respond to those components.

Designing MauMau therefore became less about making a container and more about designing a **small mechanical architecture**.

---

## Update — 2 October 2026

The guide pulley arrived and could finally be installed.

With the pulley in place, the fishing line could leave the motor-mounted spool, change direction and continue into the intended vertical path.

This completed the basic actuation chain:

**28BYJ-48 stepper motor → spool → braided fishing line → guide pulley → vertical movement**

For the first time, the laser-cut MauMau module could be tested as a functioning kinetic unit rather than only as an enclosure.

The test confirmed that the physical architecture developed in the September prototype could support the intended movement.

It also shifted the next questions away from whether the module could move at all and toward how reliably that movement could be controlled: line management, homing, limits, load, speed and the behaviour of the suspended element.

The first MauMau design was no longer only a fabricated structure.

It had become a working kinetic module.

<video
  src="https://res.cloudinary.com/da1flkgyb/video/upload/v1790891129/IMG_6106.mp4"
  autoplay
  muted
  loop
  playsinline
  preload="metadata"
  style="width: 100%; height: auto;"
></video>
>