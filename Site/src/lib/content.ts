/**
 * Central access layer for the Markdown collections.
 * Pages should go through these helpers instead of calling astro:content
 * directly, so publishing rules (drafts, ordering, related resolution) live
 * in one place.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import {
  getCloudinaryFolderMedia,
  mergeGallerySources,
  normalizeGalleryFolder,
  type GalleryItem,
} from './cloudinary';
import { entryPath } from './paths';
import {
  COLLECTIONS,
  COLLECTION_LABELS,
  COLLECTION_LABELS_SINGULAR,
  EVENT_TYPE_LABELS,
  RESEARCH_THREADS,
  THREAD_LABELS,
  isResearchThread,
  researchLogicalId,
  type CollectionName,
  type ResearchThread,
} from './vocabulary';

/* --------------------------------------------------------------------------
   Fetching
   -------------------------------------------------------------------------- */

/** All entries of a collection that are not drafts. */
export async function getPublished<C extends CollectionName>(
  collection: C,
): Promise<CollectionEntry<C>[]> {
  return getCollection(collection, (entry) => !entry.data.draft);
}

/** Collections whose entries carry a `date` field. */
export type DatedCollection = 'studies' | 'notes' | 'events';

/** Published entries, newest first. */
export async function getPublishedByDate<C extends DatedCollection>(
  collection: C,
): Promise<CollectionEntry<C>[]> {
  return sortNewestFirst(await getPublished(collection));
}

/* --------------------------------------------------------------------------
   Research threads
   A Research Thread is a conceptual layer above the four primary collections.
   Editorial copy lives in `content/research/<id>.md`. Associated Studies,
   Notes, References and Events are never listed there: they are derived
   from each entry's `threads: [<id>]`.
   -------------------------------------------------------------------------- */

const researchMarkdownPath = (id: ResearchThread) => `content/research/${id}.md`;

function missingResearchEntryError(id: ResearchThread): Error {
  return new Error(`Research entry "${id}" could not be loaded from ${researchMarkdownPath(id)}`);
}

function asResearchThreadId(id: string): ResearchThread | undefined {
  const logical = researchLogicalId(id);
  return isResearchThread(logical) ? logical : undefined;
}

async function loadResearchEntryMap(): Promise<Map<ResearchThread, CollectionEntry<'research'>>> {
  const entries = await getCollection('research');
  const byId = new Map<ResearchThread, CollectionEntry<'research'>>();

  for (const entry of entries) {
    const id = asResearchThreadId(entry.id) ?? asResearchThreadId(entry.filePath ?? '');
    if (!id) {
      console.warn(
        `[content] ignoring research file "${entry.id}"; filename must be a canonical thread id`,
      );
      continue;
    }
    byId.set(id, entry);
  }

  return byId;
}

/** Published Research Thread Markdown, in canonical id order. */
export async function getPublishedResearchThreads(): Promise<CollectionEntry<'research'>[]> {
  return (await getResearchThreads()).filter((entry) => !entry.data.draft);
}

/** All Research Thread Markdown files, including drafts, in canonical id order. */
export async function getResearchThreads(): Promise<CollectionEntry<'research'>[]> {
  const byId = await loadResearchEntryMap();
  return RESEARCH_THREADS.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw missingResearchEntryError(id);
    return entry;
  });
}

export async function getResearchThread(id: ResearchThread): Promise<CollectionEntry<'research'>> {
  for (const key of [id, `${id}.md`]) {
    const direct = await getEntry('research', key);
    if (direct && asResearchThreadId(direct.id) === id) return direct;
  }

  const entry = (await loadResearchEntryMap()).get(id);
  if (!entry) throw missingResearchEntryError(id);
  return entry;
}

/**
 * Research Thread gallery for rendering: Cloudinary folder assets (if set)
 * plus manually declared `gallery` items. Folder listing is build-time only.
 */
export async function resolveResearchGallery(
  entry: CollectionEntry<'research'>,
): Promise<GalleryItem[]> {
  const folder = entry.data.galleryFolder
    ? normalizeGalleryFolder(entry.data.galleryFolder)
    : undefined;
  const manual = entry.data.gallery.filter((item) => item.src.trim());
  if (!folder) return manual;
  return mergeGallerySources(await getCloudinaryFolderMedia(folder), manual);
}

