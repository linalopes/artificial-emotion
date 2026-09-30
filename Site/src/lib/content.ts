/**
 * Central access layer for the Markdown collections.
 * Pages should go through these helpers instead of calling astro:content
 * directly, so publishing rules (drafts, ordering, related resolution) live
 * in one place.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { entryPath } from './paths';
import {
  COLLECTION_LABELS_SINGULAR,
  THREAD_LABELS,
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
   A thread page is a curated view over existing entries: anything published
   whose `threads` contains the thread id. Only collections whose schema has a
   `threads` field take part (events currently do not).
   -------------------------------------------------------------------------- */

/** Collections whose schema includes `threads`. */
export const THREADED_COLLECTIONS = ['studies', 'notes', 'references'] as const;
export type ThreadedCollection = (typeof THREADED_COLLECTIONS)[number];

export interface ThreadContent {
  studies: CollectionEntry<'studies'>[];
  notes: CollectionEntry<'notes'>[];
  references: CollectionEntry<'references'>[];
}

/** Published entries tagged with a thread, grouped by collection and sorted. */
export async function getPublishedByThread(thread: ResearchThread): Promise<ThreadContent> {
  const inThread = <T extends { data: { threads: readonly ResearchThread[] } }>(entries: T[]) =>
    entries.filter((entry) => entry.data.threads.includes(thread));

  const [studies, notes, references] = await Promise.all([
    getPublishedByDate('studies'),
    getPublishedByDate('notes'),
    getPublished('references'),
  ]);

  return {
    studies: inThread(studies),
    notes: inThread(notes),
    references: sortByTitle(inThread(references)),
  };
}

/** Total number of entries across all groups. */
export function countThreadContent(content: ThreadContent): number {
  return THREADED_COLLECTIONS.reduce((n, c) => n + content[c].length, 0);
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
   Related entries
   Frontmatter `related: [ "notes/some-id" ]` is transformed by the schema
   into { collection, id }. Resolve those to real entries here.
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
        meta: [formatDate(data.date), ...threadLabels(data.threads)],
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
        meta: [formatDate(data.date), data.location, data.status],
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

/** Accepts a full YouTube URL or a bare video id. */
export function youtubeUrl(value: string): string {
  return /^https?:\/\//.test(value) ? value : `https://www.youtube.com/watch?v=${value}`;
}
