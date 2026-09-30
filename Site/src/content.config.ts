import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import {
  COLLECTIONS,
  EVENT_STATUSES,
  RESEARCH_THREADS,
  STUDY_STATUSES,
  type CollectionName,
} from './lib/vocabulary';

/* --------------------------------------------------------------------------
   Loader
   Content lives in the root-level /content folder (inside the Obsidian vault).
   Anything whose name starts with "_" is never loaded: /content/_templates,
   private scratch files, etc.
   -------------------------------------------------------------------------- */
const markdownIn = (folder: CollectionName) =>
  glob({
    base: `./content/${folder}`,
    pattern: ['**/*.md', '!**/_*', '!**/_*/**'],
  });

/* --------------------------------------------------------------------------
   Obsidian-friendly helpers
   Obsidian writes a cleared property as `key:` (YAML null) or "". Treat both
   as "not set" so optional fields and defaults behave as expected. Without
   this, `end:` would silently become 1970-01-01 via z.coerce.date().
   -------------------------------------------------------------------------- */
const unset = (value: unknown) => (value === null || value === '' ? undefined : value);

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(unset, schema.optional());

const withDefault = <T extends z.ZodType>(
  schema: T,
  fallback: Exclude<z.output<T>, undefined>,
) => z.preprocess(unset, schema.default(fallback));

/* --------------------------------------------------------------------------
   Reusable field schemas
   -------------------------------------------------------------------------- */

/** One canonical research thread. */
export const threadSchema = z.enum(RESEARCH_THREADS);

/** Zero, one or many threads. */
const threads = withDefault(z.array(threadSchema), []);

const tags = withDefault(z.array(z.string()), []);

/** Entries are private until explicitly published with `draft: false`. */
const draft = withDefault(z.boolean(), true);

/**
 * Cross-collection link written in frontmatter as "collection/id",
 * e.g. "notes/when-does-movement-look-hesitant".
 * Transformed into Astro's { collection, id } reference shape so pages can
 * pass it straight to getEntry() / getEntries(). Existence is not checked at
 * build time, so linking to a not-yet-written entry never breaks the build.
 */
const relatedPattern = new RegExp(`^(${COLLECTIONS.join('|')})/[^\\s/]\\S*$`);

export const relatedRef = z
  .string()
  .regex(
    relatedPattern,
    `Use "collection/id" where collection is one of: ${COLLECTIONS.join(', ')}`,
  )
  .transform((value) => {
    const slash = value.indexOf('/');
    return {
      collection: value.slice(0, slash) as CollectionName,
      id: value.slice(slash + 1),
    };
  });

const related = withDefault(z.array(relatedRef), []);

/* --------------------------------------------------------------------------
   Collections
   -------------------------------------------------------------------------- */

/** A documented research experiment. Body convention: Question / Setup / Observation / Next. */
const studies = defineCollection({
  loader: markdownIn('studies'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    status: withDefault(z.enum(STUDY_STATUSES), 'seed'),
    threads,
    tags,
    materials: withDefault(z.array(z.string()), []),
    related,
    cover: optional(z.string()),
    youtube: optional(z.string()),
    draft,
  }),
});

/** A looser research thought, observation, sketch or studio reflection. Free-form body. */
const notes = defineCollection({
  loader: markdownIn('notes'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    threads,
    tags,
    related,
    draft,
  }),
});

/** An artist, artwork, paper, book, project, technology, material or other influence. */
const references = defineCollection({
  loader: markdownIn('references'),
  schema: z.object({
    title: z.string(),
    creator: optional(z.string()),
    year: optional(z.union([z.number().int(), z.string()])),
    referenceType: optional(z.string()),
    url: optional(z.url()),
    threads,
    tags,
    related,
    image: optional(z.string()),
    draft,
  }),
});

/** A public moment in the research. Body convention: About / What was shown / Documentation / Reflection. */
const events = defineCollection({
  loader: markdownIn('events'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    end: optional(z.coerce.date()),
    location: optional(z.string()),
    status: withDefault(z.enum(EVENT_STATUSES), 'upcoming'),
    rsvp: optional(z.url()),
    cover: optional(z.string()),
    youtube: optional(z.string()),
    related,
    draft,
  }),
});

export const collections = { studies, notes, references, events };
