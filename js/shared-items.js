// Shared/claimable group items (implementation_plan.md §4.2 `shared_item_claims`).
// Same optimistic-update / realtime / offline-fallback pattern as votes.js.

import { dataService } from "./data-service.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";

let items = null; // array of {id, name, source, claimed_by, notes, added_by, updated_at}
let unsubscribe = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("sharedItemsStore listener error", err);
    }
  }
}

export const sharedItemsStore = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    if (items) return items;
    try {
      items = await dataService.list("sharedItemClaims");
      localStore.setCachedTable("sharedItemClaims", items);
    } catch {
      items = localStore.getCachedTable("sharedItemClaims") || [];
    }
    this.subscribe();
    return items;
  },

  subscribe() {
    if (unsubscribe) return;
    unsubscribe = dataService.subscribe("sharedItemClaims", (payload) => {
      applyChange(payload);
      notify();
    });
  },

  all() {
    return items || [];
  },

  async add(name, source, addedBy) {
    const row = { id: crypto.randomUUID(), name, source, claimed_by: null, notes: null, added_by: addedBy };
    applyChange({ eventType: "UPSERT", new: row });
    notify();

    try {
      await dataService.insert("sharedItemClaims", row);
    } catch {
      syncQueue.enqueue({ table: "sharedItemClaims", op: "insert", payload: row });
    }
  },

  async setClaimedBy(id, claimedBy) {
    const existing = items?.find((i) => i.id === id);
    if (!existing) return;
    applyChange({ eventType: "UPSERT", new: { ...existing, claimed_by: claimedBy } });
    notify();

    try {
      await dataService.update("sharedItemClaims", { id }, { claimed_by: claimedBy });
    } catch {
      syncQueue.enqueue({ table: "sharedItemClaims", op: "update", match: { id }, payload: { claimed_by: claimedBy } });
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
