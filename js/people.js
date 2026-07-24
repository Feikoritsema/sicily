// People / Group Info (implementation_plan.md §4.2 `people`).
// Same optimistic-update / realtime / offline-fallback pattern as votes.js.

import { dataService } from "./data-service.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";

let people = null; // array of person rows, keyed by `name` (primary key)
let unsubscribe = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("peopleStore listener error", err);
    }
  }
}

export const peopleStore = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    if (people) return people;
    try {
      people = await dataService.list("people");
      localStore.setCachedTable("people", people);
    } catch {
      people = localStore.getCachedTable("people") || [];
    }
    this.subscribe();
    return people;
  },

  // Re-fetches from Supabase (implementation_plan.md §7.4) — load()'s in-memory
  // guard means a store never refreshes on its own after the first fetch, so a
  // missed Realtime event (dropped websocket, backgrounded tab) leaves it stale
  // for the rest of the session without this. No-ops if never loaded yet — the
  // owning view's load() handles that case.
  async reconcile() {
    if (!people) return;
    try {
      const fresh = await dataService.list("people");
      people = fresh;
      localStore.setCachedTable("people", fresh);
      notify();
    } catch {
      // offline or failed — keep current in-memory state, next trigger retries
    }
  },

  subscribe() {
    if (unsubscribe) return;
    unsubscribe = dataService.subscribe("people", (payload) => {
      applyChange(payload);
      notify();
    });
  },

  all() {
    return people || [];
  },

  get(name) {
    return people?.find((p) => p.name === name) || null;
  },

  // Returns true if the write actually reached Supabase, false if it fell
  // back to the offline sync queue — callers use this for save-status UI.
  async save(row) {
    applyChange({ eventType: "UPSERT", new: row });
    notify();

    try {
      await dataService.upsert("people", row);
      return true;
    } catch {
      syncQueue.enqueue({ table: "people", op: "upsert", payload: row });
      return false;
    }
  },

  // Restricted client-side to the "feiko" profile (see profile.js) — this app
  // has no real auth (implementation_plan.md §6/L1), so this is a soft guard
  // against casual mis-taps, not a security boundary.
  async remove(name) {
    const removed = people?.find((p) => p.name === name);
    applyChange({ eventType: "DELETE", old: { name } });
    notify();

    try {
      await dataService.remove("people", { name });
    } catch {
      if (removed) syncQueue.enqueue({ table: "people", op: "delete", match: { name } });
    }
  },
};

function applyChange(payload) {
  if (!people) people = [];

  if (payload.eventType === "DELETE") {
    people = people.filter((p) => p.name !== payload.old.name);
    return;
  }

  const row = payload.new;
  const idx = people.findIndex((p) => p.name === row.name);
  if (idx >= 0) people[idx] = row;
  else people.push(row);
}
