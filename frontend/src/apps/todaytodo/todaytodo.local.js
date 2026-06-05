// Local handlers for TodayTodo. Todos are flat records carrying their own
// `date`; a date-keyed view is reconstructed by grouping.
import { register } from '../../lib/localRouter.js';
import { dataStore as db } from '../../lib/dataStore.js';

const byCreated = (a, b) => (a.created || 0) - (b.created || 0);
const open = (t) => !t.done;

register('GET', 'todos', async ({ query }) => {
  const todos = (await db.list('todos')).filter((t) => t.date === query.date).sort(byCreated);
  return { todos };
});

register('GET', 'todos/dates', async () => {
  const all = await db.list('todos');
  const groups = new Map();
  for (const t of all) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const dates = [...groups.keys()]
    .sort()
    .reverse()
    .map((date) => ({ date, open: groups.get(date).filter(open).length, total: groups.get(date).length }));
  return { dates };
});

register('GET', 'todos/pending', async ({ query }) => {
  const today = query.today;
  const all = await db.list('todos');
  const todayOpen = all.filter((t) => t.date === today && open(t)).sort(byCreated);
  const overdue = all
    .filter((t) => t.date < today && open(t))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byCreated(a, b)));
  return { today: todayOpen, overdue };
});

register('POST', 'todos', async ({ body }) => {
  const title = (body.title || '').trim();
  if (!title) throw new Error('A title is required.');
  return db.put('todos', {
    date: body.date,
    title,
    description: (body.description || '').trim(),
    done: false,
    created: Date.now(),
  });
});

register('PATCH', 'todos/:id', async ({ params, body }) => {
  const patch = {};
  if (body.title != null && body.title.trim()) patch.title = body.title.trim();
  if (body.description != null) patch.description = body.description.trim();
  if (body.done != null) patch.done = body.done;
  const todo = await db.patch('todos', params.id, patch);
  if (!todo) throw new Error('Todo not found.');
  return todo;
});

register('DELETE', 'todos/:id', async ({ params }) => {
  await db.remove('todos', params.id);
  return { ok: true };
});
