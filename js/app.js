import * as today from "./views/today.js";
import * as explore from "./views/explore.js";
import * as dayplan from "./views/dayplan.js";
import * as lists from "./views/lists.js";
import * as info from "./views/info.js";
import * as profile from "./views/profile.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";
import "./reconcile.js";

const VIEWS = { today, explore, dayplan, lists, info, profile };
const DEFAULT_TAB = "today";
const STUCK_ATTEMPTS_THRESHOLD = 3;

const app = document.getElementById("app");
const nav = document.getElementById("bottom-nav");
const syncPill = document.getElementById("sync-pill");

// Per implementation_plan.md §7.4: "a stuck sync is visible rather than silently
// lossy" — amber (never red/alarming) once an entry has retried a few times.
function refreshSyncPill(queue) {
  if (!queue.length) {
    syncPill.hidden = true;
    return;
  }
  const stuck = queue.some((e) => (e.attempts || 0) >= STUCK_ATTEMPTS_THRESHOLD);
  syncPill.hidden = false;
  syncPill.classList.toggle("is-stuck", stuck);
  syncPill.textContent = stuck
    ? `⚠️ ${queue.length} change${queue.length === 1 ? "" : "s"} couldn't sync yet — will retry`
    : `⏳ Syncing ${queue.length} change${queue.length === 1 ? "" : "s"}…`;
}
syncQueue.onChange(refreshSyncPill);

// #app is shared/reused across every view. Each view's render() is async
// (loads data before committing content), so a slower-loading view can still
// be mid-flight when the user switches tabs again — without this guard, its
// data can resolve *after* the newer tab's and silently overwrite it. Every
// view checks `isActive()` right before committing its real content (not the
// initial loading placeholder) — see e.g. views/lists.js.
let renderGeneration = 0;

function showTab(tab) {
  const view = VIEWS[tab] ? tab : DEFAULT_TAB;
  const myGeneration = ++renderGeneration;
  localStore.markTabVisited(view);
  nav.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === view);
  });
  app.classList.remove("is-visible");
  VIEWS[view].render(app, {
    onNamePicked: () => showTab(DEFAULT_TAB),
    isActive: () => myGeneration === renderGeneration,
  });
  requestAnimationFrame(() => app.classList.add("is-visible"));
  location.hash = view;
}

nav.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (btn) showTab(btn.dataset.tab);
});

window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

function boot() {
  refreshSyncPill(syncQueue.pending());
  syncQueue.replay(); // per §7.4: replay on app open too, not just the `online` event
  navigator.storage?.persist?.(); // reduces (doesn't eliminate) Safari evicting localStorage under pressure

  if (!localStore.getProfileName()) {
    nav.hidden = true;
    const myGeneration = ++renderGeneration;
    profile.render(app, {
      onNamePicked: () => { nav.hidden = false; showTab(DEFAULT_TAB); },
      isActive: () => myGeneration === renderGeneration,
    });
    requestAnimationFrame(() => app.classList.add("is-visible"));
    return;
  }
  nav.hidden = false;
  showTab(location.hash.slice(1) || DEFAULT_TAB);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

boot();
