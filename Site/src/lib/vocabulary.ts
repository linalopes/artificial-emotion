/**
 * Controlled vocabulary shared by the content schemas (src/content.config.ts)
 * and, later, by pages and visualisations (labels, colours, filters).
 *
 * Keep this file free of Astro imports so it can be used anywhere.
 */

/**
 * The four primary content collections. These are the only valid targets
 * for `related` and the only entries aggregated by a Research Thread's
 * `threads:` membership.
 *
 * Research Threads are a conceptual layer above this list. Their editorial
 * Markdown lives in `content/research/` but is not a fifth primary collection.
 */
export const COLLECTIONS = ['studies', 'notes', 'references', 'events'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** Markdown folder for Research Thread editorial source. Not a primary collection. */
export const RESEARCH_COLLECTION = 'research' as const;
export type ResearchCollectionName = typeof RESEARCH_COLLECTION;

/** Public-facing labels. Internal names stay as-is (e.g. `notes` → "Studio Notes"). */
export const COLLECTION_LABELS: Record<CollectionName, string> = {
  studies: 'Studies',
  notes: 'Studio Notes',
  references: 'References',
  events: 'Events',
};

/** Singular label, used when describing one entry ("Study", "Studio Note"). */
export const COLLECTION_LABELS_SINGULAR: Record<CollectionName, string> = {
  studies: 'Study',
  notes: 'Studio Note',
  references: 'Reference',
  events: 'Event',
};

/**
 * Canonical Research Thread identifiers, in display order:
 * 1. Soft Mechanisms  2. Kinetic Studies  3. Heartbeat & Biosignals
 *
 * Filename, URL, and `threads:` membership all use this id:
 * `content/research/soft-mechanisms.md` → `/research/soft-mechanisms/`
 * ↔ `threads: [soft-mechanisms]`.
 *
 * Editorial title, subtitle, lede, questions, process, cover, gallery and
 * tags live in the Markdown file. Do not duplicate that copy here.
 */
export const RESEARCH_THREADS = [
  'soft-mechanisms',
  'kinetic-studies',
  'heartbeat-biosignals',
] as const;
export type ResearchThread = (typeof RESEARCH_THREADS)[number];

/** Fallback titles if a Research Thread Markdown file is missing. */
export const THREAD_LABELS: Record<ResearchThread, string> = {
  'soft-mechanisms': 'Soft Mechanisms',
  'kinetic-studies': 'Kinetic Studies',
  'heartbeat-biosignals': 'Heartbeat & Biosignals',
};

export function isResearchThread(value: string): value is ResearchThread {
  return (RESEARCH_THREADS as readonly string[]).includes(value);
}

/**
 * Suggested Note `type` values. Notes stay one collection; this is a
 * lightweight semantic hint, not a separate content type.
 * The schema accepts any string so new kinds can appear without a code change.
 */
export const NOTE_TYPES = [
  'person',
  'institution',
  'place',
  'tool',
  'software',
  'material',
  'concept',
  'process',
  'collaboration',
  'other',
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

/** Lifecycle of a Study, from first idea to integration in a larger work. */
export const STUDY_STATUSES = ['seed', 'experiment', 'prototype', 'integrated'] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** Lifecycle of a public Event. */
export const EVENT_STATUSES = ['upcoming', 'ongoing', 'past', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Semantic event category. Internal ids stay kebab-case in frontmatter. */
export const EVENT_TYPES = [
  'open-studio',
  'workshop',
  'exhibition',
  'talk',
  'presentation',
  'screening',
  'residency',
  'other',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  'open-studio': 'Open studio',
  workshop: 'Workshop',
  exhibition: 'Exhibition',
  talk: 'Talk',
  presentation: 'Presentation',
  screening: 'Screening',
  residency: 'Residency',
  other: 'Event',
};

/** Default IANA timezone for event clocks. */
export const EVENT_TIMEZONE_DEFAULT = 'Europe/Zurich';
