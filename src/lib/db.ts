import postgres from "postgres";

declare global {
  var __seaproofSql: postgres.Sql | undefined;
}

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL. See README.md → Setup.");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE || 10),
    prepare: false, // compatible with Supabase's transaction pooler (port 6543)
    idle_timeout: 20,
    onnotice: () => {},
  });
}

/** Lazily-created shared client (survives Next.js dev hot reloads). */
export function sql(): postgres.Sql {
  if (!globalThis.__seaproofSql) globalThis.__seaproofSql = makeClient();
  return globalThis.__seaproofSql;
}
