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

function draw(host, releases, installed) {
  host.replaceChildren(
    ...releases.map((release) => {
      const section = document.createElement('section');
      section.className = 'release';
      const body = document.createElement('div');
      body.className = 'release-body';
      body.innerHTML = marked.parse(release.body || '_No notes for this release._');
      section.append(head(release, installed), body);
      return section;
    }),
  );
}

// Release notes are fetched from GitHub (see local/releases.local.js). We render
// the cached copy instantly, then always revalidate against the network and
// re-render if a newer release has shipped — so it never shows a stale list.
export async function renderReleaseNotes(host) {
  const installed = getVersion();
  let shownSig = null;

  const show = async (releases) => {
    const sig = signature(releases);
    if (sig === shownSig) return; // unchanged — skip the re-render (no flicker)
    shownSig = sig;
    await draw(host, releases, installed);
  };

  // 1. Instant: whatever we cached last time.
  try {
    const { releases } = await getApi('releases?cached=1');
    if (releases?.length) await show(releases);
  } catch {
    /* no cache yet */
  }
  if (!shownSig) host.replaceChildren(note('Loading release notes…'));

  // 2. Always revalidate; update the view if the list changed.
  try {
    const { releases } = await getApi('releases');
    if (releases?.length) await show(releases);
    else if (!shownSig) host.replaceChildren(note('No releases published yet.'));
  } catch {
    if (!shownSig) host.replaceChildren(note('Couldn’t load release notes — check your connection and try again.'));
  }
}
