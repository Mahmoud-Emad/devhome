// Factory for "media in → text out" apps: the user provides input (audio,
// image, …), we run it through an on-device engine with live progress steps,
// then render the text. The Voice to Text app (televoica) uses this.
//
// The caller supplies:
//   createInput()                 -> { el, onChange(fn), getData() | null, stop?() }
//   run(data, cfg, { onProgress })-> string | { text }   (onProgress: engine progress)
//   plus copy: intro, note, actionLabel, processingHeading, resultLabel, …
//
// Every successful result is saved to a local, per-app history (kept on-device)
// so the user can revisit past transcriptions/extractions. Pass `history: false`
// to opt out.
//
// Everything else (id/name/accent/dialog/settings/order) is spread onto the
// returned descriptor.

import { createProgressBar } from '../components/progressBar.js';
import { createResultView } from '../components/resultView.js';
import { getAppConfig } from './appConfig.js';
import { dataStore as db } from './dataStore.js';

const MODEL_HINT = 'The model downloads once and is cached — after that it runs offline.';
const HISTORY_LIMIT = 50;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function leadText(text, className = 'placeholder-lead') {
  return el('p', className, text);
}

const snippet = (text) => {
  const oneLine = (text || '').replace(/\s+/g, ' ').trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine || '(empty)';
};

const formatWhen = (at) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function createMediaTextApp(config) {
  const {
    intro,
    note,
    actionLabel = 'Run',
    processingHeading = 'Working…',
    resultLabel = 'Result',
    emptyText = '',
    downloadName = 'result.txt',
    createInput,
    run,
    pickText = (data) => data.text,
    history: historyEnabled = true,
  } = config;

  const HISTORY = `history:${config.id}`;
  const loadHistory = async () => (await db.list(HISTORY)).sort((a, b) => (b.at || 0) - (a.at || 0));
  const saveHistory = async (text) => {
    await db.put(HISTORY, { text, at: Date.now() });
    const all = await loadHistory();
    for (const h of all.slice(HISTORY_LIMIT)) await db.remove(HISTORY, h.id); // keep newest N
  };

  return {
    ...config,

    render(body) {
      const root = el('div', 'app-flow');
      body.replaceChildren(root);

      const showInput = async (error) => {
        const input = createInput();
        const action = el('button', 'button-primary', actionLabel);
        action.disabled = !input.getData();
        input.onChange?.(() => {
          action.disabled = !input.getData();
        });
        action.addEventListener('click', () => execute(input));

        const nodes = [leadText(intro), input.el, action];
        if (note) nodes.push(leadText(note, 'app-note'));
        if (error) nodes.push(el('p', 'app-error', error));
        root.replaceChildren(...nodes);

        if (historyEnabled) await appendHistory();
      };

      // Appends the "History" panel below the input (only if there are entries).
      const appendHistory = async () => {
        let entries;
        try {
          entries = await loadHistory();
        } catch {
          return;
        }
        if (!entries.length) return;

        const panel = el('div', 'mt-history');
        const head = el('div', 'mt-history-head');
        const clear = el('button', 'link-button', 'Clear all');
        clear.addEventListener('click', async () => {
          for (const h of entries) await db.remove(HISTORY, h.id);
          showInput();
        });
        head.append(el('span', 'mt-history-title', `History · ${entries.length}`), clear);
        panel.append(head);

        const list = el('div', 'mt-history-list');
        for (const entry of entries) {
          const item = el('div', 'mt-history-item');
          const open = el('button', 'mt-history-open');
          open.append(
            el('span', 'mt-history-snippet', snippet(entry.text)),
            el('span', 'mt-history-date', formatWhen(entry.at)),
          );
          open.addEventListener('click', () => showResult(entry.text));
          const del = el('button', 'icon-button mt-history-del', '×');
          del.title = 'Delete';
          del.setAttribute('aria-label', 'Delete from history');
          del.addEventListener('click', async (e) => {
            e.stopPropagation();
            await db.remove(HISTORY, entry.id);
            showInput();
          });
          item.append(open, del);
          list.append(item);
        }
        panel.append(list);
        root.append(panel);
      };

      const execute = async (input) => {
        input.stop?.();
        const cfg = getAppConfig(config);

        const heading = el('p', 'progress-heading', processingHeading);
        const bar = createProgressBar({ hint: MODEL_HINT });
        root.replaceChildren(heading, bar.el);

        try {
          const result = await run(input.getData(), cfg, { onProgress: (p) => bar.update(p) });
          const text = typeof result === 'string' ? result : pickText(result);
          if (historyEnabled && (text || '').trim()) await saveHistory(text);
          showResult(text || '');
        } catch (err) {
          showInput(err.message);
        }
      };

      const showResult = (text) => {
        root.replaceChildren(
          createResultView({
            label: resultLabel,
            text,
            emptyText,
            downloadName,
            onRestart: () => showInput(),
          }).el,
        );
      };

      showInput();
    },
  };
}
