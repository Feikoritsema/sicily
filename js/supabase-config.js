import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Filled in once the Supabase project exists — see feiko_todo.md steps 2-3.
// Both values are meant to be client-visible; access is controlled by RLS policies, not by hiding these.
export const SUPABASE_URL = "REPLACE_WITH_PROJECT_URL";
export const SUPABASE_ANON_KEY = "REPLACE_WITH_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
