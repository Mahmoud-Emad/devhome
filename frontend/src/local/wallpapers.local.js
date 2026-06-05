// Local handlers for custom wallpapers.
import { register } from '../lib/localRouter.js';
import { dataStore as db } from '../lib/dataStore.js';
import { imageMime } from '../lib/fileType.js';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const blobKey = (id) => `wp:${id}`;

register('GET', 'wallpapers', async () => {
  const list = (await db.list('wallpapers')).sort((a, b) => (b.added || 0) - (a.added || 0));
  return { wallpapers: list.map(({ id, name }) => ({ id, name })) };
});

register('POST', 'wallpapers', async ({ form }) => {
  const file = form.get('file');
  if (!file) throw new Error('The file is empty.');
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) throw new Error('Image is larger than the 25 MB limit.');
  if (!imageMime(buffer)) throw new Error("That file isn't a supported image (JPG, PNG, WebP, AVIF, GIF).");
  const name = (form.get('name') || '').trim() || (file.name || 'Custom').replace(/\.[^.]+$/, '');
  const wallpaper = await db.put('wallpapers', { name, added: Date.now() });
  await db.putBlob(blobKey(wallpaper.id), file);
  return { id: wallpaper.id, name: wallpaper.name };
});

register('FILE', 'wallpapers/:id/file', async ({ params }) => {
  const url = await db.blobUrl(blobKey(params.id));
  if (!url) throw new Error('Wallpaper not found.');
  return url;
});

register('DELETE', 'wallpapers/:id', async ({ params }) => {
  await db.remove('wallpapers', params.id);
  await db.delBlob(blobKey(params.id));
  return { ok: true };
});
