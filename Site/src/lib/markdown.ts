/**
 * Small Markdown helpers for splitting an entry body into named H2 sections
 * and rendering those fragments to HTML. Used when a page needs to show
 * About / Program / Documentation / Reflection independently, and skip empty headings.
 *
 * Raw HTML is escaped on purpose. Complete `<iframe>` and `<video>` blocks
 * are rebuilt from an attribute allowlist. Complete ```mermaid fences become
 * typed parts (the diagram source is never treated as trusted HTML). Internal
 * labs use `::lab{src title}`; repository STL/GLB files use `::model{src title caption?}`.
 * `::youtube` remains a compatibility alias; prefer ordinary iframe HTML.
 */
import { findCompleteIframes, iframeEmbedHtml, parseIframeMarkup } from './iframe-embed';
import { isLabDirectiveLine, labEmbedHtml, parseLabDirective } from './lab-embed';
import { mermaidEmbedHtml } from './mermaid-embed';
import { isModelDirectiveLine, modelEmbedHtml, parseModelDirective } from './model-embed';
import { findCompleteVideos, parseVideoMarkup, videoEmbedHtml } from './video-embed';
import { isYoutubeDirectiveLine, parseYoutubeDirective, youtubeEmbedHtml } from './youtube-embed';

export type MarkdownPart =
  | { type: 'html'; html: string }
  | { type: 'lab'; src: string; title: string }
  | { type: 'model'; src: string; title: string; caption?: string }
  | { type: 'youtube'; src: string; title: string }
  | { type: 'mermaid'; source: string };

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

/**
 * First meaningful block (preface + first H2, or the first section)
 * and everything after. Used to insert a gallery mid-note.
 */
export function splitIntroAndRest(markdown: string): {
  intro: MarkdownSection[];
  rest: MarkdownSection[];
} {
  const sections = splitMarkdownSections(markdown);
  if (sections.length === 0) return { intro: [], rest: [] };
  if (sections[0].heading === null && sections.length > 1) {
    return { intro: sections.slice(0, 2), rest: sections.slice(2) };
  }
  return { intro: [sections[0]], rest: sections.slice(1) };
}

function embedPart(part: MarkdownPart): string {
  if (part.type === 'lab') return labEmbedHtml(part);
  if (part.type === 'model') return modelEmbedHtml(part);
  if (part.type === 'youtube') return youtubeEmbedHtml(part);
  if (part.type === 'mermaid') return mermaidEmbedHtml(part);
  return part.html;
}

/** Render one split section, restoring its H2 when present. */
export function markdownSectionToHtml(section: MarkdownSection): string {
  return markdownSectionToParts(section).map(embedPart).join('');
}

/** Same as `markdownSectionToHtml`, but keeps lab directives as typed parts. */
export function markdownSectionToParts(section: MarkdownSection): MarkdownPart[] {
  const heading = section.heading ? `<h2>${inline(section.heading)}</h2>` : '';
  const parts = markdownToParts(section.body);
  if (!heading) return parts;
  if (parts[0]?.type === 'html') {
    return [{ type: 'html', html: heading + parts[0].html }, ...parts.slice(1)];
  }
  return [{ type: 'html', html: heading }, ...parts];
}

const MERMAID_FENCE =
  /^[ \t]*```mermaid[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*\r?$/gim;

/** Complete ```mermaid fences only. Unclosed or non-mermaid fences are left alone. */
function findCompleteMermaidFences(markdown: string): Array<{
  index: number;
  length: number;
  source: string;
}> {
  const pattern = new RegExp(MERMAID_FENCE.source, MERMAID_FENCE.flags);
  return [...markdown.matchAll(pattern)].map((match) => ({
    index: match.index ?? 0,
    length: match[0].length,
    source: match[1] ?? '',
  }));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1;
}

/** Peel trailing sentence punctuation off a matched URL. */
function splitBareUrl(raw: string): { href: string; trail: string } {
  let href = raw;
  let trail = '';
  while (/[.,;]$/.test(href)) {
    trail = href.slice(-1) + trail;
    href = href.slice(0, -1);
  }
  while (href.endsWith(')') && countChar(href, ')') > countChar(href, '(')) {
    trail = `)${trail}`;
    href = href.slice(0, -1);
  }
  return { href, trail };
}

const HOLD = '\u0001';

