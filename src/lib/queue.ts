import type postgres from "postgres";
import { sql } from "./db";

export interface Job { id: string; scan_id: string; attempts: number; }

export const MAX_ATTEMPTS = 2;

export async function enqueue(tx: postgres.Sql | postgres.TransactionSql, scanId: string) {
  await tx`insert into jobs (scan_id) values (${scanId})`;
}

/** Atomically claim the next ready job. Safe to call from many workers at once. */
export async function claimJob(workerId: string): Promise<Job | null> {
  const [job] = await sql()<Job[]>`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id = (
      select id from jobs where status = 'queued' and run_after <= now()
      order by id for update skip locked limit 1
    )
    returning id, scan_id, attempts`;
  return job ?? null;
}

export async function finishJob(id: string, ok: boolean, error?: string) {
  await sql()`update jobs set status = ${ok ? "done" : "failed"}, last_error = ${error ?? null}, locked_at = null where id = ${id}`;
}

/** Re-queue jobs whose worker died mid-scan. */
export async function reapStaleJobs(olderThanMinutes = 30): Promise<string[]> {
  const db = sql();
  const requeued = await db<{ scan_id: string }[]>`
    update jobs set status = 'queued', locked_at = null, run_after = now() + interval '30 seconds'
    where status = 'running' and locked_at < now() - make_interval(mins => ${olderThanMinutes}) and attempts < ${MAX_ATTEMPTS}
    returning scan_id`;
  const dead = await db<{ scan_id: string }[]>`
    update jobs set status = 'failed', last_error = 'worker timed out'
    where status = 'running' and locked_at < now() - make_interval(mins => ${olderThanMinutes}) and attempts >= ${MAX_ATTEMPTS}
    returning scan_id`;
  for (const d of dead) {
    await db`update scans set status = 'failed', error = 'The scan took too long and was stopped. Please try again.', finished_at = now() where id = ${d.scan_id} and status <> 'completed'`;
  }
  return requeued.map((r) => r.scan_id);
}
