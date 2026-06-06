import { createMediaTextApp } from '../../lib/createMediaTextApp.js';
import { createAudioInput } from '../../components/audioInput.js';

const MODELS = ['Xenova/whisper-tiny', 'Xenova/whisper-base'];
const DEFAULT_MODEL = 'Xenova/whisper-tiny';

export default createMediaTextApp({
  id: 'televoica',
  name: 'Voice to Text',
  description: 'Extract text from voice notes',
  accent: '#6c8cff',
  order: 1,
  dialog: { size: 'md' },

  intro: 'Upload or record a voice note and get the text back.',
  note:
    'Runs entirely in your browser — your audio never leaves your device. The ' +
    'model downloads once (~145 MB for Tiny) and is then cached for offline use; ' +
    'it only uses memory while transcribing. English is most accurate.',
  actionLabel: 'Extract text',
  processingHeading: 'Transcribing your voice note…',
  resultLabel: 'Transcript',
  emptyText: '(no speech detected)',
  downloadName: 'transcript.txt',

  // Rendered automatically in Settings → Apps.
  settings: [
    {
      key: 'model',
      label: 'Model',
      hint: 'Larger = more accurate, but a bigger download and more memory',
      type: 'select',
      default: DEFAULT_MODEL,
      options: [
        { value: 'Xenova/whisper-tiny', label: 'Tiny (fast, ~145 MB)' },
        { value: 'Xenova/whisper-base', label: 'Base (accurate, ~280 MB)' },
      ],
    },
    { key: 'language', label: 'Language', hint: 'Blank = auto-detect (e.g. en, ar)', type: 'text', default: '' },
  ],

  createInput() {
    const audio = createAudioInput();
    return {
      el: audio.el,
      onChange: audio.onChange,
      stop: audio.stop,
      getData: () => (audio.getBlob() ? { blob: audio.getBlob(), filename: audio.getFilename() } : null),
    };
  },

  run: async ({ blob }, cfg, { onProgress }) => {
    const { transcribeAudio } = await import('../../lib/engines/transcribe.js');
    // Guard against a stale stored model (e.g. an old "small" pick) triggering a
    // huge download — only the offered models are allowed.
    const model = MODELS.includes(cfg.model) ? cfg.model : DEFAULT_MODEL;
    return transcribeAudio(blob, { model, language: cfg.language || undefined, onProgress });
  },
});
