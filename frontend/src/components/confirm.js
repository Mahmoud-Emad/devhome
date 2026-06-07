// Reusable confirmation dialog. Resolves true (confirmed) or false (cancelled).
// Enter confirms, Escape / backdrop-click cancels.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function confirmDialog(message, { confirmLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = el('div', 'confirm-overlay');
    const card = el('div', 'confirm-card');
    const actions = el('div', 'confirm-actions');
    const cancel = el('button', 'button-secondary', 'Cancel');
    const ok = el('button', `button-primary${danger ? ' is-danger' : ''}`, confirmLabel);
    actions.append(cancel, ok);
    card.append(el('p', 'confirm-message', message), actions);
    overlay.append(card);
    document.body.append(overlay);

    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    const close = (val) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(val);
    };
    document.addEventListener('keydown', onKey);
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    requestAnimationFrame(() => ok.focus());
  });
}
