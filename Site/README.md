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
│   ├── studies/             documented research experiments
│   ├── notes/               looser thoughts, sketches, reflections
│   ├── references/          artists, works, papers, materials, influences
│   └── events/              public moments in the research
├── public/                  copied verbatim to dist/ (favicon, etc.)
└── src/
    ├── content.config.ts    collection schemas + glob loaders for content/*
    ├── lib/
    │   ├── vocabulary.ts    threads, statuses, collection names + public labels
    │   ├── content.ts       published-only fetching, sorting, related resolution, formatting
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
| `/research/`         | `src/pages/research/index.astro` — editorial overview of the three threads |
| `/research/[thread]/`| `src/pages/research/[thread].astro` — one page per thread in `THREAD_LIST` |
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

Only entries with `draft: false` get pages. Research thread pages are curated
views over existing entries (anything published whose `threads` contains the
thread id); they have no Markdown files of their own. Thread labels and
descriptions live in `src/lib/vocabulary.ts` (`THREADS`).

Generated folders (`node_modules/`, `dist/`, `.astro/`) are git-ignored. Consider
adding them to Obsidian → Settings → Files and links → Excluded files.

## Content model

Frontmatter is plain YAML, editable in Obsidian's Properties panel. Rules that
apply everywhere:

- Anything whose file or folder name starts with `_` is ignored by Astro.
- An entry's `id` is its filename, slugified (`Breathing Textile.md` → `breathing-textile`).
  Add a `slug:` property to override.
- Empty properties (`cover:`) count as "not set". Lists may be omitted entirely.
- `draft` defaults to `true`; set `draft: false` to publish.
- `threads` accepts only: `soft-mechanisms`, `kinetic-studies`, `heartbeat-biosignals`.
- `related` links to other entries as `collection/id`,
  e.g. `notes/when-does-movement-look-hesitant`. Targets don't have to exist yet.

| Collection   | Required        | Optional / defaults |
| ------------ | --------------- | ------------------- |
| `studies`    | title, date     | status (`seed` · experiment · prototype · integrated), threads, tags, materials, related, cover, youtube, draft |
| `notes`      | title, date     | threads, tags, related, draft |
| `references` | title           | creator, year, referenceType, url, threads, tags, related, image, draft |
| `events`     | title, date     | end, location, status (`upcoming` · past), lede, rsvp, cover, youtube, format, audience, organizedAt, partOf, whatToExpectIntro, whatToExpect, gallery, related, draft |

Body headings are an editorial convention, not validated:
Studies `## Question / ## Setup / ## Observation / ## Next` ·
References `## Why it matters / ## Notes` ·
Events `## About / ## Documentation / ## Reflection`.

Empty `## Documentation` or `## Reflection` headings are not rendered.

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
| Which nodes and links exist          | `src/lib/constellation.ts` |
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
