-- Koko: search. Run after 0012_landmark_critters.sql. Safe to run again. In the SQL editor use plain Run (RLS stays on).
--
-- 1. pg_trgm (typo-tolerant matching) and the indexes search can use on the server.
-- 2. areas: the map's zones as data, with aliases ("marina" finds Dubai Marina) and also_matches (neighbours an area
--    should take in, empty to start). Edit them here; the app reads this table, no code change needed.
-- 3. venues.area_id: the nearest area whose centre is within its radius, worked out from the place's coordinates
--    (or its chosen zone when it has none), kept up to date by a trigger. The last statement lists every place
--    that falls outside every area, so they're reported, not dropped.
-- 4. entries.dish_tags: what you had (optional), lowercase.
-- 5. photos.ai_tags, ai_tagged_at: tags read from the photo by the server (only while the feature is on).
-- 6. search_synonyms: groups of words that find each other (ice cream = gelato = soft serve), editable here.
-- 7. ai_tag_log: one row per photo tagged (tokens in and out, estimated cost) and the month's spend for the cap.

/* ---------- 1. pg_trgm ---------- */
create extension if not exists pg_trgm;

/* ---------- 2. areas ---------- */
create table if not exists public.areas (
  id           text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name         text not null check (char_length(name) between 1 and 60),
  aliases      text[] not null default '{}',
  also_matches text[] not null default '{}',
  zone_id      text,
  lat          double precision,
  lng          double precision,
  radius_km    real not null default 3 check (radius_km > 0)
);
alter table public.areas enable row level security;
drop policy if exists "areas: everyone reads" on public.areas;
create policy "areas: everyone reads" on public.areas for select to anon, authenticated using (true);
-- AREAS SEED START (tools/search-seed.mjs)
insert into public.areas (id, name, aliases, zone_id, lat, lng) values
  ('marina', 'Dubai Marina', array['marina','dubai marina','marina walk']::text[], 'marina', 25.0805, 55.1403),
  ('jbr', 'JBR', array['jbr','jumeirah beach residence','the walk']::text[], 'jbr', 25.078, 55.134),
  ('jlt', 'JLT', array['jlt','jumeirah lakes towers']::text[], 'jlt', 25.0693, 55.144),
  ('bluewaters', 'Bluewaters', array[]::text[], 'bluewaters', 25.0806, 55.1205),
  ('palm', 'Palm Jumeirah', array['palm','the palm']::text[], 'palm', 25.1124, 55.139),
  ('mediacity', 'Media City', array[]::text[], 'mediacity', 25.095, 55.156),
  ('barsha', 'Al Barsha', array[]::text[], 'barsha', 25.11, 55.2),
  ('umsuqeim', 'Umm Suqeim', array[]::text[], 'umsuqeim', 25.15, 55.208),
  ('alquoz', 'Al Quoz', array[]::text[], 'alquoz', 25.14, 55.23),
  ('dubaihills', 'Dubai Hills', array[]::text[], 'dubaihills', 25.105, 55.245),
  ('jvc', 'JVC', array[]::text[], 'jvc', 25.06, 55.21),
  ('jumeirah', 'Jumeirah', array[]::text[], 'jumeirah', 25.203, 55.25),
  ('lamer', 'La Mer', array[]::text[], 'lamer', 25.228, 55.253),
  ('citywalk', 'City Walk', array[]::text[], 'citywalk', 25.206, 55.263),
  ('downtown', 'Downtown', array['downtown','burj khalifa area','dubai mall']::text[], 'downtown', 25.195, 55.275),
  ('difc', 'DIFC', array[]::text[], 'difc', 25.213, 55.281),
  ('businessbay', 'Business Bay', array[]::text[], 'businessbay', 25.185, 55.28),
  ('karama', 'Karama', array[]::text[], 'karama', 25.245, 55.305),
  ('burdubai', 'Bur Dubai', array[]::text[], 'burdubai', 25.26, 55.295),
  ('deira', 'Deira', array[]::text[], 'deira', 25.27, 55.32),
  ('festivalcity', 'Festival City', array[]::text[], 'festivalcity', 25.223, 55.352),
  ('alseef', 'Al Seef', array[]::text[], 'alseef', 25.259, 55.299),
  ('creekharbour', 'Dubai Creek Harbour', array[]::text[], 'creekharbour', 25.201, 55.35),
  ('aljaddaf', 'Al Jaddaf', array[]::text[], 'aljaddaf', 25.217, 55.33),
  ('oudmetha', 'Oud Metha', array[]::text[], 'oudmetha', 25.235, 55.315),
  ('algarhoud', 'Al Garhoud', array[]::text[], 'algarhoud', 25.24, 55.345),
  ('satwa', 'Al Satwa', array[]::text[], 'satwa', 25.225, 55.275),
  ('alqusais', 'Al Qusais', array[]::text[], 'alqusais', 25.278, 55.38),
  ('alnahda', 'Al Nahda', array[]::text[], 'alnahda', 25.29, 55.37),
  ('almamzar', 'Al Mamzar', array[]::text[], 'almamzar', 25.296, 55.345),
  ('mirdif', 'Mirdif', array[]::text[], 'mirdif', 25.218, 55.42),
  ('alwarqa', 'Al Warqa', array[]::text[], 'alwarqa', 25.19, 55.41),
  ('alkhawaneej', 'Al Khawaneej', array[]::text[], 'alkhawaneej', 25.227, 55.48),
  ('intlcity', 'International City', array[]::text[], 'intlcity', 25.165, 55.41),
  ('siliconoasis', 'Silicon Oasis', array[]::text[], 'siliconoasis', 25.12, 55.38),
  ('meydan', 'Meydan', array[]::text[], 'meydan', 25.16, 55.3),
  ('nadalsheba', 'Nad Al Sheba', array[]::text[], 'nadalsheba', 25.15, 55.33),
  ('d3', 'Design District', array[]::text[], 'd3', 25.187, 55.297),
  ('alsafa', 'Al Safa', array[]::text[], 'alsafa', 25.18, 55.24),
  ('alsufouh', 'Al Sufouh', array[]::text[], 'alsufouh', 25.11, 55.17),
  ('barshaheights', 'Barsha Heights', array[]::text[], 'barshaheights', 25.095, 55.177),
  ('dubaiharbour', 'Dubai Harbour', array[]::text[], 'dubaiharbour', 25.093, 55.145),
  ('jvt', 'JVT', array[]::text[], 'jvt', 25.05, 55.19),
  ('motorcity', 'Motor City', array[]::text[], 'motorcity', 25.047, 55.235),
  ('sportscity', 'Sports City', array[]::text[], 'sportscity', 25.04, 55.22),
  ('ranches', 'Arabian Ranches', array[]::text[], 'ranches', 25.055, 55.27),
  ('globalvillage', 'Global Village', array[]::text[], 'globalvillage', 25.07, 55.3089),
  ('furjan', 'Al Furjan', array[]::text[], 'furjan', 25.03, 55.15),
  ('discovery', 'Discovery Gardens', array[]::text[], 'discovery', 25.04, 55.14),
  ('ibnbattuta', 'Ibn Battuta', array[]::text[], 'ibnbattuta', 25.045, 55.118),
  ('palmjebelali', 'Palm Jebel Ali', array[]::text[], 'palmjebelali', 25.01, 54.985)
