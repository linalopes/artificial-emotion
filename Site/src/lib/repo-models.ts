/**
 * Build-time bridge: repository-relative STL/GLB files stay in their research
 * folders and are copied into `dist/repo-models/` (or served in `astro dev`).
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import {
  isModelDirectiveLine,
  normalizeRepoStlRef,
  parseModelDirective,
  REPO_MODELS_PREFIX,
} from './model-embed';

/** Astro site root (`Site/`), even after Markdown is bundled into `dist/`. */
export function resolveSiteRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'astro.config.ts')) && existsSync(join(dir, 'content'))) {
      return dir;
    }
    const nested = join(dir, 'Site');
    if (existsSync(join(nested, 'astro.config.ts')) && existsSync(join(nested, 'content'))) {
      return nested;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

export function siteRepoRoot(siteRoot = resolveSiteRoot()): string {
  return resolve(siteRoot, '..');
}

export function resolveRepoStlFile(repoRoot: string, src: string): string | null {
  const ref = normalizeRepoStlRef(src);
  if (!ref) return null;

  const root = resolve(repoRoot);
  const abs = resolve(root, ...ref.split('/'));
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!abs.startsWith(rootPrefix)) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return abs;
}

function walkMarkdown(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, found);
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

export function collectModelRefsFromContent(contentDir: string): string[] {
  const refs = new Set<string>();
  for (const file of walkMarkdown(contentDir)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!isModelDirectiveLine(line)) continue;
      const parsed = parseModelDirective(line);
      if (parsed) refs.add(parsed.src);
    }
  }
  return [...refs];
}

function urlToRef(urlPath: string): string | null {
  const path = urlPath.split(/[?#]/)[0] ?? '';
  if (!path.startsWith(REPO_MODELS_PREFIX)) return null;
  try {
    return path
      .slice(REPO_MODELS_PREFIX.length)
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
      .join('/');
  } catch {
    return null;
  }
}

export function repoModelsPlugin(): Plugin {
  let config: ResolvedConfig;
  let command: ResolvedConfig['command'] = 'serve';
  const files = new Map<string, string>();

  const scan = (logMissing: 'throw' | 'warn' | 'silent') => {
    files.clear();
    const siteRoot = config?.root ?? process.cwd();
    const repoRoot = siteRepoRoot(siteRoot);
    const refs = collectModelRefsFromContent(resolve(siteRoot, 'content'));
    const missing: string[] = [];

    for (const src of refs) {
      const abs = resolveRepoStlFile(repoRoot, src);
      if (!abs) {
        missing.push(src);
        continue;
      }
      files.set(src, abs);
    }

    if (missing.length === 0) return;
    const message = `::model referenced missing or unsafe model path(s):\n${missing
      .map((src) => `  - ${src}`)
      .join('\n')}`;
    if (logMissing === 'throw') throw new Error(message);
    if (logMissing === 'warn') console.warn(`[repo-models] ${message}`);
  };

  return {
    name: 'repo-models',
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
        if (file.endsWith('.md') || /\.(stl|glb)$/i.test(file)) {
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
          res.end(`Model not found: ${ref}`);
          return;
        }
        const stat = statSync(abs);
        res.statusCode = 200;
        res.setHeader(
          'Content-Type',
          ref.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' : 'model/stl',
        );
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
        const dest = join(outDir, 'repo-models', ...src.split('/'));
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(abs, dest);
        console.log(`[repo-models] ${relative(siteRepoRoot(config.root), abs)} → ${relative(config.root, dest)}`);
      }
    },
  };
}
