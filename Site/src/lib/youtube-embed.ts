/**
 * Markdown `::youtube{src title}` directive.
 * `src` is a YouTube watch / share / embed URL, or a bare 11-character video id.
 * Embeds always use the privacy-enhanced youtube-nocookie player. No autoplay.
 */

export type YoutubeEmbedProps = {
  src: string;
  title: string;
};

const YOUTUBE_DIRECTIVE = /^::youtube\{([^}]*)\}\s*$/;
const ATTR = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isYoutubeDirectiveLine(line: string): boolean {
  return YOUTUBE_DIRECTIVE.test(line.trim());
}

/** Extract a YouTube video id, or null if the value is not a supported form. */
export function youtubeVideoId(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.includes('\0')) return null;
  if (VIDEO_ID.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    return VIDEO_ID.test(id) ? id : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;

  const fromQuery = url.searchParams.get('v')?.trim() ?? '';
  if (VIDEO_ID.test(fromQuery)) return fromQuery;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'embed' && parts[1] && VIDEO_ID.test(parts[1])) return parts[1];

  return null;
}

export function youtubeEmbedSrc(src: string): string | null {
  const id = youtubeVideoId(src);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

export function parseYoutubeDirective(source: string): YoutubeEmbedProps | null {
  const match = YOUTUBE_DIRECTIVE.exec(source.trim());
  if (!match) return null;

  const attrs: Record<string, string> = {};
  for (const part of match[1].matchAll(ATTR)) {
    attrs[part[1]] = part[2];
  }

  const src = attrs.src?.trim();
  if (!src || !youtubeVideoId(src)) return null;

  return {
    src,
    title: (attrs.title ?? '').trim() || 'YouTube',
  };
}

export function youtubeEmbedHtml({ src, title }: YoutubeEmbedProps): string {
  const embed = youtubeEmbedSrc(src);
  if (!embed) return '';

  const safeTitle = escapeHtml(title.trim() || 'YouTube');
  const safeEmbed = escapeHtml(embed);
  return (
    `<div class="youtube-embed">` +
    `<iframe src="${safeEmbed}" title="${safeTitle}" loading="lazy" allowfullscreen` +
    ` frameborder="0"` +
    ` allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share">` +
    `</iframe>` +
    `</div>`
  );
}
