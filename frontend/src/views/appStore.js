// App Store — lists every app and lets the user install / uninstall. Installed
// apps appear in the dock (and their home widget, if any). On-device tools
// download their model only once installed and used.

import { apps } from '../apps/index.js';
import { isInstalled, setInstalled } from '../models/installed.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const monogram = (name) => name.trim().charAt(0).toUpperCase();

export function renderAppStore(container, { onChange } = {}) {
  const list = el('div', 'store-list');

  function row(app) {
    const item = el('div', 'store-item');
    item.style.setProperty('--accent', app.accent || 'var(--accent)');

    const tile = el('span', 'store-tile', monogram(app.name));

    const meta = el('div', 'store-meta');
    const nameRow = el('div', 'store-name-row');
    nameRow.append(el('span', 'store-name', app.name));
    if (app.widget) nameRow.append(el('span', 'store-tag', 'Home widget'));
    meta.append(nameRow, el('p', 'store-desc', app.description || ''));

    const installed = isInstalled(app.id);
    const btn = el('button', installed ? 'button-secondary' : 'button-primary', installed ? 'Uninstall' : 'Install');
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      await setInstalled(app.id, !isInstalled(app.id));
      onChange?.();
      draw();
    });

    item.append(tile, meta, btn);
    return item;
  }

  function draw() {
    list.replaceChildren(...apps.map(row));
  }

  container.replaceChildren(
    el(
      'p',
      'store-intro',
      'Install the tools you want — they appear in the dock. On-device tools (voice, image, audio) download their model the first time you use them.',
    ),
    list,
  );
  draw();
}
