// Minimal reusable tabs. Each item: { id, label, render: () => HTMLElement }.

export function createTabs(items, initialId) {
  const el = document.createElement('div');
  el.className = 'tabs-wrap';

  const bar = document.createElement('div');
  bar.className = 'tabs';
  const panel = document.createElement('div');
  panel.className = 'tab-panel';

  function show(item) {
    for (const b of bar.children) b.classList.toggle('is-active', b.dataset.id === item.id);
    panel.replaceChildren(item.render());
  }

  for (const item of items) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.dataset.id = item.id;
    b.textContent = item.label;
    b.addEventListener('click', () => show(item));
    bar.append(b);
  }

  el.append(bar, panel);
  show(items.find((i) => i.id === initialId) || items[0]);
  return { el };
}
