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

const MAX_RESULT_TAGS = 4;
const INITIAL_STATUS = 'Search across studies, notes, references, events and research threads.';

const searchDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatSearchDate(iso?: string, year?: string): string {
  const raw = iso?.trim();
  if (raw) {
    const date = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return searchDateFormatter.format(date);
  }
  return year?.trim() ?? '';
}

function formatSearchTags(raw?: string): string {
  if (!raw) return '';
  return raw
    .split(/[,·|]/)
    .map((tag) => tag.trim().replace(/-/g, ' '))
    .filter(Boolean)
    .slice(0, MAX_RESULT_TAGS)
    .join(' · ');
}

function excerptHtml(raw: string): string {
  return raw
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/<(?!\/?mark\b)[^>]+>/gi, '')
    .trim();
}

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
      link.setAttribute('aria-selected', String(current));
      link.closest('.site-search__item')?.classList.toggle('is-active', current);
    });
    links[selectedIndex]?.closest('.site-search__item')?.scrollIntoView({ block: 'nearest' });
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
      li.className = 'site-search__item';

      const type = document.createElement('p');
      type.className = 'site-search__type';
      type.textContent = TYPE_LABELS[result.meta.type ?? ''] ?? result.meta.type ?? '';

      const title = document.createElement('a');
      title.className = 'site-search__title';
      title.href = result.url;
      title.dataset.searchItem = '';
      title.setAttribute('role', 'option');
      title.setAttribute('aria-selected', 'false');
      title.textContent = result.meta.title?.trim() || result.url;

      const excerpt = document.createElement('p');
      excerpt.className = 'site-search__excerpt';
      excerpt.innerHTML = excerptHtml(result.excerpt || '');

      li.append(type, title, excerpt);

      const thread = result.meta.threads?.trim();
      const tags = formatSearchTags(result.meta.tags);
      const date = formatSearchDate(result.meta.date, result.meta.year);
      if (thread || tags || date) {
        const meta = document.createElement('div');
        meta.className = 'site-search__meta';
        if (thread) {
          const line = document.createElement('p');
          line.className = 'site-search__thread';
          line.textContent = thread;
          meta.append(line);
        }
        if (tags) {
          const line = document.createElement('p');
          line.className = 'site-search__tags';
          line.textContent = tags;
          meta.append(line);
        }
        if (date) {
          const line = document.createElement('p');
          line.className = 'site-search__date';
          if (result.meta.date?.trim()) {
            const time = document.createElement('time');
            time.dateTime = result.meta.date.trim();
            time.textContent = date;
            line.append(time);
          } else {
            line.textContent = date;
          }
          meta.append(line);
        }
        li.append(meta);
      }

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
