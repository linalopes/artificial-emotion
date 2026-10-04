/**
 * Build-time search index for a later full-text UI.
 *
 * Not wired to any page. A future search page can call `buildSearchIndex()`
 * and either:
 *   1. serialize the records to JSON and filter in the browser, or
 *   2. add Pagefind after `astro build` so the rendered HTML (including
 *      Markdown body) is indexed automatically.
 *
 * Pagefind is the simplest later step for this static site: it finds words
 * that appear only in the body (e.g. "Coca-Cola") without a backend.
 * This helper keeps a content-layer index available if we want an isolated
 * in-browser search without extra tooling.
 */
import { getPublished } from './content';
import { entryPath } from './paths';
import {
  COLLECTION_LABELS_SINGULAR,
  THREAD_LABELS,
  type CollectionName,
  type ResearchThread,
} from './vocabulary';

export interface SearchRecord {
  /** Stable key, same as `related`: "notes/institute-for-future-technologies". */
  id: string;
  collection: CollectionName;
  href: string;
  title: string;
  lede: string;
  /** Plain text from the Markdown body. Required for body-only queries. */
  body: string;
  tags: string[];
  /** Note `type`, study/event status, referenceType, etc. */
  type: string;
  threadLabels: string[];
  metadata: string[];
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function record(
  collection: CollectionName,
  entry: { id: string; body?: string; data: { title: string } },
  extra: {
    lede?: string;
    tags?: string[];
    type?: string;
    threadIds?: readonly ResearchThread[];
    metadata?: string[];
  },
): SearchRecord {
  const threadIds = extra.threadIds ?? [];
  const type = extra.type ?? '';
  return {
    id: `${collection}/${entry.id}`,
    collection,
    href: entryPath(collection, entry.id),
    title: entry.data.title,
    lede: extra.lede ?? '',
    body: markdownToPlainText(entry.body ?? ''),
    tags: extra.tags ?? [],
    type,
    threadLabels: threadIds.map((thread) => THREAD_LABELS[thread]),
    metadata: [COLLECTION_LABELS_SINGULAR[collection], type, ...(extra.metadata ?? [])].filter(Boolean),
  };
}

export async function buildSearchIndex(): Promise<SearchRecord[]> {
  const [studies, notes, references, events] = await Promise.all([
    getPublished('studies'),
    getPublished('notes'),
    getPublished('references'),
    getPublished('events'),
  ]);

  return [
    ...studies.map((entry) =>
      record('studies', entry, {
        lede: asText(entry.data.lede),
        tags: entry.data.tags,
        type: entry.data.status,
        threadIds: entry.data.threads,
        metadata: [asText(entry.data.subtitle), entry.data.materials.join(' ')].filter(Boolean),
      }),
    ),
    ...notes.map((entry) =>
      record('notes', entry, {
        lede: asText(entry.data.lede),
        tags: entry.data.tags,
        type: asText(entry.data.type),
        threadIds: entry.data.threads,
      }),
    ),
    ...references.map((entry) =>
      record('references', entry, {
        tags: entry.data.tags,
        type: asText(entry.data.referenceType),
        threadIds: entry.data.threads,
        metadata: [
          asText(entry.data.creator),
          entry.data.year !== undefined ? String(entry.data.year) : '',
          entry.data.date.toISOString().slice(0, 10),
        ],
      }),
    ),
    ...events.map((entry) =>
      record('events', entry, {
        lede: asText(entry.data.lede),
        tags: entry.data.tags,
        type: entry.data.status,
        threadIds: entry.data.threads,
        metadata: [asText(entry.data.location)],
      }),
    ),
  ];
}
