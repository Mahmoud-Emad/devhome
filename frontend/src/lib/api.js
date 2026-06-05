// App data access — everything is local now (no backend). Apps call
// `getApi`/`jsonApi`/`callApi`/`fileUrl`; these dispatch to client-side handlers
// (IndexedDB, registered by `*.local.js`). The compute apps (televoica/snaptext)
// run their models in the browser and don't go through this layer.

import { hasRoute, dispatch } from './localRouter.js';
import './localRoutes.js'; // eager-registers all *.local.js handlers

function request(method, endpoint, opts = {}) {
  if (!hasRoute(method, endpoint)) throw new Error(`No handler for ${method} ${endpoint}`);
  return dispatch(method, endpoint, opts);
}

export const getApi = (endpoint) => request('GET', endpoint);
export const jsonApi = (method, endpoint, body) => request(method, endpoint, { body });
export const callApi = (endpoint, formData) => request('POST', endpoint, { form: formData });

// Resolve a file endpoint to an object URL from local storage.
export function fileUrl(endpoint) {
  if (!hasRoute('FILE', endpoint)) throw new Error(`No file handler for ${endpoint}`);
  return dispatch('FILE', endpoint);
}
