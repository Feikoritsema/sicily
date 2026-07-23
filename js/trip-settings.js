// Trip-wide settings (implementation_plan.md §4.2 `trip_settings`) — a
// genuine singleton table, one row (id=1), already seeded by §6 step 2.

import { dataService } from "./data-service.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";

let settings = null; // {id: 1, grocery_strategy}
let unsubscribe = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("tripSettingsStore listener error", err);
    }
  }
}

export const tripSettingsStore = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    if (settings) return settings;
    try {
      const rows = await dataService.list("tripSettings");
      settings = rows[0] || { id: 1, grocery_strategy: null };
      localStore.setCachedTable("tripSettings", settings);
    } catch {
      settings = localStore.getCachedTable("tripSettings") || { id: 1, grocery_strategy: null };
    }
    this.subscribe();
    return settings;
  },

  subscribe() {
    if (unsubscribe) return;
    unsubscribe = dataService.subscribe("tripSettings", (payload) => {
      settings = payload.new;
      notify();
    });
  },

  get() {
    return settings || { id: 1, grocery_strategy: null };
  },

  async setGroceryStrategy(value) {
    settings = { ...settings, grocery_strategy: value };
    notify();

    try {
      await dataService.update("tripSettings", { id: 1 }, { grocery_strategy: value });
    } catch {
      syncQueue.enqueue({ table: "tripSettings", op: "update", match: { id: 1 }, payload: { grocery_strategy: value } });
    }
  },
};
