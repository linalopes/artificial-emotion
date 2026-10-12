/**
 * Client-safe Cloudinary delivery URL helpers.
 * No Admin API and no secrets — safe to import from browser scripts.
 */

const LIGHTBOX_WIDTH = 2000;
const GALLERY_WIDTH = 1200;
const SCALE_KEYS = new Set(['f', 'q', 'c', 'w']);

const KNOWN_TRANSFORM_KEYS = new Set([
  'a',
  'ac',
  'ar',
  'b',
  'bo',
  'c',
  'co',
  'cs',
  'd',
  'dn',
  'dpr',
  'e',
  'f',
  'fl',
  'g',
  'h',
  'l',
  'o',
  'q',
  'r',
  'so',
  't',
  'w',
  'x',
  'y',
  'z',
]);

function isCloudinaryHost(hostname: string): boolean {
  return hostname === 'res.cloudinary.com' || hostname.endsWith('.cloudinary.com');
}

function transformKey(token: string): string | undefined {
  const match = token.match(/^([a-z]+)_/i);
  return match?.[1]?.toLowerCase();
}

function isVersionSegment(part: string): boolean {
  return /^v\d+$/.test(part);
}

function isTransformSegment(part: string): boolean {
  const tokens = part.split(',').filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.length > 1) return tokens.every((token) => Boolean(transformKey(token)));
  const key = transformKey(tokens[0] ?? '');
  return Boolean(key && KNOWN_TRANSFORM_KEYS.has(key));
}

/**
 * Insert `f_auto,q_auto,c_limit,w_{width}` into a Cloudinary image URL.
 * `c_limit` never upscales. Non-Cloudinary URLs are returned unchanged.
 */
export function cloudinaryScaledImageUrl(src: string, width: number): string {
  const trimmed = src.trim();
  if (!trimmed || !Number.isFinite(width) || width <= 0) return trimmed;

  try {
    const url = new URL(trimmed);
    if (!isCloudinaryHost(url.hostname)) return trimmed;

    const match = /\/image\/(upload|fetch|private|authenticated)\//.exec(url.pathname);
    if (!match || match.index === undefined) return trimmed;

    const markerEnd = match.index + match[0].length;
    const head = url.pathname.slice(0, markerEnd);
    const segments = url.pathname.slice(markerEnd).split('/').filter(Boolean);
    if (segments.length === 0) return trimmed;

    const versionAt = segments.findIndex(isVersionSegment);
    let transformEnd = 0;
    if (versionAt >= 0) {
      transformEnd = versionAt;
    } else {
      while (transformEnd < segments.length - 1 && isTransformSegment(segments[transformEnd] ?? '')) {
        transformEnd += 1;
      }
    }

    const existing = segments
      .slice(0, transformEnd)
      .flatMap((part) => part.split(','))
      .filter(Boolean)
      .filter((token) => {
        const key = transformKey(token);
        return !key || !SCALE_KEYS.has(key);
      });

    const transform = [`f_auto`, `q_auto`, `c_limit`, `w_${Math.round(width)}`, ...existing].join(',');
    const rest = segments.slice(transformEnd);
    url.pathname = `${head}${[transform, ...rest].join('/')}`;
    return url.toString();
  } catch {
    return trimmed;
  }
}

/** In-page gallery stills — large enough for 2x displays, not original files. */
export function cloudinaryGalleryImageUrl(src: string): string {
  return cloudinaryScaledImageUrl(src, GALLERY_WIDTH);
}

/** Lightbox stills. Generated for the modal only; do not use as the gallery `src`. */
export function cloudinaryLargeImageUrl(src: string): string {
  return cloudinaryScaledImageUrl(src, LIGHTBOX_WIDTH);
}
