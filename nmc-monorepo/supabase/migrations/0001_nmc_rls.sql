-- Supabase RLS policies for NMC Dashboard tables.
-- Apply via: supabase db push  (or psql against the linked project).

-- Enable RLS on every domain table (idempotent).
alter table public.roster_shifts       enable row level security;
alter table public.ccb_records         enable row level security;
alter table public.incidents           enable row level security;
alter table public.contacts            enable row level security;
alter table public.tickets             enable row level security;
alter table public.bras_records        enable row level security;
alter table public.users               enable row level security;

-- Drop existing policies to keep this migration idempotent.
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('roster_shifts','ccb_records','incidents','contacts','tickets','bras_records','users')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Anonymous read on rosters, contacts, public-facing reference data.
create policy "anon read rosters"   on public.roster_shifts  for select using (true);
create policy "anon read contacts"  on public.contacts       for select using (true);
create policy "anon read ccb"       on public.ccb_records    for select using (true);
create policy "anon read incidents" on public.incidents      for select using (true);
create policy "anon read tickets"   on public.tickets        for select using (true);
create policy "anon read bras"      on public.bras_records   for select using (true);

-- Authenticated users can read user profiles (used by chatbox + auth).
create policy "auth read users" on public.users
  for select to authenticated using (true);

-- Authenticated users can write their own user row.
create policy "auth upsert self" on public.users
  for insert to authenticated with check (auth.uid() = id);
create policy "auth update self" on public.users
  for update to authenticated using (auth.uid() = id);

-- Service role bypasses RLS, so server-side mutations (Knex migrations + IMAP
-- scheduler) work without explicit policies.
alter table public.users force row level security;