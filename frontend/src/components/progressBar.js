// A labelled progress bar for on-device work. It understands the normalized
// engine progress shape `{ phase, label, ratio, loaded, total }`: a `download`
// phase with byte counts shows "Downloading model — 23.4 / 80.1 MB (29%)" and
// reveals the "one-time / offline" hint; anything else shows the label.

import { el } from '../lib/dom.js';
const mb = (bytes) => `${((bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;
const pct = (ratio) => `${Math.round((ratio || 0) * 100)}%`;

export function createProgressBar({ hint } = {}) {
  const wrap = el('div', 'dl-progress');
  const label = el('p', 'dl-progress-label', 'Preparing…');
  const track = el('div', 'dl-progress-track');
  const fill = el('div', 'dl-progress-fill is-indeterminate');
  track.append(fill);
  const note = el('p', 'dl-progress-note', hint || '');
  note.hidden = true;
  wrap.append(label, track, note);

  const setRatio = (ratio) => {
    if (ratio == null) {
      fill.classList.add('is-indeterminate');
      fill.style.width = '';
    } else {
      fill.classList.remove('is-indeterminate');
      fill.style.width = pct(ratio);
    }
  };

  return {
    el: wrap,
    update(p = {}) {
      const downloading = p.phase === 'download';
      if (downloading && p.total) {
        label.textContent = `Downloading model — ${mb(p.loaded)} / ${mb(p.total)} (${pct(p.ratio)})`;
      } else if (downloading) {
        label.textContent =
          p.ratio != null ? `${p.label || 'Downloading model'} (${pct(p.ratio)})` : p.label || 'Downloading model';
      } else {
        label.textContent = p.ratio != null ? `${p.label || 'Working…'} (${pct(p.ratio)})` : p.label || 'Working…';
      }
      note.hidden = !(hint && downloading);
      setRatio(p.ratio);
    },
  };
}
