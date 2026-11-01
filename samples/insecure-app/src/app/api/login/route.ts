import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

// PLANTED: custom password login with no rate limiting (brute-forceable)
export async function POST(req: Request) {
  const { email, password } = await req.json();
  const { rows } = await pool.query("select * from users where email = $1", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return new Response("Invalid login", { status: 401 });
  }
  return Response.json({ id: user.id });
}
