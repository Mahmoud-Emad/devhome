const ENGINES = {
  google: { label: 'Google', url: (q) => `https://www.google.com/search?q=${q}` },
  duckduckgo: { label: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${q}` },
  devdocs: { label: 'DevDocs', url: (q) => `https://devdocs.io/#q=${q}` },
};

export function buildSearchUrl(engineKey, query) {
  const engine = ENGINES[engineKey] || ENGINES.google;
  return engine.url(encodeURIComponent(query));
}

export function renderSearch(el, { engine = 'google', onSubmit } = {}) {
  const form = document.createElement('form');
  form.className = 'search-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'search-input';
  input.placeholder = `Search ${ENGINES[engine]?.label || 'the web'} or enter a URL`;
  input.autocomplete = 'off';
  input.spellcheck = false;

  form.append(input);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) onSubmit?.(q);
  });

  el.replaceChildren(form);
  requestAnimationFrame(() => input.focus());
}