on conflict (id) do nothing;
-- AREAS SEED END

/* ---------- 3. each place's area ---------- */
alter table public.venues add column if not exists area_id text references public.areas on delete set null;
create or replace function public.area_for(p_lat double precision, p_lng double precision, p_zone text) returns text
language sql stable set search_path = public as $$
  select coalesce(
    (select a.id from public.areas a
      where p_lat is not null and a.lat is not null
        and sqrt(((p_lat - a.lat)*110.57)^2 + ((p_lng - a.lng)*100.75)^2) <= a.radius_km
      order by sqrt(((p_lat - a.lat)*110.57)^2 + ((p_lng - a.lng)*100.75)^2) limit 1),
    (select a.id from public.areas a where p_lat is null and a.zone_id = p_zone limit 1));
$$;
create or replace function public.venues_set_area() returns trigger language plpgsql set search_path = public as $$
begin new.area_id := public.area_for(new.lat, new.lng, new.zone); return new; end $$;
drop trigger if exists venues_set_area on public.venues;
create trigger venues_set_area before insert or update of lat, lng, zone on public.venues
  for each row execute function public.venues_set_area();
update public.venues set area_id = public.area_for(lat, lng, zone);

/* ---------- 4. dish tags ---------- */
create or replace function public.tags_ok(tags text[]) returns boolean language sql immutable as $$
  select coalesce(bool_and(t ~ '^[a-z0-9][a-z0-9 &''-]{0,29}$'), true) from unnest(tags) t $$;
