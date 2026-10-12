/**
 * Viewport navigation for a Mermaid-generated SVG.
 * Mermaid stays the renderer; this module only attaches svg-pan-zoom afterward.
 */

import svgPanZoom from 'svg-pan-zoom';

type PanZoomInstance = ReturnType<typeof svgPanZoom>;

type WheelMode = 'modifier' | 'free';

type Session = {
  inline: PanZoomInstance;
  original: SVGSVGElement;
  fullscreen?: PanZoomInstance;
};

const sessions = new WeakMap<HTMLElement, Session>();
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.18;

function readViewBox(svg: SVGSVGElement): { width: number; height: number } {
  const box = svg.viewBox.baseVal;
  if (box && box.width > 0 && box.height > 0) {
    return { width: box.width, height: box.height };
  }

  const parts = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
    return { width: parts[2], height: parts[3] };
  }

  const width = Number.parseFloat(svg.getAttribute('width') ?? '') || svg.clientWidth;
  const height = Number.parseFloat(svg.getAttribute('height') ?? '') || svg.clientHeight;
  if (width > 0 && height > 0) return { width, height };

  try {
    const bounds = svg.getBBox();
    if (bounds.width > 0 && bounds.height > 0) {
      return { width: bounds.width, height: bounds.height };
    }
  } catch {
    // SVG is not in the document yet.
  }

  return { width: 800, height: 320 };
}

function fillViewport(svg: SVGSVGElement): void {
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.maxWidth = 'none';
  svg.style.maxHeight = 'none';
  svg.style.display = 'block';
  svg.style.overflow = 'hidden';
}

/** Size the SVG from its viewBox so svg-pan-zoom cannot collapse it to 150px. */
export function preserveSvgFrame(svg: SVGSVGElement): { width: number; height: number } {
  const size = readViewBox(svg);
  svg.dataset.mermaidVbWidth = String(size.width);
  svg.dataset.mermaidVbHeight = String(size.height);
  if (!svg.getAttribute('viewBox')) {
    svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
  }
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.removeAttribute('style');
  fillViewport(svg);
  return size;
}

function pointOnSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function touchMidpoint(a: Touch, b: Touch): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

function fitInstance(instance: PanZoomInstance): void {
  instance.resize();
  instance.fit();
  instance.center();
}

function attachWheel(svg: SVGSVGElement, instance: PanZoomInstance, mode: WheelMode): void {
  const surface =
    svg.closest<HTMLElement>(
      '[data-mermaid-inline-viewport], [data-mermaid-fullscreen-viewport]',
    ) ?? svg;
  surface.addEventListener(
    'wheel',
    (event) => {
      if (!(event instanceof WheelEvent)) return;
      const modifier = event.ctrlKey || event.metaKey || event.altKey;
      if (mode === 'modifier' && !modifier) return;
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      instance.zoomAtPointBy(factor, pointOnSvg(svg, event.clientX, event.clientY));
    },
    { passive: false },
  );
}

function attachTouch(
  svg: SVGSVGElement,
  instance: PanZoomInstance,
  panWhenZoomed: boolean,
  isZoomedIn: () => boolean,
): void {
  let pinchStart = 0;
  let pinchZoom = 1;
  let panLast: { x: number; y: number } | null = null;

  svg.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        pinchStart = touchDistance(event.touches[0], event.touches[1]);
        pinchZoom = instance.getZoom();
        panLast = null;
        return;
      }
      if (event.touches.length === 1 && (!panWhenZoomed || isZoomedIn())) {
        event.preventDefault();
        panLast = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
    },
    { passive: false },
  );

  svg.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length === 2 && pinchStart > 0) {
        event.preventDefault();
        const distance = touchDistance(event.touches[0], event.touches[1]);
        const mid = touchMidpoint(event.touches[0], event.touches[1]);
        instance.zoomAtPoint(pinchZoom * (distance / pinchStart), pointOnSvg(svg, mid.x, mid.y));
        return;
      }
      if (event.touches.length === 1 && panLast && (!panWhenZoomed || isZoomedIn())) {
        event.preventDefault();
        const touch = event.touches[0];
        instance.panBy({ x: touch.clientX - panLast.x, y: touch.clientY - panLast.y });
        panLast = { x: touch.clientX, y: touch.clientY };
      }
    },
    { passive: false },
  );

  const endPan = (event: TouchEvent) => {
    if (event.touches.length === 1 && (!panWhenZoomed || isZoomedIn())) {
      panLast = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      pinchStart = 0;
      return;
    }
    panLast = null;
    pinchStart = 0;
  };
  svg.addEventListener('touchend', endPan);
  svg.addEventListener('touchcancel', endPan);
}

