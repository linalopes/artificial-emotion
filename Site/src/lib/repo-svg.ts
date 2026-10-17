/**
 * Build-time bridge: repository SVG files referenced by Obsidian wikilinks
 * stay in their research folders and are copied into `dist/repo-svg/`
 * (or served in `astro dev`).
 */
import { copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { siteRepoRoot } from './repo-models';
import {
  collectSvgWikiTargetsFromContent,
  REPO_SVG_PREFIX,
  resetSvgIndex,
  resolveSvgWikiTarget,
  SvgEmbedError,
} from './svg-embed';

function urlToRef(urlPath: string): string | null {
  const path = urlPath.split(/[?#]/)[0] ?? '';
  if (!path.startsWith(REPO_SVG_PREFIX)) return null;
  try {
    return path
      .slice(REPO_SVG_PREFIX.length)
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
      .join('/');
  } catch {
    return null;
  }
}

export function repoSvgPlugin(): Plugin {
  let config: ResolvedConfig;
  let command: ResolvedConfig['command'] = 'serve';
  const files = new Map<string, string>();

  const scan = (logMissing: 'throw' | 'warn' | 'silent') => {
    files.clear();
    resetSvgIndex();
    const siteRoot = config?.root ?? process.cwd();
    const repoRoot = siteRepoRoot(siteRoot);
    const refs = collectSvgWikiTargetsFromContent(resolve(siteRoot, 'content'));
    const problems: string[] = [];

    for (const target of refs) {
      try {
        const rel = resolveSvgWikiTarget(repoRoot, target);
        files.set(rel, resolve(repoRoot, ...rel.split('/')));
      } catch (error) {
        if (error instanceof SvgEmbedError) problems.push(error.message);
        else throw error;
      }
    }

    if (problems.length === 0) return;
    const message = `Obsidian SVG embed failed:\n${problems.map((item) => `  - ${item}`).join('\n')}`;
    if (logMissing === 'throw') throw new Error(message);
    if (logMissing === 'warn') console.warn(`[repo-svg] ${message}`);
  };

  return {
    name: 'repo-svg',
    configResolved(resolved) {
      config = resolved;
      command = resolved.command;
    },
    buildStart() {
      scan(command === 'build' ? 'throw' : 'warn');
    },
    configureServer(server: ViteDevServer) {
      const contentDir = resolve(config.root, 'content');
      server.watcher.add(contentDir);
      for (const abs of files.values()) server.watcher.add(abs);

      server.watcher.on('change', (file) => {
        if (file.endsWith('.md') || /\.svg$/i.test(file)) {
          scan('warn');
          for (const abs of files.values()) server.watcher.add(abs);
        }
      });

      server.middlewares.use((req, res, next) => {
        const ref = urlToRef(typeof req.url === 'string' ? req.url : '');
        if (!ref) {
          next();
          return;
        }
        const abs = files.get(ref);
        if (!abs || !existsSync(abs)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(`SVG not found: ${ref}`);
          return;
        }
        const stat = statSync(abs);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('Content-Length', String(stat.size));
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(abs).pipe(res);
      });
    },
    closeBundle() {
      if (command !== 'build') return;
      scan('throw');
      const outDir = resolve(config.root, config.build.outDir);
      for (const [src, abs] of files) {
        const dest = join(outDir, 'repo-svg', ...src.split('/'));
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(abs, dest);
        console.log(`[repo-svg] ${relative(siteRepoRoot(config.root), abs)} → ${relative(config.root, dest)}`);
      }
    },
  };
}
