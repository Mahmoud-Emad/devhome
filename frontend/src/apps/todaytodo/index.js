// TodayTodo — a to-do list per day. Logic (storage, CRUD, counts) lives in
// todaytodo.local.js (IndexedDB); this is the sidebar-of-days + list UI, a dock
// badge of open tasks, and a home widget showing what's left today.

import { getApi, jsonApi } from '../../lib/api.js';

const ACCENT = '#fb923c';

const PENCIL = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>
  </svg>`;

const TRASH = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 6h18"></path>
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
  </svg>`;

const BURGER = `
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16"></path>
  </svg>`;

// Below this layout width the day sidebar collapses to a hamburger-toggled overlay.
const NARROW = 560;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function keyOf(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function parseKey(key) {
  const [y, mo, d] = key.split('-').map(Number);
  return new Date(y, mo - 1, d);
}

function labelFor(key) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (key === keyOf(today)) return 'Today';
  if (key === keyOf(yesterday)) return 'Yesterday';
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fullDate(key) {
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconButton(svg, label, onClick) {
  const b = el('button', 'icon-button todo-action');
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = svg;
  b.addEventListener('click', onClick);
  return b;
}

export default {
  id: 'todaytodo',
  name: 'TodayTodo',
  description: 'A fresh to-do list for each day',
  accent: ACCENT,
  order: 3,
  dialog: { size: 'lg' },

  // Dock notification: total open (not-done) tasks across all days.
  async badge() {
    try {
      const { dates } = await getApi('todos/dates');
      return (dates || []).reduce((sum, d) => sum + d.open, 0);
    } catch {
      return 0;
    }
  },

  // Home card: today's open tasks plus anything still unfinished from earlier
  // days (overdue), so tasks don't silently vanish once the date rolls over.
  async widget(ctx) {
    const today = keyOf(new Date());
    let data;
    try {
      data = await getApi(`todos/pending?today=${today}`);
    } catch {
      return null;
    }
    const overdue = (data.overdue || []).map((t) => ({ ...t, overdue: true }));
    const todayOpen = (data.today || []).map((t) => ({ ...t, overdue: false }));
    const open = [...overdue, ...todayOpen]; // overdue first so it's not missed
    if (!open.length) return null;

    const card = el('div', 'widget-card');
    card.style.setProperty('--accent', ACCENT);

    const head = el('button', 'widget-head');
    head.append(el('span', 'widget-title', 'Today'), el('span', 'widget-count', `${open.length} left`));
    head.addEventListener('click', () => ctx.openApp('todaytodo'));
    card.append(head);

    const list = el('div', 'widget-list');
    open.slice(0, 5).forEach((todo) => {
      const item = el('div', 'widget-item');
      const check = el('input', 'todo-check');
      check.type = 'checkbox';
      check.addEventListener('change', async () => {
        await jsonApi('PATCH', `todos/${todo.id}`, { done: true });
        ctx.refresh();
      });
      item.append(check, el('span', 'widget-item-title', todo.title));
      if (todo.overdue) item.append(el('span', 'widget-item-tag', labelFor(todo.date)));
      list.append(item);
    });
    if (open.length > 5) {
      const more = el('button', 'widget-more', `+${open.length - 5} more`);
      more.addEventListener('click', () => ctx.openApp('todaytodo'));
      list.append(more);
    }
    card.append(list);
    return card;
  },

  render(body) {
    let dates = [];
    let openByDate = {};
    let selected = keyOf(new Date());

    let narrow = false;

    const layout = el('div', 'todo-layout');
    const sidebar = el('nav', 'todo-sidebar');
    const main = el('div', 'todo-main');
    layout.append(sidebar, main);
    body.replaceChildren(layout);

    const toggleSidebar = () => layout.classList.toggle('collapsed');

    // Collapse the day sidebar into an overlay when the window gets too narrow.
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      const isNarrow = w > 0 && w < NARROW;
      if (isNarrow === narrow) return;
      narrow = isNarrow;
      layout.classList.toggle('is-narrow', narrow);
      layout.classList.toggle('collapsed', narrow);
    });
    ro.observe(layout);

    // When the day sidebar is an open overlay, a click outside it closes it.
    layout.addEventListener('click', (e) => {
      if (!narrow || layout.classList.contains('collapsed')) return;
      if (e.target.closest('.todo-sidebar') || e.target.closest('.todo-burger')) return;
      layout.classList.add('collapsed');
    });

    async function refresh() {
      let recorded = [];
      try {
        recorded = (await getApi('todos/dates')).dates || [];
      } catch {
        // ignore; loadTodos surfaces connection errors
      }
      openByDate = {};
      recorded.forEach((r) => { openByDate[r.date] = r.open; });
      const today = keyOf(new Date());
      dates = [...new Set([today, ...recorded.map((r) => r.date)])].sort().reverse();
      if (!dates.includes(selected)) selected = today;
      drawSidebar();
      await loadTodos();
    }

    function drawSidebar() {
      sidebar.replaceChildren(
        ...dates.map((key) => {
          const btn = el('button', 'todo-day' + (key === selected ? ' is-active' : ''));
          btn.append(el('span', null, labelFor(key)));
          if (openByDate[key] > 0) {
            const dot = el('span', 'todo-day-dot');
            dot.title = `${openByDate[key]} open`;
            btn.append(dot);
          }
          btn.addEventListener('click', () => {
            selected = key;
            drawSidebar();
            loadTodos();
            if (narrow) layout.classList.add('collapsed');
          });
          return btn;
        }),
      );
    }

    async function loadTodos() {
      try {
        const { todos } = await getApi(`todos?date=${selected}`);
        drawMain(todos);
      } catch (err) {
        main.replaceChildren(el('p', 'app-error', err.message));
      }
    }

    function drawMain(todos) {
      const header = el('div', 'todo-header');
      const burger = el('button', 'icon-button todo-burger');
      burger.title = 'Toggle days';
      burger.setAttribute('aria-label', 'Toggle days');
      burger.innerHTML = BURGER;
      burger.addEventListener('click', toggleSidebar);
      const heading = el('div', 'todo-heading');
      heading.append(el('h3', 'todo-title', labelFor(selected)), el('p', 'todo-subtitle', fullDate(selected)));
      const left = todos.filter((t) => !t.done).length;
      header.append(burger, heading, el('span', 'todo-count', todos.length ? `${left} left` : ''));

      const composer = addComposer(async ({ title, description }) => {
        await jsonApi('POST', 'todos', { date: selected, title, description });
        loadTodos();
      });

      const list = el('ul', 'todo-list');
      if (!todos.length) {
        list.append(el('li', 'todo-empty', 'Nothing here yet. Add your first task above.'));
      } else {
        todos.forEach((todo) => list.append(todoRow(todo)));
      }

      main.replaceChildren(header, composer, list);
    }

    function todoRow(todo) {
      const row = el('li', 'todo-row' + (todo.done ? ' is-done' : ''));

      const check = el('input', 'todo-check');
      check.type = 'checkbox';
      check.checked = todo.done;
      check.addEventListener('change', async () => {
        await jsonApi('PATCH', `todos/${todo.id}`, { done: check.checked });
        loadTodos();
      });

      const content = el('div', 'todo-body');
      content.append(el('span', 'todo-row-title', todo.title));
      if (todo.description) content.append(el('span', 'todo-row-desc', todo.description));

      const actions = el('div', 'todo-row-actions');
      actions.append(
        iconButton(PENCIL, 'Edit', () => beginEdit(row, todo)),
        iconButton(TRASH, 'Delete', async () => {
          await jsonApi('DELETE', `todos/${todo.id}`);
          refresh();
        }),
      );

      row.append(check, content, actions);
      return row;
    }

    function beginEdit(row, todo) {
      row.className = 'todo-row is-editing';
      row.replaceChildren(
        taskForm({
          title: todo.title,
          description: todo.description || '',
          submitLabel: 'Save',
          onSubmit: async ({ title, description }) => {
            await jsonApi('PATCH', `todos/${todo.id}`, { title, description });
            loadTodos();
          },
          onCancel: () => loadTodos(),
          autofocus: true,
        }),
      );
    }

    refresh();
  },
};

