// Per-app configuration, persisted in the store under `apps[appId]`. Each app
// declares a `settings` schema; defaults come from it, overrides from the user.

import { store } from '../models/store.js';

function appDefaults(app) {
  const defaults = {};
  for (const field of app.settings || []) defaults[field.key] = field.default;
  return defaults;
}

export function getAppConfig(app) {
  const stored = (store.get('apps') || {})[app.id] || {};
  return { ...appDefaults(app), ...stored };
}

export async function setAppConfig(appId, key, value) {
  const all = { ...(store.get('apps') || {}) };
  all[appId] = { ...(all[appId] || {}), [key]: value };
  await store.set({ apps: all });
}
