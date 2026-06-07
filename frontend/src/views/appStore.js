// App Store — lists every app and lets the user install / uninstall. Installing
// an app that has an on-device model downloads it (with a loading button +
// progress); uninstalling frees it. Apps without a model toggle instantly.

import { apps } from '../apps/index.js';
import { isInstalled, setInstalled } from '../models/installed.js';
import { appModel } from '../lib/appModels.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const monogram = (name) => name.trim().charAt(0).toUpperCase();
const pct = (ratio) => `${Math.round((ratio || 0) * 100)}%`;

export function renderAppStore(container, { onChange } = {}) {
  const list = el('div', 'store-list');

  function row(app) {
    const model = appModel(app.id);
    const item = el('div', 'store-item');
    item.style.setProperty('--accent', app.accent || 'var(--accent)');

    const tile = el('span', 'store-tile', monogram(app.name));

    const meta = el('div', 'store-meta');
    const nameRow = el('div', 'store-name-row');
    nameRow.append(el('span', 'store-name', app.name));
    if (app.widget) nameRow.append(el('span', 'store-tag', 'Home widget'));
    if (model) nameRow.append(el('span', 'store-tag', model.size));
    meta.append(nameRow, el('p', 'store-desc', app.description || ''));

    const btn = el('button', 'store-btn-action');
    btn.type = 'button';
    const err = el('p', 'store-error');
    err.hidden = true;

    const paint = () => {
      const installed = isInstalled(app.id);
      btn.className = `store-btn-action ${installed ? 'button-secondary' : 'button-primary'}`;
      btn.textContent = installed ? 'Uninstall' : 'Install';
      btn.disabled = false;
    };

    btn.addEventListener('click', async () => {
      const installed = isInstalled(app.id);
      err.hidden = true;

      // Plain toggle for apps with no downloadable model.
      if (!model) {
        await setInstalled(app.id, !installed);
        onChange?.();
        draw();
        return;
      }

      btn.disabled = true;
      const spin = (label) => {
        btn.innerHTML = `<span class="btn-spinner"></span>${label}`;
      };
      try {
        if (!installed) {
          btn.className = 'store-btn-action button-primary is-loading';
          spin('');
          await model.download((p) => spin(p?.ratio != null ? pct(p.ratio) : ''));
          await setInstalled(app.id, true);
        } else {
          btn.className = 'store-btn-action button-secondary is-loading';
          spin('');
          await model.remove?.();
          await setInstalled(app.id, false);
        }
        onChange?.();
        draw();
      } catch (e) {
        err.textContent = `Couldn't ${installed ? 'remove' : 'download'} the model: ${e.message || e}`;
        err.hidden = false;
        paint();
      }
    });

    paint();
    const right = el('div', 'store-actions');
    right.append(btn);
    meta.append(err);
    item.append(tile, meta, right);
    return item;
  }

  function draw() {
    list.replaceChildren(...apps.map(row));
  }

  container.replaceChildren(
    el(
      'p',
      'store-intro',
      'Install the tools you want — they appear in the dock. On-device tools (voice, audio) download their model when you install them and free it when you uninstall.',
    ),
    list,
  );
  draw();
}
