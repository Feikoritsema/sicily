import * as today from "./views/today.js";
import * as explore from "./views/explore.js";
import * as dayplan from "./views/dayplan.js";
import * as lists from "./views/lists.js";
import * as info from "./views/info.js";
import * as profile from "./views/profile.js";
import { localStore } from "./local-store.js";

const VIEWS = { today, explore, dayplan, lists, info, profile };
const DEFAULT_TAB = "today";

const app = document.getElementById("app");
const nav = document.getElementById("bottom-nav");

function showTab(tab) {
  const view = VIEWS[tab] ? tab : DEFAULT_TAB;
  nav.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === view);
  });
  app.classList.remove("is-visible");
  VIEWS[view].render(app, { onNamePicked: () => showTab(DEFAULT_TAB) });
  requestAnimationFrame(() => app.classList.add("is-visible"));
  location.hash = view;
}

nav.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (btn) showTab(btn.dataset.tab);
});

window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

function boot() {
  if (!localStore.getProfileName()) {
    nav.hidden = true;
    profile.render(app, { onNamePicked: () => { nav.hidden = false; showTab(DEFAULT_TAB); } });
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
