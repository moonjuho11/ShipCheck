import { pool } from "@/lib/db";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  // PLANTED: SQL injection + no error handling
  const result = await pool.query(`SELECT * FROM products WHERE name ILIKE '%${q}%'`);
  return Response.json(result.rows);
}
