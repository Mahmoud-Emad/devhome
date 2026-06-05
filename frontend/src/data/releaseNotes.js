export const VERSION = '0.1.0';

export const RELEASES = [
  {
    version: '0.1.0',
    date: 'June 2026',
    changes: [
      'First release: clock, greeting and search on every new tab',
      'Apps in a macOS-style dock: Voice to Text, Image to Text, Books & Notes, TodayTodo, PDF Library and Calculator',
      'Voice and image tools run on-device with WebAssembly — your data never leaves the browser',
      'Home dashboard of pinnable cards: trending article, tasks, continue reading, weather, focus timer and tips',
      'Local 4K wallpapers with shuffle, favorite, custom upload and adjustable blur',
      'Everything stored locally (IndexedDB) with Export / Import for a portable backup',
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
