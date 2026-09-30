/**
 * Controlled vocabulary shared by the content schemas (src/content.config.ts)
 * and, later, by pages and visualisations (labels, colours, filters).
 *
 * Keep this file free of Astro imports so it can be used anywhere.
 */

/** The four Markdown collections under /content. */
export const COLLECTIONS = ['studies', 'notes', 'references', 'events'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

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

/** Canonical research thread identifiers. Use exactly these in frontmatter. */
export const RESEARCH_THREADS = [
  'soft-mechanisms',
  'kinetic-studies',
  'heartbeat-biosignals',
] as const;
export type ResearchThread = (typeof RESEARCH_THREADS)[number];

export interface ThreadMeta {
  id: ResearchThread;
  /** Public label. */
  label: string;
  /** One-sentence description shown on /research/ and the thread page. */
  description: string;
}

/** Public metadata for each thread. Edit wording here; ids stay canonical. */
export const THREADS: Record<ResearchThread, ThreadMeta> = {
  'soft-mechanisms': {
    id: 'soft-mechanisms',
    label: 'Soft Mechanisms',
    description:
      'Research into compliant structures, textiles, tension, deformation and mechanisms that behave through softness rather than rigid articulation.',
  },
  'kinetic-studies': {
    id: 'kinetic-studies',
    label: 'Kinetic Studies',
    description:
      'Research into movement, rhythm, balance, repetition, suspension and the expressive behavior of mechanical systems.',
  },
  'heartbeat-biosignals': {
    id: 'heartbeat-biosignals',
    label: 'Heartbeat & Biosignals',
    description:
      'Research into pulse, sensing, amplification and the translation of bodily signals into mechanical or visual behavior.',
  },
};

/** Threads in canonical display order. */
export const THREAD_LIST: readonly ThreadMeta[] = RESEARCH_THREADS.map((id) => THREADS[id]);

/** Convenience: id → public label. */
export const THREAD_LABELS: Record<ResearchThread, string> = Object.fromEntries(
  RESEARCH_THREADS.map((id) => [id, THREADS[id].label]),
) as Record<ResearchThread, string>;

/** Lifecycle of a Study, from first idea to integration in a larger work. */
export const STUDY_STATUSES = ['seed', 'experiment', 'prototype', 'integrated'] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** Whether an Event is still ahead or already happened. */
export const EVENT_STATUSES = ['upcoming', 'past'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
