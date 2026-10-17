/**
 * Shared image lightbox for article galleries and Markdown stills.
 * Videos stay in the gallery; only `[data-lightbox-image]` enters the dialog.
 * Zoom is relative to the fitted (contain) size: 1× fills the viewport,
 * 8× is the maximum. SVG sources keep their vector URL.
 */

import { cloudinaryLargeImageUrl } from '../lib/cloudinary-url';

const MOVE_THRESHOLD = 12;
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;
const DOUBLE_MS = 320;
const DOUBLE_PX = 24;

type LightboxItem = {
  trigger: HTMLElement;
  largeSrc: string;
  displaySrc: string;
  alt: string;
  caption: string;
};

type Point = { x: number; y: number };

function itemFromTrigger(trigger: HTMLElement): LightboxItem {
  const img = trigger instanceof HTMLImageElement ? trigger : trigger.querySelector('img');
  const displaySrc = img?.currentSrc || img?.src || '';
  const stored = trigger.dataset.lightboxSrc?.trim();
  const largeSrc = stored || cloudinaryLargeImageUrl(displaySrc) || displaySrc;
  const caption = trigger.dataset.lightboxCaption?.trim() || '';
  const alt = img?.getAttribute('alt')?.trim() || '';
  return { trigger, largeSrc, displaySrc, alt, caption };
}

function focusableTrigger(trigger: HTMLElement | null): HTMLElement | null {
  if (trigger?.isConnected && !trigger.closest('[inert]')) return trigger;
  const gallery = trigger?.closest('[data-gallery-lightbox]');
  if (!gallery) return null;
  return (
    [...gallery.querySelectorAll<HTMLElement>('[data-lightbox-image]')].find(
      (node) => !node.closest('[inert]'),
    ) ?? null
  );
}

