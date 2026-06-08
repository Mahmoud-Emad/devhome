// A draggable divider that resizes a sidebar pane by setting its inline width.
// Insert the returned element between the pane and the rest of a flex `layout`.
//   min      — minimum pane width (px)
//   reserve  — always keep at least this much width for the rest of the layout
//   enabled  — predicate; skip the drag when false (e.g. a narrow/overlay mode)
//   onResize — called with the new width (e.g. to persist it for the session)

import { el } from '../lib/dom.js';

export function createResizer({ layout, pane, min = 200, reserve = 320, enabled = () => true, onResize } = {}) {
  const resizer = el('div', 'pane-resizer');
  resizer.addEventListener('pointerdown', (e) => {
    if (!enabled()) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = pane.offsetWidth;
    resizer.setPointerCapture(e.pointerId);
    layout.classList.add('is-resizing');
    const move = (ev) => {
      const max = Math.max(min, layout.clientWidth - reserve);
      const w = Math.min(max, Math.max(min, startW + (ev.clientX - startX)));
      pane.style.width = `${w}px`;
      onResize?.(w);
    };
    const up = () => {
      resizer.releasePointerCapture(e.pointerId);
      layout.classList.remove('is-resizing');
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', up);
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', up);
  });
  return resizer;
}
