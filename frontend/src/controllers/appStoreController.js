import { createDialog } from '../components/dialog.js';
import { renderAppStore } from '../views/appStore.js';

export function createAppStoreController({ buttonEl, onChange }) {
  const dialog = createDialog({ title: 'App Store', size: 'md', appDialog: false });
  dialog.el.classList.add('store-dialog');

  function open() {
    renderAppStore(dialog.body, { onChange });
    dialog.open();
  }

  buttonEl.addEventListener('click', open);
  if (location.hash === '#store') open(); // deep link
  return { open };
}
