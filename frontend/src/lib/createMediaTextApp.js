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
import { confirmDialog } from '../components/confirm.js';
import { openContextMenu } from '../components/contextMenu.js';
import { showUndoToast } from '../components/undoToast.js';
import { getAppConfig } from './appConfig.js';
import { dataStore as db } from './dataStore.js';
import { el } from './dom.js';
import { formatWhen } from './format.js';
import { TRASH, DOWNLOAD, OPEN, COPY } from '../components/icons.js';

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
      let sidebarEl = null;
      let mainEl;
      let activeId = null;
      let activeMedia = null; // the audio player currently shown, so we can stop it
      const pendingDelete = new Set(); // ids hidden during their undo window

      const stopMedia = () => {
        activeMedia?.destroy?.();
        activeMedia = null;
      };

      if (historyEnabled) {
        const layout = el('div', 'mt-layout');
        sidebarEl = el('aside', 'mt-sidebar');
        sidebarEl.style.width = `${sidebarWidth}px`;
        const resizer = el('div', 'mt-resizer');
        mainEl = el('div', 'app-flow mt-main');
        layout.append(sidebarEl, resizer, mainEl);
        body.replaceChildren(layout);

        // Drag the divider to resize the sidebar (min 200px), kept for the session.
        resizer.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = sidebarEl.offsetWidth;
          resizer.setPointerCapture(e.pointerId);
          layout.classList.add('is-resizing');
          const move = (ev) => {
            const max = Math.max(200, layout.clientWidth - 300);
            sidebarWidth = Math.min(max, Math.max(200, startW + (ev.clientX - startX)));
            sidebarEl.style.width = `${sidebarWidth}px`;
          };
          const up = () => {
            resizer.releasePointerCapture(e.pointerId);
            layout.classList.remove('is-resizing');
            resizer.removeEventListener('pointermove', move);
            resizer.removeEventListener('pointerup', up);
          };
          resizer.addEventListener('pointermove', move);
          resizer.addEventListener('pointerup', up);
        });
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
        const visible = entries.filter((e) => !pendingDelete.has(e.id));
        if (!visible.length) {
          list.append(el('p', 'mt-history-empty', 'Nothing yet — your transcripts will appear here.'));
        }
        for (const entry of visible) {
          const item = el('div', 'mt-history-item' + (entry.id === activeId ? ' is-active' : ''));
          const open = el('button', 'mt-history-open');
          open.append(
            el('span', 'mt-history-snippet', snippet(entry.text)),
            el('span', 'mt-history-date', formatWhen(entry.at)),
          );
          open.addEventListener('click', () => showResult(entry));
          item.append(open);
          // Actions live in the right-click menu.
          item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openContextMenu(e.clientX, e.clientY, [
              { label: 'Open', icon: OPEN, onClick: () => showResult(entry) },
              {
                label: 'Copy text',
                icon: COPY,
                onClick: () => navigator.clipboard?.writeText(entry.text || '').catch(() => {}),
              },
              { label: 'Download .txt', icon: DOWNLOAD, onClick: () => downloadText(entry) },
              { separator: true },
              { label: 'Delete', icon: TRASH, danger: true, onClick: () => deleteEntry(entry) },
            ]);
          });
          list.append(item);
        }
        sidebarEl.replaceChildren(head, list);
      }

      const downloadText = (entry) => {
        const url = URL.createObjectURL(new Blob([entry.text || ''], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        a.click();
        URL.revokeObjectURL(url);
      };

      // Confirm, then soft-delete with an undo window before it's committed.
      const UNDO_MS = 5000;
      const deleteEntry = async (entry) => {
        if (!(await confirmDialog('Delete this transcript?'))) return;
        pendingDelete.add(entry.id);
        if (activeId === entry.id) showInput();
        else drawSidebar();

        let undone = false;
        showUndoToast('Transcript deleted', {
          duration: UNDO_MS,
          onUndo: () => {
            undone = true;
            pendingDelete.delete(entry.id);
            drawSidebar();
          },
        });
        setTimeout(async () => {
          if (undone || !pendingDelete.has(entry.id)) return;
          pendingDelete.delete(entry.id);
          await removeEntry(entry);
        }, UNDO_MS);
      };

      const showInput = (error) => {
        stopMedia();
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
        stopMedia();
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
        stopMedia();
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
          activeMedia = media;
          const wrap = el('div', 'mt-result');
          const box = el('div', 'mt-media');
          box.append(media.el);
          wrap.append(box, view.el);
          mainEl.replaceChildren(wrap);
        } else {
          mainEl.replaceChildren(view.el);
        }
        drawSidebar();
      };

      showInput();

      // Stop any playing audio when the window is closed (appsController hook).
      return () => stopMedia();
    },
  };
}
