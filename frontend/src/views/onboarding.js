// First-run onboarding: greet, ask the user's name, and let them pick which
// on-device tools to install. The four essentials are always installed; the
// optional tools are off by default — if the user opts in, we pre-download that
// tool's model so the first use is instant and offline. Shown once (`onboarded`).

import { store } from '../models/store.js';
import { DEFAULT_APPS } from '../models/installed.js';
import { createProgressBar } from '../components/progressBar.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Opt-in tools and how to warm their model.
const OPTIONAL = [
  {
    id: 'televoica',
    name: 'Voice to Text',
    hint: 'Transcribe speech — ~145 MB model',
    prefetch: async (cb) => {
      const { prefetchModel } = await import('../lib/engines/transcribe.js');
      await prefetchModel('Xenova/whisper-tiny', cb);
    },
  },
  {
    id: 'snaptext',
    name: 'Image to Text',
    hint: 'Read text from images',
    prefetch: async (cb) => {
      const { prefetchOcr } = await import('../lib/engines/ocr.js');
      await prefetchOcr('eng', cb);
    },
  },
  {
    id: 'denoise',
    name: 'Denoise',
    hint: 'Remove background noise — ~16 MB model',
    prefetch: async (cb) => {
      const { prefetchDenoiseModel } = await import('../lib/engines/denoise.js');
      await prefetchDenoiseModel(cb);
    },
  },
];

export function renderOnboarding(host, { onDone } = {}) {
  host.className = 'onboarding-overlay';

  const card = el('div', 'onboarding-card');
  card.append(
    el('h1', 'onboarding-title', 'Welcome to devhome'),
    el(
      'p',
      'onboarding-lead',
      'A private developer home page. Your notes, todos, books and tools all run locally on your device — nothing is uploaded.',
    ),
  );

  // Name (optional) — used for the home greeting.
  const nameField = el('div', 'onboarding-field');
  const nameLabel = el('label', 'onboarding-field-label', 'What should I call you?');
  nameLabel.htmlFor = 'onboarding-name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'onboarding-name';
  nameInput.className = 'input';
  nameInput.placeholder = 'Your name (optional)';
  nameInput.value = store.get('name') || '';
  nameField.append(nameLabel, nameInput);
  card.append(nameField);

  // Optional on-device tools. Essentials (calculator, notes, todos, PDF library)
  // are installed automatically; you can add more anytime from the App Store.
  const tools = el('div', 'onboarding-tools');
  const checks = new Map();
  for (const tool of OPTIONAL) {
    const row = el('label', 'onboarding-tool');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'onboarding-tool-check';
    const text = el('span', 'onboarding-tool-text');
    text.append(el('span', 'onboarding-tool-name', tool.name), el('span', 'onboarding-tool-hint', tool.hint));
    row.append(cb, text);
    checks.set(tool.id, cb);
    tools.append(row);
  }
  card.append(el('p', 'onboarding-field-label', 'Add on-device tools (optional)'), tools);

  const body = el('div', 'onboarding-body');
  const actions = el('div', 'onboarding-actions');
  const start = el('button', 'button-primary', 'Get started');
  start.type = 'button';
  actions.append(start);
  body.append(actions);
  card.append(body);
  host.replaceChildren(card);

  function finish() {
    const name = nameInput.value.trim();
    const selected = OPTIONAL.filter((t) => checks.get(t.id).checked).map((t) => t.id);
    store.set({ onboarded: true, installedApps: [...DEFAULT_APPS, ...selected], ...(name ? { name } : {}) });
    host.classList.add('is-leaving');
    setTimeout(() => {
      host.remove();
      onDone?.();
    }, 220);
  }

  async function prepare() {
    const selected = OPTIONAL.filter((t) => checks.get(t.id).checked);
    if (!selected.length) {
      finish(); // just the essentials — nothing to download
      return;
    }
    const bar = createProgressBar({ hint: 'One-time setup — cached and works offline afterwards.' });
    body.replaceChildren(bar.el);
    try {
      for (const tool of selected) {
        bar.update({ phase: 'run', label: `Preparing ${tool.name}…`, ratio: null });
        await tool.prefetch((p) => bar.update(p));
      }
      finish();
    } catch (err) {
      const error = el('p', 'app-error', `Setup didn’t finish: ${err.message || err}`);
      const retry = el('button', 'button-primary', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', prepare);
      const later = el('button', 'onboarding-skip', 'Finish anyway');
      later.type = 'button';
      later.addEventListener('click', finish); // installs them; models download on first use
      const row = el('div', 'onboarding-actions');
      row.append(retry, later);
      body.replaceChildren(error, row);
    }
  }

  start.addEventListener('click', prepare);
}
