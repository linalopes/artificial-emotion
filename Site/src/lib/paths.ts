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

/** Frontmatter media path: keep remote URLs, prefix site-relative ones with `base`. */
export function mediaSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return href(path);
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

/** Tag vocabulary index: /tags/ */
export const TAGS_PATH = '/tags/';

export function tagsPath(): string {
  return href(TAGS_PATH);
}

/** Tag page: /tags/paper/ */
export function tagPath(tag: string): string {
  return href(`${TAGS_PATH}${encodeURIComponent(tag)}/`);
}
