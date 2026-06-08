// A compact, theme-matching waveform audio player — play/pause, a clickable
// waveform that fills as it plays, and a time readout. Reusable anywhere we show
// audio (Voice to Text history, Denoise A/B). Returns { el, audio, destroy }.
//
// `src` is a URL string (e.g. an object URL); the caller owns its lifetime.

const PLAY = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>`;
const PAUSE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>`;

const BAR = 2; // bar width (css px)
const GAP = 1.5; // gap between bars

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

// Downsample one channel to `n` normalized peak amplitudes (0..1).
function peaksOf(channel, n) {
  const block = Math.floor(channel.length / n) || 1;
  const peaks = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    let p = 0;
    const start = i * block;
    for (let j = 0; j < block; j += 1) {
      const v = Math.abs(channel[start + j] || 0);
      if (v > p) p = v;
    }
    peaks[i] = p;
    if (p > max) max = p;
  }
  if (max > 0) for (let i = 0; i < n; i += 1) peaks[i] /= max;
  return peaks;
}

export function createAudioPlayer(src) {
  const audio = new Audio();
  audio.preload = 'metadata';

  const root = el('div', 'audio-player');
  const play = el('button', 'audio-play');
  play.type = 'button';
  play.innerHTML = PLAY;
  play.setAttribute('aria-label', 'Play');
  const canvas = el('canvas', 'audio-wave');
  const time = el('span', 'audio-time', '0:00');
  root.append(play, canvas, time);

  const ctx = canvas.getContext('2d');
  let channel = null; // decoded mono samples
  let peaks = null; // peaks at the current width
  let duration = 0;

  const accentColor = () => getComputedStyle(root).getPropertyValue('--accent').trim() || '#6c8cff';
  const renderTime = () => {
    time.textContent = `${fmt(audio.currentTime)} / ${fmt(duration)}`;
  };

  function draw() {
    const w = canvas.clientWidth || 240;
    const h = canvas.clientHeight || 44;
    ctx.clearRect(0, 0, w, h);
    if (!peaks) return;
    const mid = h / 2;
    const progress = duration ? audio.currentTime / duration : 0;
    const accent = accentColor();
    const idle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < peaks.length; i += 1) {
      const bh = Math.max(2, peaks[i] * (h - 2));
      ctx.fillStyle = i / peaks.length <= progress ? accent : idle;
      const x = i * (BAR + GAP);
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, mid - bh / 2, BAR, bh, 1);
        ctx.fill();
      } else {
        ctx.fillRect(x, mid - bh / 2, BAR, bh);
      }
    }
  }

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 240;
    const h = canvas.clientHeight || 44;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (channel) peaks = peaksOf(channel, Math.max(8, Math.floor(w / (BAR + GAP))));
    draw();
  }

  const ro = new ResizeObserver(layout);
  ro.observe(canvas);

  audio.addEventListener('timeupdate', () => {
    renderTime();
    draw();
  });
  audio.addEventListener('play', () => {
    play.innerHTML = PAUSE;
    play.setAttribute('aria-label', 'Pause');
  });
  audio.addEventListener('pause', () => {
    play.innerHTML = PLAY;
    play.setAttribute('aria-label', 'Play');
  });
  audio.addEventListener('ended', draw);
  // Fallback duration if decoding fails (native metadata).
  audio.addEventListener('loadedmetadata', () => {
    if (!duration && isFinite(audio.duration)) {
      duration = audio.duration;
      renderTime();
    }
  });

  play.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });

  const seekTo = (clientX) => {
    if (!duration) return;
    const rect = canvas.getBoundingClientRect();
    audio.currentTime = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
    renderTime();
    draw();
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    seekTo(e.clientX);
    const move = (ev) => seekTo(ev.clientX);
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });

  audio.src = src;
  renderTime();

  // Decode for the waveform + an accurate duration (independent of the <audio>'s
  // metadata, which is Infinity for MediaRecorder webm blobs).
  (async () => {
    try {
      const buf = await (await fetch(src)).arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const actx = new AC();
      const decoded = await actx.decodeAudioData(buf);
      actx.close();
      channel = decoded.getChannelData(0);
      duration = decoded.duration;
      renderTime();
      layout();
    } catch {
      /* no waveform — the play/pause + time still work */
    }
  })();

  const destroy = () => {
    ro.disconnect();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };

  return { el: root, audio, destroy };
}
