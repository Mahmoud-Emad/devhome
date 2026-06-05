// Reusable text-result card: a labelled transcript area with a word count and
// Copy / Download / Start over actions. Shared by every text-output app.

import { createCopyButton } from './copyButton.js';

function wordCount(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return `${words} word${words === 1 ? '' : 's'}`;
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function createResultView({
  label = 'Result',
  text = '',
  emptyText = '',
  downloadName = 'result.txt',
  onRestart,
} = {}) {
  const el = document.createElement('div');
  el.className = 'app-flow';

  const head = document.createElement('div');
  head.className = 'result-head';
  const title = document.createElement('span');
  title.className = 'result-label';
  title.textContent = label;
  const meta = document.createElement('span');
  meta.className = 'result-meta';
  meta.textContent = wordCount(text);
  head.append(title, meta);

  const area = document.createElement('textarea');
  area.className = 'result-text';
  area.readOnly = true;
  area.rows = 9;
  area.value = text || emptyText;

  const actions = document.createElement('div');
  actions.className = 'app-actions';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'button-secondary';
  downloadBtn.textContent = 'Download .txt';
  downloadBtn.disabled = !text;
  downloadBtn.addEventListener('click', () => download(text, downloadName));

  actions.append(createCopyButton(() => area.value), downloadBtn);
  if (onRestart) {
    const again = document.createElement('button');
    again.className = 'button-secondary';
    again.textContent = 'Start over';
    again.addEventListener('click', onRestart);
    actions.append(again);
  }

  el.append(head, area, actions);
  return { el };
}
