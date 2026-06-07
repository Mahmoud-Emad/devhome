// Which apps are "installed" (shown in the dock + home). Everything is auto-
// discovered in apps/index.js; this just tracks the user's installed subset.
// The on-device tools (voice/image/audio) ship uninstalled so their models only
// download when the user actually wants them.

import { store } from './store.js';
import { apps } from '../apps/index.js';

// Installed out of the box. The rest (televoica, snaptext, denoise) are opt-in.
export const DEFAULT_APPS = ['todaytodo', 'doccoon', 'pdflib', 'calculator'];

// null in the store means "never chosen" → fall back to the defaults. An empty
// array is a real state (user uninstalled everything), so we keep them distinct.
export function installedIds() {
  return store.get('installedApps') || DEFAULT_APPS;
}

export function isInstalled(id) {
  return installedIds().includes(id);
}

// Installed app descriptors, in the canonical apps order.
export function installedApps() {
  const ids = installedIds();
  return apps.filter((a) => ids.includes(a.id));
}

export async function setInstalled(id, on) {
  const set = new Set(installedIds());
  if (on) set.add(id);
  else set.delete(id);
  // Persist in the stable apps order so the dock layout is deterministic.
  await store.set({ installedApps: apps.map((a) => a.id).filter((x) => set.has(x)) });
}
