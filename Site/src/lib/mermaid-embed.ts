/**
 * Wrapper markup for ordinary ```mermaid fences.
 * Diagram source is HTML-escaped and read back via textContent — never
 * interpolated as trusted raw HTML.
 */

export type MermaidEmbedProps = {
  source: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function control(action: string, label: string, text: string): string {
  return (
    `<button type="button" class="mermaid-embed__btn" data-mermaid-action="${action}" aria-label="${label}">` +
    `${text}` +
    `</button>`
  );
}

function toolbarHtml(kind: 'inline' | 'fullscreen'): string {
  const last =
    kind === 'inline'
      ? control('expand', 'Open diagram fullscreen', 'Expand')
      : control('close', 'Close diagram', 'Close');
  return (
    `<div class="mermaid-embed__toolbar">` +
    control('zoom-in', 'Zoom in diagram', '+') +
    control('zoom-out', 'Zoom out diagram', '−') +
    control('fit', 'Fit diagram', 'Fit') +
    last +
    `</div>`
  );
}

export function hasMermaidMarkup(html: string): boolean {
  return html.includes('data-mermaid-embed');
}

export function mermaidEmbedHtml({ source }: MermaidEmbedProps): string {
  if (!source.trim()) return '';
  return (
    `<div class="mermaid-embed" data-mermaid-embed>` +
    `<pre class="mermaid-embed__source" hidden>${escapeHtml(source)}</pre>` +
    `<div class="mermaid-embed__frame">` +
    toolbarHtml('inline') +
    `<div class="mermaid-embed__viewport" data-mermaid-inline-viewport>` +
    `<div class="mermaid-embed__canvas" data-mermaid-inline-canvas></div>` +
    `</div>` +
    `</div>` +
    `<dialog class="mermaid-embed__dialog" data-mermaid-dialog aria-label="Diagram viewer">` +
    `<div class="mermaid-embed__frame mermaid-embed__frame--dialog">` +
    toolbarHtml('fullscreen') +
    `<div class="mermaid-embed__viewport mermaid-embed__viewport--fullscreen" data-mermaid-fullscreen-viewport>` +
    `<div class="mermaid-embed__canvas" data-mermaid-fullscreen-canvas></div>` +
    `</div>` +
    `</div>` +
    `</dialog>` +
    `</div>`
  );
}