function applyEmphasis(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function inline(value: string): string {
  const held: string[] = [];
  const hold = (html: string) => {
    held.push(html);
    return `${HOLD}${held.length - 1}${HOLD}`;
  };

  // Code first so `[not a link](url)` inside backticks stays literal.
  // Then links, with emphasis applied to the label so [**bold**](url) works.
  // Remaining **bold** / *italic* still wrap those held links: **[Obsidian](url)**.
  let text = escapeHtml(value).replace(/`([^`]+)`/g, (_match, code: string) => hold(`<code>${code}</code>`));

  text = text.replace(/\[([^\]]+)\]\((https?:[^)\s]+|\/[^)\s]+)\)/g, (_match, label: string, href: string) =>
    hold(`<a href="${href}">${applyEmphasis(label)}</a>`));

  text = applyEmphasis(text);

  text = text.replace(/https?:\/\/[^\s<]+/g, (raw) => {
    const { href, trail } = splitBareUrl(raw);
    return href ? `${hold(`<a href="${href}">${href}</a>`)}${trail}` : raw;
  });

  return text.replace(/\u0001(\d+)\u0001/g, (_match, index: string) => held[Number(index)] ?? '');
}

type BlockKind = 'quote' | 'ul' | 'ol' | 'lab' | 'model' | 'youtube' | 'table' | 'other';
type CellAlign = 'left' | 'center' | 'right' | '';

function lineKind(line: string): BlockKind {
  const text = line.trim();
  if (isLabDirectiveLine(text)) return 'lab';
  if (isModelDirectiveLine(text)) return 'model';
  if (isYoutubeDirectiveLine(text)) return 'youtube';
  if (/^>/.test(text)) return 'quote';
  if (/^[-*]\s+\S/.test(text)) return 'ul';
  if (/^\d+\.\s+\S/.test(text)) return 'ol';
  if (/^\|/.test(text)) return 'table';
  return 'other';
}

function splitTableCells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function alignFromSeparator(cell: string): CellAlign {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

function tableCell(tag: 'th' | 'td', value: string, align: CellAlign): string {
  const style = align ? ` style="text-align:${align}"` : '';
  return `<${tag}${style}>${inline(value)}</${tag}>`;
}

function renderTable(lines: readonly string[]): string {
  if (lines.length < 2 || !isSeparatorRow(lines[1])) {
    return `<p>${lines.map((line) => inline(line.trim())).join('<br>')}</p>`;
  }

  const headers = splitTableCells(lines[0]);
  const aligns = splitTableCells(lines[1]).map(alignFromSeparator);
  const columns = Math.max(headers.length, aligns.length);

  const head = headers
    .concat(Array.from({ length: Math.max(0, columns - headers.length) }, () => ''))
    .slice(0, columns)
    .map((cell, i) => tableCell('th', cell, aligns[i] ?? ''))
    .join('');

  const body = lines
    .slice(2)
    .map((line) => {
      const cells = splitTableCells(line);
      const row = Array.from({ length: columns }, (_, i) => tableCell('td', cells[i] ?? '', aligns[i] ?? ''));
      return `<tr>${row.join('')}</tr>`;
    })
    .join('');

  return `<div class="md-table"><table><thead><tr>${head}</tr></thead>${
    body ? `<tbody>${body}</tbody>` : ''
  }</table></div>`;
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
  if (kind === 'lab') {
    const parsed = parseLabDirective(lines.map((line) => line.trim()).join(' '));
    return parsed ? labEmbedHtml(parsed) : `<p>${lines.map((line) => inline(line.trim())).join('<br>')}</p>`;
  }

  if (kind === 'model') {
    const parsed = parseModelDirective(lines.map((line) => line.trim()).join(' '));
    return parsed ? modelEmbedHtml(parsed) : `<p>${lines.map((line) => inline(line.trim())).join('<br>')}</p>`;
  }

  if (kind === 'youtube') {
    const parsed = parseYoutubeDirective(lines.map((line) => line.trim()).join(' '));
    return parsed ? youtubeEmbedHtml(parsed) : `<p>${lines.map((line) => inline(line.trim())).join('<br>')}</p>`;
  }

  if (kind === 'quote') return renderQuote(lines);
  if (kind === 'table') return renderTable(lines);

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
 * Covers paragraphs, lists, blockquotes, GFM tables, links, bare http(s) URLs,
 * emphasis, images, sanitized HTTPS iframes and videos, ordinary ```mermaid
 * fences, internal `::lab` embeds, `::model` STL/GLB viewers, and a `::youtube`
 * compatibility alias. Other raw HTML is escaped.
 */
export function markdownToSafeHtml(markdown: string): string {
  return markdownToParts(markdown).map(embedPart).join('');
}

function appendMarkdownLines(parts: MarkdownPart[], text: string): void {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return;

  const runs: { kind: BlockKind; lines: string[] }[] = [];
  for (const line of lines) {
    const kind = lineKind(line);
    const current = runs[runs.length - 1];
    if (current && current.kind === kind) current.lines.push(line);
    else runs.push({ kind, lines: [line] });
  }

  for (const run of runs) {
    if (run.kind === 'lab') {
      const parsed = parseLabDirective(run.lines.map((line) => line.trim()).join(' '));
      if (parsed) {
        parts.push({ type: 'lab', src: parsed.src, title: parsed.title });
        continue;
      }
    }
    if (run.kind === 'model') {
      const parsed = parseModelDirective(run.lines.map((line) => line.trim()).join(' '));
      if (parsed) {
        parts.push({
          type: 'model',
          src: parsed.src,
          title: parsed.title,
          ...(parsed.caption ? { caption: parsed.caption } : {}),
        });
        continue;
      }
    }
    if (run.kind === 'youtube') {
      const parsed = parseYoutubeDirective(run.lines.map((line) => line.trim()).join(' '));
      if (parsed) {
        parts.push({ type: 'youtube', src: parsed.src, title: parsed.title });
        continue;
      }
    }
    const html = renderRun(run.kind, run.lines);
    if (html) parts.push({ type: 'html', html });
  }
}

type EmbedKind = 'md' | 'iframe' | 'video';

function embedSegments(block: string): { kind: EmbedKind; text: string }[] {
  const hits = [
    ...findCompleteIframes(block).map((match) => ({
      kind: 'iframe' as const,
      start: match.index ?? 0,
      text: match[0],
    })),
    ...findCompleteVideos(block).map((match) => ({
      kind: 'video' as const,
      start: match.index ?? 0,
      text: match[0],
    })),
  ]
    .filter((hit) => hit.start >= 0)
    .sort((a, b) => a.start - b.start);

  const segments: { kind: EmbedKind; text: string }[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) segments.push({ kind: 'md', text: block.slice(cursor, hit.start) });
    segments.push({ kind: hit.kind, text: hit.text });
    cursor = hit.start + hit.text.length;
  }
  if (cursor < block.length || segments.length === 0) {
    segments.push({ kind: 'md', text: block.slice(cursor) });
  }
  return segments;
}

