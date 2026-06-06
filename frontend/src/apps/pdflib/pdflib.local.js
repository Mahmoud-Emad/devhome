// Local handlers for PDF Library: book CRUD, annotations, and PDF blobs.
// Import-by-URL fetches the PDF client side — MV3 host_permissions let the
// extension bypass CORS.
import { register } from '../../lib/localRouter.js';
import { dataStore as db } from '../../lib/dataStore.js';
import { isPdf } from '../../lib/fileType.js';

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const blobKey = (id) => `pdf:${id}`;

// Unread first, then newest.
const byReadThenNew = (a, b) => (a.read === b.read ? (b.added || 0) - (a.added || 0) : a.read ? 1 : -1);

register('GET', 'books', async () => ({ books: (await db.list('books')).sort(byReadThenNew) }));

register('GET', 'books/last-read', async () => {
  const read = (await db.list('books')).filter((b) => b.lastReadAt).sort((a, b) => b.lastReadAt - a.lastReadAt);
  return { book: read[0] || null };
});

register('POST', 'books', async ({ body }) => {
  const url = (body.url || '').trim();
  if (!url) throw new Error('A URL is required.');
  let buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buffer = await res.arrayBuffer();
  } catch (err) {
    throw new Error(`Couldn't download that PDF: ${err.message || err}`);
  }
  if (buffer.byteLength > MAX_BYTES) throw new Error('File is larger than the 50 MB limit.');
  if (!isPdf(buffer)) throw new Error("That URL doesn't point to a PDF file.");
  const title = (body.title || '').trim() || url.split('/').pop() || 'Untitled';
  const book = await db.put('books', { title, url, source: 'url', read: false, added: Date.now(), lastPage: 1 });
  await db.putBlob(blobKey(book.id), new Blob([buffer], { type: 'application/pdf' }));
  return book;
});

register('POST', 'books/upload', async ({ form }) => {
  const file = form.get('file');
  if (!file) throw new Error('The file is empty.');
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) throw new Error('File is larger than the 50 MB limit.');
  if (!isPdf(buffer)) throw new Error("That file isn't a valid PDF.");
  const title = (form.get('title') || '').trim() || (file.name || 'Untitled').replace(/\.[^.]+$/, '');
  const book = await db.put('books', { title, url: '', source: 'file', read: false, added: Date.now(), lastPage: 1 });
  await db.putBlob(blobKey(book.id), file);
  return book;
});

register('FILE', 'books/:id/file', async ({ params }) => {
  const url = await db.blobUrl(blobKey(params.id));
  if (!url) throw new Error('File not found.');
  return url;
});

register('PATCH', 'books/:id', async ({ params, body }) => {
  const patch = {};
  if (body.title != null && body.title.trim()) patch.title = body.title.trim();
  if (body.read != null) patch.read = body.read;
  if (body.zoom != null) patch.zoom = body.zoom; // remembered per book
  if (body.lastPage != null) {
    patch.lastPage = Math.max(1, body.lastPage);
    patch.lastReadAt = Date.now(); // reading activity → "last read"
  }
  const book = await db.patch('books', params.id, patch);
  if (!book) throw new Error('Book not found.');
  return book;
});

register('DELETE', 'books/:id', async ({ params }) => {
  await db.remove('books', params.id);
  await db.delBlob(blobKey(params.id));
  const orphans = (await db.list('annotations')).filter((a) => a.bookId === params.id);
  await Promise.all(orphans.map((a) => db.remove('annotations', a.id)));
  return { ok: true };
});

// --- annotations (highlights + comments) ---
const publicAnnot = ({ bookId, ...rest }) => rest; // bookId is internal

register('GET', 'books/:id/annotations', async ({ params }) => {
  const list = (await db.list('annotations'))
    .filter((a) => a.bookId === params.id)
    .sort((a, b) => (a.created || 0) - (b.created || 0));
  return { annotations: list.map(publicAnnot) };
});

register('POST', 'books/:id/annotations', async ({ params, body }) => {
  const annot = await db.put('annotations', {
    bookId: params.id,
    page: body.page,
    rects: body.rects,
    text: body.text || '',
    color: body.color || 'yellow',
    comment: (body.comment || '').trim(),
    created: Date.now(),
  });
  return publicAnnot(annot);
});

register('PATCH', 'books/:id/annotations/:aid', async ({ params, body }) => {
  const patch = {};
  if (body.color != null) patch.color = body.color;
  if (body.comment != null) patch.comment = body.comment.trim();
  const annot = await db.patch('annotations', params.aid, patch);
  if (!annot) throw new Error('Annotation not found.');
  return publicAnnot(annot);
});

register('DELETE', 'books/:id/annotations/:aid', async ({ params }) => {
  await db.remove('annotations', params.aid);
  return { ok: true };
});
