---
title: Fishing Line as a Mechanical Linkage
subtitle: Adapting braided fishing line, knots and swivels for a small kinetic system
date: 2026-10-01
lede: A study of braided fishing line as a mechanical transmission element in MauMau, comparing line diameter, spool behavior, knotting and rotational attachment.

status: experiment

threads:
  - kinetic-studies
tags:
  - braided-line
  - fishing-materials
  - knots
  - swivel
  - spool
  - maumau
  - kinetic-mechanisms
  - line-fixation
  - mechanical-connections
  - crochet-hook
related:
  - studies/maumau-spool-first-parametric-prototype
  - studies/maumau-first-parametric-enclosure
  - notes/hrh-fishing-hebeisen

cover: https://res.cloudinary.com/da1flkgyb/image/upload/v1791881069/IMG_6064.webp
gallery:
  - type: image
    src: https://res.cloudinary.com/da1flkgyb/image/upload/v1791881068/IMG_6068.webp
    alt: Braided fishing line and small fishing hardware used in the MauMau kinetic module
    caption: Testing fishing line and small terminal hardware as part of the MauMau mechanism.
  - type: image
    src: https://res.cloudinary.com/da1flkgyb/image/upload/v1791881069/IMG_6072.webp
    alt: Detail of the fishing line connection used in the MauMau kinetic mechanism
    caption: Detail of the line and attachment system during assembly.
  - type: video
    src: https://res.cloudinary.com/da1flkgyb/video/upload/v1791881085/IMG_6057.mp4
    caption: Testing the fishing line as part of the kinetic transmission.

draft: false
---

## Question

How can a material designed for fishing become a reliable mechanical linkage inside a small kinetic system?

In MauMau, the fishing line is not only something that connects one object to another.

It transmits movement from the motor-driven spool to a suspended element.

That means its diameter, flexibility, winding behavior, knots and terminal connections all become part of the mechanism.

I had already been using **0.24 mm braided fishing line** from an earlier project. For this version, I also bought a thinner **0.16 mm braided fishing line** and began comparing how the two behaved inside the MauMau system.

## Braided fishing line

Braided fishing line is made from multiple filaments woven together into a very thin, flexible cord.

In fishing, different diameters exist because the line has to balance several competing requirements: strength, line capacity, casting behavior, visibility and the size of the reel or tackle being used.

In MauMau, those same physical differences become relevant for a different reason.

The line has to:

- wind repeatedly around a very small spool;
- pass through guide elements;
- remain flexible at a small scale;
- transmit the movement of the stepper motor;
- support a suspended element;
- accept knots and small mechanical attachments.

The **0.24 mm** line was the first version I already had available.

The **0.16 mm** line is noticeably thinner and gives more winding length for the same spool volume.

That difference also affects the spool mechanically.

A wound line gradually increases the spool's effective radius. A thicker line builds up that radius faster, so the same motor rotation can produce a slightly different linear displacement as more layers accumulate.

With a thinner line, that change happens more gradually.

At this scale, line diameter is therefore not only a material specification.

It becomes part of the movement geometry.

## Knots as mechanical connections

One of the practical problems was how to make reliable connections with a line this thin.

At the fishing shop, I was given a small illustrated booklet of fishing knots.

The booklet is in German, but the drawings are detailed enough to work as a practical reference without needing to translate every instruction.

![Fishing-knot booklet used as a practical reference for the MauMau line connections](https://res.cloudinary.com/da1flkgyb/image/upload/v1791881611/IMG_6098.webp)

Rather than inventing a new way to tie the line, I selected two existing fishing-knot constructions for two different mechanical interfaces.

### Line to spool

The first knot is used to secure the beginning of the braided line to the MauMau spool.

![Fishing-knot reference used for attaching the braided line to the spool](https://res.cloudinary.com/da1flkgyb/image/upload/v1791881582/IMG_6096.webp)

This connection works together with the two anchor holes added to the spool.

The line can pass through the printed part before winding around the core, giving the first turn a deliberate mechanical starting point instead of relying only on friction around the spool.

### Line to swivel

The second knot is used at the opposite end of the line, where it connects to a **barrel swivel with safety snap**.

![Fishing-knot reference used for attaching the braided line to the swivel](https://res.cloudinary.com/da1flkgyb/image/upload/v1791881582/IMG_6097.webp)

The swivel is a particularly useful piece of fishing hardware for kinetic work.

Its original function is to allow rotation between connected elements while reducing the transfer of twist into the fishing line.

That same function is useful here.

A suspended element may rotate around its own vertical axis. Without a swivel, that rotation could progressively twist the line all the way back toward the guide pulley and spool.

The swivel introduces rotational freedom at the end of the linkage.

The safety snap also makes the suspended element easy to remove and replace without undoing the line itself.

## Borrowing a tool from crochet

Working with a 0.16 mm line by hand is difficult.

The line is thin, flexible and hard to manipulate through small holes and loops with fingers alone.

A **crochet hook** turned out to be an unexpectedly useful assembly tool.

Crochet is another practice built around controlling flexible thread, pulling loops through openings and manipulating tension at a small scale.

The tool was not designed for fishing or kinetic sculpture, but the operation is closely related.

I could use the hook to catch the braided line, pull it through the spool holes and help position loops while tightening the knots.

This is part of a recurring working method in Artificial Emotion: tools and techniques move between domains when the physical problem is similar.

Fishing, crochet and kinetic sculpture all contain forms of knowledge about how flexible lines behave.

## Observation

The line is easy to overlook because it is visually small, but mechanically it sits in the middle of the entire actuation system.

The chain is now:

**28BYJ-48 stepper motor → spool → braided fishing line → guide pulley → swivel → suspended element**

Each transition introduces a different mechanical question.

The spool has to anchor and wind the line.

The guide pulley changes its direction.

The knot creates a reliable termination.

The swivel allows the suspended element to rotate without transferring that twist back through the system.

Together, these small components turn a piece of fishing line into a mechanical linkage.

## What this experiment changes

For the next MauMau tests, I am moving toward the **0.16 mm braided fishing line** as the preferred line for the small module.

It takes less volume on the spool, remains flexible at the scale of the mechanism and is easier to accommodate within the compact winding geometry.

The experiment also established a small but useful assembly vocabulary:

- dedicated line-anchor holes in the spool;
- a fishing knot for the spool connection;
- a second knot for the terminal connection;
- a barrel swivel with safety snap;
- a crochet hook as an assembly tool.

What began as a question about choosing a thinner line became a broader study of how an existing technical culture — fishing — can contribute ready-made solutions to kinetic sculpture.

The line is no longer just a connector.

It is part of the mechanism.
