// snaptext — extract text from an image. The picked image stays visible while
// extracting, and the result is shown as Text / Image tabs. OCR runs entirely
// in the browser (Tesseract.js / WASM) — the image never leaves the device.

import { createImageInput } from '../../components/imageInput.js';
import { createImagePanel } from '../../components/imagePanel.js';
import { createProgressBar } from '../../components/progressBar.js';
import { createResultView } from '../../components/resultView.js';
import { createTabs } from '../../components/tabs.js';
import { getAppConfig } from '../../lib/appConfig.js';

const app = {
  id: 'snaptext',
  name: 'Image to Text',
  description: 'Extract text from an image',
  accent: '#f59e0b',
  order: 4,
  dialog: { size: 'md' },

  settings: [
    {
      key: 'language',
      label: 'Language',
      hint: 'Tesseract code: eng, ara, fra, deu… (downloaded on first use)',
      type: 'text',
      default: 'eng',
    },
  ],

  render(body) {
    const root = document.createElement('div');
    root.className = 'app-flow';
    body.replaceChildren(root);

    let blob = null;
    let url = null;

    const setBlob = (b) => {
      if (url) URL.revokeObjectURL(url);
      blob = b;
      url = b ? URL.createObjectURL(b) : null;
    };

    const showPick = () => {
      setBlob(null);
      const lead = document.createElement('p');
      lead.className = 'placeholder-lead';
      lead.textContent = 'Upload, drop, or paste an image and pull the text out of it.';

      const input = createImageInput();
      const extract = document.createElement('button');
      extract.className = 'button-primary';
      extract.textContent = 'Extract text';
      extract.disabled = true;
      input.onChange(() => {
        extract.disabled = !input.getData();
      });
      extract.addEventListener('click', () => {
        const data = input.getData();
        if (!data) return;
        setBlob(data.blob, data.filename);
        runExtract();
      });

      root.replaceChildren(lead, input.el, extract);
    };

    const runExtract = async () => {
      const cfg = getAppConfig(app);
      const heading = document.createElement('p');
      heading.className = 'progress-heading';
      heading.textContent = 'Reading the image…';
      const bar = createProgressBar({
        hint: 'The OCR model downloads once and is cached — after that it runs offline.',
      });
      root.replaceChildren(createImagePanel(url), heading, bar.el);

      try {
        const { recognizeText } = await import('../../lib/engines/ocr.js');
        const text = await recognizeText(blob, { lang: cfg.language || 'eng', onProgress: (p) => bar.update(p) });
        showResult(text);
      } catch (err) {
        showError(err.message);
      }
    };

    const showResult = (text) => {
      const tabs = createTabs(
        [
          {
            id: 'text',
            label: 'Text',
            render: () =>
              createResultView({
                label: 'Extracted text',
                text,
                emptyText: '(no text found)',
                downloadName: 'snaptext.txt',
                onRestart: showPick,
              }).el,
          },
          { id: 'image', label: 'Image', render: () => createImagePanel(url) },
        ],
        'text',
      );
      root.replaceChildren(tabs.el);
    };

    const showError = (message) => {
      const box = document.createElement('p');
      box.className = 'app-error';
      box.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'app-actions';
      const retry = document.createElement('button');
      retry.className = 'button-primary';
      retry.textContent = 'Try again';
      retry.addEventListener('click', runExtract);
      const choose = document.createElement('button');
      choose.className = 'button-secondary';
      choose.textContent = 'Choose another';
      choose.addEventListener('click', showPick);
      actions.append(retry, choose);

      root.replaceChildren(createImagePanel(url), box, actions);
    };

    showPick();
  },
};

export default app;
