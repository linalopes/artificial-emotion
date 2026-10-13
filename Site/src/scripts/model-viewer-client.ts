/**
 * Boot STL/GLB viewers only on pages that already contain [data-model-viewer].
 * Three.js is a dynamic import, deferred until a viewer is near the viewport.
 */

const SELECTOR = '[data-model-viewer]';

let enginePromise: Promise<typeof import('./model-viewer-engine')> | null = null;

function loadEngine() {
  return (enginePromise ??= import('./model-viewer-engine'));
}

export function bootModelViewers(): void {
  const nodes = document.querySelectorAll<HTMLElement>(SELECTOR);
  if (nodes.length === 0) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        if (el.dataset.modelMounted === '1') continue;
        el.dataset.modelMounted = '1';
        io.unobserve(el);
        void loadEngine()
          .then(({ mountModelViewer }) => mountModelViewer(el))
          .catch(() => {
            const status = el.querySelector<HTMLElement>('[data-model-status]');
            if (status) {
              status.hidden = false;
              status.textContent = 'This model could not be loaded.';
            }
          });
      }
    },
    { rootMargin: '240px 0px', threshold: 0.01 },
  );

  nodes.forEach((node) => io.observe(node));
}
