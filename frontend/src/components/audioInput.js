// Reusable audio input: drag-and-drop / click to upload, or record from the mic
// with a live timer. Shows the chosen clip in a small player card. Any audio app
// can reuse this; it just holds the current clip and fires `change`.

const MIC = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3"></rect>
    <path d="M5 11a7 7 0 0 0 14 0"></path>
    <line x1="12" y1="18" x2="12" y2="22"></line>
  </svg>`;

const UPLOAD = `
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 16V4"></path><path d="M7 9l5-5 5 5"></path>
    <path d="M5 20h14"></path>
  </svg>`;

function formatSize(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const AUDIO_EXTS = ['mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac', 'flac', 'opus', 'weba'];

// True only for audio files. A .webm picked from disk is usually video, so we
// rely on the MIME type first and fall back to the extension.
function isAudioFile(file) {
  const type = file.type || '';
  if (type.startsWith('audio/')) return true;
  if (type.startsWith('video/')) return false;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return AUDIO_EXTS.includes(ext);
}

export function createAudioInput() {
  let blob = null;
  let filename = 'audio.webm';

  const el = document.createElement('div');
  el.className = 'audio-input';

  // Dropzone (click + drag/drop)
  const dropzone = document.createElement('button');
  dropzone.type = 'button';
  dropzone.className = 'dropzone';
  dropzone.innerHTML = `
    ${UPLOAD}
    <span class="dropzone-title">Drop a voice note here, or click to browse</span>
    <span class="dropzone-hint">MP3, OGG, WAV, M4A, AAC or FLAC</span>`;

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.mp3,.ogg,.oga,.wav,.m4a,.aac,.flac,.opus,.weba,audio/*';
  file.hidden = true;

  // Validation error line (e.g. a video file was picked).
  const error = document.createElement('p');
  error.className = 'app-error';
  error.hidden = true;

  // "or" divider
  const divider = document.createElement('div');
  divider.className = 'audio-or';
  divider.innerHTML = '<span>or</span>';

  // Record row
  const recordRow = document.createElement('div');
  recordRow.className = 'record-row';
  const recordBtn = document.createElement('button');
  recordBtn.type = 'button';
  recordBtn.className = 'button-secondary record-btn';
  recordBtn.innerHTML = `${MIC}<span>Record a voice note</span>`;
  const timer = document.createElement('span');
  timer.className = 'record-timer';
  timer.hidden = true;
  recordRow.append(recordBtn, timer);

  // Clip card (shown once a clip exists)
  const clip = document.createElement('div');
  clip.className = 'audio-clip';
  clip.hidden = true;
  const player = document.createElement('audio');
  player.controls = true;
  player.className = 'audio-player';
  const clipMeta = document.createElement('div');
  clipMeta.className = 'audio-clip-meta';
  const clipName = document.createElement('span');
  clipName.className = 'audio-clip-name';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'link-button';
  remove.textContent = 'Remove';
  clipMeta.append(clipName, remove);
  clip.append(player, clipMeta);

  function showInputMode() {
    dropzone.hidden = false;
    divider.hidden = false;
    recordRow.hidden = false;
    clip.hidden = true;
  }

  let objectUrl = null;

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function clearError() {
    error.hidden = true;
  }

  function handleFile(f) {
    if (isAudioFile(f)) {
      setClip(f, f.name);
    } else {
      showError('That looks like a video or unsupported file. Pick an audio file (MP3, OGG, WAV, M4A, AAC, FLAC).');
    }
  }

  function setClip(newBlob, name) {
    clearError();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    blob = newBlob;
    filename = name;
    objectUrl = URL.createObjectURL(newBlob);
    player.src = objectUrl;
    clipName.textContent = newBlob.size ? `${name} · ${formatSize(newBlob.size)}` : name;
    dropzone.hidden = true;
    divider.hidden = true;
    recordRow.hidden = true;
    clip.hidden = false;
    el.dispatchEvent(new CustomEvent('change'));
  }

  function reset() {
    // Stop any playback before clearing the clip.
    player.pause();
    player.removeAttribute('src');
    player.load();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    blob = null;
    clearError();
    showInputMode();
    el.dispatchEvent(new CustomEvent('change'));
  }

  // Upload
  dropzone.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) handleFile(f);
    file.value = ''; // allow re-picking the same file after an error
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-drag');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-drag'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-drag');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  // Record
  let recorder = null;
  let chunks = [];
  let startedAt = 0;
  let ticker = null;

  recordBtn.addEventListener('click', async () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(ticker);
        timer.hidden = true;
        recordBtn.classList.remove('is-recording');
        recordBtn.querySelector('span').textContent = 'Record a voice note';
        setClip(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), 'recording.webm');
      };
      recorder.start();
      startedAt = Date.now();
      timer.hidden = false;
      timer.textContent = '0:00';
      recordBtn.classList.add('is-recording');
      recordBtn.querySelector('span').textContent = 'Stop recording';
      ticker = setInterval(() => {
        timer.textContent = formatTime(Date.now() - startedAt);
      }, 250);
    } catch {
      timer.hidden = false;
      timer.textContent = 'Mic access denied';
    }
  });

  remove.addEventListener('click', reset);

  el.append(dropzone, file, error, divider, recordRow, clip);

  return {
    el,
    getBlob: () => blob,
    getFilename: () => filename,
    onChange: (fn) => el.addEventListener('change', fn),
    reset,
    stop: () => player.pause(),
  };
}
