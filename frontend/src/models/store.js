// Persistent key/value state. Backed by chrome.storage.local in the extension,
// and by localStorage when running under `vite dev`.

const NAMESPACE = 'devhome';

const DEFAULTS = {
  name: '',
  searchEngine: 'google',
  clock24h: true,
  bgBlur: 3,
  homeReadit: true,
  homeTasks: true,
  homeBook: true,
  homeWeather: false, // opt-in (the Tips card points users here)
  homeFocus: false, // opt-in
  homeTips: true,
  weatherUnit: 'celsius',
  weatherCoords: null, // { lat, lon } cached to avoid re-prompting
  weatherCache: null, // { data, at } last fetched weather
  focus: { duration: 1500, running: false, endsAt: null, remaining: 1500 },
  pinnedBgId: null,
  lastBgId: null,
  hiddenBgIds: [], // bundled wallpapers the user removed (restorable via Settings)
  onboarded: false, // first-run onboarding shows once, then prepares the AI models
  installedApps: null, // null → DEFAULT_APPS; otherwise the user's chosen app ids
  apps: {},
};

const useChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

let cache = { ...DEFAULTS };
const listeners = new Set();

async function load() {
  if (useChromeStorage) {
    const data = await chrome.storage.local.get(NAMESPACE);
    return data?.[NAMESPACE] ?? {};
  }
  try {
    return JSON.parse(localStorage.getItem(NAMESPACE)) ?? {};
  } catch {
    return {};
  }
}

async function save(state) {
  if (useChromeStorage) {
    await chrome.storage.local.set({ [NAMESPACE]: state });
  } else {
    localStorage.setItem(NAMESPACE, JSON.stringify(state));
  }
}

export const store = {
  async init() {
    cache = { ...DEFAULTS, ...(await load()) };
    return cache;
  },

  get(key) {
    return key === undefined ? { ...cache } : cache[key];
  },

  async set(patch) {
    cache = { ...cache, ...patch };
    await save(cache);
    listeners.forEach((fn) => fn(cache));
    return cache;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
