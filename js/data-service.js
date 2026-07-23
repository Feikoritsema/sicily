// The only file that talks to Supabase directly (see implementation_plan.md §7.1).
// Thin wrappers per table, plus a subscribe() helper for Realtime. Every table
// mirrors implementation_plan.md §4.2 exactly — field names match the SQL in §6.

import { supabase } from "./supabase-config.js";

const TABLES = {
  sharedItemClaims: "shared_item_claims",
  shoppingList: "shopping_list",
  votes: "votes",
  dayPlanDays: "day_plan_days",
  dayPlanAssignments: "day_plan_assignments",
  tripSettings: "trip_settings",
  people: "people",
  customPlaces: "custom_places",
};

async function selectAll(table) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return data;
}

export const dataService = {
  tables: TABLES,

  async list(tableKey) {
    return selectAll(TABLES[tableKey]);
  },

  async insert(tableKey, row) {
    const { data, error } = await supabase.from(TABLES[tableKey]).insert(row).select();
    if (error) throw error;
    return data;
  },

  async update(tableKey, match, changes) {
    let q = supabase.from(TABLES[tableKey]).update(changes);
    for (const [col, val] of Object.entries(match)) q = q.eq(col, val);
    const { data, error } = await q.select();
    if (error) throw error;
    return data;
  },

  async upsert(tableKey, row) {
    const { data, error } = await supabase.from(TABLES[tableKey]).upsert(row).select();
    if (error) throw error;
    return data;
  },

  async remove(tableKey, match) {
    let q = supabase.from(TABLES[tableKey]).delete();
    for (const [col, val] of Object.entries(match)) q = q.eq(col, val);
    const { error } = await q;
    if (error) throw error;
  },

  // Subscribes to Postgres change notifications for one table (Realtime).
  // onChange receives the raw payload (see Supabase docs for shape).
  subscribe(tableKey, onChange) {
    const table = TABLES[tableKey];
    const channel = supabase
      .channel(`realtime:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};
