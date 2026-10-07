-- Koko: Critters, and the end of points. Run after 0010_pin_color.sql. Safe to run again.
-- In the Supabase SQL editor use plain Run: this file keeps RLS on for every table.
--
-- 1. points are gone from the app. Before the column is dropped, every profile's points are copied
--    to archive.profiles_points (a schema the app's API can't see). The last statement lists that
--    backup so you can download it as CSV from the results panel. Deleting an account deletes its row.
-- 2. critter_catches: one row per person per critter (id = user | critter), never edited. You add
--    your own; you and your crewmates can read them.
-- 3. profiles.favourite_critter_id: one of the critters you've caught, or none. Crewmates read it
--    with the rest of your profile.

/* ---------- 1. back up points, then drop them ---------- */
create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;
create table if not exists archive.profiles_points (
  user_id     uuid primary key,
  points      integer not null,
  backed_up_at timestamptz not null default now()
);
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='points') then
    insert into archive.profiles_points (user_id, points)
      select id, points from public.profiles
      on conflict (user_id) do nothing;
    alter table public.profiles drop column points;
  end if;
end $$;
-- your backup row goes with your account
create or replace function public.forget_points_backup() returns trigger
language plpgsql security definer set search_path = public, archive as $$
begin delete from archive.profiles_points where user_id = old.id; return old; end $$;
drop trigger if exists profiles_forget_points on public.profiles;
create trigger profiles_forget_points after delete on public.profiles for each row execute function public.forget_points_backup();
revoke all on function public.forget_points_backup() from public, anon, authenticated;

/* ---------- 2. catches ---------- */
create table if not exists public.critter_catches (
  id         text primary key,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  critter_id text not null check (critter_id ~ '^[a-z_]{2,40}$'),
  caught_at  timestamptz not null default now(),
  lat        double precision check (lat between -90 and 90),
  lng        double precision check (lng between -180 and 180),
  accuracy_m real check (accuracy_m >= 0),
  spot       text not null default '' check (char_length(spot) <= 80),
  venue_id   text references public.venues on delete set null,
  unique (user_id, critter_id),
  check (id = user_id::text || '|' || critter_id)
);
alter table public.critter_catches enable row level security;
drop policy if exists "critter_catches: you and your crews read" on public.critter_catches;
create policy "critter_catches: you and your crews read" on public.critter_catches for select to authenticated
  using (user_id in (select public.crewmate_ids()));
drop policy if exists "critter_catches: add your own" on public.critter_catches;
create policy "critter_catches: add your own" on public.critter_catches for insert to authenticated
  with check (user_id = auth.uid());
-- (no update policy: a catch is never edited; deleting your account removes them)

/* ---------- 3. your favourite ---------- */
alter table public.profiles add column if not exists favourite_critter_id text;
create or replace function public.favourite_is_caught() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.favourite_critter_id is not null and not exists (
       select 1 from public.critter_catches c where c.user_id = new.id and c.critter_id = new.favourite_critter_id) then
    raise exception 'You can only pick a critter you''ve caught';
  end if;
  return new;
end $$;
drop trigger if exists profiles_favourite_caught on public.profiles;
create trigger profiles_favourite_caught before insert or update of favourite_critter_id on public.profiles
  for each row execute function public.favourite_is_caught();
revoke all on function public.favourite_is_caught() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'critter_catches') then
    alter publication supabase_realtime add table public.critter_catches;
  end if;
end $$;

-- the points backup, to download as CSV from the results panel
select user_id, points, backed_up_at from archive.profiles_points order by points desc;
