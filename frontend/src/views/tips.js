// Tips — a muted line under the app dock that rotates through a tip every 5s.

import { tips } from '../data/tips.js';

let timer = null;

export function stopDockTip() {
  clearInterval(timer);
  timer = null;
}

export function renderDockTip(el) {
  stopDockTip();
  if (!tips.length) {
    el.textContent = '';
    return;
  }
  let i = 0;
  const swap = () => {
    el.classList.add('is-fading');
    setTimeout(() => {
      el.textContent = tips[i % tips.length];
      i += 1;
      el.classList.remove('is-fading');
    }, 280);
  };
  el.textContent = tips[0];
  i = 1;
  timer = setInterval(swap, 5000);
}