function itemsInGallery(trigger: HTMLElement): LightboxItem[] {
  const gallery = trigger.closest<HTMLElement>('[data-gallery-lightbox]');
  const nodes = gallery
    ? [...gallery.querySelectorAll<HTMLElement>('[data-lightbox-image]')]
    : [trigger];
  return nodes.map(itemFromTrigger);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isSvgSrc(src: string): boolean {
  return /\.svg(?:$|\?)/i.test(src);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function mountGalleryLightbox(dialog: HTMLDialogElement): void {
  if (dialog.dataset.bound === 'true') return;
  dialog.dataset.bound = 'true';

  const viewport = dialog.querySelector<HTMLElement>('[data-lightbox-viewport]');
  const stage = dialog.querySelector<HTMLElement>('[data-lightbox-stage]');
  const image = dialog.querySelector<HTMLImageElement>('[data-lightbox-media]');
  const caption = dialog.querySelector<HTMLElement>('[data-lightbox-caption]');
  const closeBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-close]');
  const prevBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-prev]');
  const nextBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-next]');
  const zoomInBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-zoom-in]');
  const zoomOutBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-zoom-out]');
  const zoomResetBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-zoom-reset]');
  const zoomLabel = dialog.querySelector<HTMLElement>('[data-lightbox-zoom-label]');
  if (
    !viewport ||
    !stage ||
    !image ||
    !caption ||
    !closeBtn ||
    !prevBtn ||
    !nextBtn ||
    !zoomInBtn ||
    !zoomOutBtn ||
    !zoomResetBtn ||
    !zoomLabel
  ) {
    return;
  }

  let items: LightboxItem[] = [];
  let index = 0;
  let lastTrigger: HTMLElement | null = null;
  let pointerStart: Point | null = null;

  let scale = MIN_SCALE;
  let tx = 0;
  let ty = 0;
  let fitW = 0;
  let fitH = 0;
  let svg = false;
  let dragging = false;
  let moved = false;
  let animate = false;
  let raf = 0;
  let dragOrigin: { x: number; y: number; tx: number; ty: number } | null = null;
  const pointers = new Map<number, Point>();
  let pinch: { distance: number; scale: number } | null = null;
  let lastTap: { time: number; x: number; y: number } | null = null;
  let gestureActive = false;
  let gestureBase = MIN_SCALE;
  let showGen = 0;

  const setLoaded = (loaded: boolean) => {
    image.classList.toggle('is-loaded', loaded || prefersReducedMotion());
  };

  const measureFit = () => {
    const nw = image.naturalWidth;
    const nh = image.naturalHeight;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!nw || !nh || vw < 1 || vh < 1) {
      fitW = 0;
      fitH = 0;
      return;
    }
    const fit = Math.min(vw / nw, vh / nh, 1);
    fitW = nw * fit;
    fitH = nh * fit;
  };

  const clampPan = () => {
    const maxX = Math.max(0, (fitW * scale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (fitH * scale - viewport.clientHeight) / 2);
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
  };

  const paint = () => {
    raf = 0;
    clampPan();
    const reduced = prefersReducedMotion();
    stage.style.transition =
      animate && !reduced && !dragging && pointers.size < 2
        ? 'transform 160ms ease'
        : 'none';

    if (svg) {
      image.style.width = fitW ? `${fitW * scale}px` : '';
      image.style.height = fitH ? `${fitH * scale}px` : '';
      stage.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
    } else {
      image.style.width = fitW ? `${fitW}px` : '';
      image.style.height = fitH ? `${fitH}px` : '';
      stage.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    zoomOutBtn.disabled = scale <= MIN_SCALE + 0.001;
    zoomInBtn.disabled = scale >= MAX_SCALE - 0.001;
    viewport.classList.toggle('is-zoomed', scale > MIN_SCALE + 0.001);
    viewport.classList.toggle('is-panning', dragging);
    animate = false;
  };

  const render = (withMotion = false) => {
    if (withMotion) animate = true;
    if (raf) return;
    raf = window.requestAnimationFrame(paint);
  };

  const resetView = () => {
    scale = MIN_SCALE;
    tx = 0;
    ty = 0;
    dragOrigin = null;
    pinch = null;
    dragging = false;
    moved = false;
    pointers.clear();
  };

  const setScale = (next: number, anchor?: Point, withMotion = false) => {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    if (clamped <= MIN_SCALE + 0.001) {
      scale = MIN_SCALE;
      tx = 0;
      ty = 0;
      render(withMotion);
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ax = (anchor?.x ?? cx) - cx;
    const ay = (anchor?.y ?? cy) - cy;
    const k = clamped / scale;
    tx = ax * (1 - k) + tx * k;
    ty = ay * (1 - k) + ty * k;
    scale = clamped;
    render(withMotion);
  };

  const zoomBy = (factor: number, anchor?: Point, withMotion = false) => {
    setScale(scale * factor, anchor, withMotion);
  };

  const panBy = (dx: number, dy: number) => {
    if (scale <= MIN_SCALE + 0.001) return;
    tx += dx;
    ty += dy;
    render();
  };

  const pointFromEvent = (event: { clientX: number; clientY: number }): Point => ({
    x: event.clientX,
    y: event.clientY,
  });

  const pointerMid = (): Point => {
    const pts = [...pointers.values()];
    if (pts.length === 0) return { x: 0, y: 0 };
    if (pts.length === 1) return pts[0];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  };

  const pointerDistance = (): number => {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const show = (nextIndex: number) => {
    if (items.length === 0) return;
    index = ((nextIndex % items.length) + items.length) % items.length;
    const item = items[index];
    if (!item) return;

    const multiple = items.length > 1;
    prevBtn.hidden = !multiple;
    nextBtn.hidden = !multiple;
    prevBtn.disabled = !multiple;
    nextBtn.disabled = !multiple;

    caption.textContent = item.caption;
    caption.hidden = item.caption.length === 0;

    const label = item.alt || item.caption || 'Enlarged image';
    dialog.setAttribute('aria-label', label);
    image.alt = item.alt;
    svg = isSvgSrc(item.largeSrc) || isSvgSrc(item.displaySrc);
    resetView();
    render();

    const gen = ++showGen;
    setLoaded(false);
    const onReady = () => {
      if (gen !== showGen) return;
      measureFit();
      resetView();
      setLoaded(true);
      render();
    };
    image.addEventListener('load', onReady, { once: true });
    image.addEventListener(
      'error',
      () => {
        if (gen !== showGen) return;
        if (image.src !== item.displaySrc) {
          image.addEventListener('load', onReady, { once: true });
          image.src = item.displaySrc;
        } else onReady();
      },
      { once: true },
    );

    if (image.complete && image.naturalWidth && image.src === item.largeSrc) {
      onReady();
    } else {
      image.src = item.largeSrc;
    }
  };

  const open = (trigger: HTMLElement) => {
    items = itemsInGallery(trigger);
    const start = items.findIndex((item) => item.trigger === trigger);
    index = start === -1 ? 0 : start;
    lastTrigger = trigger;
    document.documentElement.classList.add('is-lightbox-open');
    document.body.classList.add('is-lightbox-open');
    if (!dialog.open) dialog.showModal();
    show(index);
    closeBtn.focus();
    document.dispatchEvent(new Event('gallery-lightbox-change'));
  };

  const close = () => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('is-lightbox-open');
    document.body.classList.remove('is-lightbox-open');
    image.removeAttribute('src');
    image.removeAttribute('style');
    stage.removeAttribute('style');
    image.alt = '';
    caption.textContent = '';
    caption.hidden = true;
    setLoaded(false);
    resetView();
    const restore = lastTrigger;
    lastTrigger = null;
    items = [];
    document.dispatchEvent(new Event('gallery-lightbox-change'));
    queueMicrotask(() => focusableTrigger(restore)?.focus());
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  closeBtn.addEventListener('click', () => close());
  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));
  zoomInBtn.addEventListener('click', () => zoomBy(ZOOM_STEP, undefined, true));
  zoomOutBtn.addEventListener('click', () => zoomBy(1 / ZOOM_STEP, undefined, true));
  zoomResetBtn.addEventListener('click', () => setScale(MIN_SCALE, undefined, true));

  dialog.addEventListener('keydown', (event) => {
    if (!dialog.open) return;
    if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
      event.preventDefault();
      zoomBy(ZOOM_STEP, undefined, true);
      return;
    }
    if (event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract') {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP, undefined, true);
      return;
    }
    if (event.key === '0' || event.code === 'Numpad0') {
      event.preventDefault();
      setScale(MIN_SCALE, undefined, true);
      return;
    }
    if (items.length < 2) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      show(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      show(items.length - 1);
    }
  });

  const onWheel = (event: WheelEvent) => {
    if (!dialog.open) return;
    event.preventDefault();
    if (gestureActive) return;
    const pinchZoom = event.ctrlKey || event.metaKey;
    const trackpadPan = !pinchZoom && event.deltaX !== 0 && scale > MIN_SCALE + 0.001;
    if (trackpadPan) {
      panBy(-event.deltaX, -event.deltaY);
      return;
    }
    const factor = Math.exp(-event.deltaY * (pinchZoom ? 0.01 : 0.0022));
    zoomBy(factor, pointFromEvent(event));
  };

  dialog.addEventListener('wheel', onWheel, { passive: false });

  viewport.addEventListener('dblclick', (event) => {
    event.preventDefault();
    if (scale > MIN_SCALE + 0.05) setScale(MIN_SCALE, pointFromEvent(event), true);
    else setScale(2, pointFromEvent(event), true);
  });

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, pointFromEvent(event));
    moved = false;

    if (pointers.size === 2) {
      dragging = false;
      dragOrigin = null;
      pinch = { distance: pointerDistance(), scale };
      return;
    }

    if (scale > MIN_SCALE + 0.001) {
      dragging = true;
      dragOrigin = { x: event.clientX, y: event.clientY, tx, ty };
      render();
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, pointFromEvent(event));

    if (pointers.size >= 2 && pinch && pinch.distance > 0) {
      const distance = pointerDistance();
      setScale(pinch.scale * (distance / pinch.distance), pointerMid());
      moved = true;
      return;
    }

    if (!dragging || !dragOrigin) return;
    const dx = event.clientX - dragOrigin.x;
    const dy = event.clientY - dragOrigin.y;
    if (Math.hypot(dx, dy) > 2) moved = true;
    tx = dragOrigin.tx + dx;
    ty = dragOrigin.ty + dy;
    render();
  });

  const endPointer = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1 && scale > MIN_SCALE + 0.001) {
      const remaining = [...pointers.entries()][0];
      if (remaining) {
        dragging = true;
        dragOrigin = { x: remaining[1].x, y: remaining[1].y, tx, ty };
      }
    } else if (pointers.size === 0) {
      dragging = false;
      dragOrigin = null;
      render();

      const now = performance.now();
      const point = pointFromEvent(event);
      if (event.pointerType === 'mouse') return;
      if (
        !moved &&
        lastTap &&
        now - lastTap.time < DOUBLE_MS &&
        Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < DOUBLE_PX
      ) {
        lastTap = null;
        if (scale > MIN_SCALE + 0.05) setScale(MIN_SCALE, point, true);
        else setScale(2, point, true);
      } else if (!moved) {
        lastTap = { time: now, x: point.x, y: point.y };
      } else {
        lastTap = null;
      }
    }
  };

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  viewport.addEventListener(
    'touchmove',
    (event) => {
      if (!dialog.open) return;
      event.preventDefault();
    },
    { passive: false },
  );

  const gestureTarget = viewport as HTMLElement & {
    addEventListener(type: 'gesturestart' | 'gesturechange' | 'gestureend', listener: (event: Event) => void, options?: AddEventListenerOptions): void;
  };

  const onGesture = (event: Event) => {
    event.preventDefault();
    const gesture = event as Event & { scale: number; clientX: number; clientY: number };
    if (event.type === 'gesturestart') {
      gestureActive = true;
      gestureBase = scale;
      return;
    }
    if (event.type === 'gestureend') {
      gestureActive = false;
      return;
    }
    if (event.type === 'gesturechange' && Number.isFinite(gesture.scale)) {
      setScale(gestureBase * gesture.scale, { x: gesture.clientX, y: gesture.clientY });
    }
  };
  gestureTarget.addEventListener('gesturestart', onGesture);
  gestureTarget.addEventListener('gesturechange', onGesture);
  gestureTarget.addEventListener('gestureend', onGesture);

  const resize = new ResizeObserver(() => {
    if (!dialog.open) return;
    const previous = { fitW, fitH };
    measureFit();
    if (previous.fitW && fitW && previous.fitW !== fitW) {
      const k = fitW / previous.fitW;
      tx *= k;
      ty *= k;
    }
    render();
  });
  resize.observe(viewport);

  document.addEventListener('pointerdown', (event) => {
    const trigger = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-lightbox-image]')
      : null;
    if (!trigger) {
      pointerStart = null;
      return;
    }
    pointerStart = { x: event.clientX, y: event.clientY };
  });

  document.addEventListener('click', (event) => {
    if (dialog.open) return;
    const trigger = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-lightbox-image]')
      : null;
    if (!trigger) return;
    if (trigger.closest('[data-thumb]')) return;
    if (
      pointerStart &&
      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > MOVE_THRESHOLD
    ) {
      pointerStart = null;
      return;
    }
    pointerStart = null;
    event.preventDefault();
    open(trigger);
  });
}
