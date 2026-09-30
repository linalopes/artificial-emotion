import { defineConfig } from 'astro/config';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  // Fully static build (HTML/CSS/JS in dist/), ready for GitHub Pages.
  output: 'static',

  // --- GitHub Pages -------------------------------------------------------
  // Set these once the repository exists.
  //
  // Project site  (https://<user>.github.io/<repo>/):
  //   site: 'https://<user>.github.io',
  //   base: '/<repo>',
  //
  // User site or custom domain (https://<user>.github.io/ or https://example.org/):
  //   site: 'https://example.org',
  //   (no base)
  // -----------------------------------------------------------------------
});