alter table public.entries add column if not exists dish_tags text[] not null default '{}';
alter table public.entries drop constraint if exists entries_dish_tags_ok;
alter table public.entries add constraint entries_dish_tags_ok check (cardinality(dish_tags) <= 12 and public.tags_ok(dish_tags));

/* ---------- 5. photo tags ---------- */
alter table public.photos add column if not exists ai_tags text[] not null default '{}';
alter table public.photos add column if not exists ai_tagged_at timestamptz;
alter table public.photos drop constraint if exists photos_ai_tags_ok;
alter table public.photos add constraint photos_ai_tags_ok check (cardinality(ai_tags) <= 8 and public.tags_ok(ai_tags));

/* ---------- 6. synonyms ---------- */
create table if not exists public.search_synonyms (
  id    integer primary key,
  terms text[] not null check (cardinality(terms) between 2 and 12)
);
alter table public.search_synonyms enable row level security;
drop policy if exists "search_synonyms: everyone reads" on public.search_synonyms;
create policy "search_synonyms: everyone reads" on public.search_synonyms for select to anon, authenticated using (true);
-- SYNONYMS SEED START (tools/search-seed.mjs)
insert into public.search_synonyms (id, terms) values
  (1, array['ice cream','gelato','soft serve','icecream']::text[]),
  (2, array['coffee','latte','flat white','cappuccino','espresso','americano','cortado']::text[]),
  (3, array['karak','chai','karak chai']::text[]),
  (4, array['burger','burgers','smash burger']::text[]),
  (5, array['pizza','pizzas']::text[]),
  (6, array['pasta','spaghetti','penne','linguine','carbonara','ravioli']::text[]),
  (7, array['shawarma','shawerma','shwarma']::text[]),
  (8, array['biryani','biriyani','briyani']::text[]),
  (9, array['sushi','sashimi','maki']::text[]),
  (10, array['dessert','desserts','sweets','cake','pastry']::text[]),
  (11, array['breakfast','brekkie','eggs']::text[]),
  (12, array['brunch','brunches','friday brunch']::text[]),
  (13, array['steak','steakhouse','ribeye']::text[]),
  (14, array['seafood','fish','prawns','shrimp']::text[]),
  (15, array['falafel','felafel','falafels']::text[])
on conflict (id) do nothing;
-- SYNONYMS SEED END

/* ---------- indexes for search on the server ---------- */
create index if not exists venues_name_trgm   on public.venues      using gin (name gin_trgm_ops);
create index if not exists entries_notes_trgm on public.entries     using gin (notes gin_trgm_ops);
create index if not exists entries_notes_fts  on public.entries     using gin (to_tsvector('simple', notes));
create index if not exists entries_dish_tags  on public.entries     using gin (dish_tags);
create index if not exists photos_caption_trgm on public.photos     using gin (caption gin_trgm_ops);
create index if not exists photos_ai_tags     on public.photos      using gin (ai_tags);
create index if not exists book_pages_note_trgm on public.book_pages using gin (note gin_trgm_ops);
create index if not exists areas_aliases      on public.areas       using gin (aliases);

/* ---------- 7. the photo tagger's log and its monthly spend ---------- */
create table if not exists public.ai_tag_log (
  id         bigserial primary key,
  photo_id   text,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  model      text not null,
  tokens_in  integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd   numeric(10,6) not null default 0,
  ok         boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ai_tag_log enable row level security;
drop policy if exists "ai_tag_log: add your own" on public.ai_tag_log;
create policy "ai_tag_log: add your own" on public.ai_tag_log for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "ai_tag_log: read your own" on public.ai_tag_log;
create policy "ai_tag_log: read your own" on public.ai_tag_log for select to authenticated using (user_id = auth.uid());
-- what the tagger has spent this calendar month (everyone's), for the cap
create or replace function public.ai_tags_spent_this_month() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from public.ai_tag_log where created_at >= date_trunc('month', now()) $$;
revoke all on function public.ai_tags_spent_this_month() from public, anon;
grant execute on function public.ai_tags_spent_this_month() to authenticated;

/* ---------- report: places outside every area (they stay; search just has no area for them) ---------- */
select id, name, zone, lat, lng from public.venues where area_id is null order by name;
