// In-browser speech-to-text via Whisper (Transformers.js, ONNX/WASM). Runs
// entirely on-device — the audio never leaves the browser.
//
// Notes:
//  - We use full-precision (fp32) weights. The int8/q4 "quantized" exports of
//    these Whisper models ship broken quantization scales, which crash
//    onnxruntime ("Missing required scale … MatMulNBits"). fp32 has no scales to
//    be missing, so it's reliable everywhere.
//  - The model FILES are cached by Transformers.js (Cache Storage), so the
//    download happens only once. The in-memory session is the heavy part
//    (hundreds of MB), so we DISPOSE it after each transcription to free the
//    tab's memory when idle.
//
// `onProgress` receives a normalized `{ phase, label, ratio, loaded, total }`.

async function loadPipeline(model, onProgress) {
  const { pipeline } = await import('@huggingface/transformers');
  const files = new Map(); // per-file { loaded, total }, summed for overall progress
  const progressCallback = (p) => {
    if (!p?.file) return;
    if (p.status === 'progress' || p.status === 'done') {
      const prev = files.get(p.file) || { loaded: 0, total: 0 };
      files.set(p.file, {
        loaded: p.status === 'done' ? p.total || prev.total : p.loaded || 0,
        total: p.total || prev.total,
      });
    } else if ((p.status === 'initiate' || p.status === 'download') && !files.has(p.file)) {
      files.set(p.file, { loaded: 0, total: p.total || 0 });
    } else {
      return;
    }
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    onProgress?.({
      phase: 'download',
      label: 'Downloading model',
      loaded,
      total,
      ratio: total ? loaded / total : null,
    });
  };

  return pipeline('automatic-speech-recognition', model, {
    device: 'wasm',
    dtype: 'fp32',
    progress_callback: progressCallback,
  });
}

// Decode any browser-supported audio (webm/mp3/m4a/ogg/wav) to the mono 16 kHz
// Float32 samples Whisper expects.
async function decodeToMono16k(file) {
  const buffer = await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(buffer);
    if (decoded.numberOfChannels === 1) return decoded.getChannelData(0);
    const mono = new Float32Array(decoded.length);
    for (let ch = 0; ch < decoded.numberOfChannels; ch += 1) {
      const channel = decoded.getChannelData(ch);
      for (let i = 0; i < mono.length; i += 1) mono[i] += channel[i] / decoded.numberOfChannels;
    }
    return mono;
  } finally {
    ctx.close();
  }
}

// Download + cache the model without transcribing (used by onboarding so the
// first real use is instant). Disposes the session right after.
export async function prefetchModel(model = 'Xenova/whisper-tiny', onProgress) {
  const transcriber = await loadPipeline(model, onProgress);
  await transcriber.dispose?.();
}

export async function transcribeAudio(file, { model = 'Xenova/whisper-tiny', language, onProgress } = {}) {
  const transcriber = await loadPipeline(model, onProgress);
  try {
    onProgress?.({ phase: 'run', label: 'Decoding audio', ratio: null });
    const audio = await decodeToMono16k(file);
    onProgress?.({ phase: 'run', label: 'Transcribing', ratio: null });
    const options = { chunk_length_s: 30, stride_length_s: 5 };
    if (language) {
      options.language = language;
      options.task = 'transcribe';
    }
    const output = await transcriber(audio, options);
    return (output.text || '').trim();
  } finally {
    // Free the model from memory; the cached files make the next run fast.
    await transcriber.dispose?.();
  }
}
