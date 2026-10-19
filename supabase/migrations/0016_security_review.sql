-- Koko 0016: fixes from the October 2026 security review. Run once in the Supabase SQL editor, after 0015.
-- Safe to run again.
--
-- 1. Photos only go on a visit that's yours or that you were tagged on. Before, a photo could name any visit id;
--    people tagged on that visit could then see it on "their" page.
-- 2. A photo someone you tagged added to your visit is one you can see, even when it isn't shared with a crew of yours.
-- 3. The AI photo-tag log only takes believable rows: a cost from 0 to 5 cents, token counts in range, at most 300 a
--    day per person. The monthly cap adds up everyone's rows, so before this anyone could add a negative cost (to go
--    past the cap) or a huge one (to stop tagging for everybody).

/* ---------- 1 and 2: photos and the visits they belong to ---------- */
-- is this visit yours, or one you were tagged on? (no visit: a loose photo, fine)
create or replace function public.photo_entry_ok(p_entry text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_entry is null or exists (select 1 from public.entries e where e.id = p_entry
    and (e.user_id = auth.uid() or auth.uid() = any(e.tagged_ids))) $$;
-- is this visit yours?
create or replace function public.my_entry(p_entry text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entries e where e.id = p_entry and e.user_id = auth.uid()) $$;
revoke all on function public.photo_entry_ok(text), public.my_entry(text) from public, anon;
grant execute on function public.photo_entry_ok(text), public.my_entry(text) to authenticated;

drop policy if exists "photos: add yours" on public.photos;
create policy "photos: add yours" on public.photos for insert to authenticated
  with check (user_id = auth.uid() and public.all_my_crews(crew_ids) and public.photo_entry_ok(entry_id));
drop policy if exists "photos: edit yours" on public.photos;
create policy "photos: edit yours" on public.photos for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.all_my_crews(crew_ids) and public.photo_entry_ok(entry_id));
drop policy if exists "photos: read yours and crew's shared" on public.photos;
create policy "photos: read yours and crew's shared" on public.photos for select to authenticated
  using (user_id = auth.uid() or (not private and public.shared_with_me(user_id, crew_ids))
    or (entry_id is not null and (public.tagged_in(entry_id) or public.my_entry(entry_id))));

/* ---------- 3: the AI photo-tag log ---------- */
-- (not valid: rows already there aren't rechecked; every new one is)
alter table public.ai_tag_log drop constraint if exists ai_tag_log_sane;
alter table public.ai_tag_log add constraint ai_tag_log_sane
  check (cost_usd >= 0 and cost_usd <= 0.05 and tokens_in between 0 and 20000 and tokens_out between 0 and 2000) not valid;
create or replace function public.my_ai_tags_today() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.ai_tag_log where user_id = auth.uid() and created_at >= now() - interval '1 day' $$;
revoke all on function public.my_ai_tags_today() from public, anon;
grant execute on function public.my_ai_tags_today() to authenticated;
drop policy if exists "ai_tag_log: add your own" on public.ai_tag_log;
create policy "ai_tag_log: add your own" on public.ai_tag_log for insert to authenticated
  with check (user_id = auth.uid() and public.my_ai_tags_today() < 300);
