import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Filled in once the Supabase project exists — see feiko_todo.md steps 2-3.
// Both values are meant to be client-visible; access is controlled by RLS policies, not by hiding these.
export const SUPABASE_URL = "https://uigffkfxkzweatdcsmlv.supabase.co";
// Using Publishable key as Anon key is legacy apparently
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BmRdxHvFPhT-BcDqikf6iQ_s9AJYghv";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
