-- Koko: security fixes from the October 2026 review. Run after 0005_categories.sql.
-- Safe to run again. Use plain Run in the SQL editor.
--
--  1. Crew invite codes were the crew's name letters + 2 digits (every "My Crew" got MYCRE10..99),
--     so anyone signed in could guess them and join. Codes are now 10 random characters from
--     gen_random_uuid() (cryptographically random); existing guessable codes are replaced.
--     Invite links sent before this stop working: share the new link from the Crew tab.
--  2. A plan's host could move it into a crew they're not in. Edits now keep it in your crews.
--  3. The link cache was shared by everyone, so one person could plant a wrong answer for others.
--     Each person now has their own cache entries.

/* ---------- 1. random crew codes ---------- */
create or replace function public.new_crew_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare c text;
begin
  loop
    c := upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
    exit when not exists (select 1 from public.crews where code = c);
  end loop;
  return c;
end $$;
revoke all on function public.new_crew_code() from public, anon, authenticated;

create or replace function public.create_crew(p_name text, p_tagline text default '') returns public.crews
language plpgsql security definer set search_path = public as $$
declare crew public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.crew_members where user_id = auth.uid()) >= 5 then raise exception 'max_crews'; end if;
  insert into public.crews (name, tagline, code, owner_id)
    values (coalesce(nullif(left(trim(p_name),40),''),'My Crew'), left(coalesce(trim(p_tagline),''),80), public.new_crew_code(), auth.uid())
    returning * into crew;
  insert into public.crew_members (crew_id, user_id) values (crew.id, auth.uid());
  return crew;
end $$;

-- replace the old guessable codes (letters + 2 digits)
update public.crews set code = public.new_crew_code() where code ~ '^[A-Z]{3,5}[0-9]{2}$';

-- the owner can rename the crew but not pick its code
create or replace function public.crews_keep_code() returns trigger
language plpgsql as $$
begin
  if new.code is distinct from old.code and current_user = 'authenticated' then new.code := old.code; end if;
  return new;
end $$;
drop trigger if exists crews_keep_code on public.crews;
create trigger crews_keep_code before update on public.crews for each row execute function public.crews_keep_code();

/* ---------- 2. plans stay in your crews ---------- */
drop policy if exists "events: host edits" on public.events;
create policy "events: host edits" on public.events for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and (crew_id is null or crew_id in (select public.my_crew_ids())));

/* ---------- 3. link cache: your own entries only ---------- */
create or replace function public.share_cache_get(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.share_cache
   where key = auth.uid()::text || ':' || left(p_key, 560) and updated_at > now() - interval '30 days'
$$;
create or replace function public.share_cache_put(p_key text, p_value jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.share_cache (key, value) values (auth.uid()::text || ':' || left(p_key, 560), p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now()
$$;
revoke all on function public.share_cache_get(text), public.share_cache_put(text, jsonb) from public, anon;
grant execute on function public.share_cache_get(text), public.share_cache_put(text, jsonb) to authenticated;

/* ---------- 4. delete my account (privacy law: you can have your data erased) ----------
   Everything of yours goes; shared things other people still use are handed over first:
   crews you own pass to the next member, crew books to a member, places that friends logged
   to one of those friends. Your photo files are removed by the app (storage API) before this. */
create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c record;
begin
  if me is null then raise exception 'not signed in'; end if;
  -- crew books you started, in crews that carry on: pass to another member
  update public.books b set owner_id = (select m.user_id from public.crew_members m where m.crew_id = b.crew_id and m.user_id <> me order by m.joined_at limit 1)
   where b.owner_id = me and b.kind = 'crew'
     and exists (select 1 from public.crew_members m where m.crew_id = b.crew_id and m.user_id <> me);
  -- places you added that friends have logged or planned: pass to the first of them
  update public.venues v set created_by = coalesce(
      (select e.user_id from public.entries e where e.venue_id = v.id and e.user_id <> me order by e.created_at limit 1),
      (select ev.created_by from public.events ev where ev.venue_id = v.id and ev.created_by <> me order by ev.created_at limit 1))
   where v.created_by = me
     and (exists (select 1 from public.entries e where e.venue_id = v.id and e.user_id <> me)
       or exists (select 1 from public.events ev where ev.venue_id = v.id and ev.created_by <> me));
  -- your own plans go with you (with their RSVPs); tags of you on friends' visits come off
  update public.entries set tagged_ids = array_remove(tagged_ids, me) where me = any(tagged_ids);
  -- leave every crew (ownership passes on; an empty crew closes)
  for c in select crew_id from public.crew_members where user_id = me loop
    perform public.leave_crew(c.crew_id);
  end loop;
  delete from public.share_cache where key like me::text || ':%';
  -- the account itself: profile, visits, photos (rows), places only you used, books, inbox go with it
  delete from auth.users where id = me;
end $$;
revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
