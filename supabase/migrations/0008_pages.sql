-- Koko: every visit is a scrapbook page. Run after 0007_feedback_places.sql. Safe to run again.
-- In the Supabase SQL editor use plain Run: this file keeps RLS on for every table.
--
-- Pages themselves aren't stored: a visit is a page in every book it belongs to, so a page is
-- exactly as visible as its visit (the entries rules above already decide that). What's stored
-- is how someone dressed a page up (layout, photo order, stickers, a note): one row per page.
--
-- Which book a visit belongs in:
--   personal  your own visits
--   tagged    visits someone tagged you on (your own book of them)
--   crew      visits shared with that crew (crew_ids), by anyone in it
--   album     any visit you can see (an album is a filter)
--
-- Also:
--   * tagging someone shares the visit with a crew you're both in (new tags only; visits
--     already saved keep who they were shared with).
--   * page rows can only be read or written by someone who can see the visit, for a book it
--     belongs in; leaving a crew or un-sharing a visit removes its crew-book page rows.
--   * the old per-day page settings (books.pages) are copied onto the matching visit's page
--     once. books.pages is left as it was.

/* ---------- a book of the visits you were tagged on ---------- */
alter table public.books drop constraint if exists books_kind_check;
alter table public.books add constraint books_kind_check check (kind in ('personal','crew','album','tagged'));

/* ---------- page settings ---------- */
create table if not exists public.book_pages (
  id          text primary key check (char_length(id) between 3 and 170),   -- book id | entry id
  book_id     text not null references public.books on delete cascade,
  entry_id    text not null references public.entries on delete cascade,
  layout      text not null default 'scrapbook' check (layout in ('scrapbook','grid','hero')),
  photo_order text[] not null default '{}' check (cardinality(photo_order) <= 12),
  stickers    text[] not null default '{}' check (cardinality(stickers) <= 3),
  note        text not null default '' check (char_length(note) <= 160),
  updated_by  uuid not null default auth.uid() references public.profiles on delete cascade,
  updated_at  timestamptz not null default now(),
  unique (book_id, entry_id),
  check (id = book_id || '|' || entry_id)
);
create index if not exists book_pages_entry on public.book_pages (entry_id);
alter table public.book_pages enable row level security;

-- does this visit belong in this book? Runs as the person asking, so it only finds a book and
-- a visit they're allowed to see (the books and entries rules apply inside it).
create or replace function public.page_fits(p_book text, p_entry text) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from public.books b join public.entries e on e.id = p_entry
     where b.id = p_book and e.kind = 'visit' and (
       (b.kind = 'personal' and e.user_id = b.owner_id) or
       (b.kind = 'tagged'   and b.owner_id = any(e.tagged_ids)) or
       (b.kind = 'crew'     and not e.private and b.crew_id = any(e.crew_ids)) or
       (b.kind = 'album'    and b.owner_id = auth.uid())))
$$;

drop policy if exists "book_pages: read pages you can see" on public.book_pages;
create policy "book_pages: read pages you can see" on public.book_pages for select to authenticated
  using (public.page_fits(book_id, entry_id));
drop policy if exists "book_pages: dress up pages you can see" on public.book_pages;
create policy "book_pages: dress up pages you can see" on public.book_pages for insert to authenticated
  with check (updated_by = auth.uid() and public.page_fits(book_id, entry_id));
drop policy if exists "book_pages: edit pages you can see" on public.book_pages;
create policy "book_pages: edit pages you can see" on public.book_pages for update to authenticated
  using (public.page_fits(book_id, entry_id)) with check (updated_by = auth.uid() and public.page_fits(book_id, entry_id));
drop policy if exists "book_pages: reset pages you can see" on public.book_pages;
create policy "book_pages: reset pages you can see" on public.book_pages for delete to authenticated
  using (public.page_fits(book_id, entry_id));

