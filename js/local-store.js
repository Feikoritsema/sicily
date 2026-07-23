// localStorage-only state (implementation_plan.md §4.2, §7.4):
// profile name, personal packing checklist, and cached table snapshots.

const PROFILE_KEY = "sicily:profileName";
const PACKING_KEY = "sicily:personalPacking";
const CACHE_PREFIX = "sicily:cache:";

export const localStore = {
  getProfileName() {
    return localStorage.getItem(PROFILE_KEY);
  },
  setProfileName(name) {
    localStorage.setItem(PROFILE_KEY, name);
  },

  getPersonalPacking() {
    return JSON.parse(localStorage.getItem(PACKING_KEY) || "null");
  },
  setPersonalPacking(state) {
    localStorage.setItem(PACKING_KEY, JSON.stringify(state));
  },

  getCachedTable(tableKey) {
    return JSON.parse(localStorage.getItem(CACHE_PREFIX + tableKey) || "null");
  },
  setCachedTable(tableKey, rows) {
    localStorage.setItem(CACHE_PREFIX + tableKey, JSON.stringify(rows));
  },
};
