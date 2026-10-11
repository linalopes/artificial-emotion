/**
 * Controlled `<iframe>` support for the custom Markdown renderer.
 * Raw HTML stays escaped. A complete iframe block is rebuilt from an allowlist.
 */
import { youtubeEmbedSrc } from './youtube-embed';

export type IframeEmbedProps = {
  src: string;
  title: string;
  width?: string;
  height?: string;
  allow?: string;
  allowfullscreen: boolean;
  frameborder?: string;
  referrerpolicy?: string;
};

const OPEN_TAG = /^<iframe\b([^>]*)>/i;
const ALLOWED = new Set([
  'src',
  'title',
  'width',
  'height',
  'allow',
  'allowfullscreen',
  'frameborder',
  'loading',
  'referrerpolicy',
]);
const SAFE_SIZE = /^\d+(\.\d+)?(px|%)?$/i;
const SAFE_ALLOW = /^[a-z0-9; +\-]+$/i;
const SAFE_FRAMEBORDER = /^(0|1)$/;
const REFERRER_POLICIES = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeAttr(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#37;/g, '%');
}

export function findCompleteIframes(value: string): RegExpMatchArray[] {
  return [...value.matchAll(/<iframe\b[\s\S]*?<\/iframe>/gi)];
}

/** HTTPS page URL only. Rejects javascript:, data:, blob:, http:, and //. */
export function safeIframeSrc(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('\0') || trimmed.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.href;
}

export function normalizeIframeSrc(raw: string): string | null {
  const href = safeIframeSrc(raw);
  if (!href) return null;
  return youtubeEmbedSrc(href) ?? href;
}

function parseAttributes(openAttrs: string): Record<string, string> | null {
  const attrs: Record<string, string> = {};
  for (const part of openAttrs.matchAll(
    /([^\s"'>=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi,
  )) {
    const name = part[1].toLowerCase();
    if (name.startsWith('on') || name.startsWith('data-') || !ALLOWED.has(name)) continue;
    const value = decodeAttr(part[2] ?? part[3] ?? part[4] ?? '').trim();
    attrs[name] = name === 'allowfullscreen' ? 'true' : value;
  }
  return attrs;
}

export function parseIframeMarkup(source: string): IframeEmbedProps | null {
  const match = OPEN_TAG.exec(source.trim());
  if (!match) return null;

  const attrs = parseAttributes(match[1]);
  if (!attrs) return null;

  const src = attrs.src ? normalizeIframeSrc(attrs.src) : null;
  if (!src) return null;

  const width = attrs.width && SAFE_SIZE.test(attrs.width) ? attrs.width : undefined;
  const height = attrs.height && SAFE_SIZE.test(attrs.height) ? attrs.height : undefined;
  const allow = attrs.allow && SAFE_ALLOW.test(attrs.allow) ? attrs.allow.trim() : undefined;
  const frameborder =
    attrs.frameborder && SAFE_FRAMEBORDER.test(attrs.frameborder) ? attrs.frameborder : undefined;
  const referrerpolicy =
    attrs.referrerpolicy && REFERRER_POLICIES.has(attrs.referrerpolicy.toLowerCase())
      ? attrs.referrerpolicy.toLowerCase()
      : undefined;

  return {
    src,
    title: attrs.title?.trim() || 'Embedded content',
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(allow ? { allow } : {}),
    allowfullscreen: Object.hasOwn(attrs, 'allowfullscreen'),
    ...(frameborder ? { frameborder } : {}),
    ...(referrerpolicy ? { referrerpolicy } : {}),
  };
}

function aspectRatio(width?: string, height?: string): string {
  const w = width ? Number.parseFloat(width) : Number.NaN;
  const h = height ? Number.parseFloat(height) : Number.NaN;
  const widthPercent = Boolean(width?.includes('%'));
  const heightPercent = Boolean(height?.includes('%'));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '16 / 9';
  if (widthPercent !== heightPercent) return '16 / 9';
  return `${w} / ${h}`;
}

export function iframeEmbedHtml(props: IframeEmbedProps): string {
  const attrs = [
    `src="${escapeHtml(props.src)}"`,
    `title="${escapeHtml(props.title)}"`,
    'loading="lazy"',
  ];
  if (props.width) attrs.push(`width="${escapeHtml(props.width)}"`);
  if (props.height) attrs.push(`height="${escapeHtml(props.height)}"`);
  if (props.allow) attrs.push(`allow="${escapeHtml(props.allow)}"`);
  if (props.allowfullscreen) attrs.push('allowfullscreen');
  if (props.frameborder) attrs.push(`frameborder="${escapeHtml(props.frameborder)}"`);
  if (props.referrerpolicy) attrs.push(`referrerpolicy="${escapeHtml(props.referrerpolicy)}"`);

  const ratio = aspectRatio(props.width, props.height);
  return (
    `<div class="iframe-embed" style="--iframe-aspect:${ratio}">` +
    `<iframe ${attrs.join(' ')}></iframe>` +
    `</div>`
  );
}
