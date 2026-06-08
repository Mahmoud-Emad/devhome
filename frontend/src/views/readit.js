// Readit — a pinned home feature (not an app) showing one trending tech
// article. Fetching + unique-pick logic live in readit.local.js (sources fetched
// directly); this renders the card on the home rail and lets you swap to another.

import { getApi } from '../lib/api.js';
import { createSpinner } from '../components/spinner.js';
import { el } from '../lib/dom.js';

const ACCENT = '#34d399';

const REFRESH = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
    <path d="M21 3v5h-5"></path>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
    <path d="M3 21v-5h5"></path>
  </svg>`;

export function renderReadit(host) {
  const card = () => {
    const c = el('div', 'widget-card readit-widget');
    c.style.setProperty('--accent', ACCENT);
    return c;
  };

  const load = async () => {
    const c = card();
    c.append(createSpinner('Finding an article…'));
    host.replaceChildren(c);
    try {
      showArticle(await getApi('readit/next'));
    } catch (err) {
      showError(err.message);
    }
  };

  const showArticle = (a) => {
    const c = card();

    const head = el('div', 'widget-head');
    head.append(el('span', 'widget-title', 'Trending'));
    const refresh = el('button', 'readit-refresh');
    refresh.title = 'Show another';
    refresh.setAttribute('aria-label', 'Show another');
    refresh.innerHTML = REFRESH;
    refresh.addEventListener('click', load);
    head.append(refresh);

    const title = el('button', 'readit-w-title', a.title);
    const meta = el('p', 'readit-meta', a.minutes ? `${a.source} · ${a.minutes} min read` : a.source);
    const cta = el('button', 'button-primary readit-cta', 'Read more →');

    const open = () => {
      // Hold the loading state until the browser navigates away.
      cta.disabled = true;
      refresh.disabled = true;
      cta.classList.add('is-loading');
      cta.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>Opening…';
      window.location.href = a.url;
    };
    title.addEventListener('click', open);
    cta.addEventListener('click', open);

    c.append(head, title);
    if (a.description) c.append(el('p', 'readit-w-desc', a.description));
    if (a.tags?.length) {
      const tags = el('div', 'readit-tags');
      a.tags.slice(0, 3).forEach((t) => tags.append(el('span', 'readit-tag', `#${t}`)));
      c.append(tags);
    }
    c.append(meta, cta);
    host.replaceChildren(c);
  };

  const showError = (message) => {
    const c = card();
    c.append(el('span', 'widget-title', 'Trending'), el('p', 'readit-w-desc', message));
    const retry = el('button', 'button-secondary readit-cta', 'Try again');
    retry.addEventListener('click', load);
    c.append(retry);
    host.replaceChildren(c);
  };

  load();
  return { reload: load };
}
