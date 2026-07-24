// User-added places (new `custom_places` table — see the plan at
// ~/.claude/plans/staged-munching-crab.md §B for the schema). A custom
// place is deliberately the same shape Explore already renders/filters/
// votes/day-assigns doc-sourced places by — this store just supplies the
// extra rows, merged into the same list at render time.

import { dataService } from "./data-service.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";

let places = null; // array of {id, name, category, location_area, description, maps_url, phone, added_by, created_at}
let unsubscribe = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("customPlacesStore listener error", err);
    }
  }
}

export const customPlacesStore = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    if (places) return places;
    try {
      places = await dataService.list("customPlaces");
      localStore.setCachedTable("customPlaces", places);
    } catch {
      places = localStore.getCachedTable("customPlaces") || [];
    }
    this.subscribe();
    return places;
  },

  // See people.js's reconcile() for why this exists (§7.4 re-sync on reconnect/foreground).
  async reconcile() {
    if (!places) return;
    try {
      const fresh = await dataService.list("customPlaces");
      places = fresh;
      localStore.setCachedTable("customPlaces", fresh);
      notify();
    } catch {
      // offline or failed — keep current in-memory state, next trigger retries
    }
  },

  subscribe() {
    if (unsubscribe) return;
    unsubscribe = dataService.subscribe("customPlaces", (payload) => {
      applyChange(payload);
      notify();
    });
  },

  all() {
    return places || [];
  },

  async add(fields) {
    const row = { id: crypto.randomUUID(), ...fields };
    applyChange({ eventType: "UPSERT", new: row });
    notify();

    try {
      await dataService.insert("customPlaces", row);
    } catch {
      syncQueue.enqueue({ table: "customPlaces", op: "insert", payload: row });
    }
  },
};

function applyChange(payload) {
  if (!places) places = [];

  if (payload.eventType === "DELETE") {
    places = places.filter((p) => p.id !== payload.old.id);
    return;
  }

  const row = payload.new;
  const idx = places.findIndex((p) => p.id === row.id);
  if (idx >= 0) places[idx] = row;
  else places.push(row);
}
