/**
 * Compact Research Thread gallery: one item at a time, keyboard, swipe,
 * and polite autoplay. Captions/alt come from Cloudinary at build time.
 */

const AUTOPLAY_MS = 4000;
const RESUME_MS = 7000;

export function mountResearchGallery(root: HTMLElement): void {
  const slides = [...root.querySelectorAll<HTMLElement>('[data-slide]')];
  if (slides.length < 2) return;

  const total = slides.length;
  const currentEl = root.querySelector('[data-gallery-current]');
  const liveEl = root.querySelector('[data-gallery-live]');
  const thumbs = [...root.querySelectorAll<HTMLButtonElement>('[data-thumb]')];
  const prev = root.querySelector<HTMLButtonElement>('[data-gallery-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-gallery-next]');
  const stage = root.querySelector<HTMLElement>('[data-gallery-stage]') ?? root;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let index = 0;
  let pointerId: number | undefined;
  let startX = 0;
  let advanceTimer: number | undefined;
  let resumeTimer: number | undefined;
  let pausedHover = false;
  let pausedFocus = false;
  let pausedVideo = false;
  let pausedManual = false;

  const prefersReducedMotion = () => motionQuery.matches;

  const lightboxOpen = () =>
    Boolean(
      document.fullscreenElement ||
        document.querySelector('dialog[open]') ||
        root.querySelector('[data-lightbox-open]'),
    );

  const activeSlide = () => slides[index];

  const activeVideo = () => activeSlide()?.querySelector('video') ?? null;

  const isVideoPlaying = () => {
    const video = activeVideo();
    return Boolean(video && !video.paused && !video.ended);
  };

  const canAutoplay = () =>
    !prefersReducedMotion() &&
    !document.hidden &&
    !pausedHover &&
    !pausedFocus &&
    !pausedVideo &&
    !pausedManual &&
    !lightboxOpen();

  const stopAdvance = () => {
    if (advanceTimer !== undefined) {
      window.clearTimeout(advanceTimer);
      advanceTimer = undefined;
    }
  };

  const stopResume = () => {
    if (resumeTimer !== undefined) {
      window.clearTimeout(resumeTimer);
      resumeTimer = undefined;
    }
  };

  const scheduleAdvance = () => {
    stopAdvance();
    if (!canAutoplay()) return;
    advanceTimer = window.setTimeout(() => {
      advanceTimer = undefined;
      if (!canAutoplay() || isVideoPlaying()) return;
      show(index + 1, 'auto');
    }, AUTOPLAY_MS);
  };

  const noteManual = () => {
    pausedManual = true;
    stopAdvance();
    stopResume();
    resumeTimer = window.setTimeout(() => {
      resumeTimer = undefined;
      pausedManual = false;
      scheduleAdvance();
    }, RESUME_MS);
  };

  const syncVideoState = () => {
    pausedVideo = isVideoPlaying();
    if (pausedVideo) stopAdvance();
  };

  const show = (nextIndex: number, origin: 'auto' | 'manual' = 'manual') => {
    index = ((nextIndex % total) + total) % total;
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.toggleAttribute('aria-hidden', !active);
      if (active) slide.removeAttribute('inert');
      else slide.setAttribute('inert', '');
      if (!active) {
        slide.querySelectorAll('video').forEach((video) => {
          video.pause();
        });
      }
    });
    thumbs.forEach((thumb, i) => {
      if (i === index) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });
    if (currentEl) currentEl.textContent = String(index + 1);
    if (liveEl) liveEl.setAttribute('aria-live', origin === 'manual' ? 'polite' : 'off');
    root.setAttribute('data-index', String(index));
    syncVideoState();
    if (origin === 'manual') noteManual();
    else scheduleAdvance();
  };

  root.dataset.ready = '';
  slides.forEach((slide) => slide.removeAttribute('hidden'));
  show(0, 'auto');

  prev?.addEventListener('click', () => show(index - 1));
  next?.addEventListener('click', () => show(index + 1));
  thumbs.forEach((thumb, i) => {
    thumb.addEventListener('click', () => show(i));
  });

  root.addEventListener('keydown', (event) => {
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
      show(total - 1);
    }
  });

  root.addEventListener('pointerenter', () => {
    pausedHover = true;
    stopAdvance();
  });

  root.addEventListener('pointerleave', () => {
    pausedHover = false;
    scheduleAdvance();
  });

  root.addEventListener('focusin', () => {
    pausedFocus = true;
    stopAdvance();
  });

  root.addEventListener('focusout', (event) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && root.contains(nextTarget)) return;
    pausedFocus = false;
    scheduleAdvance();
  });

  root.addEventListener('play', (event) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    if (event.target.closest('[data-slide]') !== activeSlide()) return;
    pausedVideo = true;
    stopAdvance();
  }, true);

  root.addEventListener('pause', (event) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    if (event.target.closest('[data-slide]') !== activeSlide()) return;
    pausedVideo = isVideoPlaying();
    if (!pausedVideo) scheduleAdvance();
  }, true);

  root.addEventListener('ended', (event) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    if (event.target.closest('[data-slide]') !== activeSlide()) return;
    pausedVideo = false;
    scheduleAdvance();
  }, true);

  const isSwipeTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return !target.closest('video, button, a');
  };

  stage.addEventListener('pointerdown', (event) => {
    if (!isSwipeTarget(event.target)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
  });

  stage.addEventListener('pointerup', (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = undefined;
    if (!isSwipeTarget(event.target) && Math.abs(event.clientX - startX) < 40) return;
    const dx = event.clientX - startX;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
  });

  stage.addEventListener('pointercancel', () => {
    pointerId = undefined;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAdvance();
    else scheduleAdvance();
  });

  document.addEventListener('fullscreenchange', () => {
    if (lightboxOpen()) stopAdvance();
    else scheduleAdvance();
  });

  const onMotionChange = () => {
    if (prefersReducedMotion()) {
      stopAdvance();
      stopResume();
      pausedManual = false;
      return;
    }
    scheduleAdvance();
  };

  motionQuery.addEventListener('change', onMotionChange);
}
