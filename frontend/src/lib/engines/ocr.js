// In-browser OCR via Tesseract.js (WASM). Runs entirely on-device — the image
// never leaves the browser. The engine + language data download on first use and
// are cached by Tesseract.js, so later runs are fast and work offline.
//
// `onProgress` receives a normalized `{ phase, label, ratio }` where phase is
// 'download' (loading core/lang) or 'recognize'.

export async function recognizeText(file, { lang = 'eng', onProgress } = {}) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(lang, 1, {
    // Self-hosted worker + core (copied to /ocr) — MV3 forbids loading the
    // worker from a CDN. Root-relative paths resolve against the extension root.
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    // English data is bundled (/ocr/eng.traineddata.gz) so OCR works fully
    // offline with no download. Other languages fall back to the CDN.
    ...(lang === 'eng' ? { langPath: '/ocr' } : {}),
    logger: (m) => {
      const recognizing = (m.status || '').toLowerCase().includes('recogniz');
      onProgress?.({
        phase: recognizing ? 'recognize' : 'download',
        label: recognizing ? 'Recognizing text' : titleCase(m.status),
        ratio: typeof m.progress === 'number' ? m.progress : null,
      });
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return (data.text || '').trim();
  } finally {
    await worker.terminate();
  }
}

// Warm the OCR engine (compile WASM + load the bundled English data) so the
// first real recognition is instant. Used by onboarding.
export async function prefetchOcr(lang = 'eng', onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(lang, 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    ...(lang === 'eng' ? { langPath: '/ocr' } : {}),
    logger: (m) => onProgress?.({ phase: 'download', label: titleCase(m.status), ratio: typeof m.progress === 'number' ? m.progress : null }),
  });
  await worker.terminate();
}

function titleCase(status) {
  if (!status) return 'Loading';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
