/**
 * Obsidian `![[file.svg]]` / `![[file.svg|alt]]` embeds.
 * Files stay in their research folders. Public URLs are served from `/repo-svg/`
 * by the Vite plugin in repo-svg.ts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { lightboxImageHtml } from './lightbox-image';
import { href } from './paths';

export type SvgWikiEmbedProps = {
  /** Repo-relative POSIX path of the resolved SVG. */
  src: string;
  alt: string;
};

const WIKI_EMBED = /^!\[\[([^\[\]]+)\]\]\s*$/;
const SVG_NAME = /\.svg$/i;
const BLOCKED = new Set(['.git', 'node_modules', 'Site', 'dist']);
const UNSAFE_SEGMENT = /[\u0000-\u001f<>:"|?*]/;

export const REPO_SVG_PREFIX = '/repo-svg/';

function skipDir(name: string): boolean {
  return BLOCKED.has(name) || name.startsWith('.');
}

export function svgAltFromFilename(filename: string): string {
  return filename.replace(/\.svg$/i, '').replace(/\.excalidraw$/i, '').trim() || filename;
}

/**
 * Normalize a wikilink target to a POSIX filename or repo-relative path.
 * Rejects traversal, absolute paths, and non-SVG names. Allows spaces.
 */
export function normalizeSvgWikiTarget(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('\0')) return null;
  if (trimmed.includes('://') || trimmed.includes('..') || /[?#]/.test(trimmed)) return null;
  if (!SVG_NAME.test(trimmed)) return null;

  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (!part || part === '.' || skipDir(part) || UNSAFE_SEGMENT.test(part)) return null;
  }
  return parts.join('/');
}

export function parseSvgWikiEmbed(source: string): { target: string; alt?: string } | null {
  const match = WIKI_EMBED.exec(source.trim());
  if (!match) return null;

  const inner = match[1];
  const pipe = inner.indexOf('|');
  const targetRaw = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const altRaw = pipe === -1 ? '' : inner.slice(pipe + 1).trim();
  const target = normalizeSvgWikiTarget(targetRaw);
  if (!target) return null;
  return altRaw ? { target, alt: altRaw } : { target };
}

export function isSvgWikiEmbedLine(line: string): boolean {
  return parseSvgWikiEmbed(line) !== null;
}

export function findSvgWikiEmbeds(markdown: string): Array<{ target: string; alt?: string }> {
  const found: Array<{ target: string; alt?: string }> = [];
  const pattern = /!\[\[([^\[\]]+)\]\]/g;
  const searchable = markdown
    .replace(/^```[\s\S]*?^```/gm, '')
    .replace(/`[^`]+`/g, '');
  for (const match of searchable.matchAll(pattern)) {
    const parsed = parseSvgWikiEmbed(match[0]);
    if (parsed) found.push(parsed);
  }
  return found;
}

function walkMarkdown(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, found);
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

const CONTENT_COLLECTIONS = ['studies', 'notes', 'references', 'events', 'research'];

export function collectSvgWikiTargetsFromContent(contentDir: string): string[] {
  const refs = new Set<string>();
  for (const collection of CONTENT_COLLECTIONS) {
    for (const file of walkMarkdown(join(contentDir, collection))) {
      for (const parsed of findSvgWikiEmbeds(readFileSync(file, 'utf8'))) {
        refs.add(parsed.target);
      }
    }
  }
  return [...refs];
}

function isInsideRepo(repoRoot: string, abs: string): boolean {
  const root = resolve(repoRoot);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return resolve(abs).startsWith(rootPrefix);
}

let svgIndex: { root: string; byName: Map<string, string[]> } | null = null;

export function resetSvgIndex(): void {
  svgIndex = null;
}

function listSvgFilesByBasename(repoRoot: string): Map<string, string[]> {
  const root = resolve(repoRoot);
  if (svgIndex?.root === root) return svgIndex.byName;

  const byName = new Map<string, string[]>();
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDir(entry.name)) walk(full);
        continue;
      }
      if (!entry.isFile() || !SVG_NAME.test(entry.name)) continue;
      const rel = relative(root, full).split(sep).join('/');
      const list = byName.get(entry.name) ?? [];
      list.push(rel);
      byName.set(entry.name, list);
    }
  };

  walk(root);
  svgIndex = { root, byName };
  return byName;
}

export class SvgEmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgEmbedError';
  }
}

/**
 * Resolve a wikilink target to a unique repo-relative SVG.
 * Basename-only targets must match exactly one file. Paths must exist.
 */
export function resolveSvgWikiTarget(repoRoot: string, target: string): string {
  const ref = normalizeSvgWikiTarget(target);
  if (!ref) {
    throw new SvgEmbedError(`Obsidian SVG embed ![[${target}]] is not a safe SVG filename.`);
  }

  const root = resolve(repoRoot);

  if (ref.includes('/')) {
    const abs = resolve(root, ...ref.split('/'));
    if (!isInsideRepo(root, abs) || !existsSync(abs) || !statSync(abs).isFile()) {
      throw new SvgEmbedError(`Obsidian SVG embed ![[${target}]] was not found in the repository.`);
    }
    return ref;
  }

  const matches = listSvgFilesByBasename(root).get(ref) ?? [];
  if (matches.length === 0) {
    throw new SvgEmbedError(`Obsidian SVG embed ![[${target}]] was not found in the repository.`);
  }
  if (matches.length > 1) {
    throw new SvgEmbedError(
      `Obsidian SVG embed ![[${target}]] is ambiguous. Matching files:\n${matches
        .map((path) => `  - ${path}`)
        .join('\n')}`,
    );
  }
  return matches[0];
}

export function resolveRepoSvgFile(repoRoot: string, target: string): string | null {
  try {
    const rel = resolveSvgWikiTarget(repoRoot, target);
    return resolve(repoRoot, ...rel.split('/'));
  } catch (error) {
    if (error instanceof SvgEmbedError) return null;
    throw error;
  }
}

/** Public same-origin URL for a resolved repo-relative SVG. */
export function internalSvgHref(src: string): string | null {
  const ref = normalizeSvgWikiTarget(src);
  if (!ref) return null;
  const encoded = ref.split('/').map(encodeURIComponent).join('/');
  return href(`${REPO_SVG_PREFIX}${encoded}`);
}

export function svgWikiEmbedProps(
  repoRoot: string,
  parsed: { target: string; alt?: string },
): SvgWikiEmbedProps {
  const src = resolveSvgWikiTarget(repoRoot, parsed.target);
  const filename = src.split('/').pop() ?? parsed.target;
  return {
    src,
    alt: parsed.alt?.trim() || svgAltFromFilename(filename),
  };
}

export function svgEmbedHtml(props: SvgWikiEmbedProps): string {
  const url = internalSvgHref(props.src);
  if (!url) return '';
  return lightboxImageHtml(url, props.alt);
}
