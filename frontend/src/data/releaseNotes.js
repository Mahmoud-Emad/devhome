export const VERSION = '0.1.0';

export const RELEASES = [
  {
    version: '0.1.0',
    date: 'June 2026',
    changes: [
      'First release: clock, greeting and search on every new tab',
      'Local 4K wallpapers with shuffle, favorite and adjustable blur',
      'Apps launcher with Readit, plus placeholders for upcoming tools',
      'Settings dialog: name, search engine, clock format and blur',
    ],
  },
];

export function renderReleaseNotes(body) {
  body.replaceChildren(
    ...RELEASES.map((release) => {
      const section = document.createElement('section');
      section.className = 'release';
      const heading = `
        <div class="release-head">
          <span class="release-version">v${release.version}</span>
          <span class="release-date">${release.date}</span>
        </div>`;
      const items = release.changes.map((c) => `<li>${c}</li>`).join('');
      section.innerHTML = `${heading}<ul class="release-list">${items}</ul>`;
      return section;
    }),
  );
}
