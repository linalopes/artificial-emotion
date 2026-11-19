---
title: MauMau — First Complete Functional Test
subtitle: Integrating enclosure, motor, line, pulley, endstop and a suspended visual element
date: 2026-10-02
slug: maumau-first-complete-functional-test
lede: The first complete MauMau test brought the acrylic enclosure, 28BYJ-48 motor, spool, V-groove pulley, fishing-line linkage, sliding-tube endstop and a suspended paper element together as one working kinetic module.

status: prototype

threads:
  - kinetic-studies

tags:
  - maumau
  - kinetic-module
  - acrylic
  - 28byj-48
  - braided-line
  - pulley
  - endstop
  - homing
  - fishing-materials
  - rapid-prototyping
  - mechanical-integration

related:
  - studies/two-hours-to-a-first-kinetic-prototype
  - studies/maumau-first-parametric-enclosure
  - studies/maumau-spool-first-parametric-prototype
  - studies/fishing-line-as-a-mechanical-linkage
  - notes/hrh-fishing-hebeisen
  - events/open-research-studio

cover: https://res.cloudinary.com/da1flkgyb/image/upload/v1790935058/IMG_6102.webp
gallery: []

draft: false
---

## Question

> What changes when the parts developed separately for MauMau are finally assembled and tested as one complete kinetic module?

Earlier studies had already established the individual pieces of the system: the cardboard proof of concept, the parametric acrylic enclosure, the 3D-printed spool, and the use of braided fishing line, knots and a swivel as a lightweight mechanical linkage.

This test was different.

The question was no longer whether each part could work on its own.

It was whether the complete chain could behave as a single system.

## From cardboard prototype to integrated module

The first cardboard prototype had proved the basic idea very quickly:

**motor → line → suspended element → vertical movement**

By 2 October, that architecture had become much more explicit.

The temporary cardboard box had been replaced by the laser-cut acrylic enclosure developed parametrically with Raven and Grasshopper. The improvised line guide had been replaced by a proper **V-groove pulley**, allowing the fishing line to change direction more predictably.

The module now combined:

- a **28BYJ-48 geared stepper motor**;
- the 3D-printed MauMau spool;
- braided fishing line;
- a metal V-groove guide pulley;
- fishing hardware at the suspended end, including a swivel / safety snap;
- the acrylic MauMau enclosure;
- an ESP32-S3 Super Mini running the movement test;
- an endstop mechanism;
- a sliding tube that physically actuated the endstop;
- a lightweight suspended paper element used to make the movement visible.

The visual element was deliberately provisional.

I crumpled a narrow strip of tissue paper and suspended it from the line. It had almost no functional importance beyond making the movement easy to see, but it gave the test a body.

<video
  src="https://res.cloudinary.com/da1flkgyb/video/upload/v1790891129/IMG_6106.mp4"
  autoplay
  muted
  loop
  controls
  playsinline
  preload="metadata"
></video>

## The endstop and sliding tube

One of the new parts of the system was the mechanical relationship between the moving line and the endstop.

A small tube could move vertically with the line and physically press the limit switch when it reached the top of its travel.

![Sliding tube used to actuate the MauMau endstop during the first complete functional test](https://res.cloudinary.com/da1flkgyb/image/upload/v1790889911/IMG_6103.webp)

This first sliding tube was **round**.

It worked well enough to demonstrate the principle, but the test exposed a geometric problem: because the tube could rotate freely around its vertical axis, the small tab intended to press the endstop could also rotate away from the switch.

The part therefore had two different jobs that were not yet properly reconciled:

1. slide freely up and down;
2. maintain a predictable rotational orientation.

The round cross-section solved the first and undermined the second.

This became a useful design lesson for the next iteration: the guide itself needed to constrain rotation, not only vertical movement.

## Power and control

The integrated test also made the electrical architecture more concrete.

The ESP32 and the stepper motor were no longer abstract components on a bench. Once the motor, mechanical load and control logic were combined, it became clear that the **logic electronics and motor power needed to be treated as separate power domains**, while still belonging to the same control system.

At this stage there was no dedicated MauMau controller PCB.

The electronics were still assembled as a prototype.

But this test helped define what a future controller would need to organise: motor drive, ESP32 control, power distribution, endstop input and a cleaner physical interface between electronics and mechanism.

The later PCB did not begin as an aesthetic decision to make the module look finished.

It emerged from the practical complexity exposed by this integrated prototype.

## Observation

This was the first moment when MauMau felt less like a collection of parts and more like a complete kinetic module.

The enclosure held the mechanical relationships in place.

The stepper turned the spool.

The spool moved the braided line.

The V-groove pulley redirected it.

The fishing hardware provided a removable terminal connection.

The suspended paper made the movement visible.

The sliding tube introduced a physical limit into the system.

For the first time, the module could be observed as a chain of interacting mechanical, electrical and material decisions.

The test also exposed the next problems much more clearly than the earlier cardboard prototype could:

- rotational instability in the round sliding tube;
- the need for reliable homing and limit detection;
- the need to separate and organise logic and motor power;
- the need for a dedicated electronics controller;
- the importance of making the line path repeatable;
- the difference between a mechanism that moves once and a module that can become part of a larger installation.

The value of the prototype was therefore not only that it worked.

It was that its failures became specific.

## Update — 16 November 2026

During the Open Research Studio on 15 November, this MauMau prototype was present as part of the material and mechanical research around Artificial Emotion.

At that moment it was hanging in the studio but was not being presented as a finished, functioning artwork. I still understood it primarily as a technical research object: an acrylic module, a small motor, an almost invisible fishing line and a crumpled piece of paper used during movement tests.

One visitor responded to it very differently.

Looking at the suspended prototype, they told me that they found it almost a pity that, at the end of the project, they might only see the finished installation and no longer see these intermediate things. They were interested in the fact that the research process had been opened, and described this particular prototype as already having a kind of poetry.

That comment surprised me.

I had never considered this configuration as an artwork in itself.

The transparent acrylic enclosure made the motor and mechanism visible. The fishing line almost disappeared. At its end, a small mass of crumpled paper floated as an ambiguous suspended form.

What I had been reading as **unfinished technical evidence** could also be read as an abstraction.

The comment introduced a different question into the project:

**When does a prototype stop being only evidence of a process and begin to operate as an expressive object?**

This does not mean that every research prototype should become an artwork, or that the engineering problems inside MauMau became less important.

But it changed my attention.

Opening the research process did not only expose how the final installation was being made. It also allowed intermediate mechanisms, temporary materials and unresolved constructions to be encountered on their own terms.

The prototype had been built to answer a mechanical question.

In public, it unexpectedly produced an aesthetic one.

## Next

The next MauMau iterations need to develop both the reliability of the module and the lessons exposed by this first integrated test.

Mechanically:

- replace or redesign the round sliding tube so its orientation cannot rotate away from the endstop;
- make homing and limit detection reliable;
- continue refining the line path and suspended load;
- test the mechanism through repeated movement rather than isolated demonstrations.

Electrically:

- move from temporary wiring toward a dedicated MauMau controller;
- separate motor power and ESP32 logic power deliberately;
- integrate the endstop cleanly into the control architecture.

Artistically, the Open Research Studio introduced another possibility:

the visible mechanism, transparent enclosure, nearly invisible line and provisional suspended material may not need to disappear completely when the system becomes more resolved.

The engineering prototype and the expressive object may not be as separate as I had assumed.
