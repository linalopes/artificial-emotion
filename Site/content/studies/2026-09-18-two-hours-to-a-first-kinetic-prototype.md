---
title: Two Hours to a First Kinetic Prototype
subtitle: Building a first single-movement kinetic module from cardboard and available materials
date: 2026-09-18
slug: two-hours-to-a-first-kinetic-prototype
lede: A rapid cardboard prototype used to test whether one simple kinetic idea could become a working physical module in only a few hours.

status: prototype

threads:
  - kinetic-studies
tags:
  - cardboard
  - rapid-prototyping
  - kinetic-mechanisms
  - 28byj-48
  - esp32-s3
  - braided-line
  - fishing-materials
  - improvised-hardware
related: []

cover: https://res.cloudinary.com/da1flkgyb/image/upload/v1790960073/IMG_5960.webp
gallery:
  - type: video
    src: https://res.cloudinary.com/da1flkgyb/video/upload/v1790928300/IMG_5957.mp4
    caption: First movement test of the cardboard kinetic module.
  - type: image
    src: https://res.cloudinary.com/da1flkgyb/image/upload/v1791785624/IMG_5961.webp
    alt: Cardboard kinetic module prototype with stepper motor and line mechanism
    caption: Early cardboard construction of the first kinetic module.
  - type: image
    src: https://res.cloudinary.com/da1flkgyb/image/upload/v1791786058/IMG_6330.webp
    alt: Detail of the cardboard kinetic prototype and improvised mechanism
    caption: Detail of the improvised structure and line-guiding mechanism.

draft: false
---

## Question

How quickly can a kinetic idea become a working physical prototype using simple, available materials?

At this stage, I was imagining **Artificial Emotion** as a system made from several independent kinetic modules, with each module responsible for one movement.

Before designing a more precise enclosure, mechanism or controller, I wanted to know whether that basic idea could be made physical quickly enough to observe it.

The goal was not to make a durable object.

The goal was to make something move.

## Setup

I started with materials that were already around the studio.

The structure was made from **cardboard**, chosen because it is abundant, easy to cut, easy to fold and forgiving enough to build with intuitively.

The first mechanism combined:

- a **28BYJ-48 stepper motor**
- an **ESP32-S3 Super Mini**
- braided fishing line left from an earlier project
- a small fishing weight
- cardboard fasteners
- an improvised plastic hook used as a line guide
- a very simple Arduino test sketch

I did not yet have a proper guide pulley, limit switch or finished mechanical assembly.

That was part of the point.

The question was whether the idea could work before the right parts existed.

## Construction

The enclosure began with two strips of cardboard.

I scored and folded each strip into a U-shaped profile, then combined the two pieces to form a simple four-sided box.

The dimensions were not carefully measured in advance.

I worked with the proportions the cardboard itself suggested, adjusting the folds by hand and using the available material as a guide.

This is one of the useful qualities of manual prototyping: geometry can emerge through making before it needs to be described numerically.

The pieces were fixed using small fasteners suitable for cardboard. I punched the holes directly into the material and assembled the shell mechanically rather than gluing it.

A square piece of cardboard was then inserted as a central **divider**.

This divider became the mounting plane for the stepper motor.

The motor shaft passed through it, creating a simple separation between the motor body and the moving line mechanism.

Because I did not yet have a guide pulley, I used a small plastic craft fastener with a hook-shaped front as an improvised line guide.

It was not designed for kinetic sculpture, but it was available, lightweight and sufficient for redirecting the line during the test.

## First movement

The motor was controlled with a very small Arduino sketch running on the ESP32-S3 Super Mini.

The braided line was attached to a small fishing weight.

The test was deliberately minimal: rotate the stepper, wind or release the line, and observe whether the module could produce a controlled vertical movement.

It worked.

In roughly **two hours**, including building the cardboard structure, mounting the components and writing the first control code, I had a moving physical prototype.

The system was fragile and incomplete, but it was no longer an abstract mechanism.

It was something I could watch, touch and change.

## Observation

The prototype immediately exposed its limitations.

There was no endstop or homing mechanism.

The cardboard structure could not support large loads.

The improvised line guide was not a long-term mechanical solution.

The geometry had not been designed for repeatable fabrication.

Even so, none of those limitations prevented the prototype from answering the first question.

The structure was strong enough for the light materials being tested, and the fishing weight was sufficient to make the movement legible.

The prototype confirmed that the basic architecture could work:

**motor → line → suspended weight → vertical movement**

More importantly, it showed that a useful kinetic study did not need to begin with a finished mechanical design.

## What this prototype established

This first cardboard module became the starting point for the later **MauMau** kinetic module.

It established several working assumptions that could then be refined:

- one compact module could be responsible for one movement;
- the 28BYJ-48 was sufficient for early kinetic studies;
- a divider could organise the relationship between motor and line mechanism;
- fishing line could provide a lightweight actuation path;
- a more precise guide system and homing mechanism would eventually be necessary;
- the enclosure could be developed later, after the movement itself had been observed.

It also reinforced a broader prototyping method.

When the question is still mechanical and behavioural, it can be more useful to begin with cardboard, improvised hardware and available materials than with precise CAD.

The first prototype does not need to survive.

It needs to make the idea visible.
