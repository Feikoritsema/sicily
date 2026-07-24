// Re-syncs every store from Supabase when the tab is foregrounded or comes back
// online (implementation_plan.md §7.4). Each store's load() only ever fetches
// once per page session — without this, a missed Realtime event (dropped
// websocket, a backgrounded iOS Safari tab suspending network activity) leaves
// that store's data silently stale until a hard reload. Side-effect import
// only (registers its listeners); nothing else in the app calls into this file.

import { peopleStore } from "./people.js";
import { votesStore } from "./votes.js";
import { dayPlanStore, dayPlanDaysStore } from "./day-plan.js";
import { customPlacesStore } from "./custom-places.js";
import { sharedItemsStore } from "./shared-items.js";
import { shoppingListStore } from "./shopping-list.js";
import { tripSettingsStore } from "./trip-settings.js";
import { quickPollsStore, quickPollVotesStore } from "./quick-polls.js";

const STORES = [
  peopleStore,
  votesStore,
  dayPlanStore,
  dayPlanDaysStore,
  customPlacesStore,
  sharedItemsStore,
  shoppingListStore,
  tripSettingsStore,
  quickPollsStore,
  quickPollVotesStore,
];

function reconcileAll() {
  for (const store of STORES) store.reconcile();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") reconcileAll();
});
window.addEventListener("online", reconcileAll);
