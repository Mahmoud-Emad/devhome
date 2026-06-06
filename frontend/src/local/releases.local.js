// Local handler for release notes — pulled from the GitHub Releases API so the
// changelog updates without shipping new code. Stale-while-revalidate:
//   GET releases?cached=1  → whatever is cached (instant, may be empty)
//   GET releases           → always fetches fresh, refreshes the cache, and
//                            falls back to the cache only if the network fails.
// So a newly published release shows up the next time the dialog is opened.
// Sources are fetched directly (MV3 host_permissions bypass CORS).
import { register } from '../lib/localRouter.js';
import { dataStore as db } from '../lib/dataStore.js';

const REPO = 'Mahmoud-Emad/devhome';
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

register('GET', 'releases', async ({ query }) => {
  const cache = await db.kv.get(CACHE);
  if (query?.cached) return { releases: cache?.releases || [] };
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
