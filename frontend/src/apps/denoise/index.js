// Denoise — remove background noise from a recording, on-device. Decodes the
// audio, runs DeepFilterNet3 (ONNX/WASM) over it, and gives back a clean WAV with
// an A/B player. Every run is kept in a local history sidebar (original + cleaned
// audio), so you can revisit past clips. Heavy lifting lives in engines/denoise.js.

import { createAudioInput } from '../../components/audioInput.js';
import { createProgressBar } from '../../components/progressBar.js';
import { createAudioPlayer } from '../../components/audioPlayer.js';
import { confirmDialog } from '../../components/confirm.js';
import { openContextMenu } from '../../components/contextMenu.js';
import { showUndoToast } from '../../components/undoToast.js';
import { dataStore as db } from '../../lib/dataStore.js';

const ACCENT = '#22d3ee';
const HISTORY = 'history:denoise';
const HISTORY_LIMIT = 30;
const UNDO_MS = 5000;
let sidebarWidth = 220; // drag-resizable; persists across opens within the session.

const TRASH = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
  </svg>`;
const OPEN = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M15 3h6v6"></path><path d="M10 14L21 3"></path>
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
  </svg>`;
const DOWNLOAD = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path>
  </svg>`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const formatWhen = (at) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const baseName = (name) => (name || 'denoised').replace(/\.[^.]+$/, '') || 'denoised';

const loadHistory = async () => (await db.list(HISTORY)).sort((a, b) => (b.at || 0) - (a.at || 0));

const removeEntry = async (entry) => {
  if (entry.origKey) await db.delBlob(entry.origKey);
  if (entry.cleanKey) await db.delBlob(entry.cleanKey);
  await db.remove(HISTORY, entry.id);
};

const saveEntry = async (name, orig, clean) => {
  const origKey = `${HISTORY}/${db.uid()}`;
  const cleanKey = `${HISTORY}/${db.uid()}`;
  await db.putBlob(origKey, orig);
  await db.putBlob(cleanKey, clean);
  const entry = await db.put(HISTORY, { name, at: Date.now(), origKey, cleanKey });
  for (const old of (await loadHistory()).slice(HISTORY_LIMIT)) await removeEntry(old);
  return entry;
};

const app = {
  id: 'denoise',
  name: 'Denoise',
  description: 'Remove background noise from audio',
  accent: ACCENT,
  order: 7,
  dialog: { size: 'lg' },

  render(body) {
    let activeId = null;
    let players = []; // audio players currently shown, so we can stop them
    const pendingDelete = new Set(); // ids hidden during their undo window

    const stopPlayers = () => {
      players.forEach((p) => p.destroy());
      players = [];
    };

    const layout = el('div', 'mt-layout');
    const sidebarEl = el('aside', 'mt-sidebar');
    sidebarEl.style.width = `${sidebarWidth}px`;
    const resizer = el('div', 'mt-resizer');
    const main = el('div', 'app-flow mt-main');
    layout.append(sidebarEl, resizer, main);
    body.replaceChildren(layout);

    // Drag the divider to resize the sidebar (min 200px), kept for the session.
    resizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = sidebarEl.offsetWidth;
      resizer.setPointerCapture(e.pointerId);
      layout.classList.add('is-resizing');
      const move = (ev) => {
        const max = Math.max(200, layout.clientWidth - 320);
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

    async function drawSidebar() {
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
        list.append(el('p', 'mt-history-empty', 'Cleaned clips will appear here.'));
      }
      for (const entry of visible) {
        const item = el('div', 'mt-history-item' + (entry.id === activeId ? ' is-active' : ''));
        const open = el('button', 'mt-history-open');
        open.append(
          el('span', 'mt-history-snippet', entry.name || 'Audio'),
          el('span', 'mt-history-date', formatWhen(entry.at)),
        );
        open.addEventListener('click', () => showResult(entry));
        item.append(open);
        item.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          openContextMenu(ev.clientX, ev.clientY, [
            { label: 'Open', icon: OPEN, onClick: () => showResult(entry) },
            { label: 'Download cleaned', icon: DOWNLOAD, onClick: () => downloadClean(entry) },
            { separator: true },
            { label: 'Delete', icon: TRASH, danger: true, onClick: () => deleteEntry(entry) },
          ]);
        });
        list.append(item);
      }
      sidebarEl.replaceChildren(head, list);
    }

    const downloadClean = async (entry) => {
      const url = await db.blobUrl(entry.cleanKey);
      if (!url) return;
      const a = el('a');
      a.href = url;
      a.download = `${baseName(entry.name)}.wav`;
      a.click();
    };

    const deleteEntry = async (entry) => {
      if (!(await confirmDialog('Delete this clip?'))) return;
      pendingDelete.add(entry.id);
      if (activeId === entry.id) showInput();
      else drawSidebar();

      let undone = false;
      showUndoToast('Clip deleted', {
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

    const showInput = () => {
      stopPlayers();
      activeId = null;
      const intro = el(
        'p',
        'placeholder-lead',
        'Upload or record audio and get a clean version with the background noise removed.',
      );
      const note = el(
        'p',
        'app-note',
        'Runs entirely in your browser — your audio never leaves your device. The model ' +
          'downloads once (~16 MB) and is then cached for offline use.',
      );
      const input = createAudioInput();
      const actions = el('div', 'app-actions');
      const runBtn = el('button', 'button-primary', 'Remove noise');
      runBtn.type = 'button';
      runBtn.disabled = !input.getBlob();
      input.onChange(() => {
        runBtn.disabled = !input.getBlob();
      });
      runBtn.addEventListener('click', () => execute(input));
      actions.append(runBtn);

      main.replaceChildren(intro, note, input.el, actions);
      drawSidebar();
    };

    const execute = async (input) => {
      const blob = input.getBlob();
      if (!blob) return;
      input.stop();
      stopPlayers();

      const bar = createProgressBar({ hint: 'One-time model download — cached and offline afterwards.' });
      bar.update({ phase: 'run', label: 'Preparing…', ratio: null });
      main.replaceChildren(el('p', 'progress-heading', 'Removing noise…'), bar.el);

      try {
        const { denoiseAudio } = await import('../../lib/engines/denoise.js');
        const cleaned = await denoiseAudio(blob, { onProgress: (p) => bar.update(p) });
        const entry = await saveEntry(input.getFilename?.() || 'recording.webm', blob, cleaned);
        showResult(entry);
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', `Couldn't process the audio: ${err.message || err}`));
        drawSidebar();
      }
    };

    const showResult = async (entry) => {
      stopPlayers();
      activeId = entry.id ?? null;
      const cleanUrl = await db.blobUrl(entry.cleanKey);
      const origUrl = await db.blobUrl(entry.origKey);

      const track = (title, url) => {
        const wrap = el('div', 'denoise-track');
        wrap.append(el('span', 'denoise-track-label', title));
        if (url) {
          const player = createAudioPlayer(url);
          players.push(player);
          wrap.append(player.el);
        }
        return wrap;
      };

      const result = el('div', 'denoise-result');
      const dl = el('a', 'button-primary', 'Download cleaned WAV');
      if (cleanUrl) {
        dl.href = cleanUrl;
        dl.download = `${baseName(entry.name)}.wav`;
      }
      result.append(track('Cleaned', cleanUrl), track('Original', origUrl), dl);
      main.replaceChildren(result);
      drawSidebar();
    };

    showInput();

    // Stop playback when the window closes (appsController hook).
    return () => stopPlayers();
  },
};

export default app;
