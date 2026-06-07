// App Store — lists every app and lets the user install / uninstall. Installs run
// through the global install manager, so they continue in the background if the
// store is closed and show live progress when reopened. Installing an app with an
// on-device model downloads it; uninstalling frees it. Model-less apps are instant.

import { apps } from '../apps/index.js';
import { isInstalled } from '../models/installed.js';
import { appModel } from '../lib/appModels.js';
import { install, uninstall, currentOp, isBusy, opError, onProgress } from '../lib/installManager.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const monogram = (name) => name.trim().charAt(0).toUpperCase();
const pct = (ratio) => `${Math.round((ratio || 0) * 100)}%`;

export function renderAppStore(container) {
  const list = el('div', 'store-list');
  const updaters = [];

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
    const err = el('p', 'store-error');
    err.hidden = true;
    meta.append(nameRow, el('p', 'store-desc', app.description || ''), err);

    const btn = el('button', 'store-btn-action');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (isBusy(app.id)) return;
      if (isInstalled(app.id)) uninstall(app.id);
      else install(app.id);
    });

    // Reflect the current state (called on every manager event).
    function update() {
      const op = currentOp(app.id);
      const installed = isInstalled(app.id);
      const error = opError(app.id);
      if (op) {
        btn.disabled = true;
        btn.className = `store-btn-action ${op.kind === 'install' ? 'button-primary' : 'button-secondary'} is-loading`;
        btn.innerHTML = `<span class="btn-spinner"></span>${op.kind === 'install' && op.ratio != null ? pct(op.ratio) : ''}`;
      } else {
        btn.disabled = false;
        btn.className = `store-btn-action ${installed ? 'button-secondary' : 'button-primary'}`;
        btn.textContent = installed ? 'Uninstall' : 'Install';
      }
      err.hidden = !error;
      if (error) err.textContent = `Couldn't ${installed ? 'remove' : 'download'} the model: ${error}`;
    }
    updaters.push(update);
    update();

    const actions = el('div', 'store-actions');
    actions.append(btn);
    item.append(tile, meta, actions);
    return item;
  }

  list.replaceChildren(...apps.map(row));
  container.replaceChildren(
    el(
      'p',
      'store-intro',
      'Install the tools you want — they appear in the dock. On-device tools (voice, audio) download their model when you install them and free it when you uninstall. Installs keep running in the background.',
    ),
    list,
  );

  // Live-update the buttons as installs progress (rendered once, subscribed once).
  onProgress(() => updaters.forEach((u) => u()));
}
