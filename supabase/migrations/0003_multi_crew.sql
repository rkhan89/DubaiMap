-- Koko: several crews per person (up to 5), and tagging who you went with. Run after 0002_share.sql.
-- Safe to run again.
-- In the Supabase SQL editor use plain Run: this file keeps RLS on for every table.
--
-- What changes:
--   * crew_members: a person can be in up to 5 crews (was exactly one).
--   * entries and photos say which crews they're shared with (crew_ids). A crewmate sees a
--     shared visit only if it was shared with a crew you are BOTH in right now.
--     private = shared with nobody (crew_ids is empty).
--   * leaving (or being removed from) a crew takes your posts out of it automatically.
--   * events, the crew book, RSVPs: "my crew" becomes "any of my crews".
--   * create_crew / join_crew no longer leave your current crew; leave_crew takes the crew.
--   * tagging: a visit can name who you went with (tagged_ids, people who share a crew with you).
--     Tagged people can see that visit and its photos, and can take themselves off it.

/* ---------- membership ---------- */
alter table public.crew_members drop constraint if exists crew_members_user_id_key;
create index if not exists crew_members_user on public.crew_members (user_id);

/* ---------- who's this shared with ---------- */
alter table public.entries add column if not exists crew_ids uuid[] not null default '{}';
alter table public.photos  add column if not exists crew_ids uuid[] not null default '{}';
create index if not exists entries_crew_ids on public.entries using gin (crew_ids);
create index if not exists photos_crew_ids  on public.photos  using gin (crew_ids);
alter table public.entries add column if not exists tagged_ids uuid[] not null default '{}';
create index if not exists entries_tagged on public.entries using gin (tagged_ids);

-- existing shared rows were shared with the owner's one crew
update public.entries e set crew_ids = array[m.crew_id]
  from public.crew_members m where m.user_id = e.user_id and not e.private and e.crew_ids = '{}';
update public.photos p set crew_ids = array[m.crew_id]
  from public.crew_members m where m.user_id = p.user_id and not p.private and p.crew_ids = '{}';

/* ---------- helpers (security definer so policies don't recurse) ---------- */
create or replace function public.my_crew_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select crew_id from public.crew_members where user_id = auth.uid()
$$;

-- me plus everyone in any of my crews
create or replace function public.crewmate_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select auth.uid()
  union
  select m.user_id from public.crew_members m where m.crew_id in (select public.my_crew_ids())
$$;

-- kept for anything still calling it: the crew you joined first
create or replace function public.my_crew_id() returns uuid
language sql stable security definer set search_path = public as $$
  select crew_id from public.crew_members where user_id = auth.uid() order by joined_at limit 1
$$;

-- is a post by p_owner, shared with p_crews, visible to me? Only through a crew we're both in.
create or replace function public.shared_with_me(p_owner uuid, p_crews uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crew_members mine
      join public.crew_members theirs on theirs.crew_id = mine.crew_id and theirs.user_id = p_owner
     where mine.user_id = auth.uid() and mine.crew_id = any(p_crews))
$$;

-- you can only share into crews you're in
create or replace function public.all_my_crews(p_crews uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_crews, '{}') <@ coalesce(array(select public.my_crew_ids()), '{}')
$$;

-- you can only tag people who share a crew with you
create or replace function public.all_crewmates(p_ids uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_ids, '{}') <@ coalesce(array(select public.crewmate_ids()), '{}')
$$;
-- were you tagged on this visit? (lets you see its photos)
create or replace function public.tagged_in(p_entry text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entries where id = p_entry and auth.uid() = any(tagged_ids))
$$;

/* ---------- row level security ---------- */
drop policy if exists "crews: members read" on public.crews;
create policy "crews: members read" on public.crews for select to authenticated
  using (id in (select public.my_crew_ids()));

drop policy if exists "crew_members: members read" on public.crew_members;
create policy "crew_members: members read" on public.crew_members for select to authenticated
  using (crew_id in (select public.my_crew_ids()));

