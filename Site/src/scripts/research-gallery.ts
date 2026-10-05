/**
 * Compact Research Thread gallery: one item at a time, keyboard, swipe,
 * and polite autoplay. Captions/alt come from Cloudinary at build time.
 *
 * Images advance on AUTOPLAY_MS. Videos autoplay (muted, inline) while
 * active; the carousel waits for `ended` instead of the image timer.
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
  let ready = false;
  let pointerId: number | undefined;
  let startX = 0;
  let advanceTimer: number | undefined;
  let resumeTimer: number | undefined;
  let pausedHover = false;
  let pausedFocus = false;
  let pausedManual = false;
  let userPausedVideo = false;
  let programmaticPause = false;
  let programmaticPlay = false;

  const prefersReducedMotion = () => motionQuery.matches;

  const lightboxOpen = () =>
    Boolean(
      document.fullscreenElement ||
        document.querySelector('dialog[open]') ||
        root.querySelector('[data-lightbox-open]'),
    );

  const activeSlide = () => slides[index];

  const activeVideo = () => activeSlide()?.querySelector('video') ?? null;

  const allVideos = () => [...root.querySelectorAll('video')];

  const canAdvance = () =>
    !prefersReducedMotion() &&
    !document.hidden &&
    !pausedHover &&
    !pausedFocus &&
    !pausedManual &&
    !userPausedVideo &&
    !lightboxOpen();

  const canAutoplayVideo = () => !prefersReducedMotion() && !document.hidden && !lightboxOpen();

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

  const withProgrammaticPause = (fn: () => void) => {
    programmaticPause = true;
    try {
      fn();
    } finally {
      queueMicrotask(() => {
        programmaticPause = false;
      });
    }
  };

  const resetVideo = (video: HTMLVideoElement) => {
    withProgrammaticPause(() => {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Seeking can fail before metadata; ignore.
      }
      video.preload = 'metadata';
    });
  };

  const pauseInactiveVideos = () => {
    allVideos().forEach((video) => {
      if (video.closest('[data-slide]') === activeSlide()) return;
      resetVideo(video);
    });
  };

  const isActiveVideoPlaying = () => {
    const video = activeVideo();
    return Boolean(video && !video.paused && !video.ended);
  };

  const playSafe = (video: HTMLVideoElement) => {
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    programmaticPlay = true;
    const attempt = video.play();
    if (attempt === undefined) {
      programmaticPlay = false;
      return;
    }
    void attempt
      .catch(() => {
        /* Autoplay blocked: native controls remain. */
      })
      .finally(() => {
        programmaticPlay = false;
        if (video.paused && !video.ended && !userPausedVideo) scheduleAdvance();
      });
  };

  const scheduleAdvance = () => {
    stopAdvance();
    if (!canAdvance()) return;
    if (isActiveVideoPlaying() || userPausedVideo) return;
    advanceTimer = window.setTimeout(() => {
      advanceTimer = undefined;
      if (!canAdvance() || isActiveVideoPlaying() || userPausedVideo) return;
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

  const startActiveVideo = () => {
    const video = activeVideo();
    if (!video) {
      scheduleAdvance();
      return;
    }
    stopAdvance();
    if (!canAutoplayVideo()) return;
    playSafe(video);
  };

  const show = (nextIndex: number, origin: 'auto' | 'manual' = 'manual') => {
    const wrapped = ((nextIndex % total) + total) % total;
    if (ready && wrapped === index) {
      if (origin === 'manual') noteManual();
      return;
    }

    index = wrapped;
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.toggleAttribute('aria-hidden', !active);
      if (active) slide.removeAttribute('inert');
      else slide.setAttribute('inert', '');
    });
    thumbs.forEach((thumb, i) => {
      if (i === index) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });
    if (currentEl) currentEl.textContent = String(index + 1);
    if (liveEl) liveEl.setAttribute('aria-live', origin === 'manual' ? 'polite' : 'off');
    root.setAttribute('data-index', String(index));

    userPausedVideo = false;
    pauseInactiveVideos();
    startActiveVideo();
    if (origin === 'manual') noteManual();
  };

  root.dataset.ready = '';
  slides.forEach((slide) => slide.removeAttribute('hidden'));
  show(0, 'auto');
  ready = true;

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

  root.addEventListener(
    'play',
    (event) => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      const video = event.target;
      allVideos().forEach((other) => {
        if (other === video) return;
        withProgrammaticPause(() => other.pause());
      });
      if (video.closest('[data-slide]') !== activeSlide()) return;
      userPausedVideo = false;
      stopAdvance();
      if (!programmaticPlay) noteManual();
    },
    true,
  );

  root.addEventListener(
    'pause',
    (event) => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      if (programmaticPause) return;
      if (event.target.closest('[data-slide]') !== activeSlide()) return;
      if (event.target.ended) return;
      userPausedVideo = true;
      stopAdvance();
      noteManual();
    },
    true,
  );

  root.addEventListener(
    'ended',
    (event) => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      if (event.target.closest('[data-slide]') !== activeSlide()) return;
      userPausedVideo = false;
      if (prefersReducedMotion() || document.hidden) return;
      show(index + 1, 'auto');
    },
    true,
  );

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
    const video = activeVideo();
    if (document.hidden) {
      stopAdvance();
      if (video && !video.paused) {
        withProgrammaticPause(() => video.pause());
      }
      return;
    }
    if (video && !userPausedVideo && canAutoplayVideo()) playSafe(video);
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
      withProgrammaticPause(() => {
        allVideos().forEach((video) => video.pause());
      });
      return;
    }
    startActiveVideo();
  };

  motionQuery.addEventListener('change', onMotionChange);
}