function appendMarkdownBlocks(parts: MarkdownPart[], markdown: string): void {
  const normalized = markdown.replace(/^[ \t]+$/gm, '');

  for (const block of normalized.split(/\n{2,}/)) {
    for (const segment of embedSegments(block)) {
      if (segment.kind === 'iframe') {
        const parsed = parseIframeMarkup(segment.text);
        if (parsed) {
          parts.push({ type: 'html', html: iframeEmbedHtml(parsed) });
          continue;
        }
      }
      if (segment.kind === 'video') {
        const parsed = parseVideoMarkup(segment.text);
        if (parsed) {
          parts.push({ type: 'html', html: videoEmbedHtml(parsed) });
          continue;
        }
      }
      appendMarkdownLines(parts, segment.text);
    }
  }
}

export function markdownToParts(markdown: string): MarkdownPart[] {
  const prepared = markdown.replace(/^\uFEFF/, '').trim();
  const parts: MarkdownPart[] = [];
  const fences = findCompleteMermaidFences(prepared);
  let cursor = 0;

  for (const fence of fences) {
    if (fence.index > cursor) appendMarkdownBlocks(parts, prepared.slice(cursor, fence.index));
    parts.push({ type: 'mermaid', source: fence.source });
    cursor = fence.index + fence.length;
  }
  if (cursor < prepared.length || fences.length === 0) {
    appendMarkdownBlocks(parts, prepared.slice(cursor));
  }

  return parts;
}

/** Pull list markup into a separate fragment so Program can sit in two columns. */
export function splitHtmlLists(html: string): { introHtml: string; listHtml: string } {
  const lists = html.match(/<(ul|ol)\b[\s\S]*?<\/\1>/gi) ?? [];
  return {
    introHtml: html.replace(/<(ul|ol)\b[\s\S]*?<\/\1>/gi, '').trim(),
    listHtml: lists.join(''),
  };
}
