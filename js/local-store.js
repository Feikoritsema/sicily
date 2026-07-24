// localStorage-only state (implementation_plan.md §4.2, §7.4):
// profile name, personal packing checklist, and cached table snapshots.

const PROFILE_KEY = "sicily:profileName";
const PACKING_KEY = "sicily:personalPacking";
const CACHE_PREFIX = "sicily:cache:";
const INSTALL_HINT_DISMISSED_KEY = "sicily:installHintDismissed";
const VISITED_TABS_KEY = "sicily:visitedTabs";
const CHECKLIST_DISMISSED_KEY = "sicily:checklistDismissed";

// Guards every read/write against a corrupted value (interrupted write, manual
// tampering) or a failed write (quota exceeded, Safari private-browsing edge
// cases) — both realistic over 9 days of real phones on spotty rural
// connectivity. An unguarded JSON.parse/setItem here can otherwise blank or
// permanently lock a whole view (see context/error_handling_audit.md).
function safeGetJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    console.error(`sicily: corrupted localStorage key "${key}" — resetting`);
    localStorage.removeItem(key);
    return fallback;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error(`sicily: failed to write localStorage key "${key}"`, err);
    return false;
  }
}

export const localStore = {
  getProfileName() {
    return localStorage.getItem(PROFILE_KEY);
  },
  // Returns whether the write actually succeeded — callers that gate on
  // "the user is now signed in" should check this rather than assume.
  setProfileName(name) {
    return safeSetItem(PROFILE_KEY, name);
  },

  isInstallHintDismissed() {
    return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === "1";
  },
  dismissInstallHint() {
    safeSetItem(INSTALL_HINT_DISMISSED_KEY, "1");
  },

  // Powers the Today "Getting started" checklist's dayplan/info items — a
  // cheap, purely-local signal of "has this device opened that tab yet."
  getVisitedTabs() {
    return safeGetJSON(VISITED_TABS_KEY, []);
  },
  markTabVisited(tab) {
    const visited = new Set(this.getVisitedTabs());
    if (visited.has(tab)) return;
    visited.add(tab);
    safeSetItem(VISITED_TABS_KEY, JSON.stringify([...visited]));
  },

  isChecklistDismissed() {
    return localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "1";
  },
  dismissChecklist() {
    safeSetItem(CHECKLIST_DISMISSED_KEY, "1");
  },

  getPersonalPacking() {
    return safeGetJSON(PACKING_KEY, null);
  },
  setPersonalPacking(state) {
    return safeSetItem(PACKING_KEY, JSON.stringify(state));
  },

  getCachedTable(tableKey) {
    return safeGetJSON(CACHE_PREFIX + tableKey, null);
  },
  setCachedTable(tableKey, rows) {
    safeSetItem(CACHE_PREFIX + tableKey, JSON.stringify(rows));
  },
};