drop policy if exists "entries: read yours and crew's shared" on public.entries;
create policy "entries: read yours and crew's shared" on public.entries for select to authenticated
  using (user_id = auth.uid() or auth.uid() = any(tagged_ids) or (not private and public.shared_with_me(user_id, crew_ids)));
drop policy if exists "entries: add yours" on public.entries;
create policy "entries: add yours" on public.entries for insert to authenticated
  with check (user_id = auth.uid() and public.all_my_crews(crew_ids) and public.all_crewmates(tagged_ids));
drop policy if exists "entries: edit yours" on public.entries;
create policy "entries: edit yours" on public.entries for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.all_my_crews(crew_ids) and public.all_crewmates(tagged_ids));

drop policy if exists "photos: read yours and crew's shared" on public.photos;
create policy "photos: read yours and crew's shared" on public.photos for select to authenticated
  using (user_id = auth.uid() or (not private and public.shared_with_me(user_id, crew_ids)) or (entry_id is not null and public.tagged_in(entry_id)));
drop policy if exists "photos: add yours" on public.photos;
create policy "photos: add yours" on public.photos for insert to authenticated
  with check (user_id = auth.uid() and public.all_my_crews(crew_ids));
drop policy if exists "photos: edit yours" on public.photos;
create policy "photos: edit yours" on public.photos for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.all_my_crews(crew_ids));

drop policy if exists "books: read yours and your crew's" on public.books;
create policy "books: read yours and your crew's" on public.books for select to authenticated
  using (owner_id = auth.uid() or (kind = 'crew' and crew_id in (select public.my_crew_ids())));
drop policy if exists "books: add" on public.books;
create policy "books: add" on public.books for insert to authenticated
  with check ((kind <> 'crew' and owner_id = auth.uid()) or (kind = 'crew' and crew_id in (select public.my_crew_ids())));
drop policy if exists "books: edit yours or the crew book" on public.books;
create policy "books: edit yours or the crew book" on public.books for update to authenticated
  using (owner_id = auth.uid() or (kind = 'crew' and crew_id in (select public.my_crew_ids())))
  with check (owner_id = auth.uid() or (kind = 'crew' and crew_id in (select public.my_crew_ids())));

drop policy if exists "events: read crew plans" on public.events;
create policy "events: read crew plans" on public.events for select to authenticated
  using (created_by = auth.uid() or crew_id in (select public.my_crew_ids()));
drop policy if exists "events: plan one" on public.events;
create policy "events: plan one" on public.events for insert to authenticated
  with check (created_by = auth.uid() and (crew_id is null or crew_id in (select public.my_crew_ids())));

/* ---------- leaving a crew takes your posts out of it ---------- */
create or replace function public.unshare_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.entries set crew_ids = array_remove(crew_ids, old.crew_id),
                            private  = (cardinality(array_remove(crew_ids, old.crew_id)) = 0)
   where user_id = old.user_id and old.crew_id = any(crew_ids);
  update public.photos  set crew_ids = array_remove(crew_ids, old.crew_id),
                            private  = (cardinality(array_remove(crew_ids, old.crew_id)) = 0)
   where user_id = old.user_id and old.crew_id = any(crew_ids);
  return old;
end $$;
drop trigger if exists crew_members_unshare on public.crew_members;
create trigger crew_members_unshare after delete on public.crew_members
  for each row execute function public.unshare_on_leave();

/* ---------- crew functions ---------- */
drop function if exists public.leave_crew();
create or replace function public.leave_crew(p_crew uuid) returns void
language plpgsql security definer set search_path = public as $$
declare next_owner uuid;
begin
  if not exists (select 1 from public.crew_members where crew_id = p_crew and user_id = auth.uid()) then return; end if;
  delete from public.crew_members where crew_id = p_crew and user_id = auth.uid();
  if not exists (select 1 from public.crew_members where crew_id = p_crew) then
    delete from public.crews where id = p_crew;
  elsif exists (select 1 from public.crews where id = p_crew and owner_id = auth.uid()) then
    select user_id into next_owner from public.crew_members where crew_id = p_crew order by joined_at limit 1;
    update public.crews set owner_id = next_owner where id = p_crew;
  end if;
