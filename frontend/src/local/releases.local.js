// Local handler for release notes — pulled from the GitHub Releases API so the
// changelog updates without shipping new code. Cached for 6h; on a network error
// we fall back to the last cached copy. Sources are fetched directly (MV3
// host_permissions bypass CORS).
import { register } from '../lib/localRouter.js';
import { dataStore as db } from '../lib/dataStore.js';

const REPO = 'Mahmoud-Emad/devhome';
const TTL = 6 * 60 * 60 * 1000;
const CACHE = 'releases:cache';

const normalize = (list) =>
  list
    .filter((r) => !r.draft)
    .map((r) => ({
      version: (r.tag_name || '').replace(/^v/, ''),
      name: r.name || r.tag_name || '',
      date: r.published_at ? r.published_at.slice(0, 10) : '',
      body: r.body || '',
      url: r.html_url || '',
    }));

register('GET', 'releases', async () => {
  const cache = await db.kv.get(CACHE);
  if (cache?.releases && Date.now() - cache.at < TTL) return { releases: cache.releases };
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const releases = normalize(await res.json());
    await db.kv.set(CACHE, { at: Date.now(), releases });
    return { releases };
  } catch (err) {
    if (cache?.releases) return { releases: cache.releases };
    throw err;
  }
});
