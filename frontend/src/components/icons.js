// Shared inline SVG icons (stroke-based, sized to match the UI) + a button helper.
// All use `currentColor`, so they take the surrounding text/icon color.

import { el } from '../lib/dom.js';

const svg = (size, body, sw = 1.7) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" ` +
  `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const TRASH = svg(
  15,
  '<path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>',
  1.6,
);
export const PLUS = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`;
export const BURGER = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>`;
export const DOWNLOAD = svg(
  15,
  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path>',
);
export const FOLDER = svg(
  15,
  '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  1.6,
);
export const PENCIL = svg(14, '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>');
export const INFO = svg(
  15,
  '<circle cx="12" cy="12" r="9"></circle><path d="M12 16v-5"></path><path d="M12 8h.01"></path>',
);
export const BOOK = svg(
  15,
  '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"></path><path d="M4 19a2 2 0 0 1 2-2h12"></path>',
  1.6,
);
export const BACK = svg(16, '<path d="M15 6l-6 6 6 6"></path>', 1.8);
export const OPEN = svg(
  14,
  '<path d="M15 3h6v6"></path><path d="M10 14L21 3"></path><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>',
);
export const COPY = svg(
  14,
  '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
);
export const MIC = svg(
  16,
  '<rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><line x1="12" y1="18" x2="12" y2="22"></line>',
  1.6,
);
export const UPLOAD = svg(
  22,
  '<path d="M12 16V4"></path><path d="M7 9l5-5 5 5"></path><path d="M5 20h14"></path>',
  1.5,
);

// Build an `.icon-button` with an SVG icon and (optional) title/handler.
export function iconButton(icon, { title, onClick, className = '' } = {}) {
  const btn = el('button', `icon-button ${className}`.trim());
  btn.type = 'button';
  btn.innerHTML = icon;
  if (title) {
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}
