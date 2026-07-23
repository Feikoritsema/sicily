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

  async save(row) {
    applyChange({ eventType: "UPSERT", new: row });
    notify();

    try {
      await dataService.upsert("people", row);
    } catch {
      syncQueue.enqueue({ table: "people", op: "upsert", payload: row });
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