/* --------------------------------------------------------------------------
   Thread aggregation
   A thread page is a curated view over existing primary entries: anything
   published whose `threads` contains the thread id.
   -------------------------------------------------------------------------- */

/** Collections whose schema includes `threads`. */
export const THREADED_COLLECTIONS = ['studies', 'notes', 'references', 'events'] as const;
export type ThreadedCollection = (typeof THREADED_COLLECTIONS)[number];

export interface ThreadContent {
  studies: CollectionEntry<'studies'>[];
  notes: CollectionEntry<'notes'>[];
  references: CollectionEntry<'references'>[];
  events: CollectionEntry<'events'>[];
}

/** Published entries tagged with a thread, grouped by collection and sorted. */
export async function getPublishedByThread(thread: ResearchThread): Promise<ThreadContent> {
  const inThread = <T extends { data: { threads: readonly ResearchThread[] } }>(entries: T[]) =>
    entries.filter((entry) => entry.data.threads.includes(thread));

  const [studies, notes, references, events] = await Promise.all([
    getPublishedByDate('studies'),
    getPublishedByDate('notes'),
    getPublished('references'),
    getPublishedByDate('events'),
  ]);

  return {
    studies: inThread(studies),
    notes: inThread(notes),
    references: sortByTitle(inThread(references)),
    events: inThread(events),
  };
}

/** Total number of entries across all groups. */
export function countThreadContent(content: ThreadContent): number {
  return THREADED_COLLECTIONS.reduce((n, c) => n + content[c].length, 0);
}

/* --------------------------------------------------------------------------
   Tags
   Shared characteristics across collections. Not Research Threads and not
   `related`. Pages are built only from published entries that actually use
   a tag.
   -------------------------------------------------------------------------- */

/** Collections that may carry tags, in tag-page group order. */
export const TAGGED_COLLECTIONS = [
  'research',
  'studies',
  'notes',
  'references',
  'events',
] as const;
export type TaggedCollection = (typeof TAGGED_COLLECTIONS)[number];

export const TAG_COLLECTION_LABELS: Record<TaggedCollection, string> = {
  research: 'Research',
  studies: COLLECTION_LABELS.studies,
  notes: COLLECTION_LABELS.notes,
  references: COLLECTION_LABELS.references,
  events: COLLECTION_LABELS.events,
};

export interface TagContent {
  research: CollectionEntry<'research'>[];
  studies: CollectionEntry<'studies'>[];
  notes: CollectionEntry<'notes'>[];
  references: CollectionEntry<'references'>[];
  events: CollectionEntry<'events'>[];
}

export interface TagIndexItem {
  id: string;
  count: number;
}

/** Lowercase + trim only. Do not invent kebab-case at runtime. */
export function normalizeTag(raw: string): string | undefined {
  const id = raw.trim().toLowerCase();
  return id || undefined;
}

/** Human label for an authored tag id. Keep technical names readable. */
export function tagDisplayLabel(id: string): string {
  return id.replace(/-/g, ' ');
}

