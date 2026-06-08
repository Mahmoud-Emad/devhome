// In-browser speech denoising via DeepFilterNet3 — exported by torchDF to a single
// end-to-end ONNX graph (PCM in → clean PCM out, all the STFT/ERB/deep-filter DSP
// baked in) and run on onnxruntime-web. Audio is decoded, processed frame-by-frame
// on-device, and re-encoded to WAV — nothing leaves the browser. The model
// downloads once (~16 MB) and is cached (Cache Storage) for offline use.
//
// Credits (both permissive): DeepFilterNet — https://github.com/Rikorose/DeepFilterNet
// (MIT/Apache-2.0); torchDF export — https://github.com/grazder/DeepFilterNet.
//
// `onProgress` receives the normalized `{ phase, label, ratio, loaded, total }`.

// Hosted on HuggingFace because it sends CORS headers, so the fetch works both in
// the packed extension and in `npm run dev` (a plain localhost page has no
// host_permissions to bypass CORS, and GitHub release downloads send no CORS).
const MODEL_URL = 'https://huggingface.co/LEMAS-Project/LEMAS-Edit/resolve/main/pretrained_models/denoiser_model.onnx';
const MODEL_CACHE = 'devhome-models';

// Model I/O contract (verified against the export): 48 kHz mono, 10 ms hops.
const SR = 48000;
const HOP = 480; // samples per frame
const STATE = 45304; // recurrent state vector carried frame-to-frame

// Fetch the model bytes, from Cache Storage if present, else download (with byte
// progress) and cache. Returns a Uint8Array.
async function fetchModelBytes(onProgress) {
  const cache = await caches.open(MODEL_CACHE);
  let res = await cache.match(MODEL_URL);
  if (res) {
    onProgress?.({ phase: 'download', label: 'Loading model', ratio: 1 });
    return new Uint8Array(await res.arrayBuffer());
  }
  const net = await fetch(MODEL_URL);
  if (!net.ok || !net.body) throw new Error(`Couldn't download the model (${net.status}).`);
  const total = Number(net.headers.get('content-length')) || 0;
  const reader = net.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({
      phase: 'download',
      label: 'Downloading model',
      loaded,
      total,
      ratio: total ? loaded / total : null,
    });
  }
  const blob = new Blob(chunks, { type: 'application/octet-stream' });
  await cache.put(MODEL_URL, new Response(blob));
  return new Uint8Array(await blob.arrayBuffer());
}

async function loadSession(onProgress) {
  const ort = await import('onnxruntime-web');
  // Run single-threaded — extension pages have no SharedArrayBuffer anyway.
  ort.env.wasm.numThreads = 1;
  if (import.meta.env.PROD) {
    // Self-host the wasm (the MV3 CSP blocks CDNs).
    ort.env.wasm.wasmPaths = {
      mjs: '/ort/ort-wasm-simd-threaded.mjs',
      wasm: '/ort/ort-wasm-simd-threaded.wasm',
    };
  } else {
    // Dev: onnxruntime-web has no working default wasm path under Vite — the
    // request falls back to index.html ("expected magic word …"). Load it from a
    // CDN, pinned to the installed version.
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/';
  }
  const bytes = await fetchModelBytes(onProgress);
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  return { ort, session };
}

// Decode any browser-supported audio to mono 48 kHz Float32 (the rate Whisper's
// cousin DeepFilterNet expects). The AudioContext resamples for us.
async function decodeMono48k(file) {
  const buffer = await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: SR });
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

// Minimal 16-bit PCM WAV encoder (mono).
function encodeWav(samples, sampleRate = SR) {
  const n = samples.length;
  const view = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (off, s) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits
  str(36, 'data');
  view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

// Download + cache the model without processing (for an optional warm-up).
export async function prefetchDenoiseModel(onProgress) {
  await fetchModelBytes(onProgress);
}

// Free the cached model (uninstall).
export async function removeDenoiseModel() {
  try {
    await (await caches.open(MODEL_CACHE)).delete(MODEL_URL);
  } catch {
    /* ignore */
  }
}

// Denoise an audio file; resolves to a WAV Blob of the cleaned audio.
export async function denoiseAudio(file, { onProgress } = {}) {
  const { ort, session } = await loadSession(onProgress);
  try {
    onProgress?.({ phase: 'run', label: 'Decoding audio', ratio: null });
    const pcm = await decodeMono48k(file);
    const n = pcm.length;
    const out = new Float32Array(n);

    let states = new ort.Tensor('float32', new Float32Array(STATE), [STATE]);
    const atten = new ort.Tensor('float32', new Float32Array([0]), [1]); // 0 = no attenuation limit
    const frames = Math.floor(n / HOP);

    for (let f = 0; f < frames; f += 1) {
      const off = f * HOP;
      const result = await session.run({
        input_frame: new ort.Tensor('float32', pcm.subarray(off, off + HOP), [HOP]),
        states,
        atten_lim_db: atten,
      });
      out.set(result.enhanced_audio_frame.data, off);
      states = result.new_states;
      if (f % 32 === 0) onProgress?.({ phase: 'run', label: 'Removing noise', ratio: f / frames });
    }
    // Copy any trailing partial frame through unchanged.
    if (frames * HOP < n) out.set(pcm.subarray(frames * HOP), frames * HOP);

    onProgress?.({ phase: 'run', label: 'Finishing', ratio: 1 });
    return encodeWav(out);
  } finally {
    // Free the session's memory; the cached model keeps the next run fast.
    await session.release?.();
  }
}
