import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import {
  COLLECTIONS,
  EVENT_STATUSES,
  EVENT_TIMEZONE_DEFAULT,
  EVENT_TYPES,
  RESEARCH_COLLECTION,
  RESEARCH_THREADS,
  STUDY_STATUSES,
  type CollectionName,
  type ResearchCollectionName,
} from './lib/vocabulary';

/* --------------------------------------------------------------------------
   Loader
   Content lives in the root-level /content folder (inside the Obsidian vault).
   Anything whose name starts with "_" is never loaded: /content/_templates,
   private scratch files, etc.
   -------------------------------------------------------------------------- */
const markdownIn = (folder: CollectionName | ResearchCollectionName) =>
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
 * Only the four primary collections are valid targets. Research Threads
 * are reached through `threads: [soft-mechanisms]`, not `related`.
 * Existence is not checked at build time, so linking to a not-yet-written
 * entry never breaks the build.
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

/**
 * Explicit artist-declared relationship. This is a strong semantic edge.
 * Shared `tags` are not related-ness and must not be treated as such.
 */
const related = withDefault(z.array(relatedRef), []);

/**
 * Clock time as "HH:MM". Quoted strings are preferred in YAML.
 * Unquoted `14:00` may arrive as YAML sexagesimal minutes (840); coerce those.
 */
const clockTime = z.preprocess((value) => {
  const raw = unset(value);
  if (raw === undefined) return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const total = Math.round(raw);
    const hours = Math.floor(total / 60);
    const minutes = ((total % 60) + 60) % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return typeof raw === 'string' ? raw.trim() : raw;
}, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. "14:00"'));

/** Local site-root path or externally hosted HTTPS asset. Not downloaded at build time. */
const mediaRef = z
  .string()
  .min(1)
  .refine(
    (value) => /^https:\/\//i.test(value.trim()) || value.trim().startsWith('/'),
    'Use an HTTPS URL or a site-root path starting with /',
  )
  .transform((value) => value.trim());

const galleryImage = z.object({
  type: z.literal('image'),
  src: mediaRef,
  alt: z.string(),
  caption: optional(z.string()),
});

const galleryVideo = z.object({
  type: z.literal('video'),
  src: mediaRef,
  poster: optional(mediaRef),
  caption: optional(z.string()),
});

/** Shorthand: a bare path/URL is an image. */
const galleryItem = z.union([
  mediaRef.transform((src) => ({
    type: 'image' as const,
    src,
    alt: '',
    caption: undefined,
  })),
  galleryImage,
  galleryVideo,
]);

const gallery = z.preprocess((value) => {
  const raw = unset(value);
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return raw;
  return raw.filter((item) => item !== null && item !== '');
}, z.array(galleryItem).default([]));

/* --------------------------------------------------------------------------
   Collections
   -------------------------------------------------------------------------- */

/** A documented experiment or prototype created within the research. Not a Note. Body convention: Question / Setup / Observation / Next. */
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

/**
 * Generic knowledge object. Anything that is not a Study, Reference or Event
 * may be a Note: person, institution, place, tool, concept, observation, etc.
 * Long-form explanation belongs in the Markdown body.
 */
const notes = defineCollection({
  loader: markdownIn('notes'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: optional(z.string()),
    lede: optional(z.string()),
    url: optional(z.url()),
    cover: optional(mediaRef),
    gallery,
    threads,
    tags,
    related,
    draft,
  }),
});

/** An external source that informed the research. Not a Note. Body explains why it matters to Artificial Emotion. */
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

/** A public moment in the research. Body convention: About / Program / Documentation / Reflection. */
const events = defineCollection({
  loader: markdownIn('events'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    startTime: optional(clockTime),
    endTime: optional(clockTime),
    timezone: withDefault(z.string(), EVENT_TIMEZONE_DEFAULT),
    eventType: optional(z.enum(EVENT_TYPES)),
    status: withDefault(z.enum(EVENT_STATUSES), 'upcoming'),
    location: optional(z.string()),
    lede: optional(z.string()),
    rsvp: optional(z.url()),
    eventUrl: optional(z.url()),
    cover: optional(mediaRef),
    gallery,
    youtube: optional(z.string()),
    threads,
    tags,
    related,
    draft,
  }),
});

/**
 * Editorial source for a canonical Research Thread.
 * Not a Study, Note, Reference or Event. Filename must be the thread id.
 * Membership of other entries is declared on those entries via `threads`.
 */
const research = defineCollection({
  loader: markdownIn(RESEARCH_COLLECTION),
  schema: z.object({
    title: z.string(),
    subtitle: optional(z.string()),
    lede: optional(z.string()),
    questions: withDefault(z.array(z.string()), []),
    process: withDefault(z.array(z.string()), []),
    cover: optional(mediaRef),
    gallery,
    tags,
    draft,
  }),
});

export const collections = { studies, notes, references, events, research };
