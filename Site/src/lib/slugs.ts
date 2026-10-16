/**
 * Public URL identity for Studies, Notes, References and Events.
 *
 * The Markdown filename may be `YYYY-MM-DD-slug.md` for chronological sorting.
 * The public path is always `/collection/slug/`. `slug` is stored in frontmatter
 * and must not change when the editorial title changes.
 *
 * Research Threads keep canonical filenames and are not handled here.
 */
import type { CollectionName } from './vocabulary';

/** Lowercase kebab-case public slug, e.g. `paper-heart`. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

const assigned = new Map<string, string>();

export function filenameStem(entry: string): string {
  return entry.replace(/\\/g, '/').replace(/\.md$/i, '').split('/').pop() ?? entry;
}

/** Strip a leading YYYY-MM-DD- from a filename stem, if present. */
export function slugFromFilename(entry: string): string {
  const stem = filenameStem(entry);
  const match = DATE_PREFIX.exec(stem);
  return match ? match[2] : stem;
}

function scalarSlug(value: unknown): string | undefined {
  if (value === null || value === '' || value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

/**
 * Public slug for a glob entry. Frontmatter `slug` wins; otherwise the
 * filename minus an optional date prefix. Title is never used.
 */
export function resolvePublicSlug(entry: string, data: Record<string, unknown> | undefined): string {
  return scalarSlug(data?.slug) ?? slugFromFilename(entry);
}

/** Glob `generateId`: public slug, unique within the collection. */
export function contentGenerateId(
  collection: CollectionName,
  options: { entry: string; data: Record<string, unknown> },
): string {
  const slug = resolvePublicSlug(options.entry, options.data);
  const key = `${collection}:${slug}`;
  const previous = assigned.get(key);
  if (previous && previous !== options.entry) {
    throw new Error(
      `Duplicate public slug "${slug}" in ${collection}: ${previous} and ${options.entry}`,
    );
  }
  assigned.set(key, options.entry);
  return slug;
}
