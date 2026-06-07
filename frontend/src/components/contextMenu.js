// Reusable context menu, opened at a given screen position (e.g. a right-click).
// items: [{ label, icon?, danger?, onClick }] or { separator: true }.
// Closes on outside-click, Escape, scroll/resize, or selecting an item.

let close = null; // closes the currently-open menu, if any

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function closeContextMenu() {
  if (close) close();
}

export function openContextMenu(x, y, items) {
  closeContextMenu();

  const menu = el('div', 'context-menu');
  for (const item of items) {
    if (item.separator) {
      menu.append(el('div', 'context-sep'));
      continue;
    }
    const btn = el('button', `context-item${item.danger ? ' is-danger' : ''}`);
    if (item.icon) {
      const ic = el('span', 'context-icon');
      ic.innerHTML = item.icon;
      btn.append(ic);
    }
    btn.append(el('span', 'context-label', item.label));
    btn.addEventListener('click', () => {
      dismiss();
      item.onClick?.();
    });
    menu.append(btn);
  }

  // Place off-screen first to measure, then clamp into the viewport.
  menu.style.visibility = 'hidden';
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  menu.style.visibility = '';

  const onDown = (e) => {
    if (!menu.contains(e.target)) dismiss();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') dismiss();
  };
  function dismiss() {
    menu.remove();
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', dismiss);
    window.removeEventListener('resize', dismiss);
    if (close === dismiss) close = null;
  }
  close = dismiss;

  // Defer the dismiss listeners so the opening click doesn't instantly close it.
  setTimeout(() => {
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
  }, 0);
}
