"use server";
import { pool } from "@/lib/db";

// PLANTED: server action anyone can call, no login check
export async function deleteTodo(id: string) {
  await pool.query("delete from todos where id = $1", [id]);
}
