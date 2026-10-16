/**
 * Former public paths that used a date-prefixed Markdown filename as the URL.
 * GitHub Pages is static HTML: these become meta-refresh pages, not HTTP 301s.
 */
export const LEGACY_HTML_REDIRECTS: Record<string, string> = {
  '/studies/2026-10-15-artificial-emotion-controller-v1/':
    '/studies/artificial-emotion-controller-v1/',
};
