import { VERSION } from '../data/releaseNotes.js';
import { apps } from '../apps/index.js';
import { getAppConfig, setAppConfig } from '../lib/appConfig.js';
import { dataStore } from '../lib/dataStore.js';

const ENGINES = [
  { value: 'google', label: 'Google' },
  { value: 'duckduckgo', label: 'DuckDuckGo' },
  { value: 'devdocs', label: 'DevDocs' },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const starSvg = (filled) => `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="${filled ? 'currentColor' : 'none'}"
    stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
    <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"></polygon>
  </svg>`;

function field(label, hint, control) {
  const row = document.createElement('label');
  row.className = 'field';

  const text = document.createElement('span');
  text.className = 'field-text';
  text.innerHTML = `<span class="field-label">${label}</span>` +
    (hint ? `<span class="field-hint">${hint}</span>` : '');

  row.append(text, control);
  return row;
}

function textInput(value, onInput) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input';
  input.value = value;
  input.placeholder = 'Your name';
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function select(options, value, onChange) {
  const el = document.createElement('select');
  el.className = 'input select';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    el.append(o);
  }
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

function toggle(checked, onChange) {
  const wrap = document.createElement('span');
  wrap.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const track = document.createElement('span');
  track.className = 'switch-track';
  wrap.append(input, track);
  return wrap;
}

function slider(value, onInput) {
  const wrap = document.createElement('span');
  wrap.className = 'slider';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '12';
  input.step = '1';
  input.value = String(value);
  const out = document.createElement('span');
  out.className = 'slider-value';
  out.textContent = `${value}px`;
  input.addEventListener('input', () => {
    out.textContent = `${input.value}px`;
    onInput(Number(input.value));
  });
  wrap.append(input, out);
  return wrap;
}

function personalization(state, onChange) {
  const panel = document.createElement('div');
  panel.append(
    field('Display name', 'Shown in the greeting', textInput(state.name, (v) => onChange({ name: v }))),
    field('Background blur', 'Soften the wallpaper', slider(state.bgBlur, (v) => onChange({ bgBlur: v }))),
  );
  return panel;
}

const UNITS = [
  { value: 'celsius', label: 'Celsius (°C)' },
  { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
];

function preferences(state, onChange) {
  const panel = document.createElement('div');
  panel.append(
    field('Search engine', 'Used by the search bar', select(ENGINES, state.searchEngine, (v) => onChange({ searchEngine: v }))),
    field('24-hour clock', 'Off shows AM / PM', toggle(state.clock24h, (v) => onChange({ clock24h: v }))),
    field('Temperature', 'Units for the weather card', select(UNITS, state.weatherUnit, (v) => onChange({ weatherUnit: v }))),
    groupTitle('Home screen'),
    field('Pin Readit', 'Show a trending article on the home', toggle(state.homeReadit, (v) => onChange({ homeReadit: v }))),
    field("Pin today's tasks", 'Show open to-dos on the home', toggle(state.homeTasks, (v) => onChange({ homeTasks: v }))),
    field('Pin last read book', 'Resume your latest PDF from the home', toggle(state.homeBook, (v) => onChange({ homeBook: v }))),
    field('Pin weather', 'Show local weather on the home', toggle(state.homeWeather, (v) => onChange({ homeWeather: v }))),
    field('Pin focus timer', 'A Pomodoro timer on the home', toggle(state.homeFocus, (v) => onChange({ homeFocus: v }))),
    field('Show tips', 'Helpful tips on the home', toggle(state.homeTips, (v) => onChange({ homeTips: v }))),
  );
  return panel;
}

function groupTitle(text) {
  const h = document.createElement('p');
  h.className = 'settings-group';
  h.textContent = text;
  return h;
}

// Wallpaper gallery: pick a wallpaper, favorite (pin) one so it stays, or
// upload a custom one. All wallpaper logic lives in the background controller.
function wallpaperPanel(_state, _onChange, ctx) {
  const wp = ctx?.wallpaper;
  const panel = el('div', 'wp-panel');
  if (!wp) {
    panel.append(el('p', 'field-hint', 'Wallpapers are unavailable right now.'));
    return panel;
  }

  panel.append(el('p', 'wp-hint', 'Tap a wallpaper to use it. Favorite (★) one to keep it from changing on new tabs.'));

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;
  const upBtn = el('button', 'button-secondary', 'Upload a wallpaper');
  upBtn.type = 'button';
  upBtn.addEventListener('click', () => file.click());
  const status = el('p', 'wp-status');
  status.hidden = true;
  panel.append(upBtn, file, status);

  const grid = el('div', 'wp-grid');
  panel.append(grid);

  function tile(b, currentId, pinnedId) {
    const t = el('div', 'wp-tile' + (b.id === currentId ? ' is-current' : ''));

    const thumb = el('button', 'wp-thumb');
    thumb.type = 'button';
    thumb.style.backgroundImage = `url("${b.url}")`;
    thumb.title = b.author ? `Use “${b.author}”` : 'Use this wallpaper';
    thumb.addEventListener('click', async () => { await wp.setCurrent(b.id); refresh(); });

    const star = el('button', 'wp-star' + (b.id === pinnedId ? ' is-on' : ''));
    star.type = 'button';
    star.title = b.id === pinnedId ? 'Remove favorite (resume rotation)' : 'Favorite — keep this wallpaper';
    star.innerHTML = starSvg(b.id === pinnedId);
    star.addEventListener('click', async (e) => {
      e.stopPropagation();
      await wp.setPinned(b.id === pinnedId ? null : b.id);
      refresh();
    });

    t.append(thumb, star);
    if (b.author) t.append(el('span', 'wp-author', b.author));
    if (b.custom) {
      const del = el('button', 'wp-del', '×');
      del.type = 'button';
      del.title = 'Delete this wallpaper';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        await wp.remove(b.id);
        refresh();
      });
      t.append(del);
    }
    return t;
  }

  async function refresh() {
    grid.replaceChildren(el('p', 'wp-loading', 'Loading…'));
    let list;
    try {
      list = await wp.list();
    } catch {
      grid.replaceChildren(el('p', 'field-hint', 'Couldn’t load wallpapers.'));
      return;
    }
    const currentId = wp.currentId();
    const pinnedId = wp.pinnedId();
    grid.replaceChildren(...list.map((b) => tile(b, currentId, pinnedId)));
  }

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    // Crop/frame the image to the screen aspect before uploading.
    let blob;
    try {
      const { openImageCropper } = await import('../components/imageCropper.js');
      blob = await openImageCropper(f, { aspect: window.innerWidth / window.innerHeight });
    } catch {
      blob = null;
    }
    if (!blob) return; // cancelled
    status.hidden = false;
    status.classList.remove('is-error');
    status.textContent = 'Uploading…';
    try {
      const base = (f.name || 'wallpaper').replace(/\.[^.]+$/, '');
      const wallpaperFile = new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
      const id = await wp.upload(wallpaperFile);
      await wp.setPinned(id); // set it as the wallpaper and keep it
      status.hidden = true;
      refresh();
    } catch (err) {
      status.textContent = err.message || 'Upload failed.';
      status.classList.add('is-error');
    }
  });

  refresh();
  return panel;
}

