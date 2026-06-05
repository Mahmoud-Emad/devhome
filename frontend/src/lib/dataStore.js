// Local data store — every app's records and uploaded blobs, kept on-device.
// Records live in one IndexedDB store partitioned by `collection`; files live in
// a `blobs` store and are exposed as object URLs; `kv` holds caches. App handlers
// (`*.local.js`) build on this.

import { idb } from './idb.js';

const RECORDS = 'records';
const BLOBS = 'blobs';
const KV = 'kv';

const pk = (collection, id) => `${collection}:${id}`;
const strip = ({ _pk, collection, ...rest }) => rest; // hide internal fields

// 8-char hex id.
function uid() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Cache object URLs so repeated `blobUrl(key)` calls return the same URL (and so
// we can revoke it on overwrite/delete).
const urlCache = new Map();

function dropUrl(key) {
  const url = urlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}

export const dataStore = {
  uid,

  async list(collection) {
    return (await idb.getAllByIndex(RECORDS, 'collection', collection)).map(strip);
  },

  async get(collection, id) {
    const row = await idb.get(RECORDS, pk(collection, id));
    return row ? strip(row) : null;
  },

  async put(collection, record) {
    const id = record.id || uid();
    const row = { ...record, id, collection, _pk: pk(collection, id) };
    await idb.put(RECORDS, row);
    return strip(row);
  },

  async patch(collection, id, patch) {
    const row = await idb.get(RECORDS, pk(collection, id));
    if (!row) return null;
    const next = { ...row, ...patch, id, collection, _pk: pk(collection, id) };
    await idb.put(RECORDS, next);
    return strip(next);
  },

  async remove(collection, id) {
    await idb.del(RECORDS, pk(collection, id));
  },

  // --- binary files ---
  async putBlob(key, blob) {
    await idb.put(BLOBS, blob, key);
    dropUrl(key);
  },

  async blobUrl(key) {
    if (urlCache.has(key)) return urlCache.get(key);
    const blob = await idb.get(BLOBS, key);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    return url;
  },

  async delBlob(key) {
    await idb.del(BLOBS, key);
    dropUrl(key);
  },

  // --- small key/value (caches) ---
  kv: {
    get: (key) => idb.get(KV, key),
    set: (key, value) => idb.put(KV, value, key),
    del: (key) => idb.del(KV, key),
  },

  // --- portability: the user owns (and can back up) their data ---
  async exportAll() {
    const records = await idb.getAll(RECORDS);
    const kv = {};
    for (const key of await idb.getAllKeys(KV)) kv[key] = await idb.get(KV, key);
    const blobs = {};
    for (const key of await idb.getAllKeys(BLOBS)) blobs[key] = await blobToDataUrl(await idb.get(BLOBS, key));
    return { format: 'devhome-data', version: 1, exportedAt: Date.now(), records, kv, blobs };
  },

  async importAll(data) {
    if (data?.format !== 'devhome-data') throw new Error('Not a devhome data file.');
    for (const record of data.records || []) await idb.put(RECORDS, record);
    for (const [key, value] of Object.entries(data.kv || {})) await idb.put(KV, value, key);
    for (const [key, dataUrl] of Object.entries(data.blobs || {})) {
      await idb.put(BLOBS, await (await fetch(dataUrl)).blob(), key);
    }
  },
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
