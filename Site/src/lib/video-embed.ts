/**
 * Controlled `<video>` support for the custom Markdown renderer.
 * Raw HTML stays escaped. A complete video block is rebuilt from an allowlist.
 */
export type VideoEmbedProps = {
  src: string;
  controls: boolean;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  playsinline: boolean;
  preload: 'none' | 'metadata' | 'auto';
  poster?: string;
  width?: string;
  height?: string;
  ariaLabel?: string;
};

const OPEN_TAG = /^<video\b([^>]*)>/i;
const CLOSE_TAG = /<\/video\s*>/i;
const ALLOWED = new Set([
  'src',
  'controls',
  'autoplay',
  'muted',
  'loop',
  'playsinline',
  'preload',
  'poster',
  'width',
  'height',
  'aria-label',
]);
const SOURCE_ALLOWED = new Set(['src', 'type']);
const BOOLEAN = new Set(['controls', 'autoplay', 'muted', 'loop', 'playsinline']);
const PRELOAD = new Set(['none', 'metadata', 'auto']);
const SAFE_SIZE = /^\d+(\.\d+)?(px|%)?$/i;
const SAFE_SOURCE_TYPE = /^video\/mp4(?:\s*;.*)?$/i;
const SITE_ROOT = /^\/(?!\/)/;

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

export function findCompleteVideos(value: string): RegExpMatchArray[] {
  return [...value.matchAll(/<video\b[\s\S]*?<\/video>/gi)];
}

/** HTTPS media URL only. Rejects javascript:, data:, blob:, http:, and //. */
export function safeHttpsSrc(raw: string): string | null {
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

export function safeVideoSrc(raw: string): string | null {
  return safeHttpsSrc(raw);
}

/** Poster: HTTPS URL or a site-root path. */
export function safePosterSrc(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('\0') || trimmed.includes('\\') || trimmed.includes('..')) {
    return null;
  }
  if (SITE_ROOT.test(trimmed) && !/[<>"']/.test(trimmed)) return trimmed;
  return safeHttpsSrc(trimmed);
}

function parseAttributes(openAttrs: string, allowed: Set<string>): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const part of openAttrs.matchAll(
    /([^\s"'>=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi,
  )) {
    const name = part[1].toLowerCase();
    if (name.startsWith('on') || name.startsWith('data-') || !allowed.has(name)) continue;
    const value = decodeAttr(part[2] ?? part[3] ?? part[4] ?? '').trim();
    attrs[name] = BOOLEAN.has(name) ? 'true' : value;
  }
  return attrs;
}

function videoInner(source: string): string | null {
  const trimmed = source.trim();
  const open = OPEN_TAG.exec(trimmed);
  if (!open) return null;
  const afterOpen = trimmed.slice(open[0].length);
  const close = CLOSE_TAG.exec(afterOpen);
  if (!close) return null;
  return afterOpen.slice(0, close.index);
}

function hasDisallowedInner(inner: string): boolean {
  const leftover = inner
    .replace(/<source\b[^>]*\/?>/gi, '')
    .replace(/<\/source\s*>/gi, '');
  return /<[a-z/!]/i.test(leftover);
}

function firstSourceSrc(inner: string): string | null {
  for (const match of inner.matchAll(/<source\b([^>]*)\/?>/gi)) {
    const attrs = parseAttributes(match[1] ?? '', SOURCE_ALLOWED);
    if (attrs.type && !SAFE_SOURCE_TYPE.test(attrs.type)) continue;
    const src = attrs.src ? safeVideoSrc(attrs.src) : null;
    if (src) return src;
  }
  return null;
}

export function parseVideoMarkup(source: string): VideoEmbedProps | null {
  const trimmed = source.trim();
  const match = OPEN_TAG.exec(trimmed);
  if (!match) return null;

  const inner = videoInner(trimmed);
  if (inner === null || hasDisallowedInner(inner)) return null;

  const attrs = parseAttributes(match[1], ALLOWED);
  const src = (attrs.src ? safeVideoSrc(attrs.src) : null) ?? firstSourceSrc(inner);
  if (!src) return null;

  const autoplay = Object.hasOwn(attrs, 'autoplay');
  const preloadRaw = attrs.preload?.toLowerCase();
  const preload = preloadRaw && PRELOAD.has(preloadRaw) ? (preloadRaw as VideoEmbedProps['preload']) : 'metadata';
  const poster = attrs.poster ? safePosterSrc(attrs.poster) : null;
  const width = attrs.width && SAFE_SIZE.test(attrs.width) ? attrs.width : undefined;
  const height = attrs.height && SAFE_SIZE.test(attrs.height) ? attrs.height : undefined;
  const ariaLabel = attrs['aria-label']?.trim() || undefined;

  return {
    src,
    controls: Object.hasOwn(attrs, 'controls'),
    autoplay,
    muted: autoplay || Object.hasOwn(attrs, 'muted'),
    loop: Object.hasOwn(attrs, 'loop'),
    playsinline: autoplay || Object.hasOwn(attrs, 'playsinline'),
    preload,
    ...(poster ? { poster } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(ariaLabel ? { ariaLabel } : {}),
  };
}

export function videoEmbedHtml(props: VideoEmbedProps): string {
  const attrs = [`src="${escapeHtml(props.src)}"`];
  if (props.poster) attrs.push(`poster="${escapeHtml(props.poster)}"`);
  attrs.push(`preload="${escapeHtml(props.preload)}"`);
  if (props.width) attrs.push(`width="${escapeHtml(props.width)}"`);
  if (props.height) attrs.push(`height="${escapeHtml(props.height)}"`);
  if (props.ariaLabel) attrs.push(`aria-label="${escapeHtml(props.ariaLabel)}"`);
  if (props.controls) attrs.push('controls');
  if (props.autoplay) attrs.push('autoplay');
  if (props.muted) attrs.push('muted');
  if (props.loop) attrs.push('loop');
  if (props.playsinline) attrs.push('playsinline');

  return `<div class="video-embed"><video ${attrs.join(' ')}></video></div>`;
}
