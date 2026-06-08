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
import { createAudioPlayer } from '../components/audioPlayer.js';
import { createResizer } from '../components/resizer.js';
import { createHistorySidebar } from '../components/historySidebar.js';
import { getAppConfig } from './appConfig.js';
import { dataStore as db } from './dataStore.js';
import { el } from './dom.js';
import { DOWNLOAD, OPEN, COPY } from '../components/icons.js';

const MODEL_HINT = 'The model downloads once and is cached — after that it runs offline.';
const HISTORY_LIMIT = 50;
let sidebarWidth = 220; // drag-resizable; persists across opens within the session.

function leadText(text, className = 'placeholder-lead') {
  return el('p', className, text);
}

const snippet = (text) => {
  const oneLine = (text || '').replace(/\s+/g, ' ').trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine || '(empty)';
};

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

  // A player for the saved media: a themed audio player, or an image preview.
  // Returns { el, destroy } or null.
  async function mediaEl(entry) {
    if (!entry?.blobKey) return null;
    const url = await db.blobUrl(entry.blobKey);
    if (!url) return null;
    if ((entry.mime || '').startsWith('image/')) {
      const img = el('img', 'mt-media-img');
      img.src = url;
      img.alt = entry.name || 'Input image';
      return { el: img, destroy: () => {} };
    }
    return createAudioPlayer(url);
  }

  return {
    ...config,

    render(body) {
      let mainEl;
      let history = null; // the history sidebar (when enabled)
      let activeMedia = null; // the audio player currently shown, so we can stop it

      const stopMedia = () => {
        activeMedia?.destroy?.();
        activeMedia = null;
      };
      const restart = () => (history ? history.showNew() : showInput());

      const downloadText = (entry) => {
        const url = URL.createObjectURL(new Blob([entry.text || ''], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        a.click();
        URL.revokeObjectURL(url);
      };

      const showInput = (error) => {
        stopMedia();
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
      };

      const showResult = async (entry) => {
        stopMedia();
        const view = createResultView({
          label: resultLabel,
          text: entry.text,
          emptyText,
          downloadName,
          onRestart: restart,
        });
        const media = await mediaEl(entry);
        if (media) {
          activeMedia = media;
          const wrap = el('div', 'mt-result');
          const box = el('div', 'mt-media');
          box.append(media.el);
          wrap.append(box, view.el);
          mainEl.replaceChildren(wrap);
        } else {
          mainEl.replaceChildren(view.el);
        }
      };

      const execute = async (input) => {
        stopMedia();
        input.stop?.();
        const data = input.getData();
        const cfg = getAppConfig(config);

        const bar = createProgressBar({ hint: MODEL_HINT });
        mainEl.replaceChildren(el('p', 'progress-heading', processingHeading), bar.el);

        try {
          const result = await run(data, cfg, { onProgress: (p) => bar.update(p) });
          const text = typeof result === 'string' ? result : pickText(result);
          if (historyEnabled && (text || '').trim()) {
            history.open(await saveHistory(text, data?.blob, data?.filename));
          } else {
            showResult({ text: text || '' });
          }
        } catch (err) {
          showInput(err.message);
        }
      };

      if (historyEnabled) {
        const layout = el('div', 'mt-layout');
        history = createHistorySidebar({
          emptyText: 'Nothing yet — your transcripts will appear here.',
          load: loadHistory,
          remove: removeEntry,
          itemOf: (entry) => ({ snippet: snippet(entry.text) }),
          menu: (entry) => [
            { label: 'Open', icon: OPEN, onClick: () => history.open(entry) },
            {
              label: 'Copy text',
              icon: COPY,
              onClick: () => navigator.clipboard?.writeText(entry.text || '').catch(() => {}),
            },
            { label: 'Download .txt', icon: DOWNLOAD, onClick: () => downloadText(entry) },
          ],
          onOpen: showResult,
          onNew: showInput,
          confirmMessage: 'Delete this transcript?',
          undoMessage: 'Transcript deleted',
        });
        const sidebarEl = history.el;
        sidebarEl.style.width = `${sidebarWidth}px`;
        const resizer = createResizer({
          layout,
          pane: sidebarEl,
          reserve: 300,
          onResize: (w) => {
            sidebarWidth = w;
          },
        });
        mainEl = el('div', 'app-flow mt-main');
        layout.append(sidebarEl, resizer, mainEl);
        body.replaceChildren(layout);
        history.showNew();
      } else {
        mainEl = el('div', 'app-flow');
        body.replaceChildren(mainEl);
        showInput();
      }

      // Stop any playing audio when the window is closed (appsController hook).
      return () => stopMedia();
    },
  };
}
