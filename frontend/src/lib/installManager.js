// Global install/uninstall manager. Operations run in the background and survive
// the App Store dialog being closed — closing the store never cancels a download,
// and reopening it shows the live progress. Two event channels:
//   onProgress      — fires on every progress tick (the store updates its buttons)
//   onInstalledChange — fires only when the installed set actually changes
//                       (the dock + home refresh, so no flicker during a download)

import { appModel } from './appModels.js';
import { setInstalled } from '../models/installed.js';

const ops = new Map(); // appId -> { kind: 'install' | 'uninstall', ratio }
const errors = new Map(); // appId -> last error message
const progressListeners = new Set();
const changeListeners = new Set();

const notifyProgress = () => progressListeners.forEach((fn) => fn());
const notifyChange = () => changeListeners.forEach((fn) => fn());

export const onProgress = (fn) => (progressListeners.add(fn), () => progressListeners.delete(fn));
export const onInstalledChange = (fn) => (changeListeners.add(fn), () => changeListeners.delete(fn));

export const currentOp = (appId) => ops.get(appId) || null; // { kind, ratio } or null
export const isBusy = (appId) => ops.has(appId);
export const opError = (appId) => errors.get(appId) || null;

// Clear any lingering error messages (e.g. when the App Store is reopened).
export function clearInstallErrors() {
  if (!errors.size) return;
  errors.clear();
  notifyProgress();
}

function run(appId, kind, work) {
  if (ops.has(appId)) return; // already in flight
  errors.delete(appId);
  const op = { kind, ratio: null };
  ops.set(appId, op);
  notifyProgress();
  (async () => {
    let changed = false;
    try {
      await work(op);
      changed = true;
    } catch (e) {
      errors.set(appId, e?.message || String(e));
    } finally {
      ops.delete(appId);
      notifyProgress();
      if (changed) notifyChange();
    }
  })();
}

export function install(appId) {
  run(appId, 'install', async (op) => {
    const model = appModel(appId);
    if (model) await model.download((p) => ((op.ratio = p?.ratio ?? null), notifyProgress()));
    await setInstalled(appId, true);
  });
}

export function uninstall(appId) {
  run(appId, 'uninstall', async () => {
    await appModel(appId)?.remove?.();
    await setInstalled(appId, false);
  });
}
