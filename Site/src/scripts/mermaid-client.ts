/**
 * Boot Mermaid only on pages that already contain [data-mermaid-embed].
 * The mermaid package is a dynamic import, so pages without diagrams
 * never download it. Pan/zoom attaches after mermaid.render().
 */

import { mountMermaidViewer } from './mermaid-panzoom';

const SELECTOR = '[data-mermaid-embed]';

const THEME_VARIABLES = {
  background: 'transparent',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '15px',
  primaryColor: '#CAD8D8',
  primaryTextColor: '#22113E',
  primaryBorderColor: '#22113E',
  lineColor: '#22113E',
  secondaryColor: '#FFFFFF',
  tertiaryColor: '#FFFFFF',
  mainBkg: '#CAD8D8',
  nodeBorder: '#22113E',
  clusterBkg: '#FFFFFF',
  clusterBorder: '#22113E',
  titleColor: '#22113E',
  edgeLabelBackground: '#FFFFFF',
  tertiaryTextColor: '#22113E',
  noteBkgColor: '#FFFFFF',
  noteTextColor: '#22113E',
  noteBorderColor: '#22113E',
};

let mermaidPromise: Promise<typeof import('mermaid')> | undefined;
let initialized = false;
let seq = 0;

function loadMermaid() {
  return (mermaidPromise ??= import('mermaid'));
}

function showError(root: HTMLElement, canvas: HTMLElement | null): void {
  root.classList.add('mermaid-embed--error');
  if (!canvas) return;
  canvas.replaceChildren();
  const message = document.createElement('p');
  message.className = 'mermaid-embed__error';
  message.textContent = 'This diagram could not be rendered.';
  canvas.append(message);
}

export function bootMermaid(): void {
  const nodes = document.querySelectorAll<HTMLElement>(SELECTOR);
  if (nodes.length === 0) return;

  void loadMermaid()
    .then(async ({ default: mermaid }) => {
      if (!initialized) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: THEME_VARIABLES,
          themeCSS: '.nodeLabel, .edgeLabel, .cluster-label { text-transform: none; }',
          flowchart: {
            htmlLabels: true,
            curve: 'linear',
            padding: 12,
          },
        });
        initialized = true;
      }

      for (const root of nodes) {
        if (root.dataset.mermaidRendered === 'true') continue;
        root.dataset.mermaidRendered = 'true';

        const source = root.querySelector('.mermaid-embed__source')?.textContent ?? '';
        const canvas = root.querySelector<HTMLElement>('[data-mermaid-inline-canvas]');
        if (!canvas || !source.trim()) {
          showError(root, canvas);
          continue;
        }

        const id = `mermaid-diagram-${++seq}-${crypto.randomUUID()}`;
        try {
          const { svg, bindFunctions } = await mermaid.render(id, source);
          // Mermaid's SVG may include foreignObject HTML for <br/> labels.
          // Parse through a template so scripts cannot run; user source stays
          // in the escaped <pre>, never as trusted markup.
          const template = document.createElement('template');
          template.innerHTML = svg.trim();
          const graphic = template.content.querySelector('svg');
          if (!graphic) {
            showError(root, canvas);
            continue;
          }
          if (!graphic.getAttribute('role')) graphic.setAttribute('role', 'img');
          canvas.replaceChildren(graphic);
          bindFunctions?.(canvas);
          try {
            mountMermaidViewer(root, graphic);
          } catch {
            // Diagram remains visible if navigation cannot start.
          }
        } catch {
          document.getElementById(id)?.remove();
          showError(root, canvas);
        }
      }
    })
    .catch(() => {
      nodes.forEach((root) => {
        showError(root, root.querySelector<HTMLElement>('[data-mermaid-inline-canvas]'));
      });
    });
}