/** Unique normalized tags on one entry, first occurrence kept. */
export function uniqueEntryTags(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const id = normalizeTag(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function entryHasTag(tags: readonly string[] | undefined, tag: string): boolean {
  return uniqueEntryTags(tags).includes(tag);
}

let taggedCorpus: Promise<TagContent> | undefined;

async function loadPublishedTaggedCorpus(): Promise<TagContent> {
  taggedCorpus ??= (async () => {
    const [research, studies, notes, references, events] = await Promise.all([
      getPublishedResearchThreads(),
      getPublishedByDate('studies'),
      getPublishedByDate('notes'),
      getPublished('references'),
      getPublishedByDate('events'),
    ]);

    return {
      research,
      studies,
      notes,
      references: sortByTitle(references),
      events,
    };
  })();

  return taggedCorpus;
}

/** Published entries that carry a tag, grouped by collection. */
export async function getPublishedByTag(tag: string): Promise<TagContent> {
  const id = normalizeTag(tag);
  const empty: TagContent = {
    research: [],
    studies: [],
    notes: [],
    references: [],
    events: [],
  };
  if (!id) return empty;

  const corpus = await loadPublishedTaggedCorpus();
  return {
    research: corpus.research.filter((entry) => entryHasTag(entry.data.tags, id)),
    studies: corpus.studies.filter((entry) => entryHasTag(entry.data.tags, id)),
    notes: corpus.notes.filter((entry) => entryHasTag(entry.data.tags, id)),
    references: corpus.references.filter((entry) => entryHasTag(entry.data.tags, id)),
    events: corpus.events.filter((entry) => entryHasTag(entry.data.tags, id)),
  };
}

export function countTagContent(content: TagContent): number {
  return TAGGED_COLLECTIONS.reduce((n, collection) => n + content[collection].length, 0);
}

/** "4 entries across Studies, Studio Notes and Events." */
export function formatTagEntrySummary(content: TagContent): string {
  const count = countTagContent(content);
  const groups = TAGGED_COLLECTIONS.filter((collection) => content[collection].length > 0).map(
    (collection) => TAG_COLLECTION_LABELS[collection],
  );
  const noun = count === 1 ? 'entry' : 'entries';
  if (groups.length === 0) return `${count} ${noun}.`;
  if (groups.length === 1) return `${count} ${noun} across ${groups[0]}.`;
  if (groups.length === 2) return `${count} ${noun} across ${groups[0]} and ${groups[1]}.`;
  const last = groups[groups.length - 1];
  return `${count} ${noun} across ${groups.slice(0, -1).join(', ')} and ${last}.`;
}

/** Alphabetical published tags with unique-entry counts. Empty tags omitted. */
export async function getPublishedTagIndex(): Promise<TagIndexItem[]> {
  const corpus = await loadPublishedTaggedCorpus();
  const counts = new Map<string, number>();

  for (const collection of TAGGED_COLLECTIONS) {
    for (const entry of corpus[collection]) {
      for (const tag of uniqueEntryTags(entry.data.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function collectPublishedTags(): Promise<string[]> {
  return (await getPublishedTagIndex()).map((item) => item.id);
}

/* --------------------------------------------------------------------------
   Sorting
   -------------------------------------------------------------------------- */

export function sortNewestFirst<T extends { data: { date: Date } }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function sortByTitle<T extends { data: { title: string } }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.data.title.localeCompare(b.data.title));
}

/* --------------------------------------------------------------------------
   Related vs tags vs backlinks

   `related`  Explicit relationship declared by the artist. Strong semantic edge.
              Example: Prototype B was developed from Prototype A.

   `tags`     Shared characteristics or themes (acrylic, 3d-printing, paris).
              Two entries with the same tag are not explicitly related.

   backlinks  Reverse of `related`, derived at build time. If A lists B in
              `related`, B can show A under Referenced by. Never written by hand.
   -------------------------------------------------------------------------- */

export interface RelatedRef {
  collection: CollectionName;
  id: string;
}

export interface ResolvedRelated {
  collection: CollectionName;
  id: string;
  title: string;
  /** Singular content-type label, e.g. "Studio Note". */
  typeLabel: string;
  href: string;
}

/**
 * Resolve related references to published entries.
 * Missing targets and drafts are skipped (with a console warning in the
 * build log) so a dangling link in Obsidian never breaks the build.
 */
export async function resolveRelated(
  refs: readonly RelatedRef[],
  from?: string,
): Promise<ResolvedRelated[]> {
  const results = await Promise.all(
    refs.map(async (ref) => {
      const entry = await getEntry(ref.collection, ref.id);
      if (!entry) {
        console.warn(
          `[content] related target "${ref.collection}/${ref.id}" not found${from ? ` (from ${from})` : ''}`,
        );
        return null;
      }
      if (entry.data.draft) return null;
      return {
        collection: ref.collection,
        id: entry.id,
        title: entry.data.title,
        typeLabel: COLLECTION_LABELS_SINGULAR[ref.collection],
        href: entryPath(ref.collection, entry.id),
      } satisfies ResolvedRelated;
    }),
  );
  return results.filter((r): r is ResolvedRelated => r !== null);
}

export function contentKey(collection: CollectionName, id: string): string {
  return `${collection}/${id}`;
}

const toResolved = (entry: CollectionEntry<CollectionName>): ResolvedRelated => ({
  collection: entry.collection,
  id: entry.id,
  title: entry.data.title,
  typeLabel: COLLECTION_LABELS_SINGULAR[entry.collection],
  href: entryPath(entry.collection, entry.id),
});

let backlinkIndex: Promise<Map<string, ResolvedRelated[]>> | undefined;

/**
 * Build a reverse index of `related` across all published collections.
 * Cached for the duration of one build so pages do not rescan the vault.
 */
export async function getBacklinkIndex(): Promise<Map<string, ResolvedRelated[]>> {
  backlinkIndex ??= (async () => {
    const entries = (await Promise.all(COLLECTIONS.map((collection) => getPublished(collection)))).flat();
    const index = new Map<string, ResolvedRelated[]>();

    for (const entry of entries) {
      const source = toResolved(entry);
      for (const ref of entry.data.related) {
        const key = contentKey(ref.collection, ref.id);
        if (key === contentKey(entry.collection, entry.id)) continue;
        const list = index.get(key) ?? [];
        if (!list.some((item) => item.href === source.href)) list.push(source);
        index.set(key, list);
      }
    }

    return index;
  })();

  return backlinkIndex;
}

/** Published entries that explicitly list this entry in `related`. */
export async function getBacklinks(
  collection: CollectionName,
  id: string,
): Promise<ResolvedRelated[]> {
  const index = await getBacklinkIndex();
  return index.get(contentKey(collection, id)) ?? [];
}

/* --------------------------------------------------------------------------
   List items
   One place that decides which metadata a collection shows in lists, shared by
   the collection index pages and the research thread pages.
   -------------------------------------------------------------------------- */

export interface ListItem {
  href: string;
  title: string;
  meta: (string | undefined)[];
  datetime?: string;
}

const threadLabels = (threads: readonly ResearchThread[]) => threads.map((t) => THREAD_LABELS[t]);

export function toListItem(entry: CollectionEntry<CollectionName>): ListItem {
  const href = entryPath(entry.collection, entry.id);
  switch (entry.collection) {
    case 'studies': {
      const { data } = entry;
      return {
        href,
        title: data.title,
        datetime: isoDate(data.date),
        meta: [formatDate(data.date), data.status, ...threadLabels(data.threads)],
      };
    }
    case 'notes': {
      const { data } = entry;
      return {
        href,
        title: data.title,
        datetime: isoDate(data.date),
        meta: [formatDate(data.date), data.type, ...threadLabels(data.threads)],
      };
    }
    case 'references': {
      const { data } = entry;
      return {
        href,
        title: data.title,
        meta: [
          data.creator,
          data.year !== undefined ? String(data.year) : undefined,
          data.referenceType,
          ...threadLabels(data.threads),
        ],
      };
    }
    case 'events': {
      const { data } = entry;
      return {
        href,
        title: data.title,
        datetime: isoDate(data.date),
        meta: [
          formatDate(data.date),
          formatEventTime(data.startTime, data.endTime),
          data.location,
          data.eventType ? EVENT_TYPE_LABELS[data.eventType] : undefined,
          data.status,
        ],
      };
    }
  }
}

/* --------------------------------------------------------------------------
   Formatting
   -------------------------------------------------------------------------- */

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC', // YAML dates parse as UTC midnight; avoid off-by-one shifts
});

/** "15 November 2026" */
export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "15 Nov 2026" */
export function formatDateShort(date: Date): string {
  return shortDateFormatter.format(date);
}

/** "2026-11-15", for <time datetime> attributes. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "14:00–18:00", "14:00", or undefined. */
export function formatEventTime(start?: string, end?: string): string | undefined {
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return undefined;
}

/** Accepts a full YouTube URL or a bare video id. */
export function youtubeUrl(value: string): string {
  return /^https?:\/\//.test(value) ? value : `https://www.youtube.com/watch?v=${value}`;
}
