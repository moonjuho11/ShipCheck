import { requireUser } from "@/lib/supabase-server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("notes").select("id, body").eq("id", id).eq("user_id", user.id).single();
    if (error || !data) return new Response("Not found", { status: 404 });
    return Response.json(data);
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response("Something went wrong", { status: 500 });
  }
}
