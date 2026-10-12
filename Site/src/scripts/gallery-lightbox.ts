/**
 * Shared image lightbox for article galleries.
 * Videos stay in the gallery; only `[data-lightbox-image]` enters the dialog.
 */

import { cloudinaryLargeImageUrl } from '../lib/cloudinary-url';

const MOVE_THRESHOLD = 12;

type LightboxItem = {
  trigger: HTMLElement;
  largeSrc: string;
  displaySrc: string;
  alt: string;
  caption: string;
};

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

export function mountGalleryLightbox(dialog: HTMLDialogElement): void {
  if (dialog.dataset.bound === 'true') return;
  dialog.dataset.bound = 'true';

  const image = dialog.querySelector<HTMLImageElement>('[data-lightbox-media]');
  const caption = dialog.querySelector<HTMLElement>('[data-lightbox-caption]');
  const closeBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-close]');
  const prevBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-prev]');
  const nextBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-next]');
  if (!image || !caption || !closeBtn || !prevBtn || !nextBtn) return;

  let items: LightboxItem[] = [];
  let index = 0;
  let lastTrigger: HTMLElement | null = null;
  let pointerStart: { x: number; y: number } | null = null;

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setLoaded = (loaded: boolean) => {
    image.classList.toggle('is-loaded', loaded || prefersReducedMotion());
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

    setLoaded(false);
    const onLoad = () => setLoaded(true);
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener(
      'error',
      () => {
        if (image.src !== item.displaySrc) image.src = item.displaySrc;
        else setLoaded(true);
      },
      { once: true },
    );

    if (image.src === item.largeSrc) {
      if (image.complete) setLoaded(true);
    } else {
      image.src = item.largeSrc;
      if (image.complete) setLoaded(true);
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
    image.alt = '';
    caption.textContent = '';
    caption.hidden = true;
    setLoaded(false);
    const restore = lastTrigger;
    lastTrigger = null;
    items = [];
    document.dispatchEvent(new Event('gallery-lightbox-change'));
    queueMicrotask(() => focusableTrigger(restore)?.focus());
  });

  dialog.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (
      event.target === dialog ||
      event.target.classList.contains('gallery-lightbox__figure') ||
      event.target.classList.contains('gallery-lightbox__media')
    ) {
      close();
    }
  });

  closeBtn.addEventListener('click', () => close());
  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));

  dialog.addEventListener('keydown', (event) => {
    if (!dialog.open || items.length < 2) return;
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
