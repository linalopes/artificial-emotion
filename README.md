# Artificial Emotion

**Artificial Emotion** is an ongoing artistic research project by **Lina Lopes** exploring how movement, soft mechanisms, sensing, bodily rhythms and material systems can produce expressive mechanical behaviour.

This repository is the working archive of the project. It brings together physical prototypes, fabrication files, electronics, code, research documentation and the source of the public research website.

## Research

The project currently develops through three connected research threads:

- **Soft Mechanisms**
- **Kinetic Studies**
- **Heartbeat & Biosignals**

These are not separate projects. They overlap through mechanisms, materials, sensing experiments, fabrication systems, public events and works in progress.

The research is intentionally documented while it is still changing.

## Repository structure

Some of the main areas of the repository are:

```text
artificial-emotion/
├── Site/
│   └── Public research website and Markdown-based research archive
│
├── kinetic-module-maumau/
│   └── Mau Mau kinetic module:
│       mechanical design, electronics, firmware and fabrication files
│
├── fixation-hackings/
│   └── Experimental mounting and attachment systems
│
├── homages/
│   └── Physical studies after existing kinetic works
│
├── little-heart-machine/
│   └── Folded paper heart and crank-plate fabrication files
│
└── README.md
```

The repository will continue to evolve as new studies, mechanisms and fabrication systems are developed.

## Public research site

The public documentation of the project is available at:

https://emotion.linalopes.info/

The site is built with **Astro** and uses **Markdown** as the primary content source. It functions as a public process archive rather than only as a presentation layer for finished work.

Its source lives in:

[`Site/`](Site/)

See [`Site/README.md`](Site/README.md) for the site architecture, content model, authoring rules and development setup.

## Run locally

The public site is the runnable part of this repository. From `Site/`:

```sh
cd Site
npm install        # once
npm run dev        # http://localhost:4321
```

Requires Node ≥ 22.12. Other useful commands:

```sh
npm run check      # type-check
npm run build      # static output in Site/dist/
npm run preview    # serve the built site
```

Cloudinary folder galleries (Research Threads) need credentials in `Site/.env`. Copy `Site/.env.example` and restart `npm run dev` after changing it. Those variables are used at build time only.

## Kinetic Module — Mau Mau

[`kinetic-module-maumau/`](kinetic-module-maumau/)

**Mau Mau** is an early kinetic research unit developed to study movement, rhythm, hesitation, repetition and mechanical tension.

The module combines mechanical design, electronics and control experiments around a compact actuation system.

Its folder contains work including:

- Rhino and Grasshopper mechanical design
- a parametric laser-cut enclosure
- a parametric 3D-printed spool
- ESP32-S3 / ULN2003 / 28BYJ-48 motor experiments
- homing and microswitch tests
- Arduino firmware
- an experimental KiCad PCB

See [`kinetic-module-maumau/README.md`](kinetic-module-maumau/README.md) for the detailed technical documentation.

## Fixation Hackings

[`fixation-hackings/`](fixation-hackings/)

This area collects experimental mounting, clamping and attachment solutions developed as the project begins to require a shared physical infrastructure for suspending, rearranging and exhibiting prototypes.

These parts are treated as research objects too: small fabrication decisions can determine how modular, adaptable or reusable the larger installation becomes.

## Homages

[`homages/`](homages/)

Physical studies that begin from existing kinetic works and then become independent experiments inside Artificial Emotion. Fabrication files stay here; the editorial Studies live in `Site/content/studies/`.

Current folders:

- [`homages/ora-x-homage/`](homages/ora-x-homage/) — after Bruno Munari’s *Ora X*
- [`homages/c-15-homage/`](homages/c-15-homage/) — after Abraham Palatnik’s *Objeto Cinético C-15*

## Little Heart Machine

[`little-heart-machine/`](little-heart-machine/)

Cutting templates and a 3D-printed crank plate for the folded paper heart study.

## Documentation as part of the research

Artificial Emotion is documented while it is being developed.

The repository therefore contains both technical working files and editorial research material: prototypes, references, mechanisms, experiments, unfinished systems, failures and decisions that may still change.

Markdown, Git and the public website are used as part of that process rather than only as final publication tools.

The intention is to keep the research legible while it remains open.

## Status

**Active research.**

Files in this repository should not be assumed to represent final installation designs or production-ready hardware unless explicitly marked as such.

## Artist

**Lina Lopes**  
Artist, creative technologist and researcher

https://www.linalopes.info/

## Links

- Artificial Emotion — https://emotion.linalopes.info/
- Repository — https://github.com/linalopes/artificial-emotion
- Lina Lopes — https://www.linalopes.info/
- School of Tomorrow's AI — https://schoolai.linalopes.info/