// Compact composer that expands (via :focus-within) to reveal the description.
function addComposer(onSubmit) {
  return taskForm({ submitLabel: 'Add task', onSubmit, compact: true });
}

function taskForm({ title = '', description = '', submitLabel, onSubmit, onCancel, compact = false, autofocus = false }) {
  const card = el('div', 'todo-compose' + (compact ? ' is-compact' : ''));

  const titleInput = el('input', 'todo-compose-title');
  titleInput.placeholder = compact ? '+  Add a task' : 'Task title';
  titleInput.value = title;

  const more = el('div', 'todo-compose-more');
  const descInput = el('textarea', 'todo-compose-desc');
  descInput.placeholder = 'Add a description (optional)';
  descInput.rows = 2;
  descInput.value = description;

  const actions = el('div', 'todo-compose-actions');
  const submit = el('button', 'button-primary', submitLabel);
  actions.append(submit);
  if (onCancel) {
    const cancel = el('button', 'button-secondary', 'Cancel');
    cancel.addEventListener('click', onCancel);
    actions.append(cancel);
  }

  more.append(descInput, actions);
  card.append(titleInput, more);

  const submitNow = () => {
    const t = titleInput.value.trim();
    if (!t) {
      titleInput.focus();
      return;
    }
    onSubmit({ title: t, description: descInput.value.trim() });
  };
  submit.addEventListener('click', submitNow);
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitNow();
    }
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNow();
    else if (e.key === 'Escape' && onCancel) onCancel();
  });

  if (autofocus) requestAnimationFrame(() => titleInput.focus());
  return card;
}
