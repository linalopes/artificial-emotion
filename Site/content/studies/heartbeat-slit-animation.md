---
title: Heartbeat Slit Animation
subtitle: A rotational barrier-grid experiment driven by a quartz clock
date: 2026-10-05
type: study
lede: A physical animation study using an interlaced anatomical heart and a rotating slit mask driven by the seconds axis of a quartz clock mechanism.
threads:
  - kinetic-studies
cover: https://res.cloudinary.com/da1flkgyb/image/upload/v1791225483/Screenshot_2026-10-05_at_20.33.59.webp
gallery:
  - type: image
    src: https://res.cloudinary.com/da1flkgyb/image/upload/v1791225307/IMG_6157.webp
    alt: first physical heartbeat slit animation prototype
  - type: video
    src: https://res.cloudinary.com/da1flkgyb/video/upload/v1791225352/IMG_6158.mp4
    alt: rotating slit mask revealing the heartbeat animation
tags:
  - barrier-grid-animation
  - slit-animation
  - quartz-clock
  - paper
  - transparency
  - laser-printing
  - anatomical-heart
  - rotational-animation
  - p5js
  - svg
related:
  - references/ora-x-bruno-munari
draft: false
---


## From clock movement to animation

This study began while researching **Bruno Munari’s Ora X** and the possibility of using a standard clock mechanism not simply to indicate time, but to generate changing visual states.

The experiment uses the **seconds axis of a quartz clock movement** to rotate a slit mask above a fixed image.

The base image is an anatomical heart encoded into radial fragments. The upper disc acts as a mask: as it rotates, different fragments of the encoded image become visible, producing the impression that the heart contracts and releases.

The heart itself remains stationary.

Only the mask moves.

The result is therefore not a conventional animation driven by a screen. The animation is physically encoded into the relationship between two printed layers.

## Barrier-grid animation

The principle is based on **barrier-grid animation**.

In this technique, multiple frames are interlaced into a single image. A second layer containing opaque bands and open slits hides most of the image and reveals only selected fragments at a time.

As the mask moves, different sets of fragments become visible.

The basic logic is:

> interlaced image + moving slit mask = perceived animation

Most historical examples use linear movement and parallel vertical slits.

This study translates that principle into a circular system:

> linear strips → radial slices  
> linear translation → rotation

The mask can therefore be driven directly from a rotating mechanical axis.

## A French precedent: Ombro-Cinéma

An important historical reference for this technique is **Ombro-Cinéma**, a French optical toy produced by Saussine Éditions in Paris in the early twentieth century.

Ombro-Cinéma used interlaced images moving behind a striped barrier to produce short animated sequences. The mechanism was linear rather than rotational, but the perceptual principle is closely related.

This connection is particularly interesting in the context of the ongoing research around Paris: a contemporary rotational experiment can be understood as part of a much older lineage of printed mechanical animation.

The current study is not a reconstruction of Ombro-Cinéma. Instead, it uses the same underlying idea — selectively revealing interlaced image fragments — and adapts it to a clock-driven circular mechanism.

## From linear slits to rotational animation

A standard quartz clock already provides a controlled rotational movement.

The seconds axis advances around the center of the clock while the image plane remains fixed.

This makes it a convenient mechanism for testing circular barrier-grid animation without adding an electronic motor or custom controller.

The rotating mask is designed as a circular disc containing repeated radial opaque sections and narrow open slits.

Beneath it, the anatomical-heart frames are divided into matching radial fragments and interlaced into a single fixed composition.

As the upper disc rotates, the open areas align with different groups of fragments.

The apparent heartbeat is therefore produced by **alignment**, not by physically deforming the paper heart.

## Digital lab

Before fabricating the physical version, the geometry is explored in an interactive p5.js lab:


The simulator makes it possible to test the relationship between frame count, radial slices, angular displacement and the discrete 6° movement of a quartz seconds mechanism before producing the physical layers.

