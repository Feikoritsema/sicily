// Day-plan assignments (implementation_plan.md §4.2 `day_plan_assignments`).
// Same optimistic-update / realtime / offline-fallback pattern as votes.js.

import { dataService } from "./data-service.js";
import { localStore } from "./local-store.js";
import { syncQueue } from "./sync-queue.js";

let assignments = null; // array of {id, date, place_id, time_slot, booked}
let unsubscribe = null;
const listeners = new Set();

function notify() {
  // See votes.js's notify() for why this must never let a listener's
  // exception abort the caller (it would silently skip the network write).
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("dayPlanStore listener error", err);
    }
  }
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

  assignmentsForDate(date) {
    return (assignments || []).filter((a) => a.date === date);
  },

  async setBooked(id, booked) {
    const idx = assignments?.findIndex((a) => a.id === id);
    if (idx == null || idx < 0) return;
    const previous = { ...assignments[idx] };
    applyChange({ eventType: "UPSERT", new: { ...previous, booked } });
    notify();

    try {
      await dataService.update("dayPlanAssignments", { id }, { booked });
    } catch {
      syncQueue.enqueue({ table: "dayPlanAssignments", op: "update", match: { id }, payload: { booked } });
    }
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

// day_plan_days: one row per trip date, already seeded (implementation_plan.md
// §6 step 2) — so this store only ever updates existing rows, never inserts.
let days = null;
let daysUnsubscribe = null;
const dayListeners = new Set();

function notifyDays() {
  for (const fn of dayListeners) {
    try {
      fn();
    } catch (err) {
      console.error("dayPlanDaysStore listener error", err);
    }
  }
}

export const dayPlanDaysStore = {
  onChange(fn) {
    dayListeners.add(fn);
    return () => dayListeners.delete(fn);
  },

  async load() {
    if (days) return days;
    try {
      days = await dataService.list("dayPlanDays");
      localStore.setCachedTable("dayPlanDays", days);
    } catch {
      days = localStore.getCachedTable("dayPlanDays") || [];
    }
    this.subscribe();
    return days;
  },

  subscribe() {
    if (daysUnsubscribe) return;
    daysUnsubscribe = dataService.subscribe("dayPlanDays", (payload) => {
      const row = payload.new;
      const idx = days.findIndex((d) => d.date === row.date);
      if (idx >= 0) days[idx] = row;
      else days.push(row);
      notifyDays();
    });
  },

  get(date) {
    return days?.find((d) => d.date === date) || { date, notes: null, designated_driver: null };
  },

  async setNotes(date, notes) {
    const idx = days.findIndex((d) => d.date === date);
    if (idx >= 0) days[idx] = { ...days[idx], notes };
    notifyDays();

    try {
      await dataService.update("dayPlanDays", { date }, { notes });
    } catch {
      syncQueue.enqueue({ table: "dayPlanDays", op: "update", match: { date }, payload: { notes } });
    }
  },
};
