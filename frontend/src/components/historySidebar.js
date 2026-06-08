// A reusable "history" sidebar: a titled list of past items with a New button,
// active-row highlight, and a right-click menu (Delete built in, with confirm +
// undo). The host owns the data and how the main pane renders (onOpen / onNew).
//
//   load()         -> Promise<entries[]>     (newest first; each needs an `id`)
//   remove(entry)  -> Promise                (commit the delete to the store)
//   itemOf(entry)  -> { snippet, date? }     (date defaults to formatWhen(entry.at))
//   menu(entry)    -> [contextMenuItem]      (extra items; Delete is appended)
//   onOpen(entry) / onNew()                  (render the main pane)
//
// Returns { el, open(entry), showNew(), refresh() }.

import { el } from '../lib/dom.js';
import { formatWhen } from '../lib/format.js';
import { confirmDialog } from './confirm.js';
import { openContextMenu } from './contextMenu.js';
import { showUndoToast } from './undoToast.js';
import { TRASH } from './icons.js';

export function createHistorySidebar({
  title = 'History',
  emptyText = 'Nothing here yet.',
  load,
  remove,
  itemOf,
  menu = () => [],
  onOpen,
  onNew,
  confirmMessage = 'Delete this item?',
  undoMessage = 'Deleted',
  undoMs = 5000,
} = {}) {
  const root = el('aside', 'mt-sidebar');
  const pendingDelete = new Set(); // ids hidden during their undo window
  let activeId = null;

  const open = (entry) => {
    activeId = entry?.id ?? null;
    onOpen?.(entry);
    draw();
  };
  const showNew = () => {
    activeId = null;
    onNew?.();
    draw();
  };

  const deleteEntry = async (entry) => {
    if (!(await confirmDialog(confirmMessage))) return;
    pendingDelete.add(entry.id);
    if (activeId === entry.id) showNew();
    else draw();

    let undone = false;
    showUndoToast(undoMessage, {
      duration: undoMs,
      onUndo: () => {
        undone = true;
        pendingDelete.delete(entry.id);
        draw();
      },
    });
    setTimeout(async () => {
      if (undone || !pendingDelete.has(entry.id)) return;
      pendingDelete.delete(entry.id);
      await remove(entry);
    }, undoMs);
  };

  async function draw() {
    const head = el('div', 'mt-sidebar-head');
    const newBtn = el('button', 'icon-button mt-new', '+');
    newBtn.type = 'button';
    newBtn.title = 'New';
    newBtn.setAttribute('aria-label', 'New');
    newBtn.addEventListener('click', showNew);
    head.append(el('span', 'mt-sidebar-title', title), newBtn);

    const list = el('div', 'mt-history-list');
    let entries = [];
    try {
      entries = await load();
    } catch {
      /* ignore */
    }
    const visible = entries.filter((e) => !pendingDelete.has(e.id));
    if (!visible.length) list.append(el('p', 'mt-history-empty', emptyText));
    for (const entry of visible) {
      const item = el('div', 'mt-history-item' + (entry.id === activeId ? ' is-active' : ''));
      const info = itemOf(entry);
      const btn = el('button', 'mt-history-open');
      btn.append(
        el('span', 'mt-history-snippet', info.snippet),
        el('span', 'mt-history-date', info.date ?? formatWhen(entry.at)),
      );
      btn.addEventListener('click', () => open(entry));
      item.append(btn);
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          ...menu(entry),
          { separator: true },
          { label: 'Delete', icon: TRASH, danger: true, onClick: () => deleteEntry(entry) },
        ]);
      });
      list.append(item);
    }
    root.replaceChildren(head, list);
  }

  draw();
  return { el: root, open, showNew, refresh: draw };
}