::lab{src="/lab/heartbeat-slit-animation/" title="Heartbeat Slit Animation Lab"}

The lab simulates the fixed encoded image and the rotating slit mask.

It allows changes to:

- animation frames;
- slices per frame;
- mask rotation;
- physical disc diameter;
- clock-tick behavior;
- center / axle guides.

The simulator is also used to compare free rotation with the discrete movement of a real quartz seconds mechanism.

A standard ticking seconds hand advances by approximately **6° per second**.

Because of this, the relationship between:

- number of frames;
- number of slices;
- total radial divisions;
- angular step;

directly affects how many encoded positions are skipped at each physical tick.

The purpose of the lab is not to reproduce a medically accurate cardiac cycle.

It is to find a combination that creates a convincing visual beat with the movement available from a real clock mechanism.

The lab also generates SVG geometry for fabrication.

## First physical prototype

The first physical version was made using ordinary **90 gsm printer paper** and printable transparency film.

The fixed base was printed on white paper.

The anatomical-heart animation was encoded in **red**.

Above it, a transparent circular mask was printed in **black**, leaving radial openings through which fragments of the red image could be seen.

The base remained stationary.

The mask was attached to the seconds axis and rotated with the clock mechanism.

This first prototype was primarily a proof of principle:

> Can a conventional quartz clock movement reveal an encoded anatomical heart strongly enough to be perceived as a beat?

The answer is yes, but the physical test immediately revealed several optical and mechanical constraints.

## Base layer

The base layer contains the complete interlaced animation.

Several states of the anatomical heart are distributed into radial fragments around the circular image.

The current heart is intentionally simplified.

The objective is not biological realism, but maintaining enough anatomical characteristics for the image to continue reading as a human heart after being fragmented by the encoding process.

The base currently uses:

- white 90 gsm printer paper;
- red laser printing;
- circular format;
- fixed position relative to the clock body.

The anatomical heart remains completely stationary during operation.

All perceived movement is generated by the rotating mask.

## Rotating slit mask

The first rotating mask was printed on transparency film.

Its black radial regions were intended to block the encoded image, while the clear slits reveal selected parts of the red heart beneath.

The disc was mounted to the seconds axis using a small improvised central attachment.

For the first test, a small pin was attached with hot glue and positioned at the center of the clock movement.

This was enough to test the animation, but it is not yet a reliable mechanical solution.

The rotating layer needs a central hub that is:

- very light;
- centered accurately;
- flat;
- securely attached to the seconds axis;
- removable;
- capable of holding the mask without introducing wobble.

