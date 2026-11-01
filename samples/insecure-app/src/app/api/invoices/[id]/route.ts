import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const token = cookies().get("sb-access-token")?.value;
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return new Response("Unauthorized", { status: 401 });

  // PLANTED (IDOR): any logged-in user can read any invoice by changing the id
  const { data, error } = await admin.from("invoices").select("*").eq("id", params.id).single();
  if (error) return new Response("Not found", { status: 404 });
  return Response.json(data);
}
