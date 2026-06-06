const SHUFFLE = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="16 3 21 3 21 8"></polyline>
    <line x1="4" y1="20" x2="21" y2="3"></line>
    <polyline points="21 16 21 21 16 21"></polyline>
    <line x1="15" y1="15" x2="21" y2="21"></line>
    <line x1="4" y1="4" x2="9" y2="9"></line>
  </svg>`;

const FULLSCREEN = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
    <path d="M16 3h3a2 2 0 0 1 2 2v3"></path>
    <path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>
    <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
  </svg>`;

const star = (filled) => `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? 'currentColor' : 'none'}"
    stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
    <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"></polygon>
  </svg>`;

function iconButton(svg, title, onClick, active = false) {
  const b = document.createElement('button');
  b.className = 'icon-button' + (active ? ' is-active' : '');
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = svg;
  b.addEventListener('click', onClick);
  return b;
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen?.();
  }
}

export function renderBackgroundBar(el, { pinned = false, onShuffle, onTogglePin } = {}) {
  el.replaceChildren(
    iconButton(SHUFFLE, 'Shuffle wallpaper', () => onShuffle?.()),
    iconButton(
      star(pinned),
      pinned ? 'Remove from favorites' : 'Favorite this wallpaper',
      () => onTogglePin?.(),
      pinned,
    ),
    iconButton(FULLSCREEN, 'Toggle full screen', toggleFullscreen),
  );
}

export function renderCredit(el, background) {
  el.textContent = background ? background.author : '';
}
