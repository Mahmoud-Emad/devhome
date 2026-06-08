// Factory for "media in → text out" apps: the user provides input (audio,
// image, …), we run it through an on-device engine with live progress steps,
// then render the text. The Voice to Text app (televoica) uses this.
//
// The caller supplies:
//   createInput()                 -> { el, onChange(fn), getData() | null, stop?() }
//   run(data, cfg, { onProgress })-> string | { text }   (onProgress: engine progress)
//   plus copy: intro, note, actionLabel, processingHeading, resultLabel, …
//
// Every successful result is saved to a local, per-app history (kept on-device):
// the text plus the original media (audio/image), so the user can revisit a past
// run, replay the audio, and copy the text. History lives in a left sidebar.
// Pass `history: false` to opt out (plain single-pane flow).
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

  const removeEntry = async (entry) => {
    if (entry.blobKey) await db.delBlob(entry.blobKey);
    await db.remove(HISTORY, entry.id);
  };

  const saveHistory = async (text, blob, name) => {
    let blobKey;
    if (blob) {
      blobKey = `${HISTORY}/${db.uid()}`;
      await db.putBlob(blobKey, blob);
    }
    const entry = await db.put(HISTORY, {
      text,
      at: Date.now(),
      blobKey,
      mime: blob?.type || '',
      name: name || blob?.name || '',
    });
    for (const old of (await loadHistory()).slice(HISTORY_LIMIT)) await removeEntry(old); // keep newest N
    return entry;
  };

  // A player for the saved media (audio control, or an image), or null.
  async function mediaEl(entry) {
    if (!entry?.blobKey) return null;
    const url = await db.blobUrl(entry.blobKey);
    if (!url) return null;
    if ((entry.mime || '').startsWith('image/')) {
      const img = el('img', 'mt-media-img');
      img.src = url;
      img.alt = entry.name || 'Input image';
      return img;
    }
    const audio = el('audio', 'mt-media-audio');
    audio.controls = true;
    audio.src = url;
    return audio;
  }

  return {
    ...config,

    render(body) {
      let sidebarEl = null;
      let mainEl;
      let activeId = null;

      if (historyEnabled) {
        const layout = el('div', 'mt-layout');
        sidebarEl = el('aside', 'mt-sidebar');
        mainEl = el('div', 'app-flow mt-main');
        layout.append(sidebarEl, mainEl);
        body.replaceChildren(layout);
      } else {
        mainEl = el('div', 'app-flow');
        body.replaceChildren(mainEl);
      }

      async function drawSidebar() {
        if (!sidebarEl) return;
        const head = el('div', 'mt-sidebar-head');
        const newBtn = el('button', 'icon-button mt-new', '+');
        newBtn.title = 'New';
        newBtn.setAttribute('aria-label', 'New');
        newBtn.addEventListener('click', () => showInput());
        head.append(el('span', 'mt-sidebar-title', 'History'), newBtn);

        const list = el('div', 'mt-history-list');
        let entries = [];
        try {
          entries = await loadHistory();
        } catch {
          /* ignore */
        }
        if (!entries.length) {
          list.append(el('p', 'mt-history-empty', 'Nothing yet — your transcripts will appear here.'));
        }
        for (const entry of entries) {
          const item = el('div', 'mt-history-item' + (entry.id === activeId ? ' is-active' : ''));
          const open = el('button', 'mt-history-open');
          open.append(
            el('span', 'mt-history-snippet', snippet(entry.text)),
            el('span', 'mt-history-date', formatWhen(entry.at)),
          );
          open.addEventListener('click', () => showResult(entry));
          const del = el('button', 'icon-button mt-history-del', '×');
          del.title = 'Delete';
          del.setAttribute('aria-label', 'Delete from history');
          del.addEventListener('click', async (e) => {
            e.stopPropagation();
            await removeEntry(entry);
            if (activeId === entry.id) showInput();
            else drawSidebar();
          });
          item.append(open, del);
          list.append(item);
        }
        sidebarEl.replaceChildren(head, list);
      }

      const showInput = (error) => {
        activeId = null;
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
        mainEl.replaceChildren(...nodes);
        drawSidebar();
      };

      const execute = async (input) => {
        input.stop?.();
        const data = input.getData();
        const cfg = getAppConfig(config);

        const heading = el('p', 'progress-heading', processingHeading);
        const bar = createProgressBar({ hint: MODEL_HINT });
        mainEl.replaceChildren(heading, bar.el);

        try {
          const result = await run(data, cfg, { onProgress: (p) => bar.update(p) });
          const text = typeof result === 'string' ? result : pickText(result);
          const entry =
            historyEnabled && (text || '').trim()
              ? await saveHistory(text, data?.blob, data?.filename)
              : { text: text || '' };
          showResult(entry);
        } catch (err) {
          showInput(err.message);
        }
      };

      const showResult = async (entry) => {
        activeId = entry.id ?? null;
        const view = createResultView({
          label: resultLabel,
          text: entry.text,
          emptyText,
          downloadName,
          onRestart: () => showInput(),
        });
        const media = await mediaEl(entry);
        if (media) {
          const wrap = el('div', 'mt-result');
          const box = el('div', 'mt-media');
          box.append(media);
          wrap.append(box, view.el);
          mainEl.replaceChildren(wrap);
        } else {
          mainEl.replaceChildren(view.el);
        }
        drawSidebar();
      };

      showInput();
    },
  };
}
