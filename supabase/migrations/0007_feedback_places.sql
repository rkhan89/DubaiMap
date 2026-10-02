-- Koko: feedback, error reports, and a rate limit for Google place suggestions. Run after 0006.
-- Safe to run again. Use plain Run in the SQL editor.
-- Read feedback and errors in the dashboard: Table Editor → feedback / client_errors.

/* ---------- feedback from the app (Settings → Send feedback) ---------- */
create table if not exists public.feedback (
  id         text primary key check (char_length(id) between 1 and 80),
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  kind       text not null check (kind in ('bug','idea','other')),
  message    text not null check (char_length(message) between 1 and 2000),
  app_info   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback: send yours" on public.feedback;
create policy "feedback: send yours" on public.feedback for insert to authenticated
  with check (user_id = auth.uid() and pg_column_size(app_info) < 4000);
drop policy if exists "feedback: read yours" on public.feedback;
create policy "feedback: read yours" on public.feedback for select to authenticated using (user_id = auth.uid());

/* ---------- errors the app hit on someone's phone (what broke and the device; never what they typed) ---------- */
create table if not exists public.client_errors (
  id         text primary key check (char_length(id) between 1 and 80),
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  message    text not null check (char_length(message) <= 500),
  stack      text not null default '' check (char_length(stack) <= 2000),
  where_     text not null default '' check (char_length(where_) <= 200),
  app_info   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists client_errors_at on public.client_errors (created_at);
alter table public.client_errors enable row level security;
-- how many reports you've sent today (people can't read the table, so this counts for them)
create or replace function public.my_error_count_today() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.client_errors where user_id = auth.uid() and created_at > now() - interval '1 day'
$$;
revoke all on function public.my_error_count_today() from public, anon;
grant execute on function public.my_error_count_today() to authenticated;
drop policy if exists "client_errors: send yours" on public.client_errors;
create policy "client_errors: send yours" on public.client_errors for insert to authenticated
  -- at most 50 a day from one person, so a loop on one phone can't flood the table
  with check (user_id = auth.uid() and pg_column_size(app_info) < 4000 and public.my_error_count_today() < 50);

/* ---------- Google place suggestions: 300 an hour per person (typing is cheap but not unlimited) ---------- */
create table if not exists public.places_rate (
  user_id uuid not null references public.profiles on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists places_rate_user_at on public.places_rate (user_id, at);
alter table public.places_rate enable row level security;   -- no policies: only the function below
create or replace function public.places_rate_hit() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.places_rate where user_id = auth.uid() and at < now() - interval '1 hour';
  insert into public.places_rate (user_id) values (auth.uid());
  select count(*) into n from public.places_rate where user_id = auth.uid();
  return n;
end $$;
revoke all on function public.places_rate_hit() from public, anon;
grant execute on function public.places_rate_hit() to authenticated;
grant insert, select on public.feedback to authenticated;
grant insert on public.client_errors to authenticated;

/* ---------- clean-up: error reports after 90 days, feedback after a year ---------- */
create or replace function public.prune_reports() returns void
language sql security definer set search_path = public as $$
  delete from public.client_errors where created_at < now() - interval '90 days';
  delete from public.feedback where created_at < now() - interval '365 days';
  delete from public.places_rate where at < now() - interval '1 day';
$$;
revoke all on function public.prune_reports() from public, anon, authenticated;
-- run it on the 1st of every month if Supabase's scheduler (pg_cron) is switched on;
-- otherwise run "select public.prune_reports();" in the SQL editor now and then
do $$ begin
  perform cron.schedule('koko-prune-reports', '0 3 1 * *', 'select public.prune_reports()');
exception when others then null;
end $$;
