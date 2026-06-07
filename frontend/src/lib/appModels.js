// Per-app downloadable model: installing such an app fetches its model, and
// uninstalling frees it. Apps not listed here have no model — install/uninstall
// is instant (their assets are bundled, e.g. OCR, or they need nothing).

export const APP_MODELS = {
  televoica: {
    size: '~145 MB',
    download: async (onProgress) => {
      const { prefetchModel } = await import('./engines/transcribe.js');
      await prefetchModel('Xenova/whisper-tiny', onProgress);
    },
    remove: async () => {
      const { removeWhisperCache } = await import('./engines/transcribe.js');
      await removeWhisperCache();
    },
  },
  denoise: {
    size: '~16 MB',
    download: async (onProgress) => {
      const { prefetchDenoiseModel } = await import('./engines/denoise.js');
      await prefetchDenoiseModel(onProgress);
    },
    remove: async () => {
      const { removeDenoiseModel } = await import('./engines/denoise.js');
      await removeDenoiseModel();
    },
  },
};

export const appModel = (id) => APP_MODELS[id] || null;
