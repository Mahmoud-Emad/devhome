// Eager-loads every `*.local.js` so its routes self-register before any API
// call. Drop a `<id>.local.js` next to an app (or in `src/local/`) and it's
// picked up automatically — same auto-discovery spirit as the dock apps.
import.meta.glob('/src/**/*.local.js', { eager: true });
