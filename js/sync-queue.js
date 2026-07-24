// Pending-writes queue for offline mutations (implementation_plan.md §7.4).
// Each entry is the literal Supabase call to make once back online.

import { dataService } from "./data-service.js";

const QUEUE_KEY = "sicily:syncQueue";
let replaying = false;

function readQueue() {
  const raw = localStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupted queue (interrupted write, manual tampering) — an unguarded
    // throw here used to blank the entire app on boot, since pending() is
    // the first thing boot() calls (see context/error_handling_audit.md).
    console.error("sicily: corrupted sync queue — resetting");
    localStorage.removeItem(QUEUE_KEY);
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    // Quota exceeded etc. — the queue is also the app's last-resort safety
    // net for a failed write, so losing it silently would be worse than
    // just logging and moving on; there's nothing else to fall back to here.
    console.error("sicily: failed to persist sync queue", err);
  }
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
    // Re-entrancy guard: replay() is called both once on app boot and on every
    // `online` event, so a flaky connection can trigger two overlapping calls.
    if (replaying) return;
    replaying = true;

    try {
      const queue = readQueue();
      if (queue.length === 0) return;

      const succeededIds = new Set();
      const bumpedAttempts = new Map();
      for (const entry of queue) {
        try {
          await applyEntry(entry);
          succeededIds.add(entry.id);
        } catch {
          bumpedAttempts.set(entry.id, (entry.attempts || 0) + 1);
        }
      }

      // Re-read fresh here rather than reusing the `queue` snapshot from
      // above: `await applyEntry(...)` yields to the event loop on every
      // iteration, so another part of the app can call enqueue() (its own
      // read-modify-write of the same key) while this loop is still running.
      // Writing back a stale snapshot at the end would silently erase
      // whatever that concurrent enqueue() added.
      const latest = readQueue()
        .filter((e) => !succeededIds.has(e.id))
        .map((e) => (bumpedAttempts.has(e.id) ? { ...e, attempts: bumpedAttempts.get(e.id) } : e));
      writeQueue(latest);
    } finally {
      replaying = false;
    }
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
