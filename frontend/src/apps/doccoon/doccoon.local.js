// Local handlers for doccoon notes.
import { register } from '../../lib/localRouter.js';
import { dataStore as db } from '../../lib/dataStore.js';

const MAX_CHARS = 50000;
const summary = ({ id, title, updated }) => ({ id, title, updated });
const guardSize = (content) => {
  if ((content || '').length > MAX_CHARS)
    throw new Error(`Note exceeds the ${MAX_CHARS.toLocaleString()} character limit.`);
};

register('GET', 'notes', async () => {
  const notes = (await db.list('notes')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return { notes: notes.map(summary) };
});

register('GET', 'notes/:id', async ({ params }) => {
  const note = await db.get('notes', params.id);
  if (!note) throw new Error('Note not found.');
  return note;
});

register('POST', 'notes', async ({ body }) => {
  guardSize(body.content);
  return db.put('notes', { title: body.title || 'Untitled', content: body.content || '', updated: Date.now() });
});

register('PATCH', 'notes/:id', async ({ params, body }) => {
  if (body.content != null) guardSize(body.content);
  const patch = { updated: Date.now() };
  if (body.title != null) patch.title = body.title;
  if (body.content != null) patch.content = body.content;
  const note = await db.patch('notes', params.id, patch);
  if (!note) throw new Error('Note not found.');
  return note;
});

register('DELETE', 'notes/:id', async ({ params }) => {
  await db.remove('notes', params.id);
  return { ok: true };
});
