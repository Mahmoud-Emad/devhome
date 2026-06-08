// Reusable image input: upload, drag-and-drop, or paste an image, with a
// preview. Holds the current image and fires `change`. Mirrors audioInput.

import { createImagePanel } from './imagePanel.js';
import { UPLOAD } from './icons.js';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif'];

function isImageFile(file) {
  const type = file.type || '';
  if (type.startsWith('image/')) return true;
  if (type) return false;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

function formatSize(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export function createImageInput() {
  let blob = null;
  let filename = 'image.png';
  let objectUrl = null;

  const el = document.createElement('div');
  el.className = 'image-input';

  const dropzone = document.createElement('button');
  dropzone.type = 'button';
  dropzone.className = 'dropzone';
  dropzone.innerHTML = `
    ${UPLOAD}
    <span class="dropzone-title">Drop or paste an image, or click to browse</span>
    <span class="dropzone-hint">PNG, JPG, WEBP, GIF · ⌘/Ctrl+V to paste</span>`;

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;

  const error = document.createElement('p');
  error.className = 'app-error';
  error.hidden = true;

  const preview = document.createElement('div');
  preview.className = 'image-preview';
  preview.hidden = true;
  const frameSlot = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'image-preview-meta';
  const name = document.createElement('span');
  name.className = 'image-preview-name';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'link-button';
  remove.textContent = 'Remove';
  meta.append(name, remove);
  preview.append(frameSlot, meta);

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function setImage(newBlob, label) {
    error.hidden = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    blob = newBlob;
    filename = label;
    objectUrl = URL.createObjectURL(newBlob);
    frameSlot.replaceChildren(createImagePanel(objectUrl));
    name.textContent = newBlob.size ? `${label} · ${formatSize(newBlob.size)}` : label;
    dropzone.hidden = true;
    preview.hidden = false;
    el.dispatchEvent(new CustomEvent('change'));
  }

  function reset() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    blob = null;
    error.hidden = true;
    dropzone.hidden = false;
    preview.hidden = true;
    el.dispatchEvent(new CustomEvent('change'));
  }

  function handleFile(f) {
    if (isImageFile(f)) setImage(f, f.name || 'image.png');
    else showError('That doesn’t look like an image. Use PNG, JPG, WEBP or GIF.');
  }

  dropzone.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) handleFile(f);
    file.value = '';
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

  // Paste an image from the clipboard while this input is on screen.
  document.addEventListener('paste', (e) => {
    if (!document.body.contains(el)) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const f = item.getAsFile();
    if (f) setImage(f, f.name || 'pasted.png');
  });

  remove.addEventListener('click', reset);

  el.append(dropzone, file, error, preview);

  return {
    el,
    getData: () => (blob ? { blob, filename } : null),
    onChange: (fn) => el.addEventListener('change', fn),
    reset,
  };
}
