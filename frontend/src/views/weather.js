// Weather — a pinned home card. The browser provides coordinates (geolocation,
// cached to avoid re-prompting); weather.local.js fetches Open-Meteo and returns
// a small payload. We show the cached reading instantly, then refresh.

import { store } from '../models/store.js';
import { getApi } from '../lib/api.js';

const ACCENT = '#60a5fa';

// Line-art icons keyed by the weather "group".
const ICONS = {
  clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 6.5 19z"></path></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 16a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 6.5 16"></path><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"></path></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 16a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 6.5 16"></path><path d="M8 20h.01M12 20h.01M16 20h.01"></path></svg>',
  fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14M4 13h16M6 17h12"></path></svg>',
  storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 15a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 6.5 15"></path><path d="M13 12l-3 4h4l-3 4"></path></svg>',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconFor(d) {
  const svg = d.group === 'clear' && !d.isDay ? ICONS.moon : ICONS[d.group] || ICONS.cloud;
  const span = el('span', 'weather-icon');
  span.innerHTML = svg;
  return span;
}

function getCoords(prev) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return prev ? resolve(prev) : reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => (prev ? resolve(prev) : reject(new Error('denied'))),
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export function renderWeather(host) {
  const cached = store.get('weatherCache');
  host.replaceChildren(cached?.data ? card(cached.data) : simpleCard('Weather', 'Loading…'));

  (async () => {
    let coords;
    try {
      coords = await getCoords(store.get('weatherCoords'));
    } catch {
      if (!cached?.data) host.replaceChildren(simpleCard('Weather', 'Location unavailable'));
      return;
    }
    store.set({ weatherCoords: coords });
    try {
      const unit = store.get('weatherUnit') || 'celsius';
      const data = await getApi(`weather?lat=${coords.lat}&lon=${coords.lon}&unit=${unit}`);
      store.set({ weatherCache: { data, at: Date.now() } });
      host.replaceChildren(card(data));
    } catch {
      if (!cached?.data) host.replaceChildren(simpleCard('Weather', 'Weather unavailable'));
    }
  })();
}

function shell() {
  const c = el('div', 'widget-card weather-card');
  c.style.setProperty('--accent', ACCENT);
  return c;
}

function simpleCard(title, msg) {
  const c = shell();
  const head = el('div', 'widget-head');
  head.append(el('span', 'widget-title', title));
  c.append(head, el('p', 'weather-msg', msg));
  return c;
}

function card(d) {
  const c = shell();
  const head = el('div', 'widget-head');
  head.append(el('span', 'widget-title', 'Weather'), el('span', 'widget-count', d.condition || ''));
  c.append(head);

  const row = el('div', 'weather-row');
  row.append(iconFor(d));
  row.append(el('span', 'weather-temp', d.temp != null ? `${d.temp}${d.unit}` : '—'));
  c.append(row);

  const meta = el('div', 'weather-meta');
  if (d.high != null && d.low != null) meta.append(el('span', null, `H ${d.high}°  L ${d.low}°`));
  if (d.wind != null) meta.append(el('span', null, `Wind ${d.wind} km/h`));
  if (meta.children.length) c.append(meta);
  return c;
}
