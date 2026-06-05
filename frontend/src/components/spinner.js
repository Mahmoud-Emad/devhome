// Reusable loading spinner, styled to match the app surfaces.

export function createSpinner(label = 'Working…') {
  const wrap = document.createElement('div');
  wrap.className = 'spinner-wrap';

  const ring = document.createElement('span');
  ring.className = 'spinner';
  ring.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'spinner-label';
  text.textContent = label;

  wrap.append(ring, text);
  return wrap;
}
