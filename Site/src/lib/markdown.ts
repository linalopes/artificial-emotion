/**
 * Small Markdown helpers for splitting an entry body into named H2 sections
 * and rendering those fragments to HTML. Used when a page needs to show
 * About / Program / Documentation / Reflection independently, and skip empty headings.
 */

export interface MarkdownSection {
  /** H2 title, or null for copy before the first H2. */
  heading: string | null;
  body: string;
}

const H2 = /^##\s+(.+?)\s*$/;

/** Split Markdown on `##` headings. `###` stays inside the current section. */
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let heading: string | null = null;
  let body: string[] = [];

  const flush = () => {
    const text = body.join('\n').trim();
    if (heading !== null || text) sections.push({ heading, body: text });
    body = [];
  };

  for (const line of lines) {
    const match = H2.exec(line);
    if (match) {
      flush();
      heading = match[1].trim();
      continue;
    }
    body.push(line);
  }
  flush();
  return sections;
}

export function sectionByHeading(
  sections: readonly MarkdownSection[],
  title: string,
): string {
  const needle = title.trim().toLowerCase();
  return sections.find((section) => section.heading?.toLowerCase() === needle)?.body ?? '';
}

/** True when a fragment has visible copy (empty headings and HTML comments do not count). */
export function hasMarkdownContent(markdown: string): boolean {
  return markdown.replace(/<!--[\s\S]*?-->/g, '').trim().length > 0;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+|\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

type BlockKind = 'quote' | 'ul' | 'ol' | 'other';

function lineKind(line: string): BlockKind {
  const text = line.trim();
  if (/^>/.test(text)) return 'quote';
  if (/^[-*]\s+\S/.test(text)) return 'ul';
  if (/^\d+\.\s+\S/.test(text)) return 'ol';
  return 'other';
}

function renderQuote(lines: readonly string[]): string {
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    const text = line.trim().replace(/^>\s?/, '');
    if (text === '') {
      if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([]);
      continue;
    }
    paragraphs[paragraphs.length - 1].push(text);
  }

  const html = paragraphs
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${paragraph.map((line) => inline(line)).join('<br>')}</p>`)
    .join('');

  return html ? `<blockquote>${html}</blockquote>` : '';
}

function renderRun(kind: BlockKind, lines: readonly string[]): string {
  if (kind === 'quote') return renderQuote(lines);

  if (kind === 'ul') {
    const items = lines.map((line) => `<li>${inline(line.trim().replace(/^[-*]\s+/, ''))}</li>`);
    return `<ul>${items.join('')}</ul>`;
  }

  if (kind === 'ol') {
    const items = lines.map((line) => `<li>${inline(line.trim().replace(/^\d+\.\s+/, ''))}</li>`);
    return `<ol>${items.join('')}</ol>`;
  }

  const heading = /^(#{3,6})\s+(.+)$/.exec(lines[0].trim());
  if (heading) {
    const level = heading[1].length;
    const rest = lines.slice(1).map((line) => inline(line.trim())).join('<br>');
    return `<h${level}>${inline(heading[2])}</h${level}>${rest ? `<p>${rest}</p>` : ''}`;
  }

  const image = /^!\[([^\]]*)\]\((https?:[^)\s]+|\/[^)\s]+)\)$/.exec(lines[0].trim());
  if (image && lines.length === 1) {
    return `<img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}">`;
  }

  return `<p>${lines.map((line) => inline(line.trim())).join('<br>')}</p>`;
}

/**
 * Render a Markdown fragment (no frontmatter) to HTML.
 * Covers paragraphs, lists, blockquotes, links, emphasis and images.
 */
export function markdownToSafeHtml(markdown: string): string {
  const normalized = markdown
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^[ \t]+$/gm, '');

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').filter((line) => line.trim().length > 0);
      if (lines.length === 0) return '';

      const runs: { kind: BlockKind; lines: string[] }[] = [];
      for (const line of lines) {
        const kind = lineKind(line);
        const current = runs[runs.length - 1];
        if (current && current.kind === kind) current.lines.push(line);
        else runs.push({ kind, lines: [line] });
      }

      return runs.map((run) => renderRun(run.kind, run.lines)).join('');
    })
    .filter(Boolean)
    .join('');
}

/** Pull list markup into a separate fragment so Program can sit in two columns. */
export function splitHtmlLists(html: string): { introHtml: string; listHtml: string } {
  const lists = html.match(/<(ul|ol)\b[\s\S]*?<\/\1>/gi) ?? [];
  return {
    introHtml: html.replace(/<(ul|ol)\b[\s\S]*?<\/\1>/gi, '').trim(),
    listHtml: lists.join(''),
  };
}
