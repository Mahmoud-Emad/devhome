import { store } from '../models/store.js';
import { backgrounds, byId, randomBackground, nextBackground } from '../models/backgrounds.js';
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
        candidate = nextBackground(candidate.id); // always a bundled fallback
      }
    }
  }

  async function shuffle() {
    await apply(nextBackground(current?.id));
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
    // A pinned id may point at a wallpaper that no longer exists — fall back to
    // a random bundled one. Custom ids need their blob/file URL resolved first.
    if (store.get('pinnedBgId')?.startsWith(CUSTOM)) await loadCustom();
    await apply((await resolve(store.get('pinnedBgId'))) || randomBackground(store.get('lastBgId')));
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
      const bundled = backgrounds.map((b) => ({ id: b.id, author: b.author, url: b.url, custom: false }));
      return [...customList, ...bundled];
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
      if (!id.startsWith(CUSTOM)) return;
      try {
        await jsonApi('DELETE', `wallpapers/${id.slice(CUSTOM.length)}`);
      } catch {
        /* ignore */
      }
      if (store.get('pinnedBgId') === id) await store.set({ pinnedBgId: null });
      await loadCustom();
      if (current?.id === id) await apply(randomBackground(null));
      notify();
    },
  };

  return { init, wallpaper };
}
