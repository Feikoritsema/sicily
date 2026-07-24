// Quick in-the-moment polls ("tonight: Ortigia or Marzamemi?") — two related
// tables, same optimistic-update/realtime/offline-fallback pattern as every
// other store (see votes.js for the closest template — composite-key upsert
// semantics on quick_poll_votes mirror votes' (place_id, person_name) shape).

import { dataService } from "./data-service.js";
import { syncQueue } from "./sync-queue.js";

let polls = null; // array of {id, question, options, created_by, created_at, closed}
let pollsUnsubscribe = null;
const pollListeners = new Set();

function notifyPolls() {
  for (const fn of pollListeners) {
    try {
      fn();
    } catch (err) {
      console.error("quickPollsStore listener error", err);
    }
  }
}

export const quickPollsStore = {
  onChange(fn) {
    pollListeners.add(fn);
    return () => pollListeners.delete(fn);
  },

  async load() {
    if (polls) return polls;
    try {
      polls = await dataService.list("quickPolls");
    } catch {
      polls = [];
    }
    this.subscribe();
    return polls;
  },

  async reconcile() {
    if (!polls) return;
    try {
      polls = await dataService.list("quickPolls");
      notifyPolls();
    } catch {
      // offline or failed — keep current in-memory state, next trigger retries
    }
  },

  subscribe() {
    if (pollsUnsubscribe) return;
    pollsUnsubscribe = dataService.subscribe("quickPolls", (payload) => {
      applyPollChange(payload);
      notifyPolls();
    });
  },

  // The one poll currently "live" — most recently created, not yet closed.
  // No cross-device notion of "expired," just this trip-wide open/closed flag.
  current() {
    return (polls || [])
      .filter((p) => !p.closed)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
  },

  async create(question, options, createdBy) {
    // The UI form already validates this, but the store shouldn't trust
    // callers to have done so — a bad direct call would otherwise create a
    // real, group-visible broken poll with no way to fix it except closing it.
    const cleanQuestion = question?.trim();
    const cleanOptions = (options || []).map((o) => o?.trim()).filter(Boolean);
    if (!cleanQuestion || cleanOptions.length < 2) return;

    const row = {
      id: crypto.randomUUID(),
      question: cleanQuestion,
      options: cleanOptions,
      created_by: createdBy,
      created_at: new Date().toISOString(),
      closed: false,
    };
    applyPollChange({ eventType: "UPSERT", new: row });
    notifyPolls();

    try {
      await dataService.insert("quickPolls", row);
    } catch {
      syncQueue.enqueue({ table: "quickPolls", op: "insert", payload: row });
    }
  },

  async close(id) {
    const existing = polls?.find((p) => p.id === id);
    if (!existing) return;
    applyPollChange({ eventType: "UPSERT", new: { ...existing, closed: true } });
    notifyPolls();

    try {
      await dataService.update("quickPolls", { id }, { closed: true });
    } catch {
      syncQueue.enqueue({ table: "quickPolls", op: "update", match: { id }, payload: { closed: true } });
    }
  },
};

function applyPollChange(payload) {
  if (!polls) polls = [];

  if (payload.eventType === "DELETE") {
    polls = polls.filter((p) => p.id !== payload.old.id);
    return;
  }

  const row = payload.new;
  const idx = polls.findIndex((p) => p.id === row.id);
  if (idx >= 0) polls[idx] = row;
  else polls.push(row);
}

let pollVotes = null; // array of {poll_id, person_name, choice, voted_at}
let votesUnsubscribe = null;
const voteListeners = new Set();

function notifyVotes() {
  for (const fn of voteListeners) {
    try {
      fn();
    } catch (err) {
      console.error("quickPollVotesStore listener error", err);
    }
  }
}

export const quickPollVotesStore = {
  onChange(fn) {
    voteListeners.add(fn);
    return () => voteListeners.delete(fn);
  },

  async load() {
    if (pollVotes) return pollVotes;
    try {
      pollVotes = await dataService.list("quickPollVotes");
    } catch {
      pollVotes = [];
    }
    this.subscribe();
    return pollVotes;
  },

  async reconcile() {
    if (!pollVotes) return;
    try {
      pollVotes = await dataService.list("quickPollVotes");
      notifyVotes();
    } catch {
      // offline or failed — keep current in-memory state, next trigger retries
    }
  },

  subscribe() {
    if (votesUnsubscribe) return;
    votesUnsubscribe = dataService.subscribe("quickPollVotes", (payload) => {
      applyVoteChange(payload);
      notifyVotes();
    });
  },

  tallyFor(pollId, option) {
    return (pollVotes || []).filter((v) => v.poll_id === pollId && v.choice === option).length;
  },

  myChoiceFor(pollId, personName) {
    return (pollVotes || []).find((v) => v.poll_id === pollId && v.person_name === personName)?.choice || null;
  },

  async cast(pollId, personName, choice) {
    const row = { poll_id: pollId, person_name: personName, choice, voted_at: new Date().toISOString() };
    applyVoteChange({ eventType: "UPSERT", new: row });
    notifyVotes();

    try {
      await dataService.upsert("quickPollVotes", row);
    } catch {
      syncQueue.enqueue({ table: "quickPollVotes", op: "upsert", payload: row });
    }
  },
};

function applyVoteChange(payload) {
  if (!pollVotes) pollVotes = [];
  const key = (v) => `${v.poll_id}::${v.person_name}`;

  if (payload.eventType === "DELETE") {
    const oldKey = key(payload.old);
    pollVotes = pollVotes.filter((v) => key(v) !== oldKey);
    return;
  }

  const row = payload.new;
  const idx = pollVotes.findIndex((v) => key(v) === key(row));
  if (idx >= 0) pollVotes[idx] = row;
  else pollVotes.push(row);
}
