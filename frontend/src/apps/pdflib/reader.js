// In-app PDF reader (PDF.js), loaded lazily. A continuous, Chrome-like viewer:
// every page is stacked in one scroll and rendered on demand as it nears the
// viewport (and unloaded when far away, to bound memory). Pages render at their
// natural size (never upscaled past 100%); zoom is the reader's, via the − / +
// controls. Features: smooth scrolling, a live page indicator, manual zoom,
// remember-last-page, and in-document search with highlight.

import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer, setLayerDimensions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fileUrl, getApi, jsonApi } from '../../lib/api.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const ICON = {
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>',
  prev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>',
  next: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg>',
  zoomOut:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 12h12"></path></svg>',
  zoomIn:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 6v12M6 12h12"></path></svg>',
  note: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  trash:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>',
  list: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"></path><path d="M3 6h.01M3 12h.01M3 18h.01"></path></svg>',
};

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;

// Highlight colours offered in the selection popup.
const COLORS = ['yellow', 'green', 'blue', 'pink'];

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// PDFs split text into many positioned chunks with inconsistent spacing, so we
// match ignoring whitespace — that way a word or phrase is found (and fully
// highlighted) even when it's broken across chunks.
const stripWs = (s) => s.replace(/\s+/g, '');

export function createReader({ container, book, onBack }) {
  const root = el('div', 'pdf-reader');

  const bar = el('div', 'pdf-reader-bar');
  const back = el('button', 'icon-button', ICON.back);
  back.title = 'Back to list';
  back.addEventListener('click', onBack);
  const title = el('span', 'pdf-reader-title');
  title.textContent = book.title;

  const search = el('input', 'input pdf-search');
  search.type = 'search';
  search.placeholder = 'Search in book…';
  const matchLabel = el('span', 'pdf-match');
  const searchPrev = el('button', 'icon-button pdf-nav-btn', ICON.prev);
  searchPrev.title = 'Previous match';
  const searchNext = el('button', 'icon-button pdf-nav-btn', ICON.next);
  searchNext.title = 'Next match';
  const searchGroup = el('div', 'pdf-search-group');
  searchGroup.append(search, matchLabel, searchPrev, searchNext);

  // Zoom controls (the user drives zoom; pages aren't auto-fit).
  const zoomOut = el('button', 'icon-button pdf-nav-btn', ICON.zoomOut);
  zoomOut.title = 'Zoom out';
  const zoomLabel = el('span', 'pdf-zoom-label');
  const zoomIn = el('button', 'icon-button pdf-nav-btn', ICON.zoomIn);
  zoomIn.title = 'Zoom in';
  const zoomGroup = el('div', 'pdf-zoom-group');
  zoomGroup.append(zoomOut, zoomLabel, zoomIn);

  // Read-only page indicator (no prev/next buttons — you just scroll).
  const pageLabel = el('span', 'pdf-page-label');

  // Notes panel toggle (the annotations sidebar).
  const sideBtn = el('button', 'icon-button pdf-nav-btn pdf-side-btn', ICON.list);
  sideBtn.title = 'Notes';
  sideBtn.addEventListener('click', () => toggleSide());

  // The reading controls are only added once the PDF actually opens — a failed
  // load shows just the back button + title, not dead search/zoom/page widgets.
  const showControls = () => bar.append(searchGroup, zoomGroup, sideBtn, pageLabel);

  bar.append(back, title);

  const view = el('div', 'pdf-reader-view');
  const pagesEl = el('div', 'pdf-pages');
  view.append(pagesEl);
  const side = el('aside', 'pdf-side');
  const main = el('div', 'pdf-reader-main');
  main.append(view, side);

  root.append(bar, main);
  container.replaceChildren(root);
  pagesEl.append(el('p', 'pdf-loading', 'Loading…'));

  // State
  let pdf = null;
  let scale = 1;
  let base1 = { width: 612, height: 792 }; // first-page size, the layout baseline
  let pageEls = []; // { wrap, canvas, textDiv, base, rendered, rendering, renderedScale, task }
  let tops = []; // scroll offset of each page within the view
  let current = 1;

  let query = '';
  const tcCache = new Map();
  const textCache = new Map();
  let matches = []; // zero-based page indices
  let matchIdx = -1;

  const annByPage = new Map(); // pageIndex(0-based) -> [annotation]

  let saveTimer = null;
  const saveLastPage = (n) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => jsonApi('PATCH', `books/${book.id}`, { lastPage: n }).catch(() => {}), 600);
  };

  // --- text caches (shared by search + the text layer) ---
  async function getTC(n) {
    if (!tcCache.has(n)) tcCache.set(n, await (await pdf.getPage(n)).getTextContent());
    return tcCache.get(n);
  }
  async function getText(n) {
    if (!textCache.has(n)) {
      const tc = await getTC(n);
      textCache.set(
        n,
        tc.items
          .map((it) => it.str)
          .join(' ')
          .toLowerCase(),
      );
    }
    return textCache.get(n);
  }

  // --- layout ---
  // Default zoom shows pages at natural size, only shrinking if a page would be
  // wider than the view (never upscaling). From there the user zooms manually.
  function defaultScale() {
    const fitWidth = view.clientWidth - 40; // padding + scrollbar headroom
    return clamp(Math.min(1, fitWidth / base1.width), ZOOM_MIN, ZOOM_MAX);
  }

  function setZoomLabel() {
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }

  function applyZoom() {
    if (!popup.hidden) hidePopup();
    const anchor = current - 1;
    pageEls.forEach((item, i) => {
      sizeWrap(item);
      unload(i);
    });
    measure();
    scrollToPage(anchor);
    // The IntersectionObserver won't re-fire for pages that were already in view
    // (their intersection state didn't change), so re-render the visible ones.
    renderVisible();
    setZoomLabel();
    updateCurrent();
  }

  function zoomBy(factor) {
    const next = clamp(scale * factor, ZOOM_MIN, ZOOM_MAX);
    if (next === scale) return;
    scale = next;
    applyZoom();
  }
  zoomOut.addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
  zoomIn.addEventListener('click', () => zoomBy(ZOOM_STEP));

  function sizeWrap(item) {
    item.wrap.style.width = `${Math.round(item.base.width * scale)}px`;
    item.wrap.style.height = `${Math.round(item.base.height * scale)}px`;
  }

  function measure() {
    const vt = view.getBoundingClientRect().top;
    tops = pageEls.map((p) => p.wrap.getBoundingClientRect().top - vt + view.scrollTop);
  }

  function scrollToPage(i) {
    view.scrollTop = Math.max(0, (tops[i] ?? 0) - 6);
  }

  function setCurrent(n) {
    if (n === current) return;
    current = n;
    pageLabel.textContent = `${current} / ${pdf.numPages}`;
    saveLastPage(current);
  }

  function updateCurrent() {
    const y = view.scrollTop + 90;
    let lo = 0;
    let hi = tops.length - 1;
    let cur = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tops[mid] <= y) {
        cur = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    setCurrent(cur + 1);
  }

  // --- rendering ---
  async function renderOne(i) {
    const item = pageEls[i];
    if (!item || item.rendering || (item.rendered && item.renderedScale === scale)) return;
    item.rendering = true;
    try {
      const page = await pdf.getPage(i + 1);
      const viewport = page.getViewport({ scale });
      item.base = { width: viewport.width / scale, height: viewport.height / scale };
      sizeWrap(item); // correct the placeholder to this page's real size
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      item.canvas.width = Math.floor(viewport.width * dpr);
      item.canvas.height = Math.floor(viewport.height * dpr);
      item.canvas.style.width = `${Math.floor(viewport.width)}px`;
      item.canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = item.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (item.task) {
        try {
          item.task.cancel();
        } catch {
          /* ignore */
        }
      }
      item.task = page.render({ canvasContext: ctx, viewport });
      await item.task.promise;

      item.textDiv.replaceChildren();
      setLayerDimensions(item.textDiv, viewport);
      const layer = new TextLayer({ textContentSource: await getTC(i + 1), container: item.textDiv, viewport });
      await layer.render();
      if (query) highlightItem(item);

      item.rendered = true;
      item.renderedScale = scale;
      item.canvas.classList.add('is-ready');
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') item.rendering = false;
    } finally {
      item.rendering = false;
    }
  }

  // Render every page that overlaps the viewport (plus a small buffer). Used
  // after a zoom, where the observer alone won't re-trigger already-visible pages.
  function renderVisible() {
    const top = view.scrollTop - 600;
    const bottom = view.scrollTop + view.clientHeight + 600;
    for (let i = 0; i < pageEls.length; i++) {
      const t = tops[i] ?? 0;
      if (t + pageEls[i].wrap.offsetHeight >= top && t <= bottom) renderOne(i);
    }
  }

  function unload(i) {
    const item = pageEls[i];
    if (!item || !item.rendered) return;
    if (item.task) {
      try {
        item.task.cancel();
      } catch {
        /* ignore */
      }
    }
    item.canvas.width = 0;
    item.canvas.height = 0;
    item.canvas.classList.remove('is-ready');
    item.textDiv.replaceChildren();
    item.rendered = false;
    item.renderedScale = null;
  }

  // Render pages near the viewport; unload the ones that scrolled far away.
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const i = Number(entry.target.dataset.i);
        if (entry.isIntersecting) renderOne(i);
        else unload(i);
      }
    },
    { root: view, rootMargin: '600px 0px 600px 0px' },
  );

  // --- search ---
  // Highlight every occurrence of the query across the whole page, even when it
  // spans multiple text chunks. We build a whitespace-free string over all the
  // page's spans, keeping a map back to each character's (span, offset), find
  // the matches there, then wrap exactly those characters — so partial words and
  // multi-word phrases get fully highlighted.
  function highlightItem(item) {
    const q = stripWs(query);
    if (!q) return;
    const spans = [...item.textDiv.querySelectorAll('span')];
    const compact = [];
    const map = []; // map[k] = { s: spanIndex, c: charIndex }
    for (let s = 0; s < spans.length; s++) {
      const t = spans[s].textContent;
      for (let c = 0; c < t.length; c++) {
        if (/\s/.test(t[c])) continue;
        compact.push(t[c].toLowerCase());
        map.push({ s, c });
      }
    }
    const hay = compact.join('');
    const marked = new Map(); // spanIndex -> Set(charIndex)
    for (let idx = hay.indexOf(q); idx !== -1; idx = hay.indexOf(q, idx + q.length)) {
      for (let k = idx; k < idx + q.length; k++) {
        const { s, c } = map[k];
        if (!marked.has(s)) marked.set(s, new Set());
        marked.get(s).add(c);
      }
    }
    for (const [s, set] of marked) {
      const t = spans[s].textContent;
      let html = '';
      let inMark = false;
      for (let c = 0; c < t.length; c++) {
        const isWs = /\s/.test(t[c]);
        if (set.has(c) && !inMark) {
          html += '<mark class="pdf-mark">';
          inMark = true;
        } else if (inMark && !set.has(c) && !isWs) {
          html += '</mark>';
          inMark = false;
        }
        html += escapeHtml(t[c]);
      }
      if (inMark) html += '</mark>';
      spans[s].innerHTML = html;
    }
  }

  function clearHighlights() {
    for (const item of pageEls) {
      if (!item.rendered) continue;
      for (const span of item.textDiv.querySelectorAll('span')) {
        if (span.querySelector('.pdf-mark')) span.innerHTML = escapeHtml(span.textContent);
      }
    }
  }

  async function runSearch() {
    query = search.value.trim().toLowerCase();
    matches = [];
    matchIdx = -1;
    clearHighlights();
    if (!query) {
      matchLabel.textContent = '';
      return;
    }
    matchLabel.textContent = 'Searching…';
    const compactQuery = stripWs(query);
    for (let p = 1; p <= pdf.numPages; p++) {
      if (stripWs(await getText(p)).includes(compactQuery)) matches.push(p - 1);
    }
    pageEls.forEach((item) => item.rendered && highlightItem(item));
    if (matches.length) {
      matchIdx = 0;
      await goToMatch(0);
    } else {
      matchLabel.textContent = 'No matches';
    }
  }

  async function goToMatch(absIdx) {
    matchIdx = (absIdx + matches.length) % matches.length;
    matchLabel.textContent = `${matchIdx + 1} / ${matches.length}`;
    const pageIdx = matches[matchIdx];
    scrollToPage(pageIdx);
    await renderOne(pageIdx);
    const mark = pageEls[pageIdx].textDiv.querySelector('.pdf-mark');
    mark?.scrollIntoView({ block: 'center' });
  }

  searchPrev.addEventListener('click', () => matches.length && goToMatch(matchIdx - 1));
  searchNext.addEventListener('click', () => matches.length && goToMatch(matchIdx + 1));
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (matches.length && search.value.trim().toLowerCase() === query) goToMatch(matchIdx + 1);
    else runSearch();
  });

  // --- highlights + comments ---
  async function loadAnnotations() {
    let annotations = [];
    try {
      annotations = (await getApi(`books/${book.id}/annotations`)).annotations || [];
    } catch {
      return;
    }
    annByPage.clear();
    for (const a of annotations) {
      const i = a.page - 1;
      if (!annByPage.has(i)) annByPage.set(i, []);
      annByPage.get(i).push(a);
    }
    pageEls.forEach((_, i) => drawPage(i));
    renderSidebar();
  }

  // Flat list of all annotations, ordered by page then vertical position.
  function allAnnots() {
    const out = [];
    for (const arr of annByPage.values()) out.push(...arr);
    out.sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0));
    return out;
  }

  function toggleSide() {
    root.classList.toggle('notes-open');
    sideBtn.classList.toggle('is-active', root.classList.contains('notes-open'));
  }

  function renderSidebar() {
    const items = allAnnots();
    const head = el('div', 'pdf-side-head');
    head.append(el('span', 'pdf-side-title', 'Notes'), el('span', 'pdf-side-count', String(items.length)));
    const body = el('div', 'pdf-side-list');
    if (!items.length) {
      body.append(
        el('p', 'pdf-side-empty', 'No highlights yet. Select text in the book to highlight it or add a note.'),
      );
    }
    for (const a of items) {
      const color = COLORS.includes(a.color) ? a.color : 'yellow';
      const row = el('div', 'pdf-side-item');
      row.append(el('span', `pdf-side-dot pdf-color-${color}`));
      const txt = el('div', 'pdf-side-text-wrap');
      txt.append(el('span', 'pdf-side-text', a.text || '(highlight)'));
      if (a.comment) txt.append(el('span', 'pdf-side-note', a.comment));
      txt.append(el('span', 'pdf-side-page', `Page ${a.page}`));
      txt.addEventListener('click', () => jumpToAnnot(a));
      const del = el('button', 'icon-button pdf-side-del', ICON.trash);
      del.title = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        removeAnnot(a);
      });
      row.append(txt, del);
      body.append(row);
    }
    side.replaceChildren(head, body);
  }

  async function removeAnnot(a) {
    try {
      await jsonApi('DELETE', `books/${book.id}/annotations/${a.id}`);
    } catch {
      /* ignore */
    }
    const i = a.page - 1;
    const arr = annByPage.get(i) || [];
    const idx = arr.indexOf(a);
    if (idx >= 0) arr.splice(idx, 1);
    drawPage(i);
    renderSidebar();
    if (!popup.hidden) hidePopup();
  }

  // Scroll a highlight into view and flash it. Closes the panel so it's visible.
  function jumpToAnnot(a) {
    const item = pageEls[a.page - 1];
    if (!item) return;
    if (root.classList.contains('notes-open')) toggleSide();
    renderOne(a.page - 1);
    const target = item.hl.querySelector(`[data-id="${a.id}"]`) || item.wrap;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    item.hl.querySelectorAll(`[data-id="${a.id}"]`).forEach((d) => {
      d.classList.add('is-flash');
      setTimeout(() => d.classList.remove('is-flash'), 1300);
    });
  }

  // Highlights are positioned in % of the page box, so they track zoom for free.
  function drawPage(i) {
    const item = pageEls[i];
    if (!item) return;
    item.hl.replaceChildren();
    for (const a of annByPage.get(i) || []) {
      const color = COLORS.includes(a.color) ? a.color : 'yellow';
      a.rects.forEach((r, idx) => {
        const d = el('div', `pdf-hl pdf-hl-${color}`);
        d.dataset.id = a.id;
        d.style.left = `${r.x * 100}%`;
        d.style.top = `${r.y * 100}%`;
        d.style.width = `${r.w * 100}%`;
        d.style.height = `${r.h * 100}%`;
        if (a.comment && idx === a.rects.length - 1) d.classList.add('has-note');
        item.hl.append(d);
      });
    }
  }

  function annotAt(i, fx, fy) {
    for (const a of annByPage.get(i) || []) {
      for (const r of a.rects) {
        if (fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h) return a;
      }
    }
    return null;
  }

  // Normalized rects for the current text selection, restricted to one page.
  function selectionSnapshot() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
    const node = sel.anchorNode?.parentElement || sel.anchorNode;
    const wrap = node?.closest?.('.pdf-page');
    if (!wrap) return null;
    const i = Number(wrap.dataset.i);
    const box = wrap.getBoundingClientRect();
    const rects = [];
    for (const r of sel.getRangeAt(0).getClientRects()) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < box.left || cx > box.right || cy < box.top || cy > box.bottom) continue;
      if (r.width < 1 || r.height < 1) continue;
      rects.push({
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        w: r.width / box.width,
        h: r.height / box.height,
      });
    }
    if (!rects.length) return null;
    return { page: i + 1, rects, text: sel.toString().trim() };
  }

  // A single reused floating popup (create-from-selection and edit).
  const popup = el('div', 'pdf-popup');
  popup.hidden = true;
  root.append(popup);
  let lastPointer = { x: 0, y: 0 };
  const hidePopup = () => {
    popup.hidden = true;
    popup.replaceChildren();
  };

  // Position the popup (absolute within the reader) near the cursor, clamped to
  // the reader's box so it can never spill outside the dialog.
  function placePopup(clientX, clientY) {
    popup.hidden = false;
    const w = popup.offsetWidth;
    const h = popup.offsetHeight;
    const r = root.getBoundingClientRect();
    let left = clientX - r.left - w / 2;
    let top = clientY - r.top + 14;
    if (top + h > root.clientHeight - 8) top = clientY - r.top - h - 14; // flip above
    popup.style.left = `${clamp(left, 8, Math.max(8, root.clientWidth - w - 8))}px`;
    popup.style.top = `${clamp(top, 8, Math.max(8, root.clientHeight - h - 8))}px`;
  }

  function colorRow(active, onPick) {
    const row = el('div', 'pdf-colors');
    const btns = COLORS.map((c) => {
      const b = el('button', `pdf-color pdf-color-${c}${c === active ? ' is-active' : ''}`);
      b.title = c;
      b.addEventListener('click', () => {
        btns.forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        onPick(c);
      });
      row.append(b);
      return b;
    });
    return row;
  }

  async function createAnnot(snap, color, withComment) {
    let annot;
    try {
      annot = await jsonApi('POST', `books/${book.id}/annotations`, {
        page: snap.page,
        rects: snap.rects,
        text: snap.text,
        color,
      });
    } catch {
      return;
    }
    const i = snap.page - 1;
    if (!annByPage.has(i)) annByPage.set(i, []);
    annByPage.get(i).push(annot);
    window.getSelection()?.removeAllRanges();
    drawPage(i);
    renderSidebar();
    if (withComment) openEditPopup(annot, lastPointer.x, lastPointer.y);
    else hidePopup();
  }

  function openSelectionPopup(snap, x, y) {
    popup.replaceChildren();
    popup.append(colorRow(null, (c) => createAnnot(snap, c, false)));
    const note = el('button', 'pdf-popup-note', `${ICON.note}<span>Note</span>`);
    note.addEventListener('click', () => createAnnot(snap, 'yellow', true));
    popup.append(note);
    placePopup(x, y);
  }

  function openEditPopup(annot, x, y) {
    const i = annot.page - 1;
    popup.replaceChildren();
    popup.append(
      colorRow(annot.color, async (c) => {
        annot.color = c;
        drawPage(i);
        renderSidebar();
        try {
          await jsonApi('PATCH', `books/${book.id}/annotations/${annot.id}`, { color: c });
        } catch {
          /* ignore */
        }
      }),
    );
    const ta = el('textarea', 'pdf-popup-comment');
    ta.placeholder = 'Add a note…';
    ta.value = annot.comment || '';
    popup.append(ta);
    const actions = el('div', 'pdf-popup-actions');
    const save = el('button', 'button-primary', 'Save');
    save.addEventListener('click', async () => {
      annot.comment = ta.value.trim();
      try {
        await jsonApi('PATCH', `books/${book.id}/annotations/${annot.id}`, { comment: annot.comment });
      } catch {
        /* ignore */
      }
      drawPage(i);
      renderSidebar();
      hidePopup();
    });
    const del = el('button', 'icon-button pdf-popup-del', ICON.trash);
    del.title = 'Delete highlight';
    del.addEventListener('click', () => removeAnnot(annot));
    actions.append(save, del);
    popup.append(actions);
    placePopup(x, y);
    requestAnimationFrame(() => ta.focus());
  }

  // A selection offers to highlight; a plain click on a highlight opens its note.
  view.addEventListener('mouseup', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    if (e.target.closest('.pdf-popup')) return;
    const snap = selectionSnapshot();
    if (snap) {
      openSelectionPopup(snap, e.clientX, e.clientY);
      return;
    }
    const wrap = e.target.closest('.pdf-page');
    if (wrap) {
      const i = Number(wrap.dataset.i);
      const box = wrap.getBoundingClientRect();
      const a = annotAt(i, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
      if (a) {
        openEditPopup(a, e.clientX, e.clientY);
        return;
      }
    }
    hidePopup();
  });

  // --- scroll + resize ---
  let scrollRaf = 0;
  view.addEventListener(
    'scroll',
    () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        updateCurrent();
        if (!popup.hidden) hidePopup();
      });
    },
    { passive: true },
  );

  // Zoom is manual, so resizing the window doesn't re-scale the pages — we just
  // re-measure so the page indicator and search jumps stay accurate.
  let resizeTimer = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!pdf || view.clientWidth === 0) return;
      measure();
      updateCurrent();
    }, 150);
  });
  ro.observe(view);

  // --- boot ---
  (async () => {
    try {
      pdf = await pdfjsLib.getDocument({ url: await fileUrl(`books/${book.id}/file`) }).promise;
      base1 = pdf ? await (await pdf.getPage(1)).getViewport({ scale: 1 }) : base1;
      base1 = { width: base1.width, height: base1.height };
      scale = defaultScale();
      setZoomLabel();

      showControls();
      pagesEl.replaceChildren();
      for (let i = 0; i < pdf.numPages; i++) {
        const wrap = el('div', 'pdf-page');
        wrap.dataset.i = String(i);
        const canvas = el('canvas', 'pdf-canvas');
        const hl = el('div', 'pdf-hl-layer'); // highlights (% positioned, scale-free)
        const textDiv = el('div', 'pdf-text-layer');
        wrap.append(canvas, hl, textDiv);
        const item = {
          wrap,
          canvas,
          hl,
          textDiv,
          base: base1,
          rendered: false,
          rendering: false,
          renderedScale: null,
          task: null,
        };
        sizeWrap(item);
        pagesEl.append(wrap);
        pageEls.push(item);
        io.observe(wrap);
      }

      await loadAnnotations();

      const start = clamp((book.lastPage || 1) - 1, 0, pdf.numPages - 1);
      requestAnimationFrame(() => {
        measure();
        scrollToPage(start);
        setCurrent(start + 1);
        pageLabel.textContent = `${start + 1} / ${pdf.numPages}`;
        updateCurrent();
      });
    } catch (err) {
      pagesEl.replaceChildren(el('p', 'app-error', `Couldn't open this PDF: ${err.message || err}`));
    }
  })();

  return {
    el: root,
    destroy() {
      io.disconnect();
      ro.disconnect();
    },
  };
}