/* ---------- tagging shares with a crew you're both in ---------- */
create or replace function public.share_with_tagged() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid; c uuid;
begin
  if new.kind <> 'visit' or cardinality(coalesce(new.tagged_ids,'{}')) = 0 then return new; end if;
  foreach t in array new.tagged_ids loop
    -- only people newly tagged (an edit that doesn't add anyone changes nothing)
    if tg_op = 'UPDATE' and t = any(coalesce(old.tagged_ids,'{}')) then continue; end if;
    -- already shared with a crew they're in?
    if exists (select 1 from public.crew_members m where m.user_id = t and m.crew_id = any(new.crew_ids)) then continue; end if;
    select mine.crew_id into c from public.crew_members mine
      join public.crew_members theirs on theirs.crew_id = mine.crew_id and theirs.user_id = t
     where mine.user_id = new.user_id order by mine.joined_at limit 1;
    if c is not null then new.crew_ids := array_append(coalesce(new.crew_ids,'{}'), c); end if;
  end loop;
  new.private := cardinality(coalesce(new.crew_ids,'{}')) = 0;
  return new;
end $$;
drop trigger if exists entries_share_with_tagged on public.entries;
create trigger entries_share_with_tagged before insert or update of tagged_ids, crew_ids, private on public.entries
  for each row execute function public.share_with_tagged();

/* ---------- pages leave a crew book with their visit ---------- */
create or replace function public.unpage_on_unshare() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.book_pages p using public.books b
   where p.entry_id = new.id and b.id = p.book_id and b.kind = 'crew'
     and (new.private or not (b.crew_id = any(new.crew_ids)));
  delete from public.book_pages p using public.books b
   where p.entry_id = new.id and b.id = p.book_id and b.kind = 'tagged' and not (b.owner_id = any(new.tagged_ids));
  return new;
end $$;
drop trigger if exists entries_unpage on public.entries;
create trigger entries_unpage after update of crew_ids, private, tagged_ids on public.entries
  for each row execute function public.unpage_on_unshare();
-- (leaving a crew un-shares your visits from it, which fires the trigger above)

/* ---------- the old per-day page settings, copied onto each day's visit once ---------- */
create or replace function public.backfill_book_pages() returns integer
language plpgsql security definer set search_path = public as $$
declare b record; d record; e record; n integer := 0; ord text[]; first_photo text;
begin
  for b in select * from public.books where pages <> '{}'::jsonb loop
    for d in select key as day, value as cfg from jsonb_each(b.pages) where key ~ '^\d{4}-\d{2}-\d{2}$' loop
      ord := coalesce(array(select jsonb_array_elements_text(coalesce(d.cfg->'order','[]'::jsonb))), '{}');
      -- the visit that day whose photo came first on the page, else the day's first visit
      select en.* into e from public.entries en
       where en.date = d.day::date and en.kind = 'visit' and (
         (b.kind = 'personal' and en.user_id = b.owner_id) or
         (b.kind = 'crew' and not en.private and b.crew_id = any(en.crew_ids)) or
         (b.kind = 'album'))
       order by (select min(array_position(ord, p.id)) from public.photos p where p.entry_id = en.id) nulls last, en.created_at
       limit 1;
      if e.id is null then continue; end if;
      insert into public.book_pages (id, book_id, entry_id, layout, photo_order, stickers, note, updated_by)
      values (b.id || '|' || e.id, b.id, e.id,
              case when d.cfg->>'layout' in ('scrapbook','grid','hero') then d.cfg->>'layout' else 'scrapbook' end,
              coalesce(array(select x from unnest(ord) x where exists (select 1 from public.photos p where p.id = x and p.entry_id = e.id)), '{}')::text[],
              coalesce(array(select jsonb_array_elements_text(coalesce(d.cfg->'stickers','[]'::jsonb)) limit 3), '{}'),
              left(coalesce(d.cfg->>'note',''), 160), b.owner_id)
      on conflict (id) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.backfill_book_pages(), public.share_with_tagged(), public.unpage_on_unshare() from public, anon, authenticated;
select public.backfill_book_pages();

revoke all on function public.page_fits(text, text) from public, anon;
grant execute on function public.page_fits(text, text) to authenticated;

-- live updates for page settings
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'book_pages') then
    alter publication supabase_realtime add table public.book_pages;
  end if;
end $$;
