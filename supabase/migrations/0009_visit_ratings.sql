-- Koko: people tagged on a visit can add their own rating (and a note). Run after 0008_pages.sql.
-- Safe to run again. In the Supabase SQL editor use plain Run: this file keeps RLS on.
--
-- The logger's rating stays on the visit (entries.rating), so existing visits need nothing.
-- Everyone else on the visit gets one row here: id = visit id | their user id.
--
-- Who can write a row: only you, only your own, only on a visit you're tagged on (never the
-- logger's, and never the visit itself; that's still the logger's only).
-- Who can read a row: the rater, the logger, others tagged on the same visit, and a crewmate
-- who can see the visit while the rater is still in one of the crews it was shared with. So
-- leaving a crew hides your ratings from it (as it does your visits), and a Just me visit's
-- ratings are only ever seen by the people on it.
-- Last write wins per person per visit: an older change arriving late (from a phone that was
-- offline) can't overwrite a newer one. Being untagged removes your rating from that visit.

create table if not exists public.visit_ratings (
  id         text primary key,
  entry_id   text not null references public.entries on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  rating     numeric(2,1) not null check (rating >= 0.5 and rating <= 5 and rating * 2 = floor(rating * 2)),
  note       text not null default '' check (char_length(note) <= 400),
  updated_at timestamptz not null default now(),
  unique (entry_id, user_id),
  check (id = entry_id || '|' || user_id::text)
);
create index if not exists visit_ratings_entry on public.visit_ratings (entry_id);
alter table public.visit_ratings enable row level security;

-- are you tagged on this visit (and not its logger)? Then you can rate it.
create or replace function public.can_rate(p_entry text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entries e
                  where e.id = p_entry and e.kind = 'visit' and e.user_id <> auth.uid() and auth.uid() = any(e.tagged_ids))
$$;

-- can you see p_rater's rating on this visit?
create or replace function public.rating_visible(p_entry text, p_rater uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entries e where e.id = p_entry and (
    p_rater = auth.uid()
    or e.user_id = auth.uid()
    or auth.uid() = any(e.tagged_ids)
    -- a crewmate: through a crew the visit was shared with that you, the logger and the rater are all still in
    or (not e.private and exists (
         select 1 from public.crew_members me
           join public.crew_members owner on owner.crew_id = me.crew_id and owner.user_id = e.user_id
           join public.crew_members rater on rater.crew_id = me.crew_id and rater.user_id = p_rater
          where me.user_id = auth.uid() and me.crew_id = any(e.crew_ids)))))
$$;

drop policy if exists "visit_ratings: read the ones you can see" on public.visit_ratings;
create policy "visit_ratings: read the ones you can see" on public.visit_ratings for select to authenticated
  using (public.rating_visible(entry_id, user_id));
drop policy if exists "visit_ratings: rate a visit you're tagged on" on public.visit_ratings;
create policy "visit_ratings: rate a visit you're tagged on" on public.visit_ratings for insert to authenticated
  with check (user_id = auth.uid() and public.can_rate(entry_id));
drop policy if exists "visit_ratings: change your own" on public.visit_ratings;
create policy "visit_ratings: change your own" on public.visit_ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_rate(entry_id));
drop policy if exists "visit_ratings: remove your own" on public.visit_ratings;
create policy "visit_ratings: remove your own" on public.visit_ratings for delete to authenticated
  using (user_id = auth.uid());

-- last write wins: keep the newer change
create or replace function public.visit_ratings_newest() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.updated_at < old.updated_at then return old; end if;
  return new;
end $$;
drop trigger if exists visit_ratings_newest on public.visit_ratings;
create trigger visit_ratings_newest before update on public.visit_ratings
  for each row execute function public.visit_ratings_newest();

-- untagged (by the logger or by yourself): your rating on that visit goes
create or replace function public.unrate_on_untag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.visit_ratings r where r.entry_id = new.id and not (r.user_id = any(coalesce(new.tagged_ids,'{}')));
  return new;
end $$;
drop trigger if exists entries_unrate on public.entries;
create trigger entries_unrate after update of tagged_ids on public.entries
  for each row execute function public.unrate_on_untag();

revoke all on function public.unrate_on_untag(), public.visit_ratings_newest() from public, anon, authenticated;
revoke all on function public.can_rate(text), public.rating_visible(text, uuid) from public, anon;
grant execute on function public.can_rate(text), public.rating_visible(text, uuid) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'visit_ratings') then
    alter publication supabase_realtime add table public.visit_ratings;
  end if;
end $$;
