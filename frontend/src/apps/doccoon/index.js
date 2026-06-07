// doccoon — markdown notes, Notion-style. Notes are organized into collections
// (a notebook, e.g. per book), each holding one or more Markdown pages. The
// sidebar is a tree: each collection expands/collapses to reveal its pages, next
// to an editor with an optional live preview. CRUD lives in doccoon.local.js.

import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import mdlang from 'highlight.js/lib/languages/markdown';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import 'highlight.js/styles/github-dark.css';
import { getApi, jsonApi } from '../../lib/api.js';
import { confirmDialog } from '../../components/confirm.js';
import { openContextMenu } from '../../components/contextMenu.js';

for (const [name, lang] of Object.entries({
  javascript,
  typescript,
  python,
  rust,
  bash,
  json,
  xml,
  css,
  go,
  sql,
  yaml,
  markdown: mdlang,
  c,
  cpp,
  java,
})) {
  hljs.registerLanguage(name, lang);
}

const marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
);
marked.setOptions({ gfm: true, breaks: true });

// Cap page size so rendering/highlighting stays fast.
const MAX_CHARS = 50000;

const TRASH = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 6h18"></path>
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
  </svg>`;

const PLUS = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14"></path>
  </svg>`;

const BURGER = `
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16"></path>
  </svg>`;

const DOWNLOAD = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <path d="M7 10l5 5 5-5"></path>
    <path d="M12 15V3"></path>
  </svg>`;

const FOLDER = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
  </svg>`;

const PENCIL = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>
  </svg>`;

const INFO = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M12 16v-5"></path>
    <path d="M12 8h.01"></path>
  </svg>`;

const BOOK = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"></path>
    <path d="M4 19a2 2 0 0 1 2-2h12"></path>
  </svg>`;

const BACK = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M15 6l-6 6 6 6"></path>
  </svg>`;

