-- Koko: the sticker layer (phase 2 of the scrapbook rebuild). Run after 0017_scrapbook_shelf.sql. Safe to run again.
-- In the Supabase SQL editor use plain Run: this file keeps RLS on for every table.
--
-- Stickers and tape sit on top of a page's automatic layout. A decoration belongs to the page (the visit, or a crew's
-- monthly spread), not to a book, so a page looks the same in every book it's in.
--   stickers          the catalogue: the 13 starter discs (one per kind of place) and the tape rolls are seeded here;
--                     milestone, critter and district stickers are named by key ("milestone:first", "critter:gecko",
--                     "district:deira") and drawn by the app; cutouts (phase 4) are rows with an owner
--   user_stickers     which stickers someone has unlocked, and when (written by the app when a milestone, critter or
--                     first visit in a district unlocks one)
--   page_decorations  one row per sticker or strip of tape on a page: where (0 to 1 across and down the page), turned,
--                     scaled, stacked. Anyone who can see the page sees them; you only add, move or remove your own;
--                     at most 12 per person per page (a trigger, so no app can go over)
-- Also: the old "Dress up this page" stickers (book_pages.stickers, up to three per page) are copied onto their pages
-- as decorations once, at the spots they used to sit. book_pages.stickers is left as it was.

/* ---------- the catalogue ---------- */
create table if not exists public.stickers (
  id            text primary key check (id ~ '^(starter|milestone|critter|district|tape|cutout):[a-z0-9_-]{1,40}$'),
  source        text not null check (source in ('starter','milestone','critter','district','tape','cutout')),
  key           text not null,
  name          text not null default '' check (char_length(name) <= 60),
  image_path    text,
  unlock_rule   jsonb not null default '{}'::jsonb,
  owner_user_id uuid references public.profiles on delete cascade,
  created_at    timestamptz not null default now(),
  check ((source = 'cutout') = (owner_user_id is not null))
);
alter table public.stickers enable row level security;
drop policy if exists "stickers: read the catalogue and your cutouts" on public.stickers;
create policy "stickers: read the catalogue and your cutouts" on public.stickers for select to authenticated
  using (owner_user_id is null or owner_user_id = auth.uid());
drop policy if exists "stickers: add your own cutouts" on public.stickers;
create policy "stickers: add your own cutouts" on public.stickers for insert to authenticated
  with check (source = 'cutout' and owner_user_id = auth.uid());
drop policy if exists "stickers: remove your own cutouts" on public.stickers;
create policy "stickers: remove your own cutouts" on public.stickers for delete to authenticated
  using (source = 'cutout' and owner_user_id = auth.uid());

insert into public.stickers (id, source, key, name, unlock_rule) values
  ('starter:restaurant','starter','restaurant','Restaurant','{"everyone":true}'),
  ('starter:shisha','starter','shisha','Shisha','{"everyone":true}'),
  ('starter:icecream','starter','icecream','Ice cream','{"everyone":true}'),
  ('starter:coffee','starter','coffee','Coffee','{"everyone":true}'),
  ('starter:matcha','starter','matcha','Matcha','{"everyone":true}'),
  ('starter:dessert','starter','dessert','Dessert','{"everyone":true}'),
  ('starter:burger','starter','burger','Burger','{"everyone":true}'),
  ('starter:fastfood','starter','fastfood','Fast food','{"everyone":true}'),
  ('starter:cafeteria','starter','cafeteria','Cafeteria','{"everyone":true}'),
  ('starter:karak','starter','karak','Karak','{"everyone":true}'),
  ('starter:pizza','starter','pizza','Pizza','{"everyone":true}'),
  ('starter:acai','starter','acai','Acai','{"everyone":true}'),
  ('starter:froyo','starter','froyo','Froyo','{"everyone":true}'),
  ('tape:gold','tape','gold','Gold tape','{"everyone":true}'),
  ('tape:mint','tape','mint','Mint tape','{"everyone":true}'),
  ('tape:rose','tape','rose','Rose tape','{"everyone":true}'),
  ('tape:sky','tape','sky','Sky tape','{"everyone":true}'),
  ('tape:kraft','tape','kraft','Kraft tape','{"everyone":true}'),
  ('tape:ink','tape','ink','Ink tape','{"everyone":true}'),
  ('tape:stripes','tape','stripes','Striped tape','{"everyone":true}'),
  ('tape:dots','tape','dots','Dotted tape','{"everyone":true}')
on conflict (id) do nothing;

