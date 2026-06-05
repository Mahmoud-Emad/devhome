// macOS-style dock of apps. Each tile shows a monogram and label; hovering
// magnifies it. Clicking calls onPick(app). Tiles can show a notification badge.

function monogram(name) {
  return name.trim().charAt(0).toUpperCase();
}

export function renderAppDock(dockEl, apps, onPick) {
  const badges = new Map();
  const items = new Map();

  dockEl.replaceChildren(
    ...apps.map((app) => {
      const item = document.createElement('button');
      item.className = 'dock-app';
      item.style.setProperty('--accent', app.accent || 'var(--accent)');
      item.setAttribute('aria-label', app.name);
      item.title = app.description;
      items.set(app.id, item);

      const tile = document.createElement('span');
      tile.className = 'dock-tile';
      tile.innerHTML = `<span class="dock-mono">${monogram(app.name)}</span>`;
      const badge = document.createElement('span');
      badge.className = 'dock-badge';
      badge.hidden = true;
      tile.append(badge);
      badges.set(app.id, badge);

      const name = document.createElement('span');
      name.className = 'dock-name';
      name.textContent = app.name;

      // Running indicator: a dot below the tile while the app's window is open.
      const dot = document.createElement('span');
      dot.className = 'dock-dot';

      item.append(tile, name, dot);
      item.addEventListener('click', () => onPick(app));
      return item;
    }),
  );

  function setBadge(appId, count) {
    const badge = badges.get(appId);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function setOpen(appId, isOpen) {
    items.get(appId)?.classList.toggle('is-open', isOpen);
  }

  return { setBadge, setOpen };
}
