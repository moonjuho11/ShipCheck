import { createClient } from "@supabase/supabase-js";

// Fine: the anon key is meant to be public.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
