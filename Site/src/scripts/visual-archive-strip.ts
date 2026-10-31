/**
 * Homepage visual archive.
 * The asset list is loaded once, shuffled once with Fisher–Yates, then left alone.
 */

type VisualArchiveAsset = {
  type: 'image' | 'video';
  src: string;
  largeSrc: string;
  alt: string;
  caption?: string;
};

function isAsset(value: unknown): value is VisualArchiveAsset {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<VisualArchiveAsset>;
  if (item.type !== 'image' && item.type !== 'video') return false;
  if (typeof item.largeSrc !== 'string' || item.largeSrc.trim().length === 0) return false;
  if (item.type === 'image' && (typeof item.src !== 'string' || item.src.trim().length === 0)) return false;
  return true;
}

/** Unbiased in-place shuffle. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = items[i];
    items[i] = items[j] as T;
    items[j] = current as T;
  }
  return items;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function itemMarkup(asset: VisualArchiveAsset, index: number): string {
  const eager = index < 3;
  const loading = eager ? 'eager' : 'lazy';
  const priority = index === 0 ? ' fetchpriority="high"' : '';
  const caption = asset.caption?.trim() ?? '';
  const alt = asset.alt.trim();

  if (asset.type === 'video') {
    const label = alt ? `Play video: ${alt}` : 'Play video';
    const poster = asset.src.trim();
    const image = poster
      ? `<img src="${escapeAttr(poster)}" alt="" loading="${loading}" decoding="async"${priority}>`
      : '';
    return (
      `<li class="visual-archive__item" data-archive-item>` +
      `<button type="button" class="visual-archive__open" data-lightbox-video` +
      ` data-lightbox-src="${escapeAttr(asset.largeSrc)}"` +
      (poster ? ` data-lightbox-poster="${escapeAttr(poster)}"` : '') +
      (caption ? ` data-lightbox-caption="${escapeAttr(caption)}"` : '') +
      ` aria-haspopup="dialog" aria-controls="gallery-lightbox"` +
      ` aria-label="${escapeAttr(label)}">` +
      image +
      `<span class="visual-archive__play" aria-hidden="true"></span>` +
      `</button></li>`
    );
  }

  const label = alt ? `Enlarge image: ${alt}` : 'Enlarge image';
  return (
    `<li class="visual-archive__item" data-archive-item>` +
    `<button type="button" class="visual-archive__open" data-lightbox-image` +
    ` data-lightbox-src="${escapeAttr(asset.largeSrc)}"` +
    (caption ? ` data-lightbox-caption="${escapeAttr(caption)}"` : '') +
    ` aria-haspopup="dialog" aria-controls="gallery-lightbox"` +
    ` aria-label="${escapeAttr(label)}">` +
    `<img src="${escapeAttr(asset.src)}" alt="${escapeAttr(alt)}" loading="${loading}" decoding="async"${priority}>` +
    `</button></li>`
  );
}

export function mountVisualArchiveStrip(root: HTMLElement): void {
  if (root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';

  const track = root.querySelector<HTMLElement>('[data-archive-track]');
  const prev = root.querySelector<HTMLButtonElement>('[data-archive-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-archive-next]');
  const raw = root.querySelector<HTMLScriptElement>('[data-archive-assets]')?.textContent ?? '[]';
  if (!track || !prev || !next) {
    root.remove();
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    root.remove();
    return;
  }

  const assets = shuffle((Array.isArray(parsed) ? parsed : []).filter(isAsset));
  if (assets.length === 0) {
    root.remove();
    return;
  }

  track.innerHTML = assets.map((asset, index) => itemMarkup(asset, index)).join('');

  const dropItem = (item: HTMLElement) => {
    item.remove();
    if (!track.querySelector('[data-archive-item]')) root.remove();
    else updateNav();
  };

  track.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    img.addEventListener('error', () => {
      const item = img.closest<HTMLElement>('[data-archive-item]');
      if (item) dropItem(item);
    });
  });

  const step = () => {
    const item = track.querySelector<HTMLElement>('[data-archive-item]');
    if (!item) return track.clientWidth;
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    return item.getBoundingClientRect().width + gap;
  };

  const updateNav = () => {
    const max = track.scrollWidth - track.clientWidth;
    const multiple = track.querySelectorAll('[data-archive-item]').length > 1;
    prev.hidden = !multiple;
    next.hidden = !multiple;
    prev.disabled = !multiple || track.scrollLeft <= 2;
    next.disabled = !multiple || track.scrollLeft >= max - 2;
  };

  const scrollByStep = (direction: number) => {
    track.scrollBy({
      left: direction * step(),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  prev.addEventListener('click', () => scrollByStep(-1));
  next.addEventListener('click', () => scrollByStep(1));
  track.addEventListener('scroll', () => updateNav(), { passive: true });
  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      scrollByStep(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scrollByStep(-1);
    }
  });

  let drag: { pointerId: number; x: number; left: number } | null = null;
  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { pointerId: event.pointerId, x: event.clientX, left: track.scrollLeft };
  });
  track.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    track.scrollLeft = drag.left - (event.clientX - drag.x);
  });
  const endDrag = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) drag = null;
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => updateNav());

  root.hidden = false;
  updateNav();
}
