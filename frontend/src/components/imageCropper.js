// A lightweight image cropper (no deps). Opens a modal where the user pans and
// zooms an image inside a fixed-aspect frame, then returns the cropped region
// as a Blob. Used to frame custom wallpapers to the screen before uploading.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function openImageCropper(file, { aspect = 16 / 9, title = 'Adjust wallpaper', maxWidth = 2560 } = {}) {
  return new Promise((resolve) => {
    const overlay = el('div', 'cropper-overlay');
    const panel = el('div', 'cropper-panel');
    panel.append(el('div', 'cropper-head', title));

    const stage = el('div', 'cropper-stage');
    stage.style.aspectRatio = String(aspect);
    const img = new Image();
    img.className = 'cropper-img';
    img.draggable = false;
    stage.append(img);
    panel.append(stage);

    const controls = el('div', 'cropper-controls');
    const zoom = document.createElement('input');
    zoom.type = 'range';
    zoom.className = 'cropper-zoom';
    zoom.min = '1';
    zoom.max = '4';
    zoom.step = '0.01';
    zoom.value = '1';
    controls.append(el('span', 'cropper-zoom-label', 'Zoom'), zoom);
    panel.append(controls);

    const actions = el('div', 'cropper-actions');
    const cancel = el('button', 'button-secondary', 'Cancel');
    const ok = el('button', 'button-primary', 'Set wallpaper');
    actions.append(cancel, ok);
    panel.append(actions);

    overlay.append(panel);
    document.body.append(overlay);

    let Nw = 0;
    let Nh = 0;
    let baseScale = 1; // "cover" scale (minimum zoom)
    let scale = 1;
    let tx = 0;
    let ty = 0;
    const frame = () => stage.getBoundingClientRect();

    function clamp() {
      const Fw = stage.clientWidth;
      const Fh = stage.clientHeight;
      tx = Math.min(0, Math.max(Fw - Nw * scale, tx));
      ty = Math.min(0, Math.max(Fh - Nh * scale, ty));
    }
    function render() {
      clamp();
      img.style.width = `${Nw * scale}px`;
      img.style.height = `${Nh * scale}px`;
      img.style.transform = `translate(${tx}px, ${ty}px)`;
    }

    function setZoom(nextScale, cx, cy) {
      const Fw = stage.clientWidth;
      const Fh = stage.clientHeight;
      const px = cx ?? Fw / 2;
      const py = cy ?? Fh / 2;
      const next = Math.max(baseScale, nextScale);
      tx = px - (px - tx) * (next / scale);
      ty = py - (py - ty) * (next / scale);
      scale = next;
      zoom.value = String(scale / baseScale);
      render();
    }

    const url = URL.createObjectURL(file);
    img.onload = () => {
      Nw = img.naturalWidth;
      Nh = img.naturalHeight;
      const Fw = stage.clientWidth;
      const Fh = stage.clientHeight;
      baseScale = Math.max(Fw / Nw, Fh / Nh);
      scale = baseScale;
      tx = (Fw - Nw * scale) / 2;
      ty = (Fh - Nh * scale) / 2;
      render();
    };
    img.onerror = () => finish(null);
    img.src = url;

    zoom.addEventListener('input', () => setZoom(baseScale * Number(zoom.value)));
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = frame();
        setZoom(scale * (e.deltaY < 0 ? 1.08 : 0.926), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );

    // Pan with pointer drag.
    stage.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const ox = tx;
      const oy = ty;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-grabbing');
      const move = (ev) => {
        tx = ox + (ev.clientX - startX);
        ty = oy + (ev.clientY - startY);
        render();
      };
      const up = () => {
        stage.classList.remove('is-grabbing');
        stage.releasePointerCapture(e.pointerId);
        stage.removeEventListener('pointermove', move);
        stage.removeEventListener('pointerup', up);
      };
      stage.addEventListener('pointermove', move);
      stage.addEventListener('pointerup', up);
    });

    function finish(result) {
      URL.revokeObjectURL(url);
      overlay.remove();
      resolve(result);
    }

    cancel.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });
    ok.addEventListener('click', () => {
      const Fw = stage.clientWidth;
      const Fh = stage.clientHeight;
      const cropW = Fw / scale;
      const cropH = Fh / scale;
      const cropX = -tx / scale;
      const cropY = -ty / scale;
      const outW = Math.min(maxWidth, Math.round(cropW));
      const outH = Math.round(outW * (cropH / cropW));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      canvas.getContext('2d').drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
      canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.92);
    });
  });
}
