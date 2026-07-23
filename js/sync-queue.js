// Pending-writes queue for offline mutations (implementation_plan.md §7.4).
// Each entry is the literal Supabase call to make once back online.

import { dataService } from "./data-service.js";

const QUEUE_KEY = "sicily:syncQueue";
const RETRY_DELAYS_MS = [5000, 20000, 60000];

function readQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  notifyListeners(queue);
}

const listeners = new Set();
function notifyListeners(queue) {
  for (const fn of listeners) fn(queue);
}

export const syncQueue = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  pending() {
    return readQueue();
  },

  enqueue({ table, op, match, payload }) {
    const queue = readQueue();
    queue.push({ id: crypto.randomUUID(), table, op, match, payload, ts: Date.now(), attempts: 0 });
    writeQueue(queue);
  },

  async replay() {
    let queue = readQueue();
    if (queue.length === 0) return;

    const remaining = [];
    for (const entry of queue) {
      try {
        await applyEntry(entry);
      } catch (err) {
        entry.attempts = (entry.attempts || 0) + 1;
        remaining.push(entry);
      }
    }
    writeQueue(remaining);
  },
};

async function applyEntry(entry) {
  const { table, op, match, payload } = entry;
  if (op === "insert") return dataService.insert(table, payload);
  if (op === "update") return dataService.update(table, match, payload);
  if (op === "upsert") return dataService.upsert(table, payload);
  if (op === "delete") return dataService.remove(table, match);
  throw new Error(`Unknown sync op: ${op}`);
}

window.addEventListener("online", () => syncQueue.replay());
