// Tiny DOM helpers shared across the whole app.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Empty a node (clearer than node.replaceChildren() at call sites).
export const clear = (node) => node.replaceChildren();
