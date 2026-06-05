// doccoon — markdown notes, Notion-style. A sidebar of notes + an editor with an
// optional live preview, auto-saving locally. Note CRUD lives in doccoon.local.js
// (IndexedDB); markdown is rendered client-side for an instant preview.

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
  javascript, typescript, python, rust, bash, json, xml, css, go, sql, yaml, markdown: mdlang, c, cpp, java,
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

// Cap note size so rendering/highlighting stays fast.
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

// Below this layout width the sidebar collapses to an overlay and the editor
// drops the split preview (no room for two panes).
const NARROW = 640;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export default {
  id: 'doccoon',
  name: 'Books & Notes',
  description: 'Write Markdown notes',
  accent: '#a78bfa',
  order: 5,
  dialog: { size: 'xl' },

  render(body) {
    let notes = [];
    let current = null;
    let view = 'split'; // 'split' | 'edit'
    let userView = 'split'; // the view to restore when there's room again
    let narrow = false;
    let saveTimer = null;

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
    burger.title = 'Toggle notes';
    burger.setAttribute('aria-label', 'Toggle notes');
    burger.innerHTML = BURGER;
    burger.addEventListener('click', toggleSidebar);
    const viewToggle = el('div', 'tabs doc-view-toggle');
    const editTab = el('button', 'tab', 'Edit');
    const splitTab = el('button', 'tab', 'Split');
    viewToggle.append(editTab, splitTab);
    const status = el('span', 'doc-status');
    const count = el('span', 'doc-count');
    const del = el('button', 'icon-button doc-delete');
    del.title = 'Delete note';
    del.setAttribute('aria-label', 'Delete note');
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
    // Debounced so we don't re-parse + re-highlight the whole note on every keystroke.
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
        const updated = await jsonApi('PATCH', `notes/${current.id}`, {
          title: titleInput.value,
          content: source.value,
        });
        current = { ...current, ...updated };
        // Keep the in-memory list in sync so re-rendering the sidebar (e.g. when
        // switching notes) doesn't revert the title to its stale value.
        const entry = notes.find((n) => n.id === current.id);
        if (entry) {
          entry.title = current.title;
          entry.updated = current.updated;
        }
        const item = sidebar.querySelector(`[data-id="${current.id}"] .doc-note-title`);
        if (item) item.textContent = current.title || 'Untitled';
        status.textContent = 'Saved';
      } catch (err) {
        status.textContent = err.message;
      }
    }

    // Persist any pending (debounced) edit immediately — e.g. before switching
    // notes, so a fast switch never drops an unsaved title/body.
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
      await jsonApi('DELETE', `notes/${current.id}`);
      current = null;
      await loadList();
    });

    // --- sidebar + data ---
    function drawSidebar() {
      const head = el('div', 'doc-sidebar-head');
      head.append(el('span', 'doc-sidebar-title', 'Notes'));
      const add = el('button', 'icon-button doc-new');
      add.title = 'New note';
      add.setAttribute('aria-label', 'New note');
      add.innerHTML = PLUS;
      add.addEventListener('click', newNote);
      head.append(add);

      const list = el('div', 'doc-note-list');
      for (const note of notes) {
        const item = el('div', 'doc-note-item' + (note.id === current?.id ? ' is-active' : ''));
        item.dataset.id = note.id;

        const open = el('button', 'doc-note-open');
        open.append(el('span', 'doc-note-title', note.title || 'Untitled'));
        open.addEventListener('click', () => {
          openNote(note.id);
          if (narrow) layout.classList.add('collapsed');
        });

        const dl = el('button', 'icon-button doc-note-dl');
        dl.title = 'Download as Markdown';
        dl.setAttribute('aria-label', 'Download as Markdown');
        dl.innerHTML = DOWNLOAD;
        dl.addEventListener('click', (e) => {
          e.stopPropagation();
          downloadNote(note.id);
        });

        item.append(open, dl);
        list.append(item);
      }
      sidebar.replaceChildren(head, list);
    }

    // Download a note as a .md file. Uses the live editor value for the open
    // note (so unsaved edits are included), else fetches the stored note.
    async function downloadNote(id) {
      let title;
      let content;
      if (current && current.id === id) {
        title = titleInput.value.trim() || 'Untitled';
        content = source.value;
      } else {
        try {
          const note = await getApi(`notes/${id}`);
          title = note.title;
          content = note.content || '';
        } catch (err) {
          status.textContent = err.message;
          return;
        }
      }
      const heading = title && title !== 'Untitled' ? `# ${title}\n\n` : '';
      const safe = (title || 'note').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'note';
      const url = URL.createObjectURL(new Blob([heading + content], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }

    async function loadList() {
      try {
        notes = (await getApi('notes')).notes || [];
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', err.message));
        return;
      }
      if (current && !notes.some((n) => n.id === current.id)) current = null;
      drawSidebar();
      if (!notes.length) {
        showEmpty();
      } else if (!current) {
        openNote(notes[0].id);
      } else {
        main.replaceChildren(editor);
      }
    }

    async function openNote(id) {
      await flushSave(); // don't lose unsaved edits on the note we're leaving
      try {
        current = await getApi(`notes/${id}`);
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

    async function newNote() {
      const note = await jsonApi('POST', 'notes', { title: 'Untitled', content: '' });
      current = note;
      notes = [{ id: note.id, title: note.title, updated: note.updated }, ...notes];
      drawSidebar();
      await openNote(note.id);
      requestAnimationFrame(() => titleInput.focus());
    }

    function showEmpty() {
      const wrap = el('div', 'doc-empty');
      wrap.append(el('p', 'placeholder-lead', 'No notes yet. Start your first one.'));
      const create = el('button', 'button-primary', 'New note');
      create.addEventListener('click', newNote);
      wrap.append(create);
      main.replaceChildren(wrap);
    }

    loadList();
  },
};
