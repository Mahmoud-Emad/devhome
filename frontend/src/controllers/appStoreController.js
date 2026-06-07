import { createDialog } from '../components/dialog.js';
import { renderAppStore } from '../views/appStore.js';
import { clearInstallErrors } from '../lib/installManager.js';

export function createAppStoreController({ buttonEl }) {
  const dialog = createDialog({ title: 'App Store', size: 'lg', appDialog: false });
  dialog.el.classList.add('store-dialog');
  // Rendered once; the install manager keeps the rows live (installs continue in
  // the background while the dialog is closed).
  renderAppStore(dialog.body);

  const open = () => {
    clearInstallErrors(); // don't show stale errors from a previous session
    dialog.open();
  };
  buttonEl.addEventListener('click', open);
  if (location.hash === '#store') open(); // deep link
  return { open };
}
