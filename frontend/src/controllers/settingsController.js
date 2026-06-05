import { store } from '../models/store.js';
import { createDialog } from '../components/dialog.js';
import { renderSettings } from '../views/settings.js';

export function createSettingsController({ buttonEl, onApply, wallpaper }) {
  const dialog = createDialog({ title: 'Settings', size: 'md', appDialog: false });
  // A touch wider than `md` so all the settings tabs fit on one row.
  dialog.el.classList.add('settings-dialog');

  function open(initialTab) {
    renderSettings(dialog.body, {
      state: store.get(),
      initialTab,
      wallpaper,
      onChange: async (patch) => {
        await store.set(patch);
        onApply?.(patch);
      },
    });
    dialog.open();
  }

  buttonEl.addEventListener('click', () => open());
  // Deep link: #settings or #settings=<tab> (e.g. #settings=apps).
  const match = location.hash.match(/^#settings(?:=(.+))?$/);
  if (match) open(match[1]);

  return { open };
}
