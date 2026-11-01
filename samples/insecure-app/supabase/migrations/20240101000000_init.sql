-- profiles: RLS on, but the policy lets anyone do anything (PLANTED)
create table public.profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  is_admin boolean default false
);
alter table public.profiles enable row level security;
create policy "Allow all" on public.profiles for all using (true) with check (true);

-- invoices: RLS never enabled (PLANTED)
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  amount_cents integer not null,
  pdf_url text
);

-- todos: done right (should NOT be flagged)
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null
);
alter table public.todos enable row level security;
create policy "Owners manage their todos" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
