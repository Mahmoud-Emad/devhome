import { marked } from 'marked';
import { getApi } from '../lib/api.js';

// The version actually running (from the extension manifest), so the pill and the
// About panel always reflect what's installed. Falls back to a literal during
// `vite dev`, where there's no extension manifest.
function getVersion() {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '0.1.0';
  }
}

export const VERSION = getVersion();

function note(text) {
  const p = document.createElement('p');
  p.className = 'release-loading';
  p.textContent = text;
  return p;
}

function head(release, installed) {
  const el = document.createElement('div');
  el.className = 'release-head';
  el.innerHTML =
    `<span class="release-version">v${release.version}</span>` +
    (release.date ? `<span class="release-date">${release.date}</span>` : '') +
    (release.version === installed ? '<span class="release-installed">Installed</span>' : '');
  return el;
}

const signature = (releases) => releases.map((r) => `${r.version}@${r.date}`).join('|');

function noticeBanner(text) {
  const el = document.createElement('p');
  el.className = 'release-notice';
  el.textContent = text;
  return el;
}

function draw(host, releases, installed, notice) {
  const sections = releases.map((release) => {
    const section = document.createElement('section');
    section.className = 'release';
    const body = document.createElement('div');
    body.className = 'release-body';
    body.innerHTML = marked.parse(release.body || '_No notes for this release._');
    section.append(head(release, installed), body);
    return section;
  });
  host.replaceChildren(...(notice ? [noticeBanner(notice), ...sections] : sections));
}

// Release notes are fetched from GitHub (see local/releases.local.js). We render
// the cached copy instantly, then always revalidate against the network and
// re-render if a newer release has shipped — so it never shows a stale list.
export async function renderReleaseNotes(host) {
  const installed = getVersion();
  let shownSig = null;

  const show = async (releases, notice) => {
    const sig = signature(releases) + (notice ? `|notice:${notice}` : '');
    if (sig === shownSig) return; // unchanged — skip the re-render (no flicker)
    shownSig = sig;
    draw(host, releases, installed, notice);
  };

  // 1. Instant: whatever we cached last time.
  try {
    const { releases } = await getApi('releases?cached=1');
    if (releases?.length) await show(releases);
  } catch {
    /* no cache yet */
  }
  if (!shownSig) host.replaceChildren(note('Loading release notes…'));

  // 2. Always revalidate; update the view if the list changed, and tell the user
  //    if we couldn't reach GitHub (so a stale list isn't mistaken for current).
  try {
    const { releases, stale, error } = await getApi('releases');
    if (releases?.length) {
      await show(releases, stale ? `Showing cached notes — couldn’t reach GitHub (${error}).` : null);
    } else if (!shownSig) {
      host.replaceChildren(note('No releases published yet.'));
    }
  } catch (err) {
    if (!shownSig) {
      host.replaceChildren(note(err?.message || 'Couldn’t load release notes — check your connection and try again.'));
    }
  }
}
