# Artificial Emotion — research site

Public research site for the artistic research project *Artificial Emotion*.
Built with [Astro](https://astro.build) as a fully static site. Content is
Markdown-first and authored from Obsidian (this folder lives inside the vault).

## Run

```sh
npm install        # once
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
npm run check      # type-check .astro / .ts files
```

Requires Node ≥ 22.12.

## Folder map

```
Site/
├── astro.config.ts          Astro config (static output; GitHub Pages site/base go here)
├── tsconfig.json            extends astro/tsconfigs/strict
├── content/                 Markdown authored in Obsidian — one file = one entry
│   ├── _templates/          blank frontmatter templates (NOT loaded by Astro)
│   ├── studies/             documented experiments / prototypes
│   ├── notes/               generic knowledge objects (people, places, tools, …)
│   ├── references/          external sources that informed the research
│   ├── events/              public moments in the research
│   └── research/            editorial source for the three Research Threads
├── public/                  copied verbatim to dist/ (favicon, etc.)
└── src/
    ├── content.config.ts    collection schemas + glob loaders for content/*
    ├── lib/
    │   ├── vocabulary.ts    canonical thread ids, statuses, primary collection labels
    │   ├── content.ts       published-only fetching, related + backlinks, formatting
    │   ├── search.ts        build-time search records (no UI yet)
    │   └── paths.ts         base-aware URL helpers (href, collectionPath, entryPath)
    ├── layouts/
    │   ├── BaseLayout.astro <html>, <head>, fonts, global CSS, site header
    │   └── EntryLayout.astro skeleton for one entry: label, title, meta, body, related
    ├── components/          SiteHeader, EntryList, MetaList, RelatedEntries
    ├── pages/               file-based routes (see Routes)
    └── styles/global.css    ALL design tokens + reset + base typography
```

## Routes

| Route                | Source                             |
| -------------------- | ---------------------------------- |
| `/`                  | `src/pages/index.astro` — Waves hero + constellation section |
| `/research/`         | `src/pages/research/index.astro` — Events/Studio Notes-style listing of published threads |
| `/research/[thread]/`| `src/pages/research/[thread].astro` — one page per canonical thread id |
| `/lab/constellation/`| `src/pages/lab/constellation.astro` — constellation tuning page, not in nav, `noindex` |
| `/lab/waves/`        | `src/pages/lab/waves.astro` — p5.js Tomorrow's Waves prototype, not in nav, `noindex` |
| `/lab/tissue/`       | redirects to `/lab/waves/` (previous generative-textile lab URL) |
| `/studies/`          | `src/pages/studies/index.astro`    |
| `/studies/[id]/`     | `src/pages/studies/[id].astro`     |
| `/notes/`            | `src/pages/notes/index.astro`      |
| `/notes/[id]/`       | `src/pages/notes/[id].astro`       |
| `/references/`       | `src/pages/references/index.astro` |
| `/references/[id]/`  | `src/pages/references/[id].astro`  |
| `/events/`           | `src/pages/events/index.astro`     |
| `/events/[id]/`      | `src/pages/events/[id].astro`      |

Only primary-collection entries with `draft: false` get listing and detail
pages. Research Thread pages always exist for the three canonical ids so
homepage links stay stable; unpublished thread Markdown is omitted from
`/research/` until `draft: false`.

Generated folders (`node_modules/`, `dist/`, `.astro/`) are git-ignored. Consider
adding them to Obsidian → Settings → Files and links → Excluded files.

## Content model

Artificial Emotion is an ongoing artistic research project, a digital artist
notebook, a public archive, and a digital garden. The content model stays
simple: four primary Markdown collections plus Research Threads as a
conceptual layer above them. There are no separate collections for people,
institutions, places, tools, or materials.

| Kind | Meaning |
| ---- | ------- |
| **Study** | A documented experiment or prototype created inside the research. |
| **Reference** | An external source that informed the research (artist, artwork, paper, book, project, technology, historical work). |
| **Note** | The generic knowledge object: person, institution, place, tool, software, material, concept, process, collaboration, observation, or other context. |
| **Event** | A public moment in the research, with structured date/time/location data. |
| **Thread** | A major research cluster above the four primary collections. Canonical ids: `soft-mechanisms`, `kinetic-studies`, `heartbeat-biosignals`. Editorial source lives in `content/research/<id>.md`. Not a fifth primary collection and not a valid `related` target. |
| **Tag** | A lightweight characteristic or theme (`acrylic`, `3d-printing`, `paris`). Not a page. A tag may later become a Note if editorial content accumulates. |
| **Related** | An explicit relationship declared by the artist. Strong semantic edge. Example: Prototype B was developed from Prototype A. |
| **Backlink** | The automatic reverse of `related`. If A lists B, B can show A under Referenced by. Never written by hand. |

Shared tags do **not** mean two entries are related.

### Authoring rules

Frontmatter is plain YAML, editable in Obsidian's Properties panel.

- The **filename is the stable slug / URL**. `content/notes/institute-for-future-technologies.md` → `/notes/institute-for-future-technologies/`. `content/research/soft-mechanisms.md` → `/research/soft-mechanisms/`. The title may change; the URL does not. Name files in kebab-case. Do not derive URLs from titles.
- Frontmatter is structured data. The Markdown body is narrative.
- Anything whose file or folder name starts with `_` is ignored by Astro (`content/_templates/` is never loaded).
- Empty properties (`cover:`) count as "not set". Lists may be omitted entirely.
- `draft` defaults to `true`; set `draft: false` to publish.
- Every authored Markdown entry carries a `date`. Meaning depends on the collection (see Date below).
- `threads` accepts only: `soft-mechanisms`, `kinetic-studies`, `heartbeat-biosignals`. This is how a Study, Note, Reference or Event attaches to a Research Thread. Do not list those entries inside the research Markdown.
- `related` uses `collection/id` among the four primary collections only, e.g. `notes/when-does-movement-look-hesitant`. Research Threads are not `related` targets. Targets do not have to exist yet.
- Media fields accept a local site-root path (`/images/...`) or an HTTPS URL (Cloudinary or other). The site does not download remote files.

| Collection   | Required        | Optional / defaults |
| ------------ | --------------- | ------------------- |
| `studies`    | title, date     | status (`seed` · experiment · prototype · integrated), threads, tags, materials, related, cover, youtube, draft |
| `notes`      | title, date     | type, lede, url, cover, gallery, threads, tags, related, draft |
| `references` | title, date     | creator, year, referenceType, url, threads, tags, related, image, draft. `year` is the chronology of the referenced work, not the notebook date. |
| `events`     | title, date     | startTime, endTime, timezone (`Europe/Zurich`), eventType, status (`upcoming` · ongoing · past · cancelled), location, lede, rsvp, eventUrl, cover, gallery, youtube, threads, tags, related, draft |
| `research`   | title, date     | subtitle, lede, questions, process, cover, gallery, tags, draft. No `status`, `threads`, or `related`. Filename must be the canonical thread id. |

Suggested Note `type` values (any string is accepted):
`person` · `institution` · `place` · `tool` · `software` · `material` · `concept` · `process` · `collaboration` · `other`.

Body headings are an editorial convention, not validated:
Studies `## Question / ## Setup / ## Observation / ## Next` ·
References `## Why it matters / ## Notes` ·
Events `## About / ## Program / ## Documentation / ## Reflection`.
Notes have a free-form body.

Empty event headings are not rendered.

Copy the matching file from `content/_templates/` into the collection folder,
rename it to the kebab-case slug, and fill in the properties.

### Research Threads

Research Threads are a conceptual layer above Studies, Notes, References and
Events. They are authored as three Markdown files:

```
content/research/soft-mechanisms.md      → /research/soft-mechanisms/
content/research/kinetic-studies.md      → /research/kinetic-studies/
content/research/heartbeat-biosignals.md → /research/heartbeat-biosignals/
```

The filename **is** the canonical thread id. The same id is used in other
entries:

```yaml
threads:
  - soft-mechanisms
```

That entry then appears on the Soft Mechanisms page. Do not list Studies,
Notes, References or Events inside the research Markdown. Title, subtitle,
date, lede, questions, process, cover, gallery and tags are edited in the file;
`src/lib/vocabulary.ts` keeps only the ids and fallback labels.

`date` is when the Research Thread entry was authored in the notebook. It is
not the research start date, completion date, or an event date. The body may
state a concentrated research period (for example January–June 2027) or a
public presentation (June/July 2027); those remain editorial, not metadata.

The page does not treat this date like an Event date. It stays available to
the system and is not shown beside the title.

Copy `content/_templates/research-template.md`. Canonical order on `/research/`
is Soft Mechanisms, Kinetic Studies, Heartbeat & Biosignals.

### Date

Every authored Markdown entry in the Artificial Emotion research garden carries
a `date`.

| Collection | Meaning of `date` |
| ---------- | ----------------- |
| **Studies** | Date of the study entry / research record |
| **Notes** | Date the Note entered the notebook |
| **References** | Date the Reference entered the notebook |
| **Research Threads** | Date the Research Thread entry entered the notebook |
| **Events** | Calendar date of the Event |

Reference-specific chronology stays in `year`. Example:

```yaml
title: Jean Tinguely
date: 2026-09-30
year: 1960
```

means 1960 is the period of the referenced work, and 2026-09-30 is when it was
registered in Artificial Emotion. Do not replace `year` with `date`.

### Note examples (do not publish as-is)

Person:

```yaml
title: Clara Example
date: 2026-10-02
type: person
lede:
url:
threads: []
tags: []
related: []
draft: true
```

Body: who this person is in relation to Artificial Emotion.

Institution:

```yaml
title: Institute for Future Technologies
date: 2026-10-02
type: institution
lede:
url: https://ift.devinci.fr/
threads: []
tags:
  - paris
  - residency
related: []
draft: true
```

Body: why this institution matters to the research.

### Note media

Same model as Events. `cover` is one image. `gallery` is optional structured media.

```yaml
cover: https://res.cloudinary.com/example/image/upload/portrait.webp
gallery:
  - type: image
    src: https://res.cloudinary.com/example/image/upload/studio.webp
    alt: Studio work in progress
    caption: First residency week
  - type: video
    src: https://res.cloudinary.com/example/video/upload/test.mp4
    poster: https://res.cloudinary.com/example/image/upload/test-poster.webp
    caption: Motion test
```

A bare path is treated as an image. Remote values must be `https://` URLs.

### Events

**Properties** are structured data the site uses to sort, filter, relate, or render conditionally.

**Body** is editorial narrative written naturally in Obsidian. Do not put About/Program copy in frontmatter.

| Property    | Notes |
| ----------- | ----- |
| `date`      | Calendar date only, `YYYY-MM-DD`. |
| `startTime` / `endTime` | Local clock as quoted `"HH:MM"` (24-hour). Quote them so YAML does not treat `14:00` as a number. Leave empty if unused. The page shows `14:00–18:00`, or only `14:00` if there is no end, or the date alone if neither time is set. |
| `timezone`  | IANA timezone. Default `Europe/Zurich`. Not shown on ordinary local events. |
| `eventType` | One of: `open-studio`, `workshop`, `exhibition`, `talk`, `presentation`, `screening`, `residency`, `other`. |
| `status`    | `upcoming` (default), `ongoing`, `past`, `cancelled`. |
| `lede`      | Short reusable summary for the hero, cards, and listings. |
| `rsvp`      | Registration URL. |
| `eventUrl`  | Official event page, if different from RSVP. |
| `threads`   | Canonical ids: `soft-mechanisms`, `kinetic-studies`, `heartbeat-biosignals`. |
| `cover` / `gallery` | Local site-root path (`/images/...`) or HTTPS (Cloudinary or other). |
| `youtube`   | Primary documentation video, if any. |

Copy `content/_templates/event-template.md` for each new event.

```yaml
title: Open Research Studio
date: 2026-11-15
startTime: "14:00"
endTime: "18:00"
timezone: Europe/Zurich
eventType: open-studio
status: upcoming
location: School of Tomorrow’s AI, Wetzikon, Switzerland
lede: An open day of experiments, prototypes and conversations. All welcome.
rsvp: https://luma.com/piaavgin
eventUrl:
cover: https://res.cloudinary.com/example/image/upload/cover.webp
gallery: []
youtube:
threads:
  - soft-mechanisms
tags:
  - open-studio
related:
  - studies/breathing-textile
draft: false
```

### Event media

The repository stores **references** to media. Assets may live locally in
`public/` or externally on a host such as Cloudinary. The site does not
download or proxy remote files.

**Local files** go in `public/images/events/<event-id>/`:

```
public/images/events/open-research-studio/
  cover.webp
  01.webp
```

**Cover** (`cover`) is a single image: a site-root path or an HTTPS URL.

```yaml
cover: /images/events/open-research-studio/cover.webp
# or
cover: https://res.cloudinary.com/example/image/upload/cover.webp
```

Leave `cover:` empty until a real image exists. The detail page then uses the
designed cover placeholder.

**Gallery** is optional. Empty `gallery: []` renders nothing.

Local image:

```yaml
gallery:
  - type: image
    src: /images/events/example/01.webp
    alt: Prototype on the workbench
```

External image and video:

```yaml
gallery:
  - type: image
    src: https://res.cloudinary.com/example/image/upload/example.webp
    alt: Prototype on the workbench
    caption: First movement test
  - type: video
    src: https://res.cloudinary.com/example/video/upload/test.mp4
    poster: https://res.cloudinary.com/example/image/upload/test-poster.webp
    caption: Motion test
```

A bare path still works and is treated as an image:

```yaml
gallery:
  - /images/events/example/01.webp
```

Image entries need `type`, `src`, and `alt` (`caption` optional). Video entries
need `type` and `src` (`poster` and `caption` optional). Remote values must be
`https://` URLs.

To create an entry, copy the matching file from `content/_templates/` into the
collection folder, rename it, and fill in the properties.

## Search (prepared, no UI)

`src/lib/search.ts` can build a record per published entry: title, lede,
Markdown body as plain text, tags, type, thread labels, and selected
metadata. It is not wired to a page yet.

The intended later step for this static site is [Pagefind](https://pagefind.app/)
after `astro build`. That indexes the rendered HTML, including body-only
words (e.g. a Note that mentions "Coca-Cola" only in Markdown). No backend
or CMS is required.

## Design tokens

Everything lives in `src/styles/global.css`. Components consume the *semantic*
roles, not the raw palette, so the contrast rules stay enforceable.

### Palette (School of Tomorrow's AI identity)

| Token                  | Value     |
| ---------------------- | --------- |
| `--color-deep-purple`  | `#22113E` |
| `--color-gray-green`   | `#CAD8D8` |
| `--color-pink`         | `#EA7DFF` |
| `--color-turquoise`    | `#08F2DB` |
| `--color-white`        | `#FFFFFF` |

### Semantic roles and surfaces

`--bg`, `--fg`, `--fg-muted`, `--accent`, `--accent-alt`, `--rule`

| Surface class             | Background  | Text        | Muted           | Accent      |
| ------------------------- | ----------- | ----------- | --------------- | ----------- |
| *(default)* `.theme-light`| White       | Deep Purple | Deep Purple 72% | Deep Purple |
| `.theme-dark`             | Deep Purple | White       | Gray Green      | Pink        |
| `.theme-soft`             | Gray Green  | Deep Purple | Deep Purple 75% | Deep Purple |

The site is light-first. `.theme-dark` is reserved for immersive moments
(constellation, selected headers/footers).

Rule enforced by the tokens: **Pink is never text on White.** On light surfaces
the accent resolves to Deep Purple.

### Typography

| Role                    | Family        | Weights   | Token          |
| ----------------------- | ------------- | --------- | -------------- |
| Titles                  | Space Grotesk | 300 · 500 | `--font-title` |
| Body                    | Inter         | 300 · 600 | `--font-body`  |
| Labels / metadata / mono| Courier Prime | 400 · 700 | `--font-mono`  |

Fonts load from Google Fonts via one `<link>` in `src/layouts/BaseLayout.astro`.
No font files are committed. (If self-hosting becomes desirable, Astro's fonts
API can fetch and bundle them at build time without adding files to the repo.)

Fluid type scale: `--text-xs` … `--text-2xl`. Reading measure: `--measure` (60ch).

## Research constellation

D3 force simulation over the content graph, rendered as SVG. One component,
two instances: the home page renders it inside `ConstellationSection` (a
full-bleed `.theme-dark` band with label + description) in production mode;
`/lab/constellation/` renders it directly with `mode="lab"`. `/research/`
stays textual. D3 is only shipped on those two pages: the client script is
hoisted from the component, so pages that don't render it load no JS.

| Concern                              | File |
| ------------------------------------ | ---- |
| Section chrome on light pages        | `src/components/ConstellationSection.astro` |
| Figure, props (`mode`, `labelledBy`) | `src/components/ResearchConstellation.astro` |
| Which nodes and links exist          | `src/lib/constellation.ts` — all published studies, notes, references, events, plus threads. Edges come from `threads` and explicit `related`. Tags are stored on nodes but are not edges. |
| Composition, forces, motion, sizes, labels | `src/lib/constellation.config.ts` |
| Colours, glow, link strokes, type    | `src/components/ResearchConstellation.astro` (`<style>`) |
| Simulation, ambient loop, interaction, debug panel | `src/scripts/constellation-client.ts` |

Composition is authored, not emergent: the root is anchored at the centre and
the three threads have fixed home angles (`composition.threadAngles`) on an
ellipse sized by `graphScale`. Content is only *pulled* toward the mean of its
threads' homes (single-thread content drifts to the region, multi-thread
content settles between attractors); nothing else is hard-positioned. Root
and thread labels are always shown; content labels appear on hover/focus
(`labels.pinnedIds` can force some on later).

In development, open `/lab/constellation/?debug` (lab mode only; production
instances ignore `?debug`) for live sliders grouped as
composition (graph scale, thread/content region strength, content spread),
forces (link distance, charge, collision), motion (drift, idle alpha, node
breathing amplitude/speed), links (curvature, `related` pulse speed/interval)
and look (root halo intensity), plus a "log config" button. The panel is
compiled out of production. Respects `prefers-reduced-motion` (graph settles
and stops; no breathing or travelling pulses).

## Tomorrow's Waves

p5.js 2.x, 2D canvas (no WEBGL). Port of the approved standalone sketch:
seeded ribbons, body lines, optional cross mesh, defining edges, free threads,
gradient colour ramps, and pointer influence. Palette is Deep Purple / Gray
Green / Pink / Turquoise on White. Default production state: seed `330402`,
speed `1`, ribbons `6`, lines `72`, amplitude `1.5`, width `1.7`, twist
`0.75`, mesh/threads/mouse on, deep purple off.

Used as the homepage hero background (`mode="fill"`) and as a full-viewport
lab at `/lab/waves/`. Portrait canvases scale ribbon *width* only so the
field does not flood; seed, counts, and the algorithm stay the same.

| Concern | File |
| ------- | ---- |
| Approved defaults (seed, sliders, toggles) and compact width scale | `src/lib/waves.config.ts` |
| Instance-mode p5 sketch + debug panel | `src/scripts/waves-client.ts` |
| Figure, `block` / `fill` sizing modes, debug styles | `src/components/GenerativeWaves.astro` |
| Homepage hero: full-bleed background behind the title | `src/pages/index.astro` |
| Lab page: full-viewport canvas for visual review | `src/pages/lab/waves.astro` |

In development, `/lab/waves/?debug` shows the HTML sketch's controls (compiled
out of production; never mounted on the homepage). The canvas layer uses
`pointer-events: none` and follows the pointer passively. Respects
`prefers-reduced-motion` (single static frame, no pointer). Animation pauses
when the tab is hidden or the canvas is offscreen. p5 is bundled only into
pages that render the component.

## Deployment (later)

Target: GitHub Pages. Set `site` (and `base` for a project repo) in
`astro.config.ts`, then add the official Astro GitHub Pages action.
