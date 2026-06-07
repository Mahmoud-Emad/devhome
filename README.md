# devhome

A developer's home page — a Chrome **new-tab (Manifest V3) extension** that turns
every new tab into a dashboard of daily tools over a rotating 4K wallpaper.

**100% local. No backend, no account, no servers.** Everything lives in your
browser; the AI tools (voice→text, image→text) run on-device with WebAssembly, so
your data never leaves your machine.

## Quick start

```bash
make install     # or: cd frontend && npm install
make dev         # Vite dev server (http://localhost:5173)
make build       # build → frontend/dist
make lint        # ESLint
```

Install the extension: `chrome://extensions` → enable **Developer mode** →
**Load unpacked** → select `frontend/dist`.

Cutting a release? See [`docs/releasing.md`](docs/releasing.md).

## Apps

Each opens in a draggable/resizable window from a macOS-style dock.

| App | What it does | Tech |
| --- | --- | --- |
| **Voice to Text** | Transcribe a recorded/uploaded voice note | Whisper in-browser (WASM) |
| **Image to Text** | OCR an image | Tesseract.js (WASM) |
| **Denoise** | Remove background noise from audio | DeepFilterNet3 (ONNX/WASM) |
| **Books & Notes** | Notion-style Markdown notes, live preview | — |
| **TodayTodo** | A fresh to-do list per day | — |
| **PDF Library** | Read/annotate PDFs: search, zoom, highlights, comments | PDF.js |
| **Calculator** | Four-function calculator, keyboard-driven | — |

**Home dashboard** — pinnable cards (toggle in *Settings → Preferences*): trending
article, today's tasks, continue reading, weather, focus timer, tips.
**Wallpapers** — gallery in *Settings → Wallpaper*: pick, favorite (★), or upload.

## Your data

Notes, todos, books + PDFs, highlights and wallpapers are stored in **IndexedDB** —
nothing is uploaded. *Settings → Data* has **Export / Import** for a portable
backup. The only network calls are the trending-article/weather feeds, importing a
PDF by URL, and the one-time (then cached, offline) download of the OCR/speech
models.

## Adding an app

Drop a folder `frontend/src/apps/<id>/index.js` that default-exports a descriptor —
it's auto-discovered (no registry to edit):

```js
export default {
  id: 'myapp', name: 'My App', description: '…',
  accent: '#38bdf8', order: 7, dialog: { size: 'md' },
  render(body) { /* build your UI into `body` */ },
  // optional: badge() → dock count, widget(ctx) → home card, settings: [...]
};
```

Need storage? Apps call `getApi`/`jsonApi`/`callApi`/`fileUrl` (`src/lib/api.js`),
which dispatch to client-side handlers in a sibling `<id>.local.js` (built on
`src/lib/dataStore.js`, an IndexedDB wrapper). See [`docs/architecture.md`](docs/architecture.md).

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). `main` is protected, so
changes go through pull requests with CI green.

## License

[MIT](LICENSE) © Mahmoud Emad
