// A compact, theme-matching audio player (play/pause, seek bar, time) used in
// place of the unstylable native `<audio controls>`. Returns { el, audio, destroy }.

const PLAY = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>`;
const PAUSE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export function createAudioPlayer(src) {
  const audio = new Audio();
  audio.preload = 'metadata';

  const root = el('div', 'audio-player');
  const play = el('button', 'audio-play');
  play.type = 'button';
  play.innerHTML = PLAY;
  play.setAttribute('aria-label', 'Play');
  const track = el('div', 'audio-track');
  const fill = el('div', 'audio-fill');
  track.append(fill);
  const time = el('span', 'audio-time', '0:00 / 0:00');
  root.append(play, track, time);

  let duration = 0;
  const renderTime = () => {
    time.textContent = `${fmt(audio.currentTime)} / ${fmt(duration)}`;
  };
  const renderFill = () => {
    fill.style.width = `${duration ? Math.min(100, (audio.currentTime / duration) * 100) : 0}%`;
  };
  const setDuration = (d) => {
    duration = isFinite(d) && d > 0 ? d : 0;
    renderTime();
    renderFill();
  };

  audio.addEventListener('loadedmetadata', () => {
    if (!isFinite(audio.duration) || audio.duration === 0) {
      // MediaRecorder webm blobs report Infinity until forced to seek to the end.
      const onSeek = () => {
        audio.removeEventListener('timeupdate', onSeek);
        audio.currentTime = 0;
        setDuration(audio.duration);
      };
      audio.addEventListener('timeupdate', onSeek);
      audio.currentTime = 1e101;
    } else {
      setDuration(audio.duration);
    }
  });
  audio.addEventListener('timeupdate', () => {
    renderFill();
    renderTime();
  });
  audio.addEventListener('play', () => {
    play.innerHTML = PAUSE;
    play.setAttribute('aria-label', 'Pause');
  });
  audio.addEventListener('pause', () => {
    play.innerHTML = PLAY;
    play.setAttribute('aria-label', 'Play');
  });

  play.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });

  const seekTo = (clientX) => {
    if (!duration) return;
    const rect = track.getBoundingClientRect();
    audio.currentTime = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
    renderFill();
    renderTime();
  };
  track.addEventListener('pointerdown', (e) => {
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

  const destroy = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };

  return { el: root, audio, destroy };
}
