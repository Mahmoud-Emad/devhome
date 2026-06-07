# CLAUDE.md

Project notes for AI assistants and maintainers. See `docs/architecture.md` for how
the app is built and `docs/releasing.md` for the release flow.

## Before the first public / commercial release

- [ ] **Self-host the Denoise model.** `frontend/src/lib/engines/denoise.js` fetches
      `denoiser_model.onnx` (~16 MB, DeepFilterNet3 via torchDF) from a **third-party**
      HuggingFace repo (`LEMAS-Project/LEMAS-Edit`). It works, but if that repo
      disappears, the Denoise app silently breaks. Move it to a copy **we control**
      that also sends CORS headers (so it works in `npm run dev` too):
      our own HuggingFace repo is the cleanest. Then update `MODEL_URL` in that file.
      (A copy already exists on our GitHub `models` release, but GitHub release
      downloads send **no** CORS headers, so they only work in the packed extension,
      not in dev.) Also confirm the DeepFilterNet model weights' license terms for
      redistribution (the code is MIT/Apache).

- [ ] **Chrome Web Store publishing (optional).** The release workflow has a guarded
      slot for a publish step; it needs four CWS secrets and the one-time $5 developer
      fee. Wire it up if/when we want a real store listing.

- [ ] **Bundled wallpapers** are Unsplash photos (`frontend/src/assets/images/`). The
      Unsplash License permits redistribution, but double-check before a commercial
      release, or swap for owned images.
