// Vote tallying + optimistic writes for the `votes` table (implementation_plan.md §4.2).
// A composite-key table (place_id, person_name): value null means "no vote" and
// deletes the row rather than storing a null, per the schema's own rule.

import { dataService } from "./data-service.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";

let votes = null; // array of {place_id, person_name, value, comment}
let unsubscribe = null;
const listeners = new Set();

function notify() {
  // A listener throwing (e.g. a view re-rendering DOM that's no longer
  // mounted) must never abort the caller — cast() calls notify() *before*
  // its network write, so an uncaught exception here would silently skip
  // the write for every listener, not just the one that errored.
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("votesStore listener error", err);
    }
  }
}

export const votesStore = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    if (votes) return votes;
    try {
      votes = await dataService.list("votes");
      localStore.setCachedTable("votes", votes);
    } catch {
      votes = localStore.getCachedTable("votes") || [];
    }
    this.subscribe();
    return votes;
  },

  subscribe() {
    if (unsubscribe) return;
    unsubscribe = dataService.subscribe("votes", (payload) => {
      applyChange(payload);
      notify();
    });
  },

  tallyFor(placeId) {
    if (!votes) return 0;
    return votes.filter((v) => v.place_id === placeId).reduce((sum, v) => sum + v.value, 0);
  },

  myVoteFor(placeId, personName) {
    const row = votes?.find((v) => v.place_id === placeId && v.person_name === personName);
    return row ? row.value : 0;
  },

  // Toggles: voting the same direction again clears the vote.
  async cast(placeId, personName, value) {
    const existing = this.myVoteFor(placeId, personName);
    const nextValue = existing === value ? null : value;

    applyChange({
      eventType: nextValue === null ? "DELETE" : "UPSERT",
      new: nextValue === null ? undefined : { place_id: placeId, person_name: personName, value: nextValue },
      old: { place_id: placeId, person_name: personName },
    });
    notify();

    const match = { place_id: placeId, person_name: personName };
    try {
      if (nextValue === null) await dataService.remove("votes", match);
      else await dataService.upsert("votes", { place_id: placeId, person_name: personName, value: nextValue });
    } catch {
      syncQueue.enqueue(
        nextValue === null
          ? { table: "votes", op: "delete", match }
          : { table: "votes", op: "upsert", payload: { place_id: placeId, person_name: personName, value: nextValue } }
      );
    }
  },
};

function applyChange(payload) {
  if (!votes) votes = [];
  const key = (v) => `${v.place_id}::${v.person_name}`;

  if (payload.eventType === "DELETE") {
    const oldKey = key(payload.old);
    votes = votes.filter((v) => key(v) !== oldKey);
    return;
  }

  const row = payload.new;
  const idx = votes.findIndex((v) => key(v) === key(row));
  if (idx >= 0) votes[idx] = row;
  else votes.push(row);
}
