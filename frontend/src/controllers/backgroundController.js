import { store } from '../models/store.js';
import { backgrounds, byId } from '../models/backgrounds.js';
import { renderBackgroundBar, renderCredit } from '../views/backgroundBar.js';
import { fileUrl, getApi, callApi, jsonApi } from '../lib/api.js';

const CUSTOM = 'custom:'; // prefix marking a user-uploaded wallpaper id
// Resolves a stored wallpaper to a local object URL.
const customUrl = (rawId) => fileUrl(`wallpapers/${rawId}/file`);

function preload(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = reject;
    img.src = url;
  });
}

export function createBackgroundController({ layerEl, barEl, creditEl }) {
  let current = null;
  let customList = []; // [{ id:'custom:xx', author, url, custom:true }]
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());

  // Bundled wallpapers the user has removed are hidden (the files stay in the
  // build; "Restore" just clears this list). Rotation + the gallery skip them.
  const hiddenIds = () => store.get('hiddenBgIds') || [];
  const visibleBundled = () => backgrounds.filter((b) => !hiddenIds().includes(b.id));

  // The rotation pool: the user's uploaded wallpapers plus the visible bundled
  // ones. `customList` is kept current by loadCustom() (called in init/upload/etc).
  const rotationPool = () => [...customList, ...visibleBundled()];

  function pickRandom(excludeId) {
    const pool = rotationPool();
    const choices = excludeId ? pool.filter((b) => b.id !== excludeId) : pool;
    const arr = choices.length ? choices : pool;
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }
  function pickNext(currentId) {
    const pool = rotationPool();
    if (!pool.length) return null;
    const i = pool.findIndex((b) => b.id === currentId);
    return pool[(i + 1) % pool.length];
  }
  // Bundled-only fallback for apply()'s error recovery (always-present images).
  function pickNextBundled(currentId) {
    const pool = visibleBundled();
    if (!pool.length) return null;
    const i = pool.findIndex((b) => b.id === currentId);
    return pool[(i + 1) % pool.length];
  }

  function clearBackground() {
    current = null;
    layerEl.classList.remove('is-loaded');
    layerEl.style.backgroundImage = '';
    renderCredit(creditEl, null);
    paintBar();
  }

  // Resolve a stored id (bundled or custom) into a wallpaper object.
  async function resolve(id) {
    if (!id) return null;
    if (id.startsWith(CUSTOM)) {
      return (
        customList.find((c) => c.id === id) || {
          id,
          author: 'Custom wallpaper',
          url: await customUrl(id.slice(CUSTOM.length)),
          custom: true,
        }
      );
    }
    return byId(id);
  }

  function paintBar() {
    renderBackgroundBar(barEl, {
      pinned: store.get('pinnedBgId') === current?.id,
      onShuffle: shuffle,
      onTogglePin: togglePin,
    });
  }

  // Try the chosen wallpaper; if it fails to load, walk to the next bundled one
  // so a single blocked/slow image never leaves the page on the bare gradient.
  async function apply(background) {
    let candidate = background;
    for (let tries = 0; candidate && tries < backgrounds.length + 1; tries++) {
      try {
        await preload(candidate.url);
        current = candidate;
        layerEl.style.backgroundImage = `url("${candidate.url}")`;
        layerEl.classList.add('is-loaded');
        renderCredit(creditEl, candidate);
        paintBar();
        await store.set({ lastBgId: candidate.id });
        return;
      } catch {
        candidate = pickNextBundled(candidate.id); // skip to a visible bundled one
      }
    }
  }

  async function shuffle() {
    const next = pickNext(current?.id);
    if (next) await apply(next);
    notify();
  }

  async function togglePin() {
    const pinned = store.get('pinnedBgId') === current?.id;
    await store.set({ pinnedBgId: pinned ? null : current?.id });
    paintBar();
    notify();
  }

  async function loadCustom() {
    try {
      const { wallpapers } = await getApi('wallpapers');
      customList = await Promise.all(
        (wallpapers || []).map(async (w) => ({
          id: CUSTOM + w.id,
          author: w.name,
          url: await customUrl(w.id),
          custom: true,
        })),
      );
    } catch {
      customList = [];
    }
    return customList;
  }

  async function init() {
    // Load custom wallpapers up front so they're part of the random rotation
    // (and so a custom pinned/last id resolves). If nothing is pinned, pick a
    // random one from the whole pool — uploads included.
    await loadCustom();
    const start = (await resolve(store.get('pinnedBgId'))) || pickRandom(store.get('lastBgId'));
    if (start) await apply(start);
  }

  // Wallpaper management surface used by the Settings gallery.
  const wallpaper = {
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    currentId: () => current?.id || null,
    pinnedId: () => store.get('pinnedBgId') || null,
    async list() {
      await loadCustom();
      const bundled = visibleBundled().map((b) => ({ id: b.id, author: b.author, url: b.url, custom: false }));
      return [...customList, ...bundled];
    },
    // How many bundled defaults are currently hidden (Settings shows "Restore").
    hiddenCount: () => hiddenIds().length,
    async restoreDefaults() {
      await store.set({ hiddenBgIds: [] });
      if (!current) {
        const next = pickRandom(null);
        if (next) await apply(next);
      }
      notify();
    },
    async setCurrent(id) {
      await apply(await resolve(id));
      notify();
    },
    async setPinned(id) {
      await store.set({ pinnedBgId: id });
      if (id) await apply(await resolve(id)); // favoriting also makes it the wallpaper
      paintBar();
      notify();
    },
    async upload(file) {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const w = await callApi('wallpapers', fd); // { id, name }
      await loadCustom();
      return CUSTOM + w.id;
    },
    async remove(id) {
      if (id.startsWith(CUSTOM)) {
        try {
          await jsonApi('DELETE', `wallpapers/${id.slice(CUSTOM.length)}`);
        } catch {
          /* ignore */
        }
        await loadCustom();
      } else {
        // Bundled default: hide it (restorable). The file stays in the build.
        const h = hiddenIds();
        if (!h.includes(id)) await store.set({ hiddenBgIds: [...h, id] });
      }
      if (store.get('pinnedBgId') === id) await store.set({ pinnedBgId: null });
      if (current?.id === id) {
        const next = pickRandom(null);
        if (next) await apply(next);
        else clearBackground();
      }
      notify();
    },
  };

  return { init, wallpaper };
}
