-- Koko: the scrapbook shelf (phase 1 of the scrapbook rebuild). Run after 0016_security_review.sql. Safe to run again.
-- In the Supabase SQL editor use plain Run: this file keeps RLS on for every table.
--
-- The shelf's books are saved queries over the visits you can see, not copies:
--   Everything  (kind 'personal', the book everyone already has) every visit you logged, added photos to or were
--               tagged in, Just me ones included; never a crew visit you weren't part of
--   Tagged      (kind 'tagged') the visits someone else tagged you on
--   a kind book (kind 'kind', book_key 'kind:coffee') Everything for one kind of place. Only stored once you restyle
--               its cover; until then the app draws it in its stamp colour
--   crew books and albums as before
-- Also: each book picks its paper (plain, dotted, grid or kraft) in the cover editor, and each person chooses
-- whether the scrapbook plays sounds (null = this device's default: off on the web, on in the Android app).

/* ---------- book kinds, keys and paper ---------- */
alter table public.books drop constraint if exists books_kind_check;
alter table public.books add constraint books_kind_check check (kind in ('personal','crew','album','tagged','kind'));
alter table public.books add column if not exists book_key text check (book_key is null or book_key ~ '^(everything|tagged|kind:[a-z_]{2,24})$');
alter table public.books add column if not exists paper text not null default 'plain';
alter table public.books drop constraint if exists books_paper_check;
alter table public.books add constraint books_paper_check check (paper in ('plain','dotted','grid','kraft'));
alter table public.books drop constraint if exists books_kind_key;
alter table public.books add constraint books_kind_key check (kind <> 'kind' or book_key like 'kind:%');
create unique index if not exists books_one_key_each on public.books (owner_id, book_key) where book_key is not null;

/* ---------- sounds ---------- */
alter table public.profiles add column if not exists sounds_enabled boolean;

/* ---------- which book a visit belongs in ----------
   Everything now holds visits you were tagged in or added photos to, not just your own. Runs as the person
   asking, so it only finds a book and a visit they're allowed to see. */
create or replace function public.page_fits(p_book text, p_entry text) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from public.books b join public.entries e on e.id = p_entry
     where b.id = p_book and e.kind = 'visit' and (
       (b.kind in ('personal','kind') and (e.user_id = b.owner_id or b.owner_id = any(e.tagged_ids)
          or exists (select 1 from public.photos p where p.entry_id = e.id and p.user_id = b.owner_id))
        and (b.kind = 'personal' or exists (select 1 from public.venues v where v.id = e.venue_id
             and substr(b.book_key, 6) = any(v.categories)))) or
       (b.kind = 'tagged'   and b.owner_id = any(e.tagged_ids)) or
       (b.kind = 'crew'     and not e.private and b.crew_id = any(e.crew_ids)) or
       (b.kind = 'album'    and b.owner_id = auth.uid())))
$$;

/* ---------- pages leave a book with their visit ---------- */
create or replace function public.unpage_on_unshare() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.book_pages p using public.books b
   where p.entry_id = new.id and b.id = p.book_id and b.kind = 'crew'
     and (new.private or not (b.crew_id = any(new.crew_ids)));
  delete from public.book_pages p using public.books b
   where p.entry_id = new.id and b.id = p.book_id and b.kind = 'tagged' and not (b.owner_id = any(new.tagged_ids));
  -- untagged from someone else's visit, with no photos of yours on it: it leaves your Everything too
  delete from public.book_pages p using public.books b
   where p.entry_id = new.id and b.id = p.book_id and b.kind in ('personal','kind') and b.owner_id <> new.user_id
     and not (b.owner_id = any(new.tagged_ids))
     and not exists (select 1 from public.photos ph where ph.entry_id = new.id and ph.user_id = b.owner_id);
  return new;
end $$;
