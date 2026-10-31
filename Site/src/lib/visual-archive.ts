/**
 * Homepage visual-archive payload.
 * Built on the server from Cloudinary tag results. The browser receives
 * public delivery URLs only, then shuffles them once per page load.
 */
import type { GalleryItem } from './cloudinary';
import { cloudinaryVideoPoster } from './cloudinary';
import {
  cloudinaryGalleryImageUrl,
  cloudinaryGalleryPosterUrl,
  cloudinaryLargeImageUrl,
} from './cloudinary-url';
import { mediaSrc } from './paths';

export type VisualArchiveAsset = {
  type: 'image' | 'video';
  /** In-strip image, or video poster. */
  src: string;
  /** Lightbox image, or video playback URL. */
  largeSrc: string;
  alt: string;
  caption?: string;
};

export function prepareVisualArchive(items: GalleryItem[]): VisualArchiveAsset[] {
  const assets: VisualArchiveAsset[] = [];

  for (const item of items) {
    const source = mediaSrc(item.src.trim());
    if (!source) continue;
    const caption = item.caption?.trim() || undefined;

    if (item.type === 'image') {
      assets.push({
        type: 'image',
        src: cloudinaryGalleryImageUrl(source),
        largeSrc: cloudinaryLargeImageUrl(source),
        alt: item.alt.trim(),
        caption,
      });
      continue;
    }

    const posterSource = item.poster?.trim() || cloudinaryVideoPoster(source);
    const deliveredPoster = posterSource ? mediaSrc(posterSource) : '';
    const poster = deliveredPoster.includes('/video/')
      ? cloudinaryGalleryPosterUrl(deliveredPoster)
      : deliveredPoster
        ? cloudinaryGalleryImageUrl(deliveredPoster)
        : '';
    assets.push({
      type: 'video',
      src: poster,
      // Original delivery URL. A width/height resize squares portrait phone videos.
      largeSrc: source,
      alt: item.alt?.trim() || caption || '',
      caption,
    });
  }

  return assets.filter((asset) => asset.type === 'video' || asset.src.length > 0);
}
