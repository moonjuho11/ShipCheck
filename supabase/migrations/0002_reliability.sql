-- Users can cancel a scan.
alter table scans drop constraint if exists scans_status_check;
alter table scans add constraint scans_status_check check (status in ('queued','running','completed','failed','canceled'));

-- Each worker checks in here, so we can tell people when no scanners are online.
create table if not exists worker_heartbeats (
  worker_id text primary key,
  seen_at   timestamptz not null default now()
);
alter table worker_heartbeats enable row level security;
