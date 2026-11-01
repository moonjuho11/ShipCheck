import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabase() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: () => {} },
  });
}

export async function requireUser() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return { supabase, user };
}
