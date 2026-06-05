# Architecture

devhome is a **fully local** Chrome MV3 new-tab extension. There is no backend,
no account, and no server — everything you create lives in your browser and never
leaves the device. This doc describes how that works.

## Data layer

All persistence goes through a small client-side stack:

| Module | Role |
| --- | --- |
| `lib/idb.js` | Zero-dependency IndexedDB wrapper. One DB (`devhome`) with stores `records`, `blobs`, `kv`. |
| `lib/dataStore.js` | CRUD over `records` (partitioned by `collection`), blob storage exposed as object URLs, and a `kv` cache. Also `exportAll`/`importAll` for backup. |
| `lib/localRouter.js` | A tiny REST-style router. Handlers `register(method, pattern, fn)` and receive `{ params, query, body, form }`. The pseudo-method `FILE` returns an object URL. |
| `lib/api.js` | What apps call: `getApi`/`jsonApi`/`callApi`/`fileUrl`. Dispatches straight to the local router. |

App handlers live next to their app as `*.local.js` and are auto-discovered by
`lib/localRoutes.js` (`import.meta.glob('/src/**/*.local.js')`). To add an app's
data layer, register routes in a `*.local.js` file — no wiring needed.

```
apps/pdflib/index.js   →  getApi('books')  →  localRouter.dispatch  →  apps/pdflib/pdflib.local.js
```

## On-device compute (televoica / snaptext)

The two compute apps run their models **in the browser** so audio and images
never leave the device:

- **snaptext** — OCR via Tesseract.js (`lib/engines/ocr.js`). Worker + core are
  self-hosted under `/ocr` (MV3 bans remote worker scripts); English data is
  bundled.
- **televoica** — speech-to-text via `@huggingface/transformers` Whisper
  (`lib/engines/transcribe.js`), `device: 'wasm'`, `dtype: 'fp32'`. The pipeline
  is disposed after each run to free memory; model **files** stay cached.

Model files are fetched once and cached. The onboarding overlay
(`views/onboarding.js`) pre-downloads them on first visit with a progress bar.

## Backup / portability

`dataStore.exportAll()` serialises every record and blob (blobs as data URLs)
into one JSON file; `importAll()` restores it. This is how a user moves their
data between machines — they own the file.

## Manifest notes

- `permissions`: `storage`, `geolocation`, `unlimitedStorage`.
- `host_permissions`: `https://*/*` — lets import-by-URL and key-free feeds
  (Open-Meteo, DEV/HN/Lobsters) be fetched directly, bypassing CORS.
- CSP allows `'wasm-unsafe-eval'` (for the WASM engines) and `worker-src 'self' blob:`.
