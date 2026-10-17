/**
 * Markup for a Markdown (or SVG wiki) image that opens the shared gallery lightbox.
 * Matches GalleryImage.astro: `[data-lightbox-image]` + optional `data-lightbox-src`.
 * Standalone images are not wrapped in `[data-gallery-lightbox]`, so they open
 * without prev/next controls.
 */
import { cloudinaryLargeImageUrl } from './cloudinary-url';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function lightboxImageHtml(src: string, alt: string): string {
  const trimmedSrc = src.trim();
  if (!trimmedSrc) return '';

  const trimmedAlt = alt.trim();
  const largeSrc = cloudinaryLargeImageUrl(trimmedSrc);
  const enlargeLabel = trimmedAlt ? `Enlarge image: ${trimmedAlt}` : 'Enlarge image';

  return (
    `<button type="button" class="gallery-zoom" data-lightbox-image` +
    ` data-lightbox-src="${escapeHtml(largeSrc)}"` +
    ` aria-haspopup="dialog" aria-controls="gallery-lightbox"` +
    ` aria-label="${escapeHtml(enlargeLabel)}">` +
    `<img src="${escapeHtml(trimmedSrc)}" alt="${escapeHtml(trimmedAlt)}">` +
    `</button>`
  );
}
