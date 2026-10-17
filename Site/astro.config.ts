import { defineConfig } from 'astro/config';
import { LEGACY_HTML_REDIRECTS } from './src/lib/legacy-urls';
import { repoModelsPlugin } from './src/lib/repo-models';
import { repoSvgPlugin } from './src/lib/repo-svg';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  // Fully static build (HTML/CSS/JS in dist/), ready for GitHub Pages.
  output: 'static',
  redirects: LEGACY_HTML_REDIRECTS,

  // Custom domain at the site root. Do not set `base`: production is
  // https://emotion.linalopes.info/, not a /artificial-emotion/ subpath.
  // Local `astro dev` still serves from http://localhost and `/`.
  site: 'https://emotion.linalopes.info',

  vite: {
    plugins: [repoModelsPlugin(), repoSvgPlugin()],
  },
});