function createInstance(svg: SVGSVGElement, wheel: WheelMode, panWhenZoomed: boolean): PanZoomInstance {
  const instance = svgPanZoom(svg, {
    panEnabled: true,
    zoomEnabled: true,
    controlIconsEnabled: false,
    dblClickZoomEnabled: false,
    mouseWheelZoomEnabled: false,
    preventMouseEventsDefault: true,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    fit: true,
    center: true,
    refreshRate: 'auto',
    customEventsHandler: {
      haltEventListeners: ['touchstart', 'touchend', 'touchmove', 'touchleave', 'touchcancel'],
      init() {},
      destroy() {},
    },
  });

  fillViewport(svg);
  fitInstance(instance);
  attachWheel(svg, instance, wheel);
  attachTouch(svg, instance, panWhenZoomed, () => instance.getZoom() > 1.08);
  return instance;
}

function bindToolbar(toolbar: ParentNode | null, instance: () => PanZoomInstance | undefined): void {
  toolbar?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-mermaid-action]');
    if (!button) return;
    const nav = instance();
    if (!nav) return;
    const action = button.dataset.mermaidAction;
    if (action === 'zoom-in') nav.zoomIn();
    if (action === 'zoom-out') nav.zoomOut();
    if (action === 'fit') fitInstance(nav);
  });
}

function openFullscreen(root: HTMLElement, session: Session): void {
  const dialog = root.querySelector<HTMLDialogElement>('[data-mermaid-dialog]');
  const canvas = root.querySelector<HTMLElement>('[data-mermaid-fullscreen-canvas]');
  const expand = root.querySelector<HTMLButtonElement>('[data-mermaid-action="expand"]');
  if (!dialog || !canvas) return;

  session.fullscreen?.destroy();
  session.fullscreen = undefined;
  canvas.replaceChildren();

  const copy = session.original.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll('[id]').forEach((node, index) => {
    node.id = `${node.id}-fs-${index}`;
  });
  preserveSvgFrame(copy);
  canvas.replaceChildren(copy);

  const onClose = () => {
    session.fullscreen?.destroy();
    session.fullscreen = undefined;
    canvas.replaceChildren();
    dialog.removeEventListener('close', onClose);
    if (expand?.isConnected) expand.focus();
  };
  dialog.addEventListener('close', onClose);
  dialog.showModal();

  requestAnimationFrame(() => {
    if (!dialog.open || !copy.isConnected) return;
    session.fullscreen = createInstance(copy, 'free', false);
  });
}

export function mountMermaidViewer(root: HTMLElement, svg: SVGSVGElement): void {
  const viewport = root.querySelector<HTMLElement>('[data-mermaid-inline-viewport]');
  const canvas = root.querySelector<HTMLElement>('[data-mermaid-inline-canvas]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-mermaid-dialog]');
  if (!viewport || !canvas) return;

  const original = svg.cloneNode(true) as SVGSVGElement;
  preserveSvgFrame(svg);
  const inline = createInstance(svg, 'modifier', true);
  const session: Session = { inline, original };
  sessions.set(root, session);
  root.dataset.mermaidInteractive = 'true';
  requestAnimationFrame(() => {
    if (svg.isConnected) fitInstance(inline);
  });

  const inlineToolbar = root.querySelector(
    '.mermaid-embed__frame:not(.mermaid-embed__frame--dialog) .mermaid-embed__toolbar',
  );
  bindToolbar(inlineToolbar, () => sessions.get(root)?.inline);
  bindToolbar(dialog, () => sessions.get(root)?.fullscreen);

  root.querySelector('[data-mermaid-action="expand"]')?.addEventListener('click', () => {
    const current = sessions.get(root);
    if (current) openFullscreen(root, current);
  });

  dialog?.querySelector('[data-mermaid-action="close"]')?.addEventListener('click', () => {
    dialog.close();
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  let box = { width: viewport.clientWidth, height: viewport.clientHeight };
  const resize = () => {
    const current = sessions.get(root);
    if (!current) return;
    const next = { width: viewport.clientWidth, height: viewport.clientHeight };
    if (next.width === box.width && next.height === box.height) return;
    box = next;
    fitInstance(current.inline);
    if (current.fullscreen) fitInstance(current.fullscreen);
  };
  window.addEventListener('resize', resize, { passive: true });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resize).observe(viewport);
  }
}
