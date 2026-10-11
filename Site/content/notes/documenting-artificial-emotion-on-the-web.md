---
title: Documenting Artificial Emotion on the Web
date: 2026-09-28
type:
  - information-architecture
lede: A note on how Markdown, Astro, GitHub, Cloudinary and browser-based creative coding became part of the documentation process of Artificial Emotion.
url:
cover: https://res.cloudinary.com/da1flkgyb/image/upload/v1791713000/Screenshot_2026-10-11_at_12.01.49.webp
gallery: []
threads: []
tags:
  - markdown
  - astro
  - obsidian
  - github
  - cloudinary
  - documentation
  - digital-garden
  - static-site
related:
  - notes/lina-lopes
  - notes/school-of-tomorrows-ai
draft: false
---

## Documentation as part of the process

The website for **Artificial Emotion** is not only a place where finished information about the project is published.

It has gradually become part of the research process itself.

Studies, references, events, technical experiments and notes are written while the work is still changing. Some entries document functioning prototypes. Others preserve an unfinished mechanism, a material test, a question, a failure, a reference or a public moment that may become important later.

For that reason, I wanted the documentation system to remain close to the way I already work: text files, folders, images, code and links that can be reorganised without depending on a large publishing platform.

The site is therefore being developed less as a portfolio and more as a **public process archive**.

## Returning to Markdown

I have used **Markdown** for many years, including through earlier websites built with **Jekyll**.

I still like the basic idea behind that workflow: the writing remains readable outside the website.

A research note is first a `.md` file.

It can be opened in a text editor, read in **Obsidian**, versioned with Git, moved to another system or transformed into another kind of publication later. The content does not need to live inside a proprietary page builder in order to remain useful.

This became an important constraint for Artificial Emotion.

I wanted the content to stay separate from the interface.

Titles, dates, research threads, tags, relationships, images and long-form writing live in Markdown. The website interprets those files and gives them different visual forms, but the research itself remains portable.

## Why Astro

For this version of the site, I am testing **Astro**.

Part of the attraction is familiar: Astro works very naturally with Markdown and static content, which makes it a good fit for a research archive that does not need a conventional database or content-management system.

At the same time, it gives me more freedom than the static-site workflows I used previously.

The site can remain mostly static while individual parts become computational or interactive when needed.

This matters because Artificial Emotion is not only text and images.

The website already contains elements built with JavaScript libraries I use elsewhere in my practice, including **[p5.js](https://p5js.org/)** for generative visual systems and **[D3.js](https://d3js.org/)** for the research constellation. These elements can live alongside ordinary Markdown pages without forcing the entire site to become a large client-side application.

That combination is useful to me:

> static documents when documents are enough, and code when behaviour matters.

## A small publishing stack

The documentation currently moves across a small set of tools.

**[Obsidian](https://obsidian.md/)** is one of the places where I write and organise notes.

**[GitHub](https://github.com/linalopes/artificial-emotion)** keeps the files and code versioned together and makes changes to the research archive traceable over time.

**[Astro](https://astro.build/)** turns those files into the public website.

**[Cloudinary](https://cloudinary.com/)** holds much of the photographic and video documentation, especially when galleries begin to contain more media than makes sense to keep inside the repository itself.

The published site remains static, while the archive can still include image galleries, video, full-text search, generative graphics and relational navigation between entries.

None of these tools is especially interesting on its own.

What interests me is the workflow they make possible: documentation can remain lightweight while the interface around it becomes progressively richer.

## Structure without fixing the research

One of the recurring questions while building the site has been how much structure the research actually needs.

Artificial Emotion currently distinguishes between **Research Threads, Studies, Studio Notes, References and Events**.

Those categories are useful, but they are not intended to describe every possible object in advance.

Tags provide a looser vocabulary across the archive. Explicit relationships connect particular entries. Search makes it possible to recover things that were not classified in the same way. The research constellation provides another view of the same material as a network rather than a list.

The aim is not to build a perfect database.

It is to create enough structure that the research can remain navigable while still being allowed to change.

## The website as a research object

Building the site has also made the documentation itself visible as a design problem.

How should a prototype be documented differently from an artist reference?

When does an image need a caption?

How much metadata is useful before a research note begins to feel like a database record?

Can a generative visual language connect different kinds of pages without overwhelming the material being documented?

What happens when tags, backlinks and search begin to expose relationships that were not obvious while writing the individual notes?

These questions are not separate from Artificial Emotion.

The project is concerned with systems, behaviour, interpretation and the movement between simple rules and more complex states. The documentation system develops through a related process: small structural decisions accumulate until the archive begins to behave as something more than a sequence of pages.

For now, the website remains deliberately unfinished.

Like the physical prototypes in the studio, it is being built through use.
