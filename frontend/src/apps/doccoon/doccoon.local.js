// Local handlers for doccoon. Notes are organized as collections (a notebook,
// e.g. per book) each holding one or more Markdown pages. A collection's
// `updated` is bumped whenever one of its pages changes, so "recent" sorting
// reflects activity.

import { register } from '../../lib/localRouter.js';
import { dataStore as db } from '../../lib/dataStore.js';

const MAX_CHARS = 50000;
const guardSize = (content) => {
  if ((content || '').length > MAX_CHARS)
    throw new Error(`Page exceeds the ${MAX_CHARS.toLocaleString()} character limit.`);
};

const touchCollection = (id) => db.patch('collections', id, { updated: Date.now() });

// One-time migration: the old flat `notes` become pages in a "My Notes" collection.
async function migrate() {
  if (await db.kv.get('doccoon:migrated')) return;
  const legacy = await db.list('notes');
  if (legacy.length) {
    const col = await db.put('collections', { name: 'My Notes', updated: Date.now() });
    for (const note of legacy.sort((a, b) => (a.updated || 0) - (b.updated || 0))) {
      await db.put('pages', {
        collectionId: col.id,
        title: note.title || 'Untitled',
        content: note.content || '',
        updated: note.updated || Date.now(),
      });
      await db.remove('notes', note.id);
    }
  }
  await db.kv.set('doccoon:migrated', true);
}

// --- collections ---
register('GET', 'collections', async () => {
  await migrate();
  const collections = (await db.list('collections')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const pages = await db.list('pages');
  const counts = pages.reduce((m, p) => ((m[p.collectionId] = (m[p.collectionId] || 0) + 1), m), {});
  return {
    collections: collections.map((c) => ({ id: c.id, name: c.name, updated: c.updated, pageCount: counts[c.id] || 0 })),
  };
});

register('POST', 'collections', async ({ body }) => {
  await migrate();
  return db.put('collections', { name: (body?.name || '').trim() || 'New collection', updated: Date.now() });
});

register('PATCH', 'collections/:id', async ({ params, body }) => {
  const patch = { updated: Date.now() };
  if (body.name != null) patch.name = body.name.trim() || 'Untitled collection';
  const collection = await db.patch('collections', params.id, patch);
  if (!collection) throw new Error('Collection not found.');
  return collection;
});

register('DELETE', 'collections/:id', async ({ params }) => {
  const pages = (await db.list('pages')).filter((p) => p.collectionId === params.id);
  for (const page of pages) await db.remove('pages', page.id);
  await db.remove('collections', params.id);
  return { ok: true };
});

// --- pages (within a collection) ---
register('GET', 'collections/:id/pages', async ({ params }) => {
  await migrate();
  const pages = (await db.list('pages'))
    .filter((p) => p.collectionId === params.id)
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return { pages: pages.map(({ id, title, updated }) => ({ id, title, updated })) };
});

register('POST', 'collections/:id/pages', async ({ params, body }) => {
  guardSize(body?.content);
  const page = await db.put('pages', {
    collectionId: params.id,
    title: body?.title || 'Untitled',
    content: body?.content || '',
    updated: Date.now(),
  });
  await touchCollection(params.id);
  return page;
});

register('GET', 'pages/:id', async ({ params }) => {
  const page = await db.get('pages', params.id);
  if (!page) throw new Error('Page not found.');
  return page;
});

register('PATCH', 'pages/:id', async ({ params, body }) => {
  if (body.content != null) guardSize(body.content);
  const patch = { updated: Date.now() };
  if (body.title != null) patch.title = body.title;
  if (body.content != null) patch.content = body.content;
  const page = await db.patch('pages', params.id, patch);
  if (!page) throw new Error('Page not found.');
  await touchCollection(page.collectionId);
  return page;
});

register('DELETE', 'pages/:id', async ({ params }) => {
  const page = await db.get('pages', params.id);
  await db.remove('pages', params.id);
  if (page) await touchCollection(page.collectionId);
  return { ok: true };
});
