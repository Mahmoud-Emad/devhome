// Full-screen image viewer. Uses a native <dialog> (showModal) so it stacks
// above an already-open app dialog. Click outside or press Esc to close.

const CLOSE = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18"></path>
  </svg>`;

export function openLightbox(src) {
  const dlg = document.createElement('dialog');
  dlg.className = 'lightbox';

  const img = document.createElement('img');
  img.className = 'lightbox-img';
  img.src = src;
  img.alt = 'Full size image';

  const close = document.createElement('button');
  close.className = 'icon-button lightbox-close';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = CLOSE;

  dlg.append(img, close);
  document.body.append(dlg);

  function dismiss() {
    dlg.classList.remove('is-open');
    setTimeout(() => {
      dlg.close();
      dlg.remove();
    }, 180);
  }

  close.addEventListener('click', dismiss);
  dlg.addEventListener('click', (e) => {
    if (e.target !== img) dismiss();
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    dismiss();
  });

  dlg.showModal();
  requestAnimationFrame(() => dlg.classList.add('is-open'));
}
