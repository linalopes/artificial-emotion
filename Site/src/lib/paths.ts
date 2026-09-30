import type { CollectionName, ResearchThread } from './vocabulary';

/**
 * Prefix a site-relative path with Astro's `base` so links keep working when
 * the site is served from a sub-path (GitHub Pages project sites).
 * `href('/studies/')` → `/studies/` locally, `/<repo>/studies/` with a base.
 */
export function href(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Canonical list page for a collection: /studies/ */
export function collectionPath(collection: CollectionName): string {
  return href(`/${collection}/`);
}

/** Canonical detail page for an entry: /studies/breathing-textile/ */
export function entryPath(collection: CollectionName, id: string): string {
  return href(`/${collection}/${id}/`);
}

/** Research thread index: /research/ */
export const RESEARCH_PATH = '/research/';

export function researchPath(): string {
  return href(RESEARCH_PATH);
}

/** Research thread page: /research/soft-mechanisms/ */
export function threadPath(thread: ResearchThread): string {
  return href(`${RESEARCH_PATH}${thread}/`);
}
