// Applies supabase/migrations/*.sql in order. Usage: npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const dir = path.join(process.cwd(), "supabase", "migrations");
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    console.log(`→ applying ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(path.join(dir, file), "utf8"));
      await tx`insert into schema_migrations (name) values (${file})`;
    });
  }
  console.log("✓ database is up to date");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
