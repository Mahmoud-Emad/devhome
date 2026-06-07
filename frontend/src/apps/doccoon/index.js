// doccoon — markdown notes, Notion-style. Notes are organized into collections
// (a notebook, e.g. per book), each holding one or more Markdown pages. A sidebar
// lists collections (the active one expands to its pages) next to an editor with
// an optional live preview. CRUD lives in doccoon.local.js (IndexedDB).

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
    let pages = []; // pages of the active collection [{ id, title, updated }]
    let activeColId = null;
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
        // Keep the in-memory page list in sync so re-rendering the sidebar doesn't
        // revert the title to its stale value.
        const entry = pages.find((p) => p.id === current.id);
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
      await jsonApi('DELETE', `pages/${current.id}`);
      current = null;
      await loadPages();
    });

    // --- sidebar (collections → the active collection's pages) ---
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
      for (const col of collections) {
        const isActive = col.id === activeColId;
        const colEl = el('div', 'doc-collection' + (isActive ? ' is-active' : ''));

        const row = el('div', 'doc-collection-row');
        const icon = el('span', 'doc-collection-icon');
        icon.innerHTML = FOLDER;
        const pageCount = isActive ? pages.length : col.pageCount;

        if (isActive) {
          // The active collection's name is editable inline.
          const name = el('input', 'doc-collection-rename');
          name.value = col.name || '';
          name.placeholder = 'Collection name';
          name.addEventListener('input', () => scheduleRename(col.id, name.value));
          const remove = el('button', 'icon-button doc-collection-del');
          remove.title = 'Delete collection';
          remove.setAttribute('aria-label', 'Delete collection');
          remove.innerHTML = TRASH;
          remove.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCollection(col.id);
          });
          row.append(icon, name, el('span', 'doc-collection-count', String(pageCount)), remove);
        } else {
          const open = el('button', 'doc-collection-open');
          open.append(icon, el('span', 'doc-collection-name', col.name || 'Untitled'));
          open.append(el('span', 'doc-collection-count', String(pageCount)));
          open.addEventListener('click', () => selectCollection(col.id));
          row.append(open);
        }
        colEl.append(row);

        if (isActive) {
          const pagesList = el('div', 'doc-page-list');
          for (const page of pages) {
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
            pagesList.append(item);
          }
          const addPage = el('button', 'doc-add-page');
          addPage.innerHTML = `${PLUS}<span>New page</span>`;
          addPage.addEventListener('click', newPage);
          pagesList.append(addPage);
          colEl.append(pagesList);
        }
        list.append(colEl);
      }
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
      const safe = (title || 'page').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'page';
      const url = URL.createObjectURL(new Blob([heading + content], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // --- data ---
    async function loadCollections() {
      try {
        collections = (await getApi('collections')).collections || [];
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', err.message));
        return;
      }
      // Coming from the home widget.
      if (pendingNewCollection) {
        pendingNewCollection = false;
        await newCollection();
        return;
      }
      if (pendingCollectionId) {
        const id = pendingCollectionId;
        pendingCollectionId = null;
        if (collections.some((c) => c.id === id)) activeColId = id;
      }

      if (!collections.length) {
        activeColId = null;
        pages = [];
        current = null;
        drawSidebar();
        showEmpty();
        return;
      }
      if (!activeColId || !collections.some((c) => c.id === activeColId)) activeColId = collections[0].id;
      await loadPages();
    }

    async function loadPages() {
      try {
        pages = (await getApi(`collections/${activeColId}/pages`)).pages || [];
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', err.message));
        return;
      }
      if (current && !pages.some((p) => p.id === current.id)) current = null;
      drawSidebar();
      if (!pages.length) {
        current = null;
        showEmptyPages();
      } else if (!current) {
        await openPage(pages[0].id);
      } else {
        main.replaceChildren(editor);
      }
    }

    async function openPage(id) {
      await flushSave(); // don't lose unsaved edits on the page we're leaving
      try {
        current = await getApi(`pages/${id}`);
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', err.message));
        return;
      }
      titleInput.value = current.title === 'Untitled' ? '' : current.title;
      source.value = current.content || '';
      updateCount();
      renderPreview();
      status.textContent = '';
      drawSidebar();
      main.replaceChildren(editor);
    }

    async function newPage() {
      const page = await jsonApi('POST', `collections/${activeColId}/pages`, { title: 'Untitled', content: '' });
      current = page;
      pages = [{ id: page.id, title: page.title, updated: page.updated }, ...pages];
      drawSidebar();
      await openPage(page.id);
      requestAnimationFrame(() => titleInput.focus());
    }

    async function newCollection() {
      await flushSave();
      const col = await jsonApi('POST', 'collections', { name: 'New collection' });
      collections = [{ id: col.id, name: col.name, updated: col.updated, pageCount: 0 }, ...collections];
      activeColId = col.id;
      pages = [];
      current = null;
      drawSidebar();
      showEmptyPages();
      // Focus the name so the user can title it (e.g. the book) straight away.
      requestAnimationFrame(() => {
        const input = sidebar.querySelector('.doc-collection.is-active .doc-collection-rename');
        if (input) {
          input.focus();
          input.select();
        }
      });
    }

    async function selectCollection(id) {
      if (id === activeColId) return;
      await flushSave();
      activeColId = id;
      current = null;
      await loadPages();
    }

    async function deleteCollection(id) {
      await jsonApi('DELETE', `collections/${id}`);
      if (activeColId === id) {
        activeColId = null;
        current = null;
      }
      await loadCollections();
    }

    function showEmpty() {
      const wrap = el('div', 'doc-empty');
      wrap.append(el('p', 'placeholder-lead', 'No collections yet. Create one for a book or topic.'));
      const create = el('button', 'button-primary', 'New collection');
      create.addEventListener('click', newCollection);
      wrap.append(create);
      main.replaceChildren(wrap);
    }

    function showEmptyPages() {
      const wrap = el('div', 'doc-empty');
      wrap.append(el('p', 'placeholder-lead', 'No pages yet in this collection.'));
      const create = el('button', 'button-primary', 'New page');
      create.addEventListener('click', newPage);
      wrap.append(create);
      main.replaceChildren(wrap);
    }

    loadCollections();
  },
};
