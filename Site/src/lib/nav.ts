/**
 * Canonical global navigation. Homepage and internal pages both render this list.
 * Visual treatment stays in SiteHeader; this file is labels, order and targets only.
 */
import { collectionPath, href, researchPath } from './paths';
import { COLLECTIONS, COLLECTION_LABELS } from './vocabulary';

export interface SiteNavItem {
  label: string;
  path: string;
}

export const SITE_NAV: readonly SiteNavItem[] = [
  { label: 'Research', path: researchPath() },
  ...COLLECTIONS.map((collection) => ({
    label: COLLECTION_LABELS[collection],
    path: collectionPath(collection),
  })),
  { label: 'Constellation', path: href('/#constellation') },
  { label: 'About', path: href('/#about') },
];

/** Collection and Research routes mark the current section; homepage anchors do not. */
export function isNavCurrent(pathname: string, path: string): boolean {
  if (path.includes('#')) return false;
  const current = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const target = path.endsWith('/') ? path : `${path}/`;
  return current === target || current.startsWith(target);
}