![discs | 600](https://res.cloudinary.com/da1flkgyb/image/upload/v1791267492/IMG_6161.webp)

## What worked

The basic animation principle works.

The experiment confirmed several useful things:

- a stationary encoded image can produce apparent movement;
- the mask can be driven from the seconds axis of a conventional quartz clock;
- the anatomical-heart source remains recognizable;
- radial barrier-grid animation can work mechanically at this scale;
- a simple clock mechanism can function as an animation driver;
- the physical system can be designed digitally and fabricated from flat materials.

This means the experiment can now move from proof of concept toward improving image quality and mechanical precision.

## What did not work

The largest optical problem in the first test was the opacity of the printed mask.

The black produced by the printer on transparency was **not sufficiently opaque**.

Areas that should completely block the base still transmitted enough light for parts of the red image to remain visible.

As a result, multiple encoded states could be perceived simultaneously.

This reduces the separation between animation frames and makes the heartbeat less legible.

The issue is not necessarily the encoded animation itself.

It is partly a masking problem.

[](https://res.cloudinary.com/da1flkgyb/image/upload/v1791267492/IMG_6161.webp](https://res.cloudinary.com/da1flkgyb/image/upload/v1791267492/IMG_6161.webp)
## Contrast and layer distance

Two variables now appear critical:

### 1. Mask opacity

The opaque parts of the mask need to block the base image much more effectively.

The next version will therefore test a **mask cut from black paper** rather than printed black ink on transparent film.

Instead of relying on printed opacity, the black paper itself becomes the barrier.

The open areas can be physically cut as slits.

This should produce much stronger separation between visible and hidden regions.

### 2. Distance between layers

The mask and base also need to sit **very close together**.

If the distance between them becomes too large, the viewing angle allows the observer to see underneath the edges of the mask.

This causes:

- image leakage;
- blurred frame separation;
- reduced contrast;
- weaker animation.

The next mechanical iteration therefore needs to control not only rotation, but also the spacing between the two planes.

## Mechanical attachment problem

The central connection to the seconds axis remains unresolved.

The current test uses an improvised hot-glued pin.

This is sufficient for experimentation, but not precise enough for a repeatable version.

The attachment needs to solve two different problems:

1. connect the rotating slit disc reliably to the seconds axis;
2. keep the disc as flat and centered as possible.

A custom 3D-printed adapter may eventually be useful, but very small clock-shaft dimensions make FDM resolution a concern.

Another possibility is to reuse or modify the existing second-hand hub and use it as the mechanical interface between the clock movement and the fabricated disc.

This remains an open mechanical problem.

## Bringing the layers closer

The fixed heart disc currently also needs a better support.

The ideal geometry would hold the base close to the rotating mask while leaving enough clearance for free movement.

A small 3D-printed support or spacer could position the base at the correct height relative to the clock mechanism.

This piece would not animate anything.

Its function would simply be:

> control the gap between the image and the mask.

The target is the smallest reliable gap that avoids friction.

## Next iteration

The next prototype will change several things simultaneously:

- increase the contrast of the red anatomical-heart image;
- replace the printed transparency mask with **black cut paper**;
- reduce the distance between the mask and the fixed base;
- develop a more reliable center attachment for the seconds axis;
- test a support that positions the base close to the rotating disc;
- continue using the digital lab to evaluate frame and slice combinations before fabrication.

The next slit disc will therefore behave less like a printed transparency and more like a physically cut shutter.

This should make the optical logic much clearer.

## Fabrication

### Version 01

- standard quartz clock movement;
- seconds axis used as the rotating output;
- 120 mm circular study;
- fixed anatomical-heart base;
- 90 gsm white printer paper;
- red laser printing;
- transparent printable film;
- black printed radial mask;
- improvised central attachment;
- hot glue;
- SVG geometry generated from the p5.js lab.

### Planned Version 02

- stronger red base image;
- fixed white-paper base;
- black paper slit mask;
- digitally cut radial openings;
- minimal gap between layers;
- improved seconds-axis hub;
- possible 3D-printed base spacer / support.

## What this study is testing

This study is not primarily about reconstructing a historical optical toy or reproducing *Ora X*.

It asks a broader question:

> How can a simple existing mechanism be used to produce the perception of a living behavior?

The quartz clock provides only rotation.

The printed layers translate that single mechanical behavior into something that can be perceived as a heartbeat.

The mechanism therefore does not imitate the biological heart directly.

Instead, it supplies a rule.

The visual system interprets that rule as behavior.

This is the connection to **Artificial Emotion**:

> mechanical state → perceptual state → attributed behavior


## Sources

- Gianni A. Sarcone — Kinegrams / rotating optical animation:  https://www.giannisarcone.com/Kinegrams.html

- Le Corpus — Ombro-Cinéma animation workshop and barrier-grid method: https://www.le-corpus.com/cours-ateliers/2014-25_dessin-animation-6-13ans/animation_ombrocinema.html

- Musée du Jouet de Poissy — Ombro-Cinéma: https://musees.ville-poissy.fr/fr/notice/mj-78-45-5-1-et-2-ombro-cinema-716f9659-14b6-4d27-8e73-0263d996b7e3