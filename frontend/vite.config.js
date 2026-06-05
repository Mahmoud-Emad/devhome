import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// devhome is a Manifest V3 new-tab extension.
// Vite bundles the new-tab page (index.html) and its JS/CSS into dist/,
// and we copy the manifest + icons alongside so dist/ is loadable as-is.
export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'public/icons', dest: '.' },
        // Self-host Tesseract's worker + WASM core so OCR works as an MV3
        // extension (which forbids loading the worker from a CDN).
        { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'ocr' },
        { src: 'node_modules/tesseract.js-core/tesseract-core*.{js,wasm}', dest: 'ocr' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { newtab: 'index.html' },
    },
  },
});