// Below this layout width the sidebar collapses to an overlay and the editor
// drops the split preview (no room for two panes).
const NARROW = 640;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Normalize a title/name for internal links: lowercase, spaces & dashes → "_".
const slug = (s) =>
  (s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

// Set by the home widget so the next open jumps to a collection / starts a new one.
let pendingCollectionId = null;
let pendingNewCollection = false;
// Sidebar width, drag-resizable; persists across opens within the session.
let sidebarWidth = 300;

export default {
  id: 'doccoon',
  name: 'Books & Notes',
  description: 'Markdown notes, organized into collections',
  accent: '#a78bfa',
  order: 5,
  dialog: { size: 'xl' },

  // Home card: your most recently worked-on collections (up to 5).
  async widget(ctx) {
    let collections;
    try {
      collections = (await getApi('collections')).collections || [];
    } catch {
      return null;
    }
    if (!collections.length) return null;

    const card = el('div', 'widget-card');
    card.style.setProperty('--accent', '#a78bfa');

    const head = el('button', 'widget-head');
    head.append(el('span', 'widget-title', 'Notes'), el('span', 'widget-count', String(collections.length)));
    head.addEventListener('click', () => ctx.openApp('doccoon'));
    card.append(head);

    const list = el('div', 'widget-list');
    collections.slice(0, 5).forEach((col) => {
      const item = el('button', 'widget-note', col.name || 'Untitled');
      item.title = `${col.name} · ${col.pageCount} page${col.pageCount === 1 ? '' : 's'}`;
      item.addEventListener('click', () => {
        pendingCollectionId = col.id;
        ctx.openApp('doccoon');
      });
      list.append(item);
    });
    card.append(list);

    const add = el('button', 'widget-more', '+ New collection');
    add.addEventListener('click', () => {
      pendingNewCollection = true;
      ctx.openApp('doccoon');
    });
    card.append(add);

    return card;
  },

  render(body) {
    let collections = []; // [{ id, name, updated, pageCount }]
    const pagesByCol = new Map(); // collectionId -> [{ id, title, updated }] (cached when expanded)
    const expanded = new Set(); // expanded collection ids
    let current = null; // the open page (full record)
    let view = 'split'; // 'split' | 'edit'
    let userView = 'split'; // the view to restore when there's room again
    let narrow = false;
    let saveTimer = null;

    const layout = el('div', 'doc-layout');
    const sidebar = el('aside', 'doc-sidebar');
    sidebar.style.width = `${sidebarWidth}px`;
    const resizer = el('div', 'doc-resizer');
    const main = el('div', 'doc-main');
    layout.append(sidebar, resizer, main);
    body.replaceChildren(layout);

    const toggleSidebar = () => layout.classList.toggle('collapsed');

    // Drag the divider to resize the sidebar (min 200px), kept for the session.
    resizer.addEventListener('pointerdown', (e) => {
      if (narrow) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = sidebar.offsetWidth;
      resizer.setPointerCapture(e.pointerId);
      layout.classList.add('is-resizing');
      const move = (ev) => {
        const max = Math.max(200, layout.clientWidth - 360); // leave room for the editor
        sidebarWidth = Math.min(max, Math.max(200, startW + (ev.clientX - startX)));
        sidebar.style.width = `${sidebarWidth}px`;
      };
      const up = () => {
        resizer.releasePointerCapture(e.pointerId);
        layout.classList.remove('is-resizing');
        resizer.removeEventListener('pointermove', move);
        resizer.removeEventListener('pointerup', up);
      };
      resizer.addEventListener('pointermove', move);
      resizer.addEventListener('pointerup', up);
    });

    // Undo toast for deletes (stays for 30s).
    const undoBar = el('div', 'doc-undo');
    undoBar.hidden = true;
    layout.append(undoBar);
    let undoTimer = null;
    function showUndo(message, onUndo) {
      clearTimeout(undoTimer);
      const btn = el('button', 'doc-undo-btn', 'Undo');
      btn.addEventListener('click', async () => {
        clearTimeout(undoTimer);
        undoBar.hidden = true;
        await onUndo();
      });
      undoBar.replaceChildren(el('span', 'doc-undo-msg', message), btn);
      undoBar.hidden = false;
      undoTimer = setTimeout(() => {
        undoBar.hidden = true;
      }, 30000);
    }

    const sanitize = (s) => (s || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    // Small modal to edit a title; resolves to the new value, or null if cancelled.
    function promptTitle(label, value) {
      return new Promise((resolve) => {
        const overlay = el('div', 'doc-prompt-overlay');
        const card = el('div', 'doc-prompt');
        const input = el('input', 'input');
        input.value = value || '';
        const actions = el('div', 'doc-prompt-actions');
        const cancel = el('button', 'button-secondary', 'Cancel');
        const ok = el('button', 'button-primary', 'Save');
        actions.append(cancel, ok);
        card.append(el('p', 'doc-prompt-label', label), input, actions);
        overlay.append(card);
        layout.append(overlay);

        const close = (val) => {
          overlay.remove();
          resolve(val);
        };
        cancel.addEventListener('click', () => close(null));
        ok.addEventListener('click', () => close(input.value.trim()));
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) close(null);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') close(input.value.trim());
          else if (e.key === 'Escape') close(null);
        });
        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });
      });
    }

    // --- editor (built once, kept stable so the textarea doesn't lose focus) ---
    const editor = el('div', 'doc-editor');
    editor.dataset.view = view;

    const toolbar = el('div', 'doc-toolbar');
    const burger = el('button', 'icon-button doc-burger');
    burger.title = 'Toggle collections';
    burger.setAttribute('aria-label', 'Toggle collections');
    burger.innerHTML = BURGER;
    burger.addEventListener('click', toggleSidebar);
    const viewToggle = el('div', 'tabs doc-view-toggle');
    const editTab = el('button', 'tab', 'Edit');
    const splitTab = el('button', 'tab', 'Split');
    const previewTab = el('button', 'tab', 'Preview');
    viewToggle.append(editTab, splitTab, previewTab);
    const info = el('button', 'icon-button doc-info');
    info.innerHTML = INFO;
    info.title = 'Internal linking help';
    info.setAttribute('aria-label', 'Internal linking help');
    info.addEventListener('click', showLinkHelp);
    const status = el('span', 'doc-status');
    const count = el('span', 'doc-count');
    toolbar.append(burger, viewToggle, info, status, count);

    // Page title — display only. Rename/delete live in the page's right-click menu.
    const titleBar = el('div', 'doc-title-bar');
    const titleText = el('h2', 'doc-title-text');
    titleBar.append(titleText);
    const setTitleText = () => {
      titleText.textContent = current && current.title !== 'Untitled' ? current.title : 'Untitled';
    };

    const area = el('div', 'doc-editor-area');
    const source = el('textarea', 'doc-source');
    source.placeholder = 'Write Markdown here…';
    source.spellcheck = false;
    source.maxLength = MAX_CHARS;

    const updateCount = () => {
      const n = source.value.length;
      count.textContent = `${n.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
      count.classList.toggle('is-over', n >= MAX_CHARS);
    };
    const preview = el('div', 'md-preview doc-preview');
    area.append(source, preview);

    editor.append(toolbar, titleBar, area);

    function setView(next) {
      view = next;
      editor.dataset.view = view;
      editTab.classList.toggle('is-active', view === 'edit');
      splitTab.classList.toggle('is-active', view === 'split');
      previewTab.classList.toggle('is-active', view === 'preview');
    }
    editTab.addEventListener('click', () => {
      userView = 'edit';
      setView('edit');
    });
    splitTab.addEventListener('click', () => {
      userView = 'split';
      setView('split');
      renderPreview();
    });
    previewTab.addEventListener('click', () => {
      userView = 'preview';
      setView('preview');
      renderPreview();
    });
    setView(view);

    // Collapse the sidebar + force edit view when the window gets too narrow,
    // and restore the preferred layout when there's room again.
    const applyWidth = (w) => {
      const isNarrow = w > 0 && w < NARROW;
      if (isNarrow === narrow) return;
      narrow = isNarrow;
      layout.classList.toggle('is-narrow', narrow);
      if (narrow) {
        layout.classList.add('collapsed');
        sidebar.style.width = ''; // let the overlay CSS size it
        setView('edit');
      } else {
        layout.classList.remove('collapsed');
        sidebar.style.width = `${sidebarWidth}px`; // restore the resizable width
        if (view !== userView) {
          setView(userView);
          renderPreview();
        }
      }
    };
    const ro = new ResizeObserver((entries) => applyWidth(entries[0].contentRect.width));
    ro.observe(layout);

    // When the sidebar is an open overlay, a click anywhere outside it closes it.
    layout.addEventListener('click', (e) => {
      if (!narrow || layout.classList.contains('collapsed')) return;
      if (e.target.closest('.doc-sidebar') || e.target.closest('.doc-burger')) return;
      layout.classList.add('collapsed');
    });

    let previewTimer = null;
    const renderPreview = () => {
      if (view === 'edit') return; // preview hidden in edit mode — don't parse
      preview.innerHTML = marked.parse(source.value || '*Nothing to preview yet.*');
      enhanceLinks(preview, current?.collectionId);
    };

    // Detect an internal page link: `this:page` (same collection) or
    // `collection:page` (another collection). Returns null for real URLs.
    function parseInternalLink(href) {
      const m = href.match(/^([^:/?#]+):(.+)$/);
      if (!m) return null;
      const [, prefix, rest] = m;
      if (rest.startsWith('//')) return null; // https://, etc.
      if (prefix === 'this') return { collectionSlug: null, pageSlug: slug(rest) };
      const cslug = slug(prefix);
      if (collections.some((c) => slug(c.name) === cslug)) return { collectionSlug: cslug, pageSlug: slug(rest) };
      return null;
    }

    // Resolve an internal link to { col, page }, loading the target collection's
    // pages if needed. Works across collections.
    async function resolveInternalLink({ collectionSlug, pageSlug }, baseColId) {
      const col =
        collectionSlug == null
          ? collections.find((c) => c.id === (baseColId ?? current?.collectionId))
          : collections.find((c) => slug(c.name) === collectionSlug);
      if (!col) {
        status.textContent = 'Linked collection not found.';
        return null;
      }
      if (!pagesByCol.has(col.id)) await loadPages(col.id);
      const page = (pagesByCol.get(col.id) || []).find((p) => slug(p.title) === pageSlug);
      if (!page) {
        status.textContent = 'Linked page not found.';
        return null;
      }
      return { col, page };
    }

    // From the editor preview: open the linked page in the editor.
    async function openInternalLink(internal, baseColId) {
      const found = await resolveInternalLink(internal, baseColId);
      if (!found) return;
      expanded.add(found.col.id);
      await openPage(found.page.id);
    }

    // From book view: stay in reading mode — open the target collection's book
    // (even another collection) and scroll to the linked page.
    async function openInternalLinkInBook(internal, baseColId) {
      const found = await resolveInternalLink(internal, baseColId);
      if (!found) return;
      await openBookView(found.col.id, found.page.id);
    }

    // Wire up links in rendered markdown: internal page links navigate in-app
    // (via `onInternal`); everything else opens in a new tab (schemeless → https).
    function enhanceLinks(container, baseColId, onInternal) {
      container.querySelectorAll('a').forEach((a) => {
        const href = a.getAttribute('href') || '';
        const internal = parseInternalLink(href);
        if (internal) {
          a.classList.add('doc-link');
          a.removeAttribute('target');
          a.addEventListener('click', (e) => {
            e.preventDefault();
            (onInternal || openInternalLink)(internal, baseColId);
          });
          return;
        }
        if (href && !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(href)) {
          a.setAttribute('href', `https://${href}`);
        }
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
    }

    // Help popover explaining the internal-link syntax.
    function showLinkHelp() {
      const overlay = el('div', 'doc-prompt-overlay');
      const card = el('div', 'doc-prompt doc-help');
      card.innerHTML =
        '<p class="doc-prompt-label">Internal links</p>' +
        '<p>Link to another page with a Markdown link:</p>' +
        '<ul><li>Same collection: <code>[text](this:page_name)</code></li>' +
        '<li>Another collection: <code>[text](collection_name:page_name)</code></li></ul>' +
        '<p>Names are normalized — spaces and dashes become <code>_</code> and case is ignored, so “Page Title” → <code>page_title</code>.</p>';
      const actions = el('div', 'doc-prompt-actions');
      const close = el('button', 'button-primary', 'Got it');
      actions.append(close);
      card.append(actions);
      overlay.append(card);
      layout.append(overlay);
      const done = () => overlay.remove();
      close.addEventListener('click', done);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) done();
      });
    }

    // "Export as Book": read the whole collection as one continuous, rendered doc.
    async function openBookView(colId, focusPageId) {
      await flushSave();
      const col = collections.find((c) => c.id === colId);
      if (!pagesByCol.has(colId)) await loadPages(colId);
      const list = pagesByCol.get(colId) || [];
      const fulls = (await Promise.all(list.map((p) => getApi(`pages/${p.id}`).catch(() => null)))).filter(Boolean);
      const ordered = fulls.reverse(); // pages are newest-first; read oldest-first

      const book = el('div', 'doc-book');
      const bar = el('div', 'doc-book-bar');
      const back = el('button', 'icon-button');
      back.innerHTML = BACK;
      back.title = 'Back to editor';
      back.setAttribute('aria-label', 'Back to editor');
      back.addEventListener('click', exitBookView);
      bar.append(back, el('span', 'doc-book-title', col?.name || 'Book'));

      const content = el('div', 'doc-book-content md-preview');
      for (const page of ordered) {
        const section = el('section', 'doc-book-page');
        section.dataset.id = page.id;
        section.innerHTML = marked.parse(`# ${page.title || 'Untitled'}\n\n${page.content || ''}`);
        // Internal links navigate within the book (stay in reading mode).
        enhanceLinks(section, colId, openInternalLinkInBook);
        content.append(section);
      }
      if (!ordered.length) content.append(el('p', 'placeholder-lead', 'This collection has no pages yet.'));

      book.append(bar, content);
      layout.classList.add('is-reading'); // hide the sidebar for a focused read
      main.replaceChildren(book);
      if (focusPageId) {
        const target = content.querySelector(`.doc-book-page[data-id="${focusPageId}"]`);
        if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
      }
    }

    function exitBookView() {
      layout.classList.remove('is-reading');
      if (current) main.replaceChildren(editor);
      else showPlaceholder();
    }
    // Debounced so we don't re-parse + re-highlight the whole page on every keystroke.
    const schedulePreview = () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 200);
    };

    const scheduleSave = () => {
      status.textContent = 'Saving…';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 600);
    };

    async function save() {
      if (!current) return;
      saveTimer = null; // this save is now in flight; don't let flushSave double-fire
      const page = current; // pin the page being saved (it may change during the await)
      try {
        const updated = await jsonApi('PATCH', `pages/${page.id}`, { content: source.value });
        // Only write back if we're still on the same page (the user may have switched).
        if (current === page) {
          current = { ...current, ...updated };
          status.textContent = 'Saved';
        }
        const entry = pagesByCol.get(page.collectionId)?.find((p) => p.id === page.id);
        if (entry) entry.updated = updated.updated;
      } catch (err) {
        status.textContent = err.message;
      }
    }

    // Rename a page via the dialog (defaults to the open page), then sync the
    // editor (if it's open) + the sidebar.
    async function renamePage(page = current, colId = current?.collectionId) {
      if (!page) return;
      const name = await promptTitle('Page title', page.title === 'Untitled' ? '' : page.title);
      if (name == null) return;
      if (current?.id === page.id) await flushSave();
      let updated;
      try {
        updated = await jsonApi('PATCH', `pages/${page.id}`, { title: name || 'Untitled' });
      } catch (err) {
        status.textContent = err.message;
        return;
      }
      const entry = (pagesByCol.get(colId) || []).find((p) => p.id === page.id);
      if (entry) {
        entry.title = updated.title;
        entry.updated = updated.updated;
      }
      if (current?.id === page.id) {
        current = { ...current, ...updated };
        setTitleText();
      }
      const item = sidebar.querySelector(`.doc-page-item[data-id="${page.id}"] .doc-page-title`);
      if (item) item.textContent = updated.title || 'Untitled';
    }

    // Delete a page (defaults to the open page) with confirm + 30s undo.
    async function deletePage(pageInfo = current, colId = current?.collectionId) {
      if (!pageInfo) return;
      if (!(await confirmDialog('Delete this page?'))) return;
      const isCurrent = current?.id === pageInfo.id;
      let snapshot;
      if (isCurrent) {
        snapshot = { title: current.title, content: source.value };
      } else {
        try {
          const full = await getApi(`pages/${pageInfo.id}`);
          snapshot = { title: full.title, content: full.content || '' };
        } catch {
          snapshot = { title: pageInfo.title, content: '' };
        }
      }
      await jsonApi('DELETE', `pages/${pageInfo.id}`);
      const remaining = (pagesByCol.get(colId) || []).filter((p) => p.id !== pageInfo.id);
      pagesByCol.set(colId, remaining);
      if (isCurrent) {
        current = null;
        drawSidebar();
        if (remaining.length) await openPage(remaining[0].id);
        else showPlaceholder();
      } else {
        drawSidebar();
      }
      showUndo('Page deleted', async () => {
        const restored = await jsonApi('POST', `collections/${colId}/pages`, snapshot);
        pagesByCol.set(colId, [
          { id: restored.id, title: restored.title, updated: restored.updated },
          ...(pagesByCol.get(colId) || []),
        ]);
        expanded.add(colId);
        await openPage(restored.id);
      });
    }

    // Persist any pending (debounced) edit immediately — e.g. before switching
    // pages, so a fast switch never drops an unsaved title/body.
    async function flushSave() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        await save();
      }
    }

    source.addEventListener('input', () => {
      updateCount();
      schedulePreview();
      scheduleSave();
    });

    // --- sidebar (a tree of collections → pages) ---
    function pageRow(page, colId) {
      const item = el('div', 'doc-page-item' + (page.id === current?.id ? ' is-active' : ''));
      item.dataset.id = page.id;

      const open = el('button', 'doc-page-open');
      open.title = 'Click to open · right-click for options';
      open.append(el('span', 'doc-page-title', page.title || 'Untitled'));
      open.addEventListener('click', () => {
        openPage(page.id);
        if (narrow) layout.classList.add('collapsed');
      });
      item.append(open);

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: 'Rename', icon: PENCIL, onClick: () => renamePage(page, colId) },
          { label: 'Download (.md)', icon: DOWNLOAD, onClick: () => downloadPage(page.id) },
          { separator: true },
          { label: 'Delete', icon: TRASH, danger: true, onClick: () => deletePage(page, colId) },
        ]);
      });
      return item;
    }

    function collectionEl(col) {
      const isOpen = expanded.has(col.id);
      const hasCurrent = current?.collectionId === col.id;
      const colEl = el('div', 'doc-collection' + (isOpen ? ' is-expanded' : '') + (hasCurrent ? ' is-active' : ''));

      const row = el('div', 'doc-collection-row');
      const icon = el('span', 'doc-collection-icon');
      icon.innerHTML = FOLDER;
      const pageCount = pagesByCol.get(col.id)?.length ?? col.pageCount;

      // Clicking the collection expands / collapses it; right-click for actions.
      const open = el('button', 'doc-collection-open');
      open.title = 'Click to open · right-click for options';
      open.append(
        icon,
        el('span', 'doc-collection-name', col.name || 'Untitled'),
        el('span', 'doc-collection-count', String(pageCount)),
      );
      open.addEventListener('click', () => toggleExpand(col.id));
      row.append(open);

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: 'Export as Book', icon: BOOK, onClick: () => openBookView(col.id) },
          { label: 'Rename', icon: PENCIL, onClick: () => renameCollection(col) },
          { label: 'Download (.zip)', icon: DOWNLOAD, onClick: () => downloadCollection(col.id) },
          { separator: true },
          { label: 'Delete', icon: TRASH, danger: true, onClick: () => deleteCollection(col.id) },
        ]);
      });

      colEl.append(row);

      if (isOpen) {
        const pagesList = el('div', 'doc-page-list');
        for (const page of pagesByCol.get(col.id) || []) pagesList.append(pageRow(page, col.id));
        const addPage = el('button', 'doc-add-page');
        addPage.innerHTML = `${PLUS}<span>New page</span>`;
        addPage.addEventListener('click', () => newPage(col.id));
        pagesList.append(addPage);
        colEl.append(pagesList);
      }
      return colEl;
    }

    function drawSidebar() {
      const head = el('div', 'doc-sidebar-head');
      head.append(el('span', 'doc-sidebar-title', 'Notes'));
      const addCol = el('button', 'icon-button doc-new');
      addCol.title = 'New collection';
      addCol.setAttribute('aria-label', 'New collection');
      addCol.innerHTML = PLUS;
      addCol.addEventListener('click', newCollection);
      head.append(addCol);

      const list = el('div', 'doc-collection-list');
      for (const col of collections) list.append(collectionEl(col));
      sidebar.replaceChildren(head, list);
    }

    async function renameCollection(col) {
      const name = await promptTitle('Collection name', col.name || '');
      if (name == null) return;
      try {
        await jsonApi('PATCH', `collections/${col.id}`, { name: name || 'Untitled collection' });
        col.name = name || 'Untitled collection';
        drawSidebar();
      } catch (err) {
        status.textContent = err.message;
      }
    }

    // Download a page as a .md file. Uses the live editor value for the open page
    // (so unsaved edits are included), else fetches the stored page.
    async function downloadPage(id) {
      let title;
      let content;
      if (current && current.id === id) {
        title = current.title || 'Untitled';
        content = source.value;
      } else {
        try {
          const page = await getApi(`pages/${id}`);
          title = page.title;
          content = page.content || '';
        } catch (err) {
          status.textContent = err.message;
          return;
        }
      }
      const heading = title && title !== 'Untitled' ? `# ${title}\n\n` : '';
      const safe = sanitize(title) || 'page';
      downloadBlob(new Blob([heading + content], { type: 'text/markdown' }), `${safe}.md`);
    }

    // Download a whole collection as a .zip containing `collection_name/<page>.md`.
    async function downloadCollection(colId) {
      const col = collections.find((c) => c.id === colId);
      await flushSave();
      if (!pagesByCol.has(colId)) await loadPages(colId);
      const pageList = pagesByCol.get(colId) || [];
      if (!pageList.length) {
        status.textContent = 'This collection has no pages to download.';
        return;
      }
      const folder = sanitize(col?.name) || 'collection';
      const used = new Set();
      const files = [];
      for (const p of pageList) {
        const page =
          current && current.id === p.id
            ? { title: current.title || 'Untitled', content: source.value }
            : await getApi(`pages/${p.id}`);
        const title = page.title || 'Untitled';
        const base = sanitize(title) || 'page';
        let name = base;
        let i = 2;
        while (used.has(name.toLowerCase())) name = `${base}-${i++}`;
        used.add(name.toLowerCase());
        const heading = title && title !== 'Untitled' ? `# ${title}\n\n` : '';
        files.push({ name: `${folder}/${name}.md`, data: heading + (page.content || '') });
      }
      const { zipStore } = await import('../../lib/zip.js');
      downloadBlob(zipStore(files), `${folder}.zip`);
    }

    // --- data ---
    async function loadPages(colId) {
      try {
        pagesByCol.set(colId, (await getApi(`collections/${colId}/pages`)).pages || []);
      } catch {
        pagesByCol.set(colId, []);
      }
    }

    async function toggleExpand(colId) {
      if (expanded.has(colId)) {
        expanded.delete(colId);
        drawSidebar();
        return;
      }
      expanded.add(colId);
      if (!pagesByCol.has(colId)) await loadPages(colId);
      drawSidebar();
    }

    async function openPage(id) {
      await flushSave(); // don't lose unsaved edits on the page we're leaving
      try {
        current = await getApi(`pages/${id}`);
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', err.message));
        return;
      }
      expanded.add(current.collectionId); // make sure it's visible in the tree
      setTitleText();
      source.value = current.content || '';
      updateCount();
      renderPreview();
      status.textContent = '';
      drawSidebar();
      main.replaceChildren(editor);
    }

    async function newPage(colId) {
      const page = await jsonApi('POST', `collections/${colId}/pages`, { title: 'Untitled', content: '' });
      pagesByCol.set(colId, [
        { id: page.id, title: page.title, updated: page.updated },
        ...(pagesByCol.get(colId) || []),
      ]);
      expanded.add(colId);
      current = page;
      drawSidebar();
      await openPage(page.id);
      requestAnimationFrame(() => source.focus());
    }

    async function newCollection() {
      await flushSave();
      const name = await promptTitle('Name your collection', '');
      if (name == null) return; // cancelled — nothing created
      const col = await jsonApi('POST', 'collections', { name: name || 'New collection' });
      collections = [{ id: col.id, name: col.name, updated: col.updated, pageCount: 0 }, ...collections];
      pagesByCol.set(col.id, []);
      expanded.add(col.id);
      current = null;
      drawSidebar();
      showPlaceholder();
    }

    async function deleteCollection(id) {
      const col = collections.find((c) => c.id === id);
      if (!(await confirmDialog(`Delete "${col?.name || 'this collection'}" and all its pages?`))) return;
      await flushSave();
      if (!pagesByCol.has(id)) await loadPages(id);
      // Capture full pages (with content) so the delete can be undone.
      const snapshot = await Promise.all(
        (pagesByCol.get(id) || []).map((p) => getApi(`pages/${p.id}`).catch(() => null)),
      );
      await jsonApi('DELETE', `collections/${id}`);
      collections = collections.filter((c) => c.id !== id);
      pagesByCol.delete(id);
      expanded.delete(id);
      if (current?.collectionId === id) current = null;
      drawSidebar();
      if (current) main.replaceChildren(editor);
      else if (collections.length) showPlaceholder();
      else showEmpty();
      showUndo(`Deleted "${col?.name || 'collection'}"`, async () => {
        const newCol = await jsonApi('POST', 'collections', { name: col?.name || 'Untitled collection' });
        // Recreate pages oldest-first so their original order is preserved.
        for (const page of [...snapshot].reverse()) {
          if (page)
            await jsonApi('POST', `collections/${newCol.id}/pages`, { title: page.title, content: page.content });
        }
        await loadCollections();
      });
    }

    function showEmpty() {
      const wrap = el('div', 'doc-empty');
      wrap.append(el('p', 'placeholder-lead', 'No collections yet. Create one for a book or topic.'));
      const create = el('button', 'button-primary', 'New collection');
      create.addEventListener('click', newCollection);
      wrap.append(create);
      main.replaceChildren(wrap);
    }

    function showPlaceholder() {
      const wrap = el('div', 'doc-empty');
      wrap.append(el('p', 'placeholder-lead', 'Open a page from the sidebar, or add one to a collection.'));
      main.replaceChildren(wrap);
    }

    async function loadCollections() {
      try {
        collections = (await getApi('collections')).collections || [];
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', err.message));
        return;
      }
      if (pendingNewCollection) {
        pendingNewCollection = false;
        await newCollection();
        return;
      }
      if (!collections.length) {
        drawSidebar();
        showEmpty();
        return;
      }
      // Open the requested (or most-recent) collection: expand it and open its
      // first page so the editor isn't empty on first open.
      let openCol = pendingCollectionId;
      pendingCollectionId = null;
      if (!openCol || !collections.some((c) => c.id === openCol)) openCol = collections[0].id;
      expanded.add(openCol);
      await loadPages(openCol);
      drawSidebar();
      const first = (pagesByCol.get(openCol) || [])[0];
      if (first) await openPage(first.id);
      else showPlaceholder();
    }

    loadCollections();

    // Teardown when the window closes: stop the observer and any pending timers
    // so they don't fire against a detached editor on the next open.
    return () => {
      ro.disconnect();
      clearTimeout(saveTimer);
      clearTimeout(previewTimer);
      clearTimeout(undoTimer);
    };
  },
};
