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

const CHEVRON = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6"></path>
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

// Set by the home widget so the next open jumps to a collection / starts a new one.
let pendingCollectionId = null;
let pendingNewCollection = false;

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
    let renameTimer = null;

    const layout = el('div', 'doc-layout');
    const sidebar = el('aside', 'doc-sidebar');
    const main = el('div', 'doc-main');
    layout.append(sidebar, main);
    body.replaceChildren(layout);

    const toggleSidebar = () => layout.classList.toggle('collapsed');

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
    viewToggle.append(editTab, splitTab);
    const status = el('span', 'doc-status');
    const count = el('span', 'doc-count');
    const del = el('button', 'icon-button doc-delete');
    del.title = 'Delete page';
    del.setAttribute('aria-label', 'Delete page');
    del.innerHTML = TRASH;
    toolbar.append(burger, viewToggle, status, count, del);

    const titleInput = el('input', 'doc-title');
    titleInput.placeholder = 'Untitled';

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

    editor.append(toolbar, titleInput, area);

    function setView(next) {
      view = next;
      editor.dataset.view = view;
      editTab.classList.toggle('is-active', view === 'edit');
      splitTab.classList.toggle('is-active', view === 'split');
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
        setView('edit');
      } else {
        layout.classList.remove('collapsed');
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
      if (view !== 'split') return; // preview is hidden in edit mode — don't parse
      preview.innerHTML = marked.parse(source.value || '*Nothing to preview yet.*');
      preview.querySelectorAll('a').forEach((a) => {
        const href = a.getAttribute('href') || '';
        // A bare domain like "google.com" has no scheme, so the browser treats
        // it as relative. Send schemeless links to https:// instead.
        if (href && !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(href)) {
          a.setAttribute('href', `https://${href}`);
        }
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
    };
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
      try {
        const updated = await jsonApi('PATCH', `pages/${current.id}`, {
          title: titleInput.value,
          content: source.value,
        });
        current = { ...current, ...updated };
        // Keep the cached page list in sync so re-rendering the sidebar doesn't
        // revert the title to its stale value.
        const entry = pagesByCol.get(current.collectionId)?.find((p) => p.id === current.id);
        if (entry) {
          entry.title = current.title;
          entry.updated = current.updated;
        }
        const item = sidebar.querySelector(`.doc-page-item[data-id="${current.id}"] .doc-page-title`);
        if (item) item.textContent = current.title || 'Untitled';
        status.textContent = 'Saved';
      } catch (err) {
        status.textContent = err.message;
      }
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

    titleInput.addEventListener('input', scheduleSave);
    source.addEventListener('input', () => {
      updateCount();
      schedulePreview();
      scheduleSave();
    });

    del.addEventListener('click', async () => {
      if (!current) return;
      const colId = current.collectionId;
      const snapshot = { title: titleInput.value, content: source.value };
      await jsonApi('DELETE', `pages/${current.id}`);
      const remaining = (pagesByCol.get(colId) || []).filter((p) => p.id !== current.id);
      pagesByCol.set(colId, remaining);
      current = null;
      drawSidebar();
      if (remaining.length) await openPage(remaining[0].id);
      else showPlaceholder();
      showUndo('Page deleted', async () => {
        const restored = await jsonApi('POST', `collections/${colId}/pages`, snapshot);
        pagesByCol.set(colId, [
          { id: restored.id, title: restored.title, updated: restored.updated },
          ...(pagesByCol.get(colId) || []),
        ]);
        expanded.add(colId);
        await openPage(restored.id);
      });
    });

    // --- sidebar (a tree of collections → pages) ---
    function pageRow(page) {
      const item = el('div', 'doc-page-item' + (page.id === current?.id ? ' is-active' : ''));
      item.dataset.id = page.id;

      const open = el('button', 'doc-page-open');
      open.append(el('span', 'doc-page-title', page.title || 'Untitled'));
      open.addEventListener('click', () => {
        openPage(page.id);
        if (narrow) layout.classList.add('collapsed');
      });

      const dl = el('button', 'icon-button doc-page-dl');
      dl.title = 'Download as Markdown';
      dl.setAttribute('aria-label', 'Download as Markdown');
      dl.innerHTML = DOWNLOAD;
      dl.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadPage(page.id);
      });

      item.append(open, dl);
      return item;
    }

    function collectionEl(col) {
      const isOpen = expanded.has(col.id);
      const hasCurrent = current?.collectionId === col.id;
      const colEl = el('div', 'doc-collection' + (isOpen ? ' is-expanded' : '') + (hasCurrent ? ' is-active' : ''));

      const row = el('div', 'doc-collection-row');
      const chevron = el('button', 'icon-button doc-collection-chevron');
      chevron.innerHTML = CHEVRON;
      chevron.title = isOpen ? 'Collapse' : 'Expand';
      chevron.setAttribute('aria-label', chevron.title);
      chevron.addEventListener('click', () => toggleExpand(col.id));

      const icon = el('span', 'doc-collection-icon');
      icon.innerHTML = FOLDER;
      const pageCount = pagesByCol.get(col.id)?.length ?? col.pageCount;
      const countEl = el('span', 'doc-collection-count', String(pageCount));

      if (isOpen) {
        // The expanded collection's name is editable inline.
        const name = el('input', 'doc-collection-rename');
        name.value = col.name || '';
        name.placeholder = 'Collection name';
        name.addEventListener('input', () => scheduleRename(col.id, name.value));
        const dlCol = el('button', 'icon-button doc-collection-dl');
        dlCol.title = 'Download collection (.zip)';
        dlCol.setAttribute('aria-label', 'Download collection');
        dlCol.innerHTML = DOWNLOAD;
        dlCol.addEventListener('click', (e) => {
          e.stopPropagation();
          downloadCollection(col.id);
        });
        const remove = el('button', 'icon-button doc-collection-del');
        remove.title = 'Delete collection';
        remove.setAttribute('aria-label', 'Delete collection');
        remove.innerHTML = TRASH;
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCollection(col.id);
        });
        row.append(chevron, icon, name, countEl, dlCol, remove);
      } else {
        const open = el('button', 'doc-collection-open');
        open.append(icon, el('span', 'doc-collection-name', col.name || 'Untitled'), countEl);
        open.addEventListener('click', () => toggleExpand(col.id));
        row.append(chevron, open);
      }
      colEl.append(row);

      if (isOpen) {
        const pagesList = el('div', 'doc-page-list');
        for (const page of pagesByCol.get(col.id) || []) pagesList.append(pageRow(page));
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

    function scheduleRename(id, name) {
      const col = collections.find((c) => c.id === id);
      if (col) col.name = name; // keep in-memory in sync without a redraw
      clearTimeout(renameTimer);
      renameTimer = setTimeout(() => {
        jsonApi('PATCH', `collections/${id}`, { name }).catch(() => {});
      }, 500);
    }

    // Download a page as a .md file. Uses the live editor value for the open page
    // (so unsaved edits are included), else fetches the stored page.
    async function downloadPage(id) {
      let title;
      let content;
      if (current && current.id === id) {
        title = titleInput.value.trim() || 'Untitled';
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
            ? { title: titleInput.value.trim() || 'Untitled', content: source.value }
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
      titleInput.value = current.title === 'Untitled' ? '' : current.title;
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
      requestAnimationFrame(() => titleInput.focus());
    }

    async function newCollection() {
      await flushSave();
      const col = await jsonApi('POST', 'collections', { name: 'New collection' });
      collections = [{ id: col.id, name: col.name, updated: col.updated, pageCount: 0 }, ...collections];
      pagesByCol.set(col.id, []);
      expanded.add(col.id);
      current = null;
      drawSidebar();
      showPlaceholder();
      // Focus the name so the user can title it (e.g. the book) straight away.
      requestAnimationFrame(() => {
        const input = sidebar.querySelector('.doc-collection.is-expanded .doc-collection-rename');
        if (input) {
          input.focus();
          input.select();
        }
      });
    }

    async function deleteCollection(id) {
      const col = collections.find((c) => c.id === id);
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
  },
};
