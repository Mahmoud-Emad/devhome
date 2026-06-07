import { store } from '../models/store.js';
import { apps } from '../apps/index.js';
import { createDialog } from '../components/dialog.js';
import { renderClock, renderSubtitle } from '../views/clock.js';
import { renderSearch, buildSearchUrl } from '../views/searchBar.js';
import { renderReadit } from '../views/readit.js';
import { renderWeather } from '../views/weather.js';
import { renderFocus, stopFocus } from '../views/focusTimer.js';
import { renderDockTip, stopDockTip } from '../views/tips.js';
import { renderOnboarding } from '../views/onboarding.js';
import { renderReleaseNotes, VERSION } from '../data/releaseNotes.js';
import { isInstalled } from '../models/installed.js';
import { onInstalledChange } from '../lib/installManager.js';
import { createBackgroundController } from './backgroundController.js';
import { createSettingsController } from './settingsController.js';
import { createAppsController } from './appsController.js';
import { createAppStoreController } from './appStoreController.js';

const $ = (id) => document.getElementById(id);

function applyBlur() {
  document.documentElement.style.setProperty('--bg-blur', `${store.get('bgBlur')}px`);
}

function renderTime() {
  const now = new Date();
  renderClock($('clock'), now, store.get('clock24h'));
  renderSubtitle($('subtitle'), now, store.get('name'));
}

function renderSearchBar() {
  renderSearch($('search'), {
    engine: store.get('searchEngine'),
    onSubmit: (q) => {
      window.location.href = buildSearchUrl(store.get('searchEngine'), q);
    },
  });
}

function setupReleaseNotes() {
  const button = $('release-btn');
  button.textContent = `v${VERSION}`;
  const dialog = createDialog({ title: 'Release notes', size: 'md', appDialog: false });
  dialog.el.classList.add('release-dialog'); // a touch wider for the changelog
  button.addEventListener('click', () => {
    renderReleaseNotes(dialog.body);
    dialog.open();
  });
}

export async function startApp() {
  await store.init();

  applyBlur();
  renderTime();
  setInterval(renderTime, 15000);
  renderSearchBar();

  const background = createBackgroundController({
    layerEl: $('bg-layer'),
    barEl: $('bg-bar'),
    creditEl: $('bg-credit'),
  });
  await background.init();

  let apps_;
  // Each pinnable app widget is gated by a Settings toggle (store key).
  const HOME_GATES = { todaytodo: 'homeTasks', pdflib: 'homeBook', doccoon: 'homeNotes' };

  // Render home widgets (today's tasks, continue-reading) and refresh badges.
  async function refreshHome() {
    const ctx = { refresh: refreshHome, openApp: (id) => apps_.openById(id) };
    const widgets = (
      await Promise.all(
        apps.map(async (app) => {
          if (!app.widget || !isInstalled(app.id)) return null;
          const gate = HOME_GATES[app.id];
          if (gate && !store.get(gate)) return null;
          try {
            return await app.widget(ctx);
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);
    $('home-widgets').replaceChildren(...widgets);
    apps_.refreshBadges();
  }

  // Pinned home features (not dock apps); each can be toggled off in Settings.
  function applyReadit() {
    if (store.get('homeReadit')) renderReadit($('home-readit'));
    else $('home-readit').replaceChildren();
  }
  function applyWeather() {
    if (store.get('homeWeather')) renderWeather($('home-weather'));
    else $('home-weather').replaceChildren();
  }
  function applyFocus() {
    if (store.get('homeFocus')) {
      renderFocus($('home-focus'));
    } else {
      stopFocus();
      $('home-focus').replaceChildren();
    }
  }
  function applyTips() {
    if (store.get('homeTips')) renderDockTip($('dock-tip'));
    else {
      stopDockTip();
      $('dock-tip').textContent = '';
    }
  }

  apps_ = createAppsController({ dockEl: $('app-dock'), onAfterClose: refreshHome });
  refreshHome();
  applyReadit();
  applyWeather();
  applyFocus();
  applyTips();

  setupReleaseNotes();

  createAppStoreController({ buttonEl: $('store-btn') });
  // An install/uninstall finishing (in the background) updates the dock + home.
  onInstalledChange(() => {
    apps_.refresh();
    refreshHome();
  });

  createSettingsController({
    buttonEl: $('settings-btn'),
    wallpaper: background.wallpaper,
    onApply: (patch) => {
      if ('bgBlur' in patch) applyBlur();
      if ('name' in patch || 'clock24h' in patch) renderTime();
      if ('searchEngine' in patch) renderSearchBar();
      if ('homeReadit' in patch) applyReadit();
      if ('homeTasks' in patch || 'homeBook' in patch || 'homeNotes' in patch) refreshHome();
      if ('homeWeather' in patch || 'weatherUnit' in patch) applyWeather();
      if ('homeFocus' in patch) applyFocus();
      if ('homeTips' in patch) applyTips();
    },
  });

  // First visit: welcome + pre-download the on-device AI models.
  if (!store.get('onboarded')) {
    const overlay = document.createElement('div');
    document.body.append(overlay);
    renderOnboarding(overlay, {
      onDone: () => {
        renderTime(); // the greeting may now have a name
        refreshHome();
      },
    });
  }
}
