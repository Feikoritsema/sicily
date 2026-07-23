// Day-plan assignments (implementation_plan.md §4.2 `day_plan_assignments`).
// Same optimistic-update / realtime / offline-fallback pattern as votes.js.

import { dataService } from "./data-service.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";

let assignments = null; // array of {id, date, place_id, time_slot, booked}
let unsubscribe = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn();
}

export const dayPlanStore = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    if (assignments) return assignments;
    try {
      assignments = await dataService.list("dayPlanAssignments");
      localStore.setCachedTable("dayPlanAssignments", assignments);
    } catch {
      assignments = localStore.getCachedTable("dayPlanAssignments") || [];
    }
    this.subscribe();
    return assignments;
  },

  subscribe() {
    if (unsubscribe) return;
    unsubscribe = dataService.subscribe("dayPlanAssignments", (payload) => {
      applyChange(payload);
      notify();
    });
  },

  assignmentsFor(placeId) {
    return (assignments || []).filter((a) => a.place_id === placeId);
  },

  async add(date, placeId, timeSlot) {
    const tempId = `pending-${crypto.randomUUID()}`;
    const optimisticRow = { id: tempId, date, place_id: placeId, time_slot: timeSlot || null, booked: false };
    applyChange({ eventType: "UPSERT", new: optimisticRow });
    notify();

    try {
      const [saved] = await dataService.insert("dayPlanAssignments", { date, place_id: placeId, time_slot: timeSlot || null });
      applyChange({ eventType: "DELETE", old: { id: tempId } });
      applyChange({ eventType: "UPSERT", new: saved });
      notify();
    } catch {
      syncQueue.enqueue({ table: "dayPlanAssignments", op: "insert", payload: { date, place_id: placeId, time_slot: timeSlot || null } });
    }
  },

  async remove(id) {
    const removed = assignments?.find((a) => a.id === id);
    applyChange({ eventType: "DELETE", old: { id } });
    notify();

    try {
      await dataService.remove("dayPlanAssignments", { id });
    } catch {
      if (removed) syncQueue.enqueue({ table: "dayPlanAssignments", op: "delete", match: { id } });
    }
  },
};

function applyChange(payload) {
  if (!assignments) assignments = [];

  if (payload.eventType === "DELETE") {
    assignments = assignments.filter((a) => a.id !== payload.old.id);
    return;
  }

  const row = payload.new;
  const idx = assignments.findIndex((a) => a.id === row.id);
  if (idx >= 0) assignments[idx] = row;
  else assignments.push(row);
}
