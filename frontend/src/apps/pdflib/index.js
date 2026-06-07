// PDF Library — a reading list with an in-app reader. Books, PDF blobs and
// last-page memory are stored locally (IndexedDB via pdflib.local.js). The
// reader (PDF.js) is a lazily-imported module so it isn't in the main bundle.

import { getApi, jsonApi, callApi } from '../../lib/api.js';
import { confirmDialog } from '../../components/confirm.js';

const TRASH = `
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 6h18"></path>
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
  </svg>`;

const DOC = `
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path>
    <path d="M14 3v5h5"></path>
    <path d="M9 13h6M9 17h4"></path>
  </svg>`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function host(url) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

// Set by the home "Continue reading" card so the next render opens that book
// straight into the reader instead of the list.
let pendingBookId = null;

const app = {
  id: 'pdflib',
  name: 'PDF Library',
  description: 'Read and annotate your PDFs',
  accent: '#38bdf8',
  order: 6,
  dialog: { size: 'lg' },

  async badge() {
    try {
      const { books } = await getApi('books');
      return (books || []).filter((b) => !b.read).length;
    } catch {
      return 0;
    }
  },

  // Home card: resume the most recently read book.
  async widget(ctx) {
    let book;
    try {
      book = (await getApi('books/last-read')).book;
    } catch {
      return null;
    }
    if (!book) return null;

    const resume = () => {
      pendingBookId = book.id;
      ctx.openApp('pdflib');
    };

    const card = el('div', 'widget-card');
    card.style.setProperty('--accent', '#38bdf8');

    const head = el('button', 'widget-head');
    head.append(
      el('span', 'widget-title', 'Continue reading'),
      el('span', 'widget-count', `Page ${book.lastPage || 1}`),
    );
    head.addEventListener('click', resume);

    const titleBtn = el('button', 'widget-book');
    titleBtn.textContent = book.title;
    titleBtn.title = `Resume “${book.title}”`;
    titleBtn.addEventListener('click', resume);

    card.append(head, titleBtn);
    return card;
  },

  render(body) {
    const root = el('div', 'app-flow');
    body.replaceChildren(root);

    let books = [];
    let filter = 'all';

    const load = async () => {
      try {
        books = (await getApi('books')).books || [];
      } catch (err) {
        root.replaceChildren(el('p', 'app-error', err.message));
        return;
      }
      // Coming from the home "Continue reading" card → open that book directly.
      if (pendingBookId) {
        const book = books.find((b) => b.id === pendingBookId);
        pendingBookId = null;
        if (book) {
          openReader(book);
          return;
        }
      }
      showList();
    };

    const openReader = async (book) => {
      root.replaceChildren(el('p', 'pdf-loading', 'Loading reader…'));
      try {
        const { createReader } = await import('./reader.js');
        let reader;
        reader = createReader({
          container: root,
          book,
          onBack: () => {
            reader?.destroy?.();
            load();
          },
        });
      } catch (err) {
        root.replaceChildren(el('p', 'app-error', `Couldn't load the reader: ${err.message || err}`));
      }
    };

    function showList() {
      const wrap = el('div', 'pdf-listview');

      const header = el('div', 'pdf-header');
      header.append(el('h3', 'pdf-h-title', 'Reading list'));
      const unread = books.filter((b) => !b.read).length;
      header.append(el('span', 'pdf-count', unread ? `${unread} unread` : 'all read'));

      // Add: import by URL or upload a file.
      const form = el('form', 'pdf-add');
      const title = el('input', 'input');
      title.placeholder = 'Title (optional)';
      const row = el('div', 'pdf-add-row');
      const url = el('input', 'input');
      url.placeholder = 'Paste a PDF URL to import';
      const importBtn = el('button', 'button-primary');
      importBtn.type = 'submit';
      importBtn.textContent = 'Import';
      row.append(url, importBtn);
      form.append(title, row);

      const uploadRow = el('div', 'pdf-upload-row');
      const file = el('input');
      file.type = 'file';
      file.accept = 'application/pdf';
      file.hidden = true;
      const uploadBtn = el('button', 'button-secondary');
      uploadBtn.type = 'button';
      uploadBtn.textContent = 'Upload a PDF from your computer';
      uploadBtn.addEventListener('click', () => file.click());
      uploadRow.append(uploadBtn, file);

      const status = el('p', 'pdf-add-status');
      status.hidden = true;

      const busy = (msg) => {
        status.textContent = msg;
        status.classList.remove('is-error');
        status.hidden = false;
      };
      const fail = (msg) => {
        status.textContent = msg;
        status.classList.add('is-error');
        status.hidden = false;
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = url.value.trim();
        if (!u) return;
        busy('Importing…');
        try {
          const book = await jsonApi('POST', 'books', { title: title.value.trim(), url: u });
          openReader(book);
        } catch (err) {
          fail(err.message);
        }
      });
      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        if (!f) return;
        busy('Uploading…');
        try {
          const fd = new FormData();
          fd.append('file', f, f.name);
          fd.append('title', title.value.trim());
          const book = await callApi('books/upload', fd);
          openReader(book);
        } catch (err) {
          fail(err.message);
        }
        file.value = '';
      });

      // Filter
      const filterBar = el('div', 'tabs pdf-filter');
      for (const f of FILTERS) {
        const b = el('button', 'tab' + (filter === f.id ? ' is-active' : ''), f.label);
        b.addEventListener('click', () => {
          filter = f.id;
          showList();
        });
        filterBar.append(b);
      }

      // List
      const visible = books.filter(
        (b) => filter === 'all' || (filter === 'unread' && !b.read) || (filter === 'read' && b.read),
      );
      const list = el('ul', 'pdf-list');
      if (!visible.length) {
        list.append(
          el('li', 'pdf-empty', books.length ? 'Nothing here.' : 'No books yet. Import or upload one above.'),
        );
      } else {
        // In the All tab, mark where the read books begin (they sort last).
        const showDivider = filter === 'all' && visible.some((b) => !b.read) && visible.some((b) => b.read);
        let divided = false;
        visible.forEach((book) => {
          if (showDivider && book.read && !divided) {
            divided = true;
            const divider = el('li', 'pdf-divider');
            divider.append(el('span', null, 'Read'));
            list.append(divider);
          }
          list.append(bookRow(book));
        });
      }

      wrap.append(header, form, uploadRow, status, filterBar, list);
      root.replaceChildren(wrap);
    }

    function bookRow(book) {
      const item = el('li', 'pdf-item' + (book.read ? ' is-read' : ''));

      const cover = el('span', 'pdf-cover');
      cover.innerHTML = DOC;

      const open = el('button', 'pdf-open');
      open.append(el('span', 'pdf-title', book.title));
      const source = book.source === 'url' ? host(book.url) : 'Uploaded PDF';
      const sub = book.lastPage > 1 ? `${source} · Page ${book.lastPage}` : source;
      open.append(el('span', 'pdf-host', sub));
      open.addEventListener('click', () => openReader(book));

      const actions = el('div', 'pdf-row-actions');
      const check = el('input', 'pdf-check');
      check.type = 'checkbox';
      check.checked = book.read;
      check.title = book.read ? 'Mark unread' : 'Mark read';
      check.addEventListener('change', async () => {
        await jsonApi('PATCH', `books/${book.id}`, { read: check.checked });
        load();
      });

      const remove = el('button', 'icon-button pdf-action');
      remove.title = 'Remove';
      remove.setAttribute('aria-label', 'Remove');
      remove.innerHTML = TRASH;
      remove.addEventListener('click', async () => {
        if (!(await confirmDialog(`Remove “${book.title}” from your library?`))) return;
        await jsonApi('DELETE', `books/${book.id}`);
        load();
      });
      actions.append(check, remove);

      item.append(cover, open, actions);
      return item;
    }

    load();
  },
};

export default app;
