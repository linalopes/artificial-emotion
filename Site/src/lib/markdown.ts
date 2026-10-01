/**
 * Small Markdown helpers for splitting an entry body into named H2 sections
 * and rendering those fragments to HTML. Used when a page needs to show
 * About / Documentation / Reflection independently, and skip empty headings.
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

/**
 * Render a Markdown fragment (no frontmatter) to HTML.
 * Covers paragraphs, lists, links, emphasis and images — enough for event notes.
 */
export function markdownToSafeHtml(markdown: string): string {
  const blocks = markdown.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split('\n').filter((line) => line.trim().length > 0);
      if (lines.length === 0) return '';

      if (lines.every((line) => /^[-*]\s+\S/.test(line.trim()))) {
        const items = lines.map((line) => `<li>${inline(line.trim().replace(/^[-*]\s+/, ''))}</li>`);
        return `<ul>${items.join('')}</ul>`;
      }

      if (lines.every((line) => /^\d+\.\s+\S/.test(line.trim()))) {
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
    })
    .filter(Boolean)
    .join('');
}

/** Lines for compact fact fields that authors may write as a string or a YAML list. */
export function asFactLines(value: string | readonly string[] | undefined): string[] {
  if (value == null) return [];
  const items = typeof value === 'string' ? value.split('\n') : [...value];
  return items.map((item) => item.trim()).filter(Boolean);
}