/* ---------- unlocks ---------- */
create table if not exists public.user_stickers (
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  sticker_id  text not null check (sticker_id ~ '^(milestone|critter|district|cutout):[a-z0-9_-]{1,40}$'),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, sticker_id)
);
alter table public.user_stickers enable row level security;
drop policy if exists "user_stickers: read yours" on public.user_stickers;
create policy "user_stickers: read yours" on public.user_stickers for select to authenticated using (user_id = auth.uid());
drop policy if exists "user_stickers: add yours" on public.user_stickers;
create policy "user_stickers: add yours" on public.user_stickers for insert to authenticated with check (user_id = auth.uid());

/* ---------- decorations ---------- */
create table if not exists public.page_decorations (
  id          text primary key check (char_length(id) between 8 and 120),
  page_type   text not null check (page_type in ('visit','spread')),
  page_id     text not null check (char_length(page_id) between 1 and 100),
  book_id     text,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  sticker_id  text check (sticker_id is null or sticker_id ~ '^(starter|milestone|critter|district|cutout):[a-z0-9_-]{1,40}$'),
  kind        text not null check (kind in ('sticker','tape')),
  x           real not null check (x between 0 and 1),
  y           real not null check (y between 0 and 1),
  x2          real check (x2 is null or x2 between 0 and 1),
  y2          real check (y2 is null or y2 between 0 and 1),
  rotation    real not null default 0 check (rotation between -360 and 360),
  scale       real not null default 1 check (scale between 0.4 and 2.5),
  flip        boolean not null default false,
  z           integer not null default 0 check (z between -1000 and 100000),
  tape_style  text check (tape_style is null or tape_style in ('gold','mint','rose','sky','kraft','ink','stripes','dots')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((kind = 'sticker' and sticker_id is not null) or (kind = 'tape' and tape_style is not null and x2 is not null and y2 is not null))
);
create index if not exists page_decorations_page on public.page_decorations (page_type, page_id);
create index if not exists page_decorations_user on public.page_decorations (user_id);
alter table public.page_decorations enable row level security;

-- can the person asking see this page? (runs as them, so the entries rules apply inside; spreads come in 0019)
create or replace function public.can_see_page(p_type text, p_id text) returns boolean
language plpgsql stable set search_path = public as $$
begin
  if p_type = 'visit' then return exists (select 1 from public.entries e where e.id = p_id and e.kind = 'visit'); end if;
  return false;
end $$;

drop policy if exists "page_decorations: read on pages you can see" on public.page_decorations;
create policy "page_decorations: read on pages you can see" on public.page_decorations for select to authenticated
  using (public.can_see_page(page_type, page_id));
drop policy if exists "page_decorations: add yours" on public.page_decorations;
create policy "page_decorations: add yours" on public.page_decorations for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_page(page_type, page_id));
drop policy if exists "page_decorations: move yours" on public.page_decorations;
create policy "page_decorations: move yours" on public.page_decorations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_see_page(page_type, page_id));
drop policy if exists "page_decorations: remove yours" on public.page_decorations;
create policy "page_decorations: remove yours" on public.page_decorations for delete to authenticated
  using (user_id = auth.uid());

-- at most 12 decorations per person per page; a cutout only by the person who made it
create or replace function public.decoration_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.page_decorations d
       where d.user_id = new.user_id and d.page_type = new.page_type and d.page_id = new.page_id and d.id <> new.id) >= 12 then
    raise exception 'at most 12 stickers and tape per person on a page' using errcode = 'check_violation';
  end if;
  if new.sticker_id like 'cutout:%' and not exists (select 1 from public.stickers s where s.id = new.sticker_id and s.owner_user_id = new.user_id) then
    raise exception 'that cutout is someone else''s' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists page_decorations_rules on public.page_decorations;
create trigger page_decorations_rules before insert or update on public.page_decorations
  for each row execute function public.decoration_rules();

do $$ begin
  begin alter publication supabase_realtime add table public.page_decorations; exception when others then null; end;
end $$;

/* ---------- the old Dress up stickers, onto their pages once ---------- */
-- the three spots they used to sit: top right, middle left, bottom right. Someone who dressed the same visit in two
-- books gets the newest one's stickers, once.
insert into public.page_decorations (id, page_type, page_id, book_id, user_id, sticker_id, kind, x, y, rotation, scale, z)
select 'mig|' || p.entry_id || '|' || p.updated_by || '|' || s.n, 'visit', p.entry_id, p.book_id, p.updated_by, 'milestone:' || s.sticker, 'sticker',
       (array[0.80, 0.12, 0.84])[s.n], (array[0.20, 0.55, 0.84])[s.n], (array[-8, 6, -4])[s.n], 0.9, s.n
  from (select distinct on (entry_id, updated_by) * from public.book_pages where cardinality(stickers) > 0
         order by entry_id, updated_by, updated_at desc) p,
       unnest(p.stickers) with ordinality as s(sticker, n)
 where s.n <= 3 and s.sticker ~ '^[a-z0-9_-]{1,40}$'
on conflict (id) do nothing;