// Build a control from an app's settings-schema field.
function schemaControl(fieldDef, value, onChange) {
  if (fieldDef.type === 'select') {
    return select(fieldDef.options, value, onChange);
  }
  const input = document.createElement('input');
  input.type = fieldDef.type === 'password' ? 'password' : 'text';
  input.className = 'input';
  input.value = value ?? '';
  input.placeholder = fieldDef.placeholder || '';
  input.autocomplete = 'off';
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

function appsPanel() {
  const panel = document.createElement('div');
  let any = false;

  for (const appItem of apps) {
    if (!appItem.settings?.length) continue;
    any = true;
    panel.append(groupTitle(appItem.name));
    const cfg = getAppConfig(appItem);
    for (const fieldDef of appItem.settings) {
      panel.append(field(
        fieldDef.label,
        fieldDef.hint,
        schemaControl(fieldDef, cfg[fieldDef.key], (v) => setAppConfig(appItem.id, fieldDef.key, v)),
      ));
    }
  }

  if (!any) panel.append(el('p', 'field-hint', 'No app settings to configure.'));
  return panel;
}

// Data: everything is stored locally; back it up / restore it (the user owns it).
function dataPanel() {
  const panel = el('div', 'wp-panel');

  panel.append(
    el(
      'p',
      'wp-hint',
      'Everything you create — notes, todos, books, highlights and wallpapers — is stored privately in this browser. Export a backup to keep a copy or move to another device.',
    ),
  );

  panel.append(groupTitle('Backup'));
  const status = el('p', 'wp-status');
  status.hidden = true;

  const exportBtn = el('button', 'button-secondary', 'Export my data');
  exportBtn.type = 'button';
  exportBtn.addEventListener('click', async () => {
    const data = await dataStore.exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `devhome-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json';
  file.hidden = true;
  const importBtn = el('button', 'button-secondary', 'Import a backup');
  importBtn.type = 'button';
  importBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    status.hidden = false;
    status.classList.remove('is-error');
    status.textContent = 'Importing…';
    try {
      await dataStore.importAll(JSON.parse(await f.text()));
      status.textContent = 'Imported — reloading…';
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      status.textContent = err.message || 'Import failed.';
      status.classList.add('is-error');
    }
  });

  const row = el('div', 'data-actions');
  row.append(exportBtn, importBtn, file);
  panel.append(row, status);
  return panel;
}

const COFFEE_SVG = `
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 8h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8z"></path>
    <path d="M17 9h2a2 2 0 0 1 0 4h-2"></path>
    <path d="M8 2c-.4.7-.4 1.3 0 2M12 2c-.4.7-.4 1.3 0 2"></path>
  </svg>`;

const GITHUB_SVG = `
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.42.37.8 1.1.8 2.22v3.29c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5z"></path>
  </svg>`;

function linkButton(href, svg, label) {
  const a = document.createElement('a');
  a.className = 'about-link';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.innerHTML = `${svg}<span>${label}</span>`;
  return a;
}

function about() {
  const panel = document.createElement('div');
  panel.className = 'about';
  panel.innerHTML = `
    <p class="about-name">devhome</p>
    <p class="about-version">Version ${VERSION}</p>
    <p class="about-text">A developer home page for every new tab — your everyday tools and a fresh wallpaper, one keystroke away.</p>
  `;

  const links = el('div', 'about-links');
  links.append(
    linkButton('https://github.com/Mahmoud-Emad', GITHUB_SVG, 'GitHub'),
    linkButton('https://buymeacoffee.com/omdanii', COFFEE_SVG, 'Buy me a coffee'),
  );
  panel.append(links);
  return panel;
}

const TABS = [
  { id: 'personalization', label: 'Personalization', render: personalization },
  { id: 'wallpaper', label: 'Wallpaper', render: wallpaperPanel },
  { id: 'preferences', label: 'Preferences', render: preferences },
  { id: 'apps', label: 'Apps', render: () => appsPanel() },
  { id: 'data', label: 'Data', render: dataPanel },
  { id: 'about', label: 'About', render: () => about() },
];

export function renderSettings(container, { state, onChange, initialTab, wallpaper }) {
  const tabBar = document.createElement('nav');
  tabBar.className = 'settings-tabs';

  const panels = document.createElement('div');
  panels.className = 'settings-panels';

  const ctx = { wallpaper };

  function show(tab) {
    for (const b of tabBar.children) b.classList.toggle('is-active', b.dataset.tab === tab.id);
    panels.replaceChildren(tab.render(state, onChange, ctx));
  }

  for (const tab of TABS) {
    const b = document.createElement('button');
    b.className = 'settings-tab';
    b.dataset.tab = tab.id;
    b.textContent = tab.label;
    b.addEventListener('click', () => show(tab));
    tabBar.append(b);
  }

  container.replaceChildren(tabBar, panels);
  show(TABS.find((t) => t.id === initialTab) || TABS[0]);
}
