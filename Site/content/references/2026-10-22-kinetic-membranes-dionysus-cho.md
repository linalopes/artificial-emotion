---
title: Kinetic Membranes
date: 2026-10-22
slug: kinetic-membranes-dionysus-cho
creator: Dionysus Cho
year: c. 2012–2013 (exact completion date unconfirmed)
referenceType: artwork
lede: An early interactive textile installation by Dionysus Cho, developed at Yale School of Architecture, in which motor-driven cables transform stretched nylon membranes into changing three-dimensional volumes.
url: https://dionysus.works/project/kinetic-membranes/
cover: https://dionysus.works/wp-content/uploads/2021/03/dionysus_kinetic_manual-1536x1152.jpg
gallery: []
threads:
  - soft-mechanisms
tags:
  - kinetic-membranes
  - textile
  - nylon
  - tensile-structures
  - tension
  - servo-motors
  - arduino
  - grasshopper
  - kangaroo
  - kinect
  - interactive-installation
related:
  - studies/a-membrane-under-tension
draft: false
---

_Photo: Dionysus Cho website. [Source](https://dionysus.works/project/kinetic-membranes/)_

# Kinetic Membranes — Fabric as a Moving Spatial Structure

**Artist / designer:** [Dionysus Cho](https://dionysus.works/)  
**Project:** [Kinetic Membranes](https://dionysus.works/project/kinetic-membranes/)  
**Context:** Yale School of Architecture, *Design Reconnaissance* course  
**Period:** approximately 2012–2013; the exact project completion date has not been verified. A video of the work was cited as published on January 9, 2013 in a later architectural bibliography, but that does not independently establish the fabrication date.  

<iframe width="100%" height="400" src="https://www.youtube.com/embed/qskPHo-4xcw" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>


## Who is Dionysus Cho?

Dionysus Cho works across architecture, interaction design, design research, visual media and software engineering. His practice is interdisciplinary: rather than separating spatial design from electronics and computation, his projects often investigate how a technical system can produce a physical or perceptual experience.

He studied architecture at the University of Waterloo (Honours Bachelor of Architectural Science, 2006–2011) and Yale University (Master of Architecture, 2012–2015), then computer science at the University of Toronto (2018–2021). His published professional background includes design and research at Perkins&Will and software engineering at Meta Reality Labs (2022–2025). His portfolio identifies **Los Angeles** as his location; this is a website statement, not an independently verified current residence.

Sources: [official biography](https://dionysus.works/about/) · [portfolio](https://dionysus.works/).

## What is Kinetic Membranes?

*Kinetic Membranes* is a proof-of-concept installation for responsive architecture: flexible textile surfaces are suspended in a rigid frame and transformed through cables attached to selected points. By pulling or releasing different lines, the membranes move from relatively flat configurations into changing three-dimensional volumes.

Its architectural proposition is larger than the scale of the prototype. Instead of treating an enclosure as a fixed geometry, the project asks whether space itself might be continuously reconfigured through controlled tension and user interaction.

The important distinction is between a **static tensile surface**, whose equilibrium defines a fixed form, and an **actuated membrane**, whose tension is varied in time. In this work, the shape is neither purely digitally modeled nor mechanically prescribed by a rigid linkage: it emerges from the interaction between fabric elasticity, attachment points, cable lengths and forces.

![](https://dionysus.works/wp-content/uploads/2021/03/dionysus_kinetic_final.png)

_Photo: Dionysus Cho website. [Source](https://dionysus.works/project/kinetic-membranes/)_

## From hand pulling to controlled actuation

Dionysus's account is particularly valuable because it documents several iterations rather than just the finished installation.

He began with a **laser-cut millboard cube** perforated with a grid of holes. This allowed attachment points and directions of pull to be changed quickly. The first studies were static: lines were pulled by hand and tied off to hold a form.

The next experiments were still deliberately low-tech. Two people pulled different strings at the same time, watching the membranes deform and coordinating through conversation. Only after these tests did the work move toward motorization. This separation of material exploration from electronic control is an important methodological lesson.

The final frame used **laser-cut acrylic plates** connected by **¼-inch steel rods** (nominally 6.35 mm). The artist does not specify in the project description whether the rods were threaded or the precise type of fasteners. The more rigid frame was needed to withstand repeated forces.

<!-- IMAGE PLACEHOLDER 2: millboard cube with perforation grid, and/or acrylic frame detail. Credit: Dionysus Cho. -->

## Why nylon instead of latex?

Early membrane tests used thin rubber latex. Latex could stretch dramatically and offered a relatively continuous, translucent surface, but attaching the cables proved difficult. Small metal rings and clasps concentrated force at individual spots, producing tears; attempts to glue the rings did not solve the problem. The material also resisted stretching strongly enough to challenge the available servos.

Other fabrics, including spandex and jersey, were tested. The final choice was described by Dionysus as **nylon fabric comparable to tights or stockings**. In the project, this material stretched easily and tolerated repeated deformation; the connection points also resisted tearing better than those in the latex trials.

This is a particularly relevant observation for my own membrane experiments: a successful kinetic fabric is not simply the most elastic material. Its **recovery, resistance to localized tearing, attachment method and required actuation force** matter together.

![](https://dionysus.works/wp-content/uploads/2021/03/dionysus_kinetic_latex-2048x1536.jpg)

_Photo: Dionysus Cho website. [Source](https://dionysus.works/project/kinetic-membranes/)_

## Mechanics and electronics

The membrane was moved by **tension lines wound onto wheels or drums**, driven by servomotors under Arduino control. Dionysus documents three mechanical iterations:

1. **Millboard gearbox:** small servos drove winding wheels through gears fabricated from millboard. The gear teeth wore or broke under tension.
2. **3D-printed gears:** more robust gears, but prolonged operation still caused slipping or wear; the wheel diameter also limited the speed of fabric movement.
3. **Winch servos:** heavier-duty servos and larger plastic winding wheels, eliminating the intermediary gear train. This version was used in the final installation.

The progression is useful because it identifies mechanical failure modes, not merely successful components: gear strength, transmitted torque, drum size, travel speed, cable tension and material fatigue all affect the movement.

Dionysus does not provide a verified component bill of materials, exact servo model, full wiring diagram or dimensions for the acrylic plates on the project page. They should not be inferred from photographs alone.

![](https://dionysus.works/wp-content/uploads/2021/03/dionysus_kinetic_gears3-1536x1152.jpg)

_Photo: Dionysus Cho website. [Source](https://dionysus.works/project/kinetic-membranes/)_

## Modeling, control and interaction

The project connected physical actuation to a digital design workflow:

- **Rhino 3D + Grasshopper:** spatial modeling and parametric control.
- **Kangaroo for Grasshopper:** force-based simulation of tension acting on simplified membrane surfaces.
- **Arduino:** interface to the servomotors and physical actuation.
- **Touch-enabled MIDI application on a tablet:** an intuitive, wireless way to adjust the mechanism during presentations.
- **Microsoft Kinect:** depth sensing and skeleton tracking; hand movements were mapped to servo behavior through Grasshopper.

The simulation required calibration against the physical model. Dionysus reports broken strings and torn fabrics during this process — a reminder that a computational approximation of membrane behavior does not remove the difficulties of actual material resistance.

![](https://dionysus.works/wp-content/uploads/2021/03/dionysus_kinetic_OSC-1536x1147.jpg)

_Photo: Dionysus Cho website. [Source](https://dionysus.works/project/kinetic-membranes/)_

## Why this reference matters to Soft Mechanics

What interests me most is the order of inquiry: **material → structure → tension → motion → control**. The movement begins as a direct negotiation with a flexible surface, before becoming an electronic system.

*Kinetic Membranes* helps clarify the difference between traditional tensile structures, which are usually designed to maintain a stable tensioned form, and kinetic textile systems that intentionally change their force distribution. A single point of pull can create a large deformation; several points can create coordinated or competing gestures. The fabric is not a passive covering for a machine. Its physical behavior is part of the mechanism.

This reference speaks directly to [*A Membrane Under Tension*](../studies/2026-10-19-a-membrane-under-tension.md), my own exploratory study with hosiery-like mesh, reinforcing drywall tape, metal eyelets, removable bead-based stoppers and a reconfigurable pegboard frame. The approaches are not identical, but both begin by testing how attachment points and tension transform a flexible surface. In my study, ease of reconfiguration is as important as the motion itself.

The project also provides a useful precedent for deciding **when** to add motors. Manual pulling is not an incomplete version of the work; it is a way to discover the behavior that future actuation should preserve.

## A memory from Barcelona, 2013 — Lucas de Sordi

This research reminds me of meeting **Lucas de Sordi in Barcelona in 2013**, while he was working with particular kinds of membranes. I would like to revisit what those material experiments were, how the membranes behaved and whether they relate to this line of soft kinetic research. For now, this is a personal recollection rather than a documented attribution of any specific membrane project to Lucas.

**To do**

- [ ] Contact Lucas de Sordi to reconnect and discuss the membrane research I remember from Barcelona in 2013.
- [ ] Ask whether he has photographs, videos, material names or project documentation from that period.

## Sources and image credits

- **Primary project documentation:** [Dionysus Cho — Kinetic Membranes](https://dionysus.works/project/kinetic-membranes/).
- **Creator biography:** [Dionysus Cho — About](https://dionysus.works/about/).
- **Project video:** [Kinetic Membranes / interactive fluid form](https://www.youtube.com/watch?v=qskPHo-4xcw).
- **Contemporary dating clue:** The YouTube video is cited with a January 9, 2013 publication date in a later architectural research bibliography; the project's exact development date remains unverified.

