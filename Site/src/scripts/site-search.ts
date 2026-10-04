/**
 * Lazy Pagefind overlay. The search WASM/JS loads only after the user opens
 * search, so ordinary page visits stay light.
 */

type PagefindResultData = {
  url: string;
  excerpt: string;
  meta: Record<string, string | undefined>;
};

type PagefindSearchResult = {
  id: string;
  data: () => Promise<PagefindResultData>;
};

type PagefindSearchApi = {
  results: PagefindSearchResult[];
};

type PagefindApi = {
  options: (opts: { bundlePath: string }) => Promise<void>;
  init: () => Promise<void>;
  search: (query: string) => Promise<PagefindSearchApi>;
};

const TYPE_LABELS: Record<string, string> = {
  research: 'Research',
  study: 'Study',
  note: 'Note',
  reference: 'Reference',
  event: 'Event',
};

const INITIAL_STATUS = 'Search across studies, notes, references, events and research threads.';

let pagefindPromise: Promise<PagefindApi> | undefined;
let lastQuery = '';
let selectedIndex = -1;

function bundlePath(): string {
  const base = import.meta.env.BASE_URL;
  const root = new URL(base.endsWith('/') ? base : `${base}/`, window.location.origin);
  return new URL('pagefind/', root).href;
}

async function loadPagefind(): Promise<PagefindApi> {
  pagefindPromise ??= (async () => {
    const url = new URL('pagefind.js', bundlePath()).href;
    const module = (await import(/* @vite-ignore */ url)) as PagefindApi;
    await module.options({ bundlePath: bundlePath() });
    await module.init();
    return module;
  })();
  return pagefindPromise;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function closeMobileMenu() {
  const header = document.querySelector('.site-header');
  const button = header?.querySelector('.site-header__menu');
  if (!(header instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  header.classList.remove('is-open');
  button.setAttribute('aria-expanded', 'false');
  button.textContent = 'Menu';
}

export function mountSiteSearch() {
  const root = document.querySelector<HTMLElement>('[data-site-search]');
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';

  const dialog = root.querySelector<HTMLElement>('[data-search-dialog]');
  const input = root.querySelector<HTMLInputElement>('[data-search-input]');
  const status = root.querySelector<HTMLElement>('[data-search-status]');
  const list = root.querySelector<HTMLElement>('[data-search-results]');
  const openers = document.querySelectorAll<HTMLButtonElement>('[data-search-open]');
  if (!dialog || !input || !status || !list) return;

  let searchTimer = 0;
  let requestId = 0;

  const setExpanded = (open: boolean) => {
    for (const opener of openers) opener.setAttribute('aria-expanded', String(open));
  };

  const setStatus = (text: string) => {
    status.textContent = text;
  };

  const clearResults = () => {
    list.replaceChildren();
    selectedIndex = -1;
  };

  const items = () => [...list.querySelectorAll<HTMLAnchorElement>('[data-search-item]')];

  const highlight = (index: number) => {
    const links = items();
    selectedIndex = links.length === 0 ? -1 : Math.max(0, Math.min(index, links.length - 1));
    links.forEach((link, i) => {
      const current = i === selectedIndex;
      link.classList.toggle('is-active', current);
      link.setAttribute('aria-selected', String(current));
    });
    links[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  };

  const close = () => {
    if (root.hasAttribute('hidden')) return;
    root.setAttribute('hidden', '');
    dialog.removeAttribute('open');
    document.body.classList.remove('is-search-open');
    setExpanded(false);
    window.clearTimeout(searchTimer);
  };

  const open = async () => {
    if (!root.hasAttribute('hidden')) {
      input.focus();
      return;
    }
    closeMobileMenu();
    root.removeAttribute('hidden');
    dialog.setAttribute('open', '');
    document.body.classList.add('is-search-open');
    setExpanded(true);
    input.focus();
    input.select();

    try {
      await loadPagefind();
    } catch {
      pagefindPromise = undefined;
      setStatus('Search is available after the production build.');
    }
  };

  const render = (query: string, results: PagefindResultData[]) => {
    clearResults();
    if (!query) {
      setStatus(INITIAL_STATUS);
      return;
    }
    if (results.length === 0) {
      setStatus('No results found.');
      return;
    }

    const noun = results.length === 1 ? 'result' : 'results';
    setStatus(`${results.length} ${noun}`);

    for (const result of results) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = result.url;
      link.dataset.searchItem = '';
      link.setAttribute('role', 'option');
      link.setAttribute('aria-selected', 'false');

      const type = document.createElement('span');
      type.className = 'site-search__type';
      type.textContent = TYPE_LABELS[result.meta.type ?? ''] ?? result.meta.type ?? '';

      const title = document.createElement('span');
      title.className = 'site-search__title';
      title.textContent = result.meta.title?.trim() || result.url;

      const excerpt = document.createElement('p');
      excerpt.className = 'site-search__excerpt';
      excerpt.innerHTML = result.excerpt || '';

      const metaBits = [result.meta.threads, result.meta.tags, result.meta.date || result.meta.year].filter(
        (value): value is string => Boolean(value?.trim()),
      );
      link.append(type, title, excerpt);
      if (metaBits.length > 0) {
        const meta = document.createElement('p');
        meta.className = 'site-search__meta';
        meta.textContent = metaBits.join(' · ');
        link.append(meta);
      }

      li.append(link);
      list.append(li);
    }

    highlight(0);
  };

  const runSearch = async (raw: string) => {
    const query = raw.trim();
    lastQuery = query;
    if (!query) {
      clearResults();
      setStatus(INITIAL_STATUS);
      return;
    }

    const current = ++requestId;
    setStatus('Searching…');

    try {
      const api = await loadPagefind();
      const found = await api.search(query);
      const data = await Promise.all(found.results.slice(0, 24).map((result) => result.data()));
      if (current !== requestId) return;
      render(query, data);
    } catch {
      if (current !== requestId) return;
      pagefindPromise = undefined;
      clearResults();
      setStatus('Search is available after the production build.');
    }
  };

  for (const opener of openers) {
    opener.addEventListener('click', () => {
      void open();
    });
  }

  root.querySelectorAll('[data-search-close]').forEach((el) => {
    el.addEventListener('click', close);
  });

  input.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      void runSearch(input.value);
    }, 140);
  });

  input.addEventListener('keydown', (event) => {
    const links = items();
    if (event.key === 'ArrowDown' && links.length > 0) {
      event.preventDefault();
      highlight(selectedIndex + 1);
    } else if (event.key === 'ArrowUp' && links.length > 0) {
      event.preventDefault();
      highlight(selectedIndex <= 0 ? links.length - 1 : selectedIndex - 1);
    } else if (event.key === 'Enter' && links[selectedIndex]) {
      event.preventDefault();
      links[selectedIndex].click();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hasAttribute('hidden')) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    void open();
    if (lastQuery) input.select();
  });
}
