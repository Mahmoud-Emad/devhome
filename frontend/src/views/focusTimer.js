// Focus timer — a pinned home card (Pomodoro-style). State lives in the store so
// a running timer continues across new tabs (remaining is derived from endsAt).

import { store } from '../models/store.js';

const ACCENT = '#f472b6';
const PRESETS = [
  { label: '25m', sec: 1500 },
  { label: '15m', sec: 900 },
  { label: '5m', sec: 300 },
];

let tick = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function state() {
  const f = store.get('focus') || {};
  const duration = f.duration ?? 1500;
  return {
    duration,
    running: !!f.running,
    endsAt: f.endsAt ?? null,
    remaining: f.remaining ?? duration,
  };
}

function remainingNow(s) {
  if (s.running && s.endsAt) return Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
  return s.remaining;
}

export function stopFocus() {
  clearInterval(tick);
  tick = null;
}

export function renderFocus(host) {
  stopFocus();

  function persist(patch) {
    store.set({ focus: { ...state(), ...patch } });
  }

  function start() {
    const s = state();
    const rem = remainingNow(s) || s.duration;
    persist({ running: true, endsAt: Date.now() + rem * 1000, remaining: rem });
    draw();
    ensureTick();
  }
  function pause() {
    persist({ running: false, endsAt: null, remaining: remainingNow(state()) });
    stopFocus();
    draw();
  }
  function reset() {
    const { duration } = state();
    persist({ running: false, endsAt: null, remaining: duration });
    stopFocus();
    draw();
  }
  function setDuration(sec) {
    store.set({ focus: { duration: sec, running: false, endsAt: null, remaining: sec } });
    stopFocus();
    draw();
  }
  function ensureTick() {
    stopFocus();
    tick = setInterval(() => {
      if (!state().running) return stopFocus();
      draw();
    }, 1000);
  }

  function draw() {
    const s = state();
    let rem = remainingNow(s);
    if (s.running && rem <= 0) {
      // finished → reset to a fresh, paused timer
      store.set({ focus: { duration: s.duration, running: false, endsAt: null, remaining: s.duration } });
      stopFocus();
      rem = s.duration;
      host.replaceChildren(card(state(), rem, true));
      return;
    }
    host.replaceChildren(card(s, rem, false));
  }

  function card(s, rem, done) {
    const c = el('div', 'widget-card focus-card');
    c.style.setProperty('--accent', ACCENT);

    const head = el('div', 'widget-head');
    head.append(el('span', 'widget-title', 'Focus'),
      el('span', 'widget-count', done ? 'Done' : s.running ? 'Running' : 'Ready'));
    c.append(head);

    c.append(el('div', 'focus-time' + (s.running ? ' is-running' : ''), fmt(rem)));

    if (!s.running) {
      const presets = el('div', 'focus-presets');
      for (const p of PRESETS) {
        const b = el('button', 'focus-preset' + (s.duration === p.sec ? ' is-active' : ''), p.label);
        b.addEventListener('click', () => setDuration(p.sec));
        presets.append(b);
      }
      c.append(presets);
    }

    const actions = el('div', 'focus-actions');
    const primary = el('button', 'button-primary', s.running ? 'Pause' : 'Start');
    primary.addEventListener('click', s.running ? pause : start);
    actions.append(primary);
    if (rem !== s.duration || s.running) {
      const resetBtn = el('button', 'button-secondary', 'Reset');
      resetBtn.addEventListener('click', reset);
      actions.append(resetBtn);
    }
    c.append(actions);
    return c;
  }

  draw();
  if (state().running) ensureTick();
}
