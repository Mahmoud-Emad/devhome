// First-run onboarding: welcome the user and pre-download / warm the on-device
// AI models so the first real use of Voice to Text and Image to Text is instant
// and works offline. Shown once (store `onboarded`).

import { store } from '../models/store.js';
import { createProgressBar } from '../components/progressBar.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function renderOnboarding(host, { onDone } = {}) {
  host.className = 'onboarding-overlay';

  const card = el('div', 'onboarding-card');
  card.append(
    el('h1', 'onboarding-title', 'Welcome to devhome'),
    el(
      'p',
      'onboarding-lead',
      'A private developer home page. Your notes, todos, books, and the AI tools all run locally on your device — nothing is uploaded.',
    ),
    el(
      'p',
      'onboarding-lead',
      'Voice to Text and Image to Text use on-device models. We can set them up now (~145 MB, one time) so they’re ready and work offline.',
    ),
  );

  const body = el('div', 'onboarding-body');
  const actions = el('div', 'onboarding-actions');
  const start = el('button', 'button-primary', 'Set up & get started');
  start.type = 'button';
  const skip = el('button', 'onboarding-skip', 'Skip — set up later');
  skip.type = 'button';
  actions.append(start, skip);
  body.append(actions);
  card.append(body);
  host.replaceChildren(card);

  function finish() {
    store.set({ onboarded: true });
    host.classList.add('is-leaving');
    setTimeout(() => {
      host.remove();
      onDone?.();
    }, 220);
  }

  async function prepare() {
    const bar = createProgressBar({ hint: 'One-time setup — it’s cached and works offline afterwards.' });
    bar.update({ phase: 'run', label: 'Preparing Voice to Text…', ratio: null });
    body.replaceChildren(bar.el);

    try {
      const { prefetchModel } = await import('../lib/engines/transcribe.js');
      await prefetchModel('Xenova/whisper-tiny', (p) => bar.update(p));
      bar.update({ phase: 'run', label: 'Preparing Image to Text…', ratio: null });
      const { prefetchOcr } = await import('../lib/engines/ocr.js');
      await prefetchOcr('eng', (p) => bar.update(p));
      finish();
    } catch (err) {
      const error = el('p', 'app-error', `Setup didn’t finish: ${err.message || err}`);
      const retry = el('button', 'button-primary', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', prepare);
      const later = el('button', 'onboarding-skip', 'Skip — set up later');
      later.type = 'button';
      later.addEventListener('click', finish);
      const row = el('div', 'onboarding-actions');
      row.append(retry, later);
      body.replaceChildren(error, row);
    }
  }

  start.addEventListener('click', prepare);
  skip.addEventListener('click', finish);
}
