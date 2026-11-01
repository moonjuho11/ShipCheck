create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  body text not null
);
alter table public.notes enable row level security;
create policy "Owners read notes" on public.notes for select using (auth.uid() = user_id);
create policy "Owners write notes" on public.notes for insert with check (auth.uid() = user_id);
