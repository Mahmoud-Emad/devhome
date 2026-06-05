// An image with a hover "view full size" button that opens the lightbox.
// Reused in the snaptext input preview and during/after extraction.

import { openLightbox } from './lightbox.js';

const ZOOM = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path>
    <path d="M21 3l-8 8"></path><path d="M3 21l8-8"></path>
  </svg>`;

export function createImagePanel(src) {
  const frame = document.createElement('div');
  frame.className = 'image-frame';

  const img = document.createElement('img');
  img.className = 'image-frame-img';
  img.src = src;
  img.alt = 'Selected image';

  const zoom = document.createElement('button');
  zoom.type = 'button';
  zoom.className = 'icon-button image-zoom-btn';
  zoom.title = 'View full size';
  zoom.setAttribute('aria-label', 'View full size');
  zoom.innerHTML = ZOOM;
  zoom.addEventListener('click', () => openLightbox(src));

  frame.append(img, zoom);
  return frame;
}
