// Denoise — remove background noise from a recording, on-device. Decodes the
// audio, runs DeepFilterNet3 (ONNX/WASM) over it, and gives back a clean WAV with
// an A/B player. All the heavy lifting lives in lib/engines/denoise.js.

import { createAudioInput } from '../../components/audioInput.js';
import { createProgressBar } from '../../components/progressBar.js';

const ACCENT = '#22d3ee';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function audioBlock(title, blob) {
  const wrap = el('div', 'denoise-track');
  wrap.append(el('span', 'denoise-track-label', title));
  const player = el('audio', 'audio-player');
  player.controls = true;
  player.src = URL.createObjectURL(blob);
  wrap.append(player);
  return { wrap, url: player.src };
}

const app = {
  id: 'denoise',
  name: 'Denoise',
  description: 'Remove background noise from audio',
  accent: ACCENT,
  order: 7,
  dialog: { size: 'md' },

  render(body) {
    const root = el('div', 'app-flow');
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
    runBtn.disabled = true;
    actions.append(runBtn);

    const stage = el('div', 'denoise-stage');
    let urls = []; // object URLs to revoke when we re-render the stage

    const clearStage = () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls = [];
      stage.replaceChildren();
    };

    root.append(intro, note, input.el, actions, stage);
    body.replaceChildren(root);

    input.onChange(() => {
      runBtn.disabled = !input.getBlob();
      clearStage();
    });

    runBtn.addEventListener('click', async () => {
      const blob = input.getBlob();
      if (!blob) return;
      input.stop();
      runBtn.disabled = true;
      clearStage();

      const bar = createProgressBar({ hint: 'One-time model download — cached and offline afterwards.' });
      bar.update({ phase: 'run', label: 'Preparing…', ratio: null });
      stage.append(bar.el);

      try {
        const { denoiseAudio } = await import('../../lib/engines/denoise.js');
        const cleaned = await denoiseAudio(blob, { onProgress: (p) => bar.update(p) });

        const result = el('div', 'denoise-result');
        const clean = audioBlock('Cleaned', cleaned);
        const orig = audioBlock('Original', blob);
        urls = [clean.url, orig.url];

        const dl = el('a', 'button-primary', 'Download cleaned WAV');
        dl.href = clean.url;
        dl.download = 'denoised.wav';

        result.append(clean.wrap, orig.wrap, dl);
        stage.replaceChildren(result);
      } catch (err) {
        stage.replaceChildren(el('p', 'app-error', `Couldn't process the audio: ${err.message || err}`));
      } finally {
        runBtn.disabled = !input.getBlob();
      }
    });
  },
};

export default app;
