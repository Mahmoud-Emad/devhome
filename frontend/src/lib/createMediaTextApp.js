// Factory for "media in → text out" apps: the user provides input (audio,
// image, …), we run it through an on-device engine with live progress steps,
// then render the text. televoica uses this.
//
// The caller supplies:
//   createInput()                 -> { el, onChange(fn), getData() | null, stop?() }
//   run(data, cfg, { onProgress })-> string | { text }   (onProgress: engine progress)
//   plus copy: intro, note, actionLabel, processingHeading, resultLabel, …
//
// Everything else (id/name/accent/dialog/settings/order) is spread onto the
// returned descriptor.

import { createProgressBar } from '../components/progressBar.js';
import { createResultView } from '../components/resultView.js';
import { getAppConfig } from './appConfig.js';

const MODEL_HINT = 'The model downloads once and is cached — after that it runs offline.';

function leadText(text, className = 'placeholder-lead') {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

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
  } = config;

  return {
    ...config,

    render(body) {
      const root = document.createElement('div');
      root.className = 'app-flow';
      body.replaceChildren(root);

      const showInput = (error) => {
        const input = createInput();
        const action = document.createElement('button');
        action.className = 'button-primary';
        action.textContent = actionLabel;
        action.disabled = !input.getData();
        input.onChange?.(() => {
          action.disabled = !input.getData();
        });
        action.addEventListener('click', () => execute(input));

        const nodes = [leadText(intro), input.el, action];
        if (note) nodes.push(leadText(note, 'app-note'));
        if (error) {
          const box = document.createElement('p');
          box.className = 'app-error';
          box.textContent = error;
          nodes.push(box);
        }
        root.replaceChildren(...nodes);
      };

      const execute = async (input) => {
        input.stop?.();
        const cfg = getAppConfig(config);

        const heading = document.createElement('p');
        heading.className = 'progress-heading';
        heading.textContent = processingHeading;
        const bar = createProgressBar({ hint: MODEL_HINT });
        root.replaceChildren(heading, bar.el);

        try {
          const result = await run(input.getData(), cfg, { onProgress: (p) => bar.update(p) });
          const text = typeof result === 'string' ? result : pickText(result);
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
