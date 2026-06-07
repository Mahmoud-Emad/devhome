import { apps } from '../apps/index.js';
import { installedApps, isInstalled } from '../models/installed.js';
import { createDialog } from '../components/dialog.js';
import { renderAppDock } from '../views/appDock.js';

export function createAppsController({ dockEl, onAfterClose }) {
  // One window per app, reused. Minimizing keeps its rendered state and the
  // dock "running" dot; closing resets both so the next open starts fresh.
  const windows = new Map();

  function openApp(app) {
    let entry = windows.get(app.id);
    if (!entry) {
      entry = { rendered: false };
      entry.win = createDialog({
        title: app.name,
        size: app.dialog?.size || 'md',
        accent: app.accent,
        onClose: () => {
          entry.rendered = false;
          dock.setOpen(app.id, false);
          onAfterClose?.();
        },
        onMinimize: () => onAfterClose?.(),
      });
      windows.set(app.id, entry);
    }
    if (!entry.rendered) {
      app.render(entry.win.body, { close: entry.win.close });
      entry.rendered = true;
    }
    entry.win.open();
    dock.setOpen(app.id, true);
  }

  // Dock click toggles: if the app's window is open on screen, close it;
  // otherwise open/restore it. (Programmatic openById/deep-links always open.)
  function toggleApp(app) {
    const entry = windows.get(app.id);
    if (entry && entry.win.isVisible()) {
      entry.win.close();
      return;
    }
    openApp(app);
  }

  // The dock shows only installed apps; re-rendered when the set changes.
  let dock = renderAppDock(dockEl, installedApps(), toggleApp);

  // Refresh each installed app's dock notification badge.
  async function refreshBadges() {
    await Promise.all(
      installedApps().map(async (app) => {
        if (!app.badge) return;
        try {
          dock.setBadge(app.id, await app.badge());
        } catch {
          dock.setBadge(app.id, 0);
        }
      }),
    );
  }

  // Re-render the dock after an install/uninstall, closing any open window whose
  // app was just removed.
  function refresh() {
    for (const [id, entry] of windows) {
      if (!isInstalled(id) && entry.win.isVisible()) entry.win.close();
    }
    dock = renderAppDock(dockEl, installedApps(), toggleApp);
    refreshBadges();
  }

  // Deep link: open an app directly with #app=<id> in the URL.
  const match = location.hash.match(/^#app=(.+)$/);
  if (match) {
    const app = apps.find((a) => a.id === match[1]);
    if (app) openApp(app);
  }

  return {
    openApp,
    openById: (id) => {
      const app = apps.find((a) => a.id === id);
      if (app) openApp(app);
    },
    refreshBadges,
    refresh,
  };
}
