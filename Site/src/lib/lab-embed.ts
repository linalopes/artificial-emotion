import { href } from './paths';

export type LabEmbedProps = {
  src: string;
  title: string;
};

const LAB_DIRECTIVE = /^::lab\{([^}]*)\}\s*$/;
const ATTR = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;
/** Same-origin lab routes only: /lab/slug/ or /lab/slug/nested/ */
const LAB_PATH = /^\/lab\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\/?$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isLabDirectiveLine(line: string): boolean {
  return LAB_DIRECTIVE.test(line.trim());
}

/** Resolve a Markdown lab src to a site-local href, or null if it is not a safe internal lab path. */
export function internalLabHref(src: string): string | null {
  const trimmed = src.trim();
  if (!LAB_PATH.test(trimmed)) return null;
  if (/[?#\\]|\/\/|\.\./.test(trimmed)) return null;
  const withSlash = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  return href(withSlash);
}

/** Same-origin lab URL with embed chrome removed. */
export function internalLabEmbedHref(src: string): string | null {
  const url = internalLabHref(src);
  return url ? `${url}?embed=1` : null;
}

export function parseLabDirective(source: string): LabEmbedProps | null {
  const match = LAB_DIRECTIVE.exec(source.trim());
  if (!match) return null;

  const attrs: Record<string, string> = {};
  for (const part of match[1].matchAll(ATTR)) {
    attrs[part[1]] = part[2];
  }

  const src = attrs.src?.trim();
  if (!src || !internalLabHref(src)) return null;

  return {
    src,
    title: (attrs.title ?? '').trim() || 'Lab',
  };
}

export function labEmbedHtml({ src, title }: LabEmbedProps): string {
  const openUrl = internalLabHref(src);
  const embedUrl = internalLabEmbedHref(src);
  if (!openUrl || !embedUrl) return '';
  const safeTitle = escapeHtml(title.trim() || 'Lab');
  const safeOpen = escapeHtml(openUrl);
  const safeEmbed = escapeHtml(embedUrl);
  return `<div class="lab-embed"><iframe src="${safeEmbed}" title="${safeTitle}" loading="lazy"></iframe><p class="lab-embed__open"><a href="${safeOpen}">Open the ${safeTitle}</a></p></div>`;
}
