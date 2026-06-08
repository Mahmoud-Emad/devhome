// Reusable "undo" toast: a small floating bar with an Undo button that
// auto-dismisses after `duration` ms. Only one is shown at a time.
// Returns a function that closes the toast early.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function showUndoToast(message, { onUndo, duration = 5000 } = {}) {
  document.querySelector('.undo-toast')?.remove();

  const toast = el('div', 'undo-toast');
  const btn = el('button', 'undo-toast-btn', 'Undo');
  toast.append(el('span', 'undo-toast-msg', message), btn);
  document.body.append(toast);

  const close = () => {
    clearTimeout(timer);
    toast.remove();
  };
  const timer = setTimeout(close, duration);
  btn.addEventListener('click', () => {
    close();
    onUndo?.();
  });
  return close;
}