end $$;

create or replace function public.create_crew(p_name text, p_tagline text default '') returns public.crews
language plpgsql security definer set search_path = public as $$
declare letters text; new_code text; crew public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.crew_members where user_id = auth.uid()) >= 5 then raise exception 'max_crews'; end if;
  letters := left(regexp_replace(upper(coalesce(p_name,'')), '[^A-Z]', '', 'g'), 5);
  if char_length(letters) < 3 then letters := rpad(letters, 3, 'X'); end if;
  loop
    new_code := letters || (10 + floor(random()*90))::int;
    exit when not exists (select 1 from public.crews where code = new_code);
  end loop;
  insert into public.crews (name, tagline, code, owner_id)
    values (coalesce(nullif(trim(p_name),''),'My Crew'), coalesce(trim(p_tagline),''), new_code, auth.uid())
    returning * into crew;
  insert into public.crew_members (crew_id, user_id) values (crew.id, auth.uid());
  return crew;
end $$;

-- join by code: 'ok', 'invalid', 'full' (15 members) or 'max' (you're already in 5 crews)
create or replace function public.join_crew(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from public.crews where code = upper(trim(p_code));
  if not found then return 'invalid'; end if;
  if exists (select 1 from public.crew_members where crew_id = c.id and user_id = auth.uid()) then return 'ok'; end if;
  if (select count(*) from public.crew_members where user_id = auth.uid()) >= 5 then return 'max'; end if;
  if (select count(*) from public.crew_members where crew_id = c.id) >= 15 then return 'full'; end if;
  insert into public.crew_members (crew_id, user_id) values (c.id, auth.uid());
  return 'ok';
end $$;

create or replace function public.rsvp(p_event text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('going','maybe','no') then raise exception 'bad status'; end if;
  update public.events set rsvps = rsvps || jsonb_build_object(auth.uid()::text, p_status)
   where id = p_event and (created_by = auth.uid() or crew_id in (select public.my_crew_ids()));
end $$;

create or replace function public.toggle_bookmark(p_photo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare on_now boolean;
begin
  update public.photos p
     set bookmarked_by = case when auth.uid() = any(p.bookmarked_by) then array_remove(p.bookmarked_by, auth.uid())
                              else array_append(p.bookmarked_by, auth.uid()) end
   where p.id = p_photo
     and (p.user_id = auth.uid() or (not p.private and public.shared_with_me(p.user_id, p.crew_ids)) or (p.entry_id is not null and public.tagged_in(p.entry_id)))
  returning auth.uid() = any(bookmarked_by) into on_now;
  return coalesce(on_now, false);
end $$;

-- take yourself off a visit someone tagged you on
create or replace function public.untag_me(p_entry text) returns void
language sql security definer set search_path = public as $$
  update public.entries set tagged_ids = array_remove(tagged_ids, auth.uid()) where id = p_entry and auth.uid() = any(tagged_ids)
$$;

revoke all on function public.untag_me(text), public.all_crewmates(uuid[]), public.tagged_in(text), public.leave_crew(uuid), public.create_crew(text, text), public.join_crew(text),
  public.rsvp(text, text), public.toggle_bookmark(text), public.my_crew_ids(), public.shared_with_me(uuid, uuid[]),
  public.all_my_crews(uuid[]) from public, anon;
grant execute on function public.untag_me(text), public.all_crewmates(uuid[]), public.tagged_in(text), public.leave_crew(uuid), public.create_crew(text, text), public.join_crew(text),
  public.rsvp(text, text), public.toggle_bookmark(text), public.my_crew_ids(), public.shared_with_me(uuid, uuid[]),
  public.all_my_crews(uuid[]) to authenticated;
