import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// PLANTED: admin endpoint with no login check
export async function GET() {
  const { data } = await admin.from("profiles").select("*");
  return Response.json(data);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  await admin.from("profiles").delete().eq("id", id);
  return Response.json({ ok: true });
}
