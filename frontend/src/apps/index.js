// Auto-discovers every app: drop a folder `apps/<id>/index.js` whose default
// export is an app descriptor and it shows up in the dock. Optional `order`
// controls position (lower first; default 100), then name as a tiebreaker.

const modules = import.meta.glob('./*/index.js', { eager: true });

export const apps = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name));
