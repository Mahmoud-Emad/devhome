// Denoise — remove background noise from a recording, on-device. Decodes the
// audio, runs DeepFilterNet3 (ONNX/WASM) over it, and gives back a clean WAV with
// an A/B player. Every run is kept in a local history sidebar (original + cleaned
// audio), so you can revisit past clips. Heavy lifting lives in engines/denoise.js.

import { createAudioInput } from '../../components/audioInput.js';
import { createProgressBar } from '../../components/progressBar.js';
import { createAudioPlayer } from '../../components/audioPlayer.js';
import { createResizer } from '../../components/resizer.js';
import { createHistorySidebar } from '../../components/historySidebar.js';
import { dataStore as db } from '../../lib/dataStore.js';
import { el } from '../../lib/dom.js';
import { DOWNLOAD, OPEN } from '../../components/icons.js';

const ACCENT = '#22d3ee';
const HISTORY = 'history:denoise';
const HISTORY_LIMIT = 30;
let sidebarWidth = 220; // drag-resizable; persists across opens within the session.

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
    let main;
    let history;
    let players = []; // audio players currently shown, so we can stop them

    const stopPlayers = () => {
      players.forEach((p) => p.destroy());
      players = [];
    };

    const downloadClean = async (entry) => {
      const url = await db.blobUrl(entry.cleanKey);
      if (!url) return;
      const a = el('a');
      a.href = url;
      a.download = `${baseName(entry.name)}.wav`;
      a.click();
    };

    const showInput = () => {
      stopPlayers();
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
        history.open(await saveEntry(input.getFilename?.() || 'recording.webm', blob, cleaned));
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', `Couldn't process the audio: ${err.message || err}`));
      }
    };

    const showResult = async (entry) => {
      stopPlayers();
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
    };

    const layout = el('div', 'mt-layout');
    history = createHistorySidebar({
      emptyText: 'Cleaned clips will appear here.',
      load: loadHistory,
      remove: removeEntry,
      itemOf: (entry) => ({ snippet: entry.name || 'Audio' }),
      menu: (entry) => [
        { label: 'Open', icon: OPEN, onClick: () => history.open(entry) },
        { label: 'Download cleaned', icon: DOWNLOAD, onClick: () => downloadClean(entry) },
      ],
      onOpen: showResult,
      onNew: showInput,
      confirmMessage: 'Delete this clip?',
      undoMessage: 'Clip deleted',
    });
    const sidebarEl = history.el;
    sidebarEl.style.width = `${sidebarWidth}px`;
    const resizer = createResizer({
      layout,
      pane: sidebarEl,
      reserve: 320,
      onResize: (w) => {
        sidebarWidth = w;
      },
    });
    main = el('div', 'app-flow mt-main');
    layout.append(sidebarEl, resizer, main);
    body.replaceChildren(layout);
    history.showNew();

    // Stop playback when the window closes (appsController hook).
    return () => stopPlayers();
  },
};

export default app;
