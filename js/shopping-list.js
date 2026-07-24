// Shopping list (implementation_plan.md §4.2 `shopping_list`).
// Same optimistic-update / realtime / offline-fallback pattern as votes.js.

import { dataService } from "./data-service.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";

let items = null; // array of {id, item, quantity, requested_by, checked, added_at}
let unsubscribe = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("shoppingListStore listener error", err);
    }
  }
}

export const shoppingListStore = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    if (items) return items;
    try {
      items = await dataService.list("shoppingList");
      localStore.setCachedTable("shoppingList", items);
    } catch {
      items = localStore.getCachedTable("shoppingList") || [];
    }
    this.subscribe();
    return items;
  },

  // See people.js's reconcile() for why this exists (§7.4 re-sync on reconnect/foreground).
  async reconcile() {
    if (!items) return;
    try {
      const fresh = await dataService.list("shoppingList");
      items = fresh;
      localStore.setCachedTable("shoppingList", fresh);
      notify();
    } catch {
      // offline or failed — keep current in-memory state, next trigger retries
    }
  },

  subscribe() {
    if (unsubscribe) return;
    unsubscribe = dataService.subscribe("shoppingList", (payload) => {
      applyChange(payload);
      notify();
    });
  },

  all() {
    return items || [];
  },

  async add(item, quantity, requestedBy) {
    const row = { id: crypto.randomUUID(), item, quantity: quantity || null, requested_by: requestedBy, checked: false };
    applyChange({ eventType: "UPSERT", new: row });
    notify();

    try {
      await dataService.insert("shoppingList", row);
    } catch {
      syncQueue.enqueue({ table: "shoppingList", op: "insert", payload: row });
    }
  },

  async setChecked(id, checked) {
    const existing = items?.find((i) => i.id === id);
    if (!existing) return;
    applyChange({ eventType: "UPSERT", new: { ...existing, checked } });
    notify();

    try {
      await dataService.update("shoppingList", { id }, { checked });
    } catch {
      syncQueue.enqueue({ table: "shoppingList", op: "update", match: { id }, payload: { checked } });
    }
  },

  async clearChecked() {
    const toRemove = (items || []).filter((i) => i.checked);
    for (const row of toRemove) await this.remove(row.id);
  },

  async clearAll() {
    const toRemove = [...(items || [])];
    for (const row of toRemove) await this.remove(row.id);
  },

  async remove(id) {
    applyChange({ eventType: "DELETE", old: { id } });
    notify();

    try {
      await dataService.remove("shoppingList", { id });
    } catch {
      syncQueue.enqueue({ table: "shoppingList", op: "delete", match: { id } });
    }
  },
};

function applyChange(payload) {
  if (!items) items = [];

  if (payload.eventType === "DELETE") {
    items = items.filter((i) => i.id !== payload.old.id);
    return;
  }

  const row = payload.new;
  const idx = items.findIndex((i) => i.id === row.id);
  if (idx >= 0) items[idx] = row;
  else items.push(row);
}
