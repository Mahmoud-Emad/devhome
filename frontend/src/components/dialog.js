// App window. Non-modal so several can be open at once; draggable by its header
// (clamped to the viewport); OS-style header controls: minimize (keeps state),
// maximize/restore, close. Clicking a window raises it above the others.
//
// Pass `appDialog: false` for utility surfaces like Settings / Release notes:
// they keep the minimize/maximize/close controls but are not draggable or
// resizable (centered, fixed size).

let zTop = 100;

const ICON = {
  min: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 12h12"></path></svg>',
  max: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4.5" y="4.5" width="15" height="15" rx="2"></rect></svg>',
  restore: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="7" width="12" height="12" rx="2"></rect><path d="M5 15V6a1 1 0 0 1 1-1h9"></path></svg>',
  close: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
};

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function control(cls, label, svg, onClick) {
  const b = document.createElement('button');
  b.className = `dialog-control ${cls}`;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = svg;
  b.addEventListener('click', onClick);
  return b;
}

export function createDialog({ title = '', size = 'md', accent, onClose, onMinimize, appDialog = true } = {}) {
  const el = document.createElement('div');
  el.className = `dialog dialog-${size}${appDialog ? '' : ' dialog-static'}`;
  if (accent) el.style.setProperty('--accent', accent);
  el.hidden = true;

  const header = document.createElement('header');
  header.className = 'dialog-header';
  const heading = document.createElement('h2');
  heading.className = 'dialog-title';
  heading.textContent = title;

  const controls = document.createElement('div');
  controls.className = 'dialog-controls';
  const minBtn = control('window-min', 'Minimize', ICON.min, () => minimize());
  const maxBtn = control('window-max', 'Maximize', ICON.max, () => toggleMax());
  const closeBtn = control('window-close', 'Close', ICON.close, () => close());
  controls.append(minBtn, maxBtn, closeBtn);
  header.append(heading, controls);

  const body = document.createElement('div');
  body.className = 'dialog-body';

  el.append(header, body);

  // Resize handles on all four edges and corners (app windows only).
  const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const handles = appDialog
    ? DIRS.map((dir) => {
        const h = document.createElement('div');
        h.className = `dialog-resize dialog-resize-${dir}`;
        h.dataset.dir = dir;
        h.setAttribute('aria-hidden', 'true');
        el.append(h);
        return h;
      })
    : [];

  document.body.append(el);

  const MIN_W = 350;
  const MIN_H = 400;
  let placed = false;
  let maxed = false;
  let sized = false;
  let moved = false;
  let prev = null;

  const raise = () => { el.style.zIndex = ++zTop; };

  function center() {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${Math.max(8, (window.innerWidth - w) / 2)}px`;
    el.style.top = `${Math.max(8, (window.innerHeight - h) / 2)}px`;
  }

  function open() {
    el.hidden = false;
    if (!placed) {
      center();
      placed = true;
    }
    raise();
    requestAnimationFrame(() => el.classList.add('is-open'));
  }

  function hide(after) {
    el.classList.remove('is-open');
    setTimeout(() => {
      el.hidden = true;
      after?.();
    }, 160);
  }

  function close() {
    if (maxed) toggleMax();
    // A fresh open should re-center; minimizing keeps the window where it is.
    placed = false;
    moved = false;
    hide(onClose);
  }

  function minimize() {
    hide(onMinimize);
  }

  function toggleMax() {
    maxed = !maxed;
    if (maxed) {
      prev = { left: el.style.left, top: el.style.top };
      el.classList.add('is-max');
    } else {
      el.classList.remove('is-max');
      if (prev) {
        el.style.left = prev.left;
        el.style.top = prev.top;
      }
    }
    maxBtn.innerHTML = maxed ? ICON.restore : ICON.max;
    maxBtn.title = maxed ? 'Restore' : 'Maximize';
  }

  el.addEventListener('pointerdown', raise);

  // Drag by the header (not when maximized or clicking a control). Utility
  // dialogs (appDialog: false) stay centered — no drag.
  if (appDialog) header.addEventListener('pointerdown', (e) => {
    if (maxed || e.target.closest('.dialog-controls')) return;
    const rect = el.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    header.setPointerCapture(e.pointerId);

    const move = (ev) => {
      moved = true;
      el.style.left = `${clamp(ev.clientX - offX, 0, window.innerWidth - el.offsetWidth)}px`;
      el.style.top = `${clamp(ev.clientY - offY, 0, window.innerHeight - el.offsetHeight)}px`;
    };
    const up = () => {
      header.releasePointerCapture(e.pointerId);
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', up);
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
  });

  // Resize from any edge/corner. The direction string says which sides move.
  function startResize(e) {
    if (maxed) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const dir = handle.dataset.dir;
    const r = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const right0 = r.left + r.width;
    const bottom0 = r.top + r.height;
    if (!sized) { sized = true; el.classList.add('is-sized'); }
    handle.setPointerCapture(e.pointerId);

    const move = (ev) => {
      let left = r.left;
      let top = r.top;
      let w = r.width;
      let h = r.height;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dir.includes('e')) w = clamp(r.width + dx, MIN_W, window.innerWidth - r.left - 8);
      if (dir.includes('s')) h = clamp(r.height + dy, MIN_H, window.innerHeight - r.top - 8);
      if (dir.includes('w')) { left = clamp(r.left + dx, 8, right0 - MIN_W); w = right0 - left; }
      if (dir.includes('n')) { top = clamp(r.top + dy, 8, bottom0 - MIN_H); h = bottom0 - top; }
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    };
    const up = () => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }
  handles.forEach((h) => h.addEventListener('pointerdown', startResize));

  function clampIntoView() {
    el.style.left = `${clamp(parseFloat(el.style.left) || 0, 0, window.innerWidth - el.offsetWidth)}px`;
    el.style.top = `${clamp(parseFloat(el.style.top) || 0, 0, window.innerHeight - el.offsetHeight)}px`;
  }

  // Keep a moved/resized window within the viewport when the browser resizes.
  window.addEventListener('resize', () => {
    if (el.hidden || maxed) return;
    if (sized) {
      el.style.width = `${Math.min(el.offsetWidth, window.innerWidth - 16)}px`;
      el.style.height = `${Math.min(el.offsetHeight, window.innerHeight - 16)}px`;
    }
    clampIntoView();
  });

  // When the window's own content changes its size (e.g. opening the PDF reader
  // makes the dialog taller), re-center it if the user hasn't positioned it
  // themselves — otherwise just keep it on-screen.
  const selfRO = new ResizeObserver(() => {
    if (el.hidden || maxed) return;
    if (placed && !moved && !sized) center();
    else clampIntoView();
  });
  selfRO.observe(el);

  return {
    el,
    body,
    open,
    close,
    minimize,
    setTitle: (t) => { heading.textContent = t; },
    isVisible: () => !el.hidden,
  };
}
