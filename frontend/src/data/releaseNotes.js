import { getApi } from '../lib/api.js';

// The version actually running (from the extension manifest), so the pill and the
// About panel always reflect what's installed. Falls back to a literal during
// `vite dev`, where there's no extension manifest.
export function getVersion() {
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

// Release notes are fetched from GitHub (see local/releases.local.js) so the
// changelog stays current without a code change. Bodies are Markdown, rendered
// with `marked` (lazy-loaded to keep it out of the main bundle).
export async function renderReleaseNotes(host) {
  host.replaceChildren(note('Loading release notes…'));

  let releases;
  try {
    ({ releases } = await getApi('releases'));
  } catch {
    host.replaceChildren(note('Couldn’t load release notes — check your connection and try again.'));
    return;
  }
  if (!releases?.length) {
    host.replaceChildren(note('No releases published yet.'));
    return;
  }

  const installed = getVersion();
  const { marked } = await import('marked');

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
