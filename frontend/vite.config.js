import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Transformers.js imports `onnxruntime-web/webgpu`, whose `new URL(...wasm)` calls
// make Vite bundle the full ORT backend (the ~22 MB asyncify build) into assets/.
// We never use it — Whisper is pinned to the self-hosted plain build in /ort/ (see
// transcribe.js) — so strip the auto-bundled ORT wasm after the build.
function dropUnusedOrtWasm() {
  return {
    name: 'drop-unused-ort-wasm',
    apply: 'build',
    async closeBundle() {
      const dir = join('dist', 'assets');
      for (const f of await readdir(dir)) {
        if (/^ort-wasm.*\.wasm$/.test(f)) await rm(join(dir, f));
      }
    },
  };
}

// devhome is a Manifest V3 new-tab extension.
// Vite bundles the new-tab page (index.html) and its JS/CSS into dist/,
// and we copy the manifest + icons alongside so dist/ is loadable as-is.
export default defineConfig({
  plugins: [
    dropUnusedOrtWasm(),
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'public/icons', dest: '.' },
        // Self-host Tesseract's worker + WASM core so OCR works as an MV3
        // extension (which forbids loading the worker from a CDN). We ship only
        // the SIMD + LSTM core (self-contained, wasm embedded) — Chrome always
        // supports SIMD, so the other 17 core variants (~50 MB) aren't needed.
        { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'ocr' },
        { src: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', dest: 'ocr' },
        // Self-host the ONNX Runtime (Whisper) — CSP blocks the CDN. Only the
        // plain SIMD+threaded build; the .asyncify/.jsep/.jspi variants aren't
        // used (see transcribe.js wasmPaths).
        { src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', dest: 'ort' },
        { src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', dest: 'ort' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { newtab: 'index.html' },
    },
    // The big chunks are vendor libs that are already lazy-loaded on demand
    // (transformers.js for televoica, pdf.js + its worker for the reader), so
    // they never touch the initial load. Raise the advisory limit accordingly.
    chunkSizeWarningLimit: 2000,
  },
});
