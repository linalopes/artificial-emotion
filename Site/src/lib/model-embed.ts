/**
 * Markdown `::model{src title caption?}` directive.
 * `src` is a repository-relative STL or GLB path
 * (e.g. kinetic-module-maumau/DESIGNS/archive/box-3d-assembly.glb).
 * Public URLs are served from `/repo-models/` by the Vite plugin in repo-models.ts.
 */
import { href } from './paths';

export type ModelEmbedProps = {
  src: string;
  title: string;
  caption?: string;
};

const MODEL_DIRECTIVE = /^::model\{([^}]*)\}\s*$/;
const ATTR = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MODEL_NAME = /\.(stl|glb)$/i;
const BLOCKED = new Set(['.git', 'node_modules', 'Site', 'dist']);

export const REPO_MODELS_PREFIX = '/repo-models/';

export function isModelDirectiveLine(line: string): boolean {
  return MODEL_DIRECTIVE.test(line.trim());
}

export function hasModelViewerMarkup(html: string): boolean {
  return html.includes('data-model-viewer');
}

/**
 * Normalize a Markdown `src` to a repo-relative POSIX path, or null if unsafe.
 * Rejects absolute paths, traversal, hidden segments, and non-STL/GLB files.
 */
export function normalizeRepoStlRef(src: string): string | null {
  const trimmed = src.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('\0')) return null;
  if (trimmed.includes('://') || trimmed.includes('..') || /[?#]/.test(trimmed)) return null;

  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((part) => !SEGMENT.test(part) || part === '.' || BLOCKED.has(part))) return null;

  const file = parts[parts.length - 1];
  if (!file || !MODEL_NAME.test(file)) return null;
  return parts.join('/');
}

export function modelFilename(src: string): string {
  const ref = normalizeRepoStlRef(src);
  return ref?.split('/').pop() ?? 'model.stl';
}

export function modelDownloadLabel(src: string): string {
  return /\.glb$/i.test(modelFilename(src)) ? 'Download GLB' : 'Download STL';
}

/** Public same-origin URL for a validated repo-relative STL or GLB, or null. */
export function internalModelHref(src: string): string | null {
  const ref = normalizeRepoStlRef(src);
  if (!ref) return null;
  const encoded = ref.split('/').map(encodeURIComponent).join('/');
  return href(`${REPO_MODELS_PREFIX}${encoded}`);
}

export function parseModelDirective(source: string): ModelEmbedProps | null {
  const match = MODEL_DIRECTIVE.exec(source.trim());
  if (!match) return null;

  const attrs: Record<string, string> = {};
  for (const part of match[1].matchAll(ATTR)) {
    attrs[part[1]] = part[2];
  }

  const src = attrs.src?.trim();
  if (!src || !internalModelHref(src)) return null;

  const caption = attrs.caption?.trim();
  return {
    src,
    title: (attrs.title ?? '').trim() || modelFilename(src),
    ...(caption ? { caption } : {}),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function modelEmbedHtml({ src, title, caption }: ModelEmbedProps): string {
  const url = internalModelHref(src);
  if (!url) return '';

  const label = title.trim() || modelFilename(src);
  const safeTitle = escapeHtml(label);
  const safeUrl = escapeHtml(url);
  const safeFile = escapeHtml(modelFilename(src));
  const captionHtml = caption?.trim()
    ? `<p class="model-embed__note">${escapeHtml(caption.trim())}</p>`
    : '';

  return (
    `<figure class="model-embed" data-model-viewer data-src="${safeUrl}" data-title="${safeTitle}">` +
    `<div class="model-embed__stage"><p class="model-embed__status" data-model-status>Loading model…</p></div>` +
    `<figcaption class="model-embed__caption">` +
    `<p class="model-embed__title">${safeTitle}</p>` +
    captionHtml +
    `<p class="model-embed__actions">` +
    `<button type="button" data-model-reset disabled>Reset view</button>` +
    `<a href="${safeUrl}" download="${safeFile}">${escapeHtml(modelDownloadLabel(src))}</a>` +
    `</p></figcaption></figure>`
  );
}
