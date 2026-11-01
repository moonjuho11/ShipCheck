import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const form = await req.formData();
  const file = form.get("file") as File;
  // PLANTED: no file type or size check, and the user picks the file name
  const { error } = await supabase.storage.from("avatars").upload(`public/${file.name}`, file);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}
