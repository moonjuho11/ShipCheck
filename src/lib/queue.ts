import type postgres from "postgres";
import { sql } from "./db";

export interface Job { id: string; scan_id: string; attempts: number; }

/** A job and the worker lane that claimed it. Writes check this, so a worker that lost a job can't touch it. */
export interface JobOwner { id: string; workerId: string; }

/** The first try plus two retries. */
export const MAX_ATTEMPTS = 3;

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

/** Prove this worker is alive and still owns the job, and find out if the user cancelled it. */
export async function heartbeat(owner: JobOwner): Promise<"ok" | "canceled" | "lost"> {
  const [row] = await sql()<{ status: string }[]>`
    update jobs j set locked_at = now() from scans s
    where j.id = ${owner.id} and j.locked_by = ${owner.workerId} and j.status = 'running' and s.id = j.scan_id
    returning s.status`;
  return !row ? "lost" : row.status === "canceled" ? "canceled" : "ok";
}

export async function finishJob(owner: JobOwner, ok: boolean, error?: string) {
  await sql()`
    update jobs set status = ${ok ? "done" : "failed"}, last_error = ${error ?? null}, locked_at = null
    where id = ${owner.id} and locked_by = ${owner.workerId} and status = 'running'`;
}

/** Put a scan back in line with its progress cleared. A cancelled scan stays cancelled. */
async function scanBackToQueue(tx: postgres.TransactionSql, scanId: string) {
  await tx`
    update scans set status = 'queued', steps = (
      select coalesce(jsonb_agg((step || '{"status":"pending"}'::jsonb) - 'detail' order by n), '[]'::jsonb)
      from jsonb_array_elements(steps) with ordinality as t(step, n)
    )
    where id = ${scanId} and status = 'running'`;
}

/** Give a job back to the queue: to retry after a delay, or (refundAttempt) because the worker is shutting down. */
export async function requeueJob(owner: JobOwner, opts: { delaySeconds: number; refundAttempt?: boolean; error?: string }) {
  await sql().begin(async (tx) => {
    const [job] = await tx<{ scan_id: string }[]>`
      update jobs set status = 'queued', locked_at = null, locked_by = null,
        run_after = now() + make_interval(secs => ${opts.delaySeconds}),
        attempts = attempts - ${opts.refundAttempt ? 1 : 0},
        last_error = coalesce(${opts.error ?? null}, last_error)
      where id = ${owner.id} and locked_by = ${owner.workerId} and status = 'running'
      returning scan_id`;
    if (job) await scanBackToQueue(tx, job.scan_id);
  });
}

export interface DeadScan { id: string; repo_full_name: string; check_run_id: string | null; installation_id: string | null; }

export const DIED_MESSAGE = "This scan kept stopping unexpectedly, so we gave up on it. Please try again in a few minutes.";

/** Recover jobs whose worker stopped checking in: back in line, or failed once out of attempts. */
export async function reapStaleJobs(staleSeconds: number): Promise<{ requeued: string[]; dead: DeadScan[] }> {
  return sql().begin(async (tx) => {
    const stale = await tx<Job[]>`
      select id, scan_id, attempts from jobs
      where status = 'running' and locked_at < now() - make_interval(secs => ${staleSeconds})
      for update skip locked`;
    const requeued: string[] = [];
    const dead: DeadScan[] = [];
    for (const job of stale) {
      if (job.attempts < MAX_ATTEMPTS) {
        await tx`update jobs set status = 'queued', locked_at = null, locked_by = null, last_error = 'worker stopped responding' where id = ${job.id}`;
        await scanBackToQueue(tx, job.scan_id);
        requeued.push(job.scan_id);
      } else {
        await tx`update jobs set status = 'failed', locked_at = null, last_error = 'worker stopped responding' where id = ${job.id}`;
        dead.push(...await tx<DeadScan[]>`
          update scans set status = 'failed', error = ${DIED_MESSAGE}, finished_at = now()
          where id = ${job.scan_id} and status in ('queued','running')
          returning id, repo_full_name, check_run_id, installation_id`);
      }
    }
    return { requeued, dead };
  });
}

export const WORKER_ONLINE_SECONDS = 60;

export async function workerSeen(workerId: string) {
  await sql()`
    insert into worker_heartbeats (worker_id) values (${workerId})
    on conflict (worker_id) do update set seen_at = now()`;
}

export async function workerGone(workerId: string) {
  await sql()`delete from worker_heartbeats where worker_id = ${workerId} or seen_at < now() - interval '1 day'`;
}

/** Where a queued scan stands: how many jobs are ahead of it and how many workers are online. */
export async function queueStatus(scanId: string): Promise<{ ahead: number; workersOnline: number }> {
  const [row] = await sql()<{ ahead: number; workers_online: number }[]>`
    select
      (select count(*)::int from jobs j where j.status in ('queued','running')
        and j.id < coalesce((select min(id) from jobs where scan_id = ${scanId} and status = 'queued'), 0)) as ahead,
      (select count(*)::int from worker_heartbeats where seen_at > now() - make_interval(secs => ${WORKER_ONLINE_SECONDS})) as workers_online`;
  return { ahead: row.ahead, workersOnline: row.workers_online };
}

export async function queueHealth(): Promise<{ queued: number; running: number; oldestQueuedSeconds: number; workersOnline: number }> {
  const [row] = await sql()<{ queued: number; running: number; oldest: number; workers_online: number }[]>`
    select
      count(*) filter (where status = 'queued')::int as queued,
      count(*) filter (where status = 'running')::int as running,
      coalesce(extract(epoch from now() - min(created_at) filter (where status = 'queued')), 0)::int as oldest,
      (select count(*)::int from worker_heartbeats where seen_at > now() - make_interval(secs => ${WORKER_ONLINE_SECONDS})) as workers_online
    from jobs where status in ('queued','running')`;
  return { queued: row.queued, running: row.running, oldestQueuedSeconds: row.oldest, workersOnline: row.workers_online };
}
