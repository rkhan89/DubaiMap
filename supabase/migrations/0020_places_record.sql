-- Koko: the places record (Job 4, phase 1). Run after 0019_drops_and_sharing.sql. Safe to run again.
-- In the Supabase SQL editor use plain Run (RLS stays on), or run it with tools/overture-import.py.
--
--   place_seed        read-only reference data: the Dubai area of one pinned Overture Maps release (places theme),
--                     loaded by tools/overture-import.py. Any signed-in person can search it; nobody can write it
--                     through the API. Searching it says nothing about the crew: a place only becomes a Koko place
--                     (a venues row) once someone logs a visit.
--                     Data from Overture Maps Foundation, Places theme (https://overturemaps.org/attribution),
--                     CDLA-Permissive-2.0 (some sources Apache-2.0 / CC0): each row keeps its sources and licences.
--   place_seed_releases  which release is loaded (pinned: the app never talks to Overture at runtime).
--   taxonomy_kinds    Overture taxonomy → Koko kind, as data. Suggestions only: the card asks before applying them.
--                     Shisha and karak are never suggested (the taxonomy can't tell): people pick those.
--   venues (+)        the places record is the existing venues table (visits are entries, linked by venue_id):
--                     seed_id, phone, website, instagram (a handle), other_socials (URLs), field_sources (where each
--                     value came from: seed, web, user or legacy_google), verified_at.
--                     A value marked 'user' is never replaced by enrichment: venues_keep_user_fields() puts it back.
--   tags, venue_tags  tags describing a place: the 13 kinds as system tags (kept in step with venues.categories),
--                     plus words people add. A tag is visible to people who can see a place carrying it.
--   Privacy fix       a place is visible only to someone who can see a visit, plan or photo at it (or who made it).
--                     Before, crewmates could see a place a crewmate had only logged Just me.
--   Google            new places never get a google_place_id (it stays on old rows as a matching key only), and
--                     old places' Google-derived values are marked legacy_google in field_sources for the backfill.

create extension if not exists pg_trgm;

/* ---------- 1. the seed ---------- */
create table if not exists public.place_seed (
  id                 text primary key check (id ~ '^overture:[0-9a-f-]{8,64}$'),
  source             text not null default 'overture' check (source in ('overture')),
  source_id          text not null,
  release            text not null check (release ~ '^\d{4}-\d{2}-\d{2}\.\d+$'),
  name               text not null check (char_length(name) between 1 and 120),
  address            text check (char_length(address) <= 200),
  lat                double precision not null,
  lng                double precision not null,
  zone               text,
  phone              text check (char_length(phone) <= 20),
  website            text check (char_length(website) <= 300),
  instagram          text check (char_length(instagram) <= 30),
  socials            jsonb not null default '[]'::jsonb check (jsonb_typeof(socials) = 'array'),
  basic_category     text,
  taxonomy_primary   text,
  taxonomy_hierarchy jsonb not null default '[]'::jsonb check (jsonb_typeof(taxonomy_hierarchy) = 'array'),
  confidence         real,
  brand              text,
  licenses           jsonb not null default '[]'::jsonb,
  sources            jsonb not null default '[]'::jsonb
);
create index if not exists place_seed_name_trgm on public.place_seed using gin (name gin_trgm_ops);
create index if not exists place_seed_latlng    on public.place_seed (lat, lng);
alter table public.place_seed enable row level security;
drop policy if exists "place_seed: signed in reads" on public.place_seed;
create policy "place_seed: signed in reads" on public.place_seed for select to authenticated using (true);
revoke insert, update, delete, truncate on public.place_seed from anon, authenticated;

create table if not exists public.place_seed_releases (
  release     text primary key,
  source      text not null default 'overture',
  loaded_at   timestamptz not null default now(),
  row_count   integer not null default 0,
  bbox        jsonb not null default '{}'::jsonb,
  attribution text not null default 'Data from Overture Maps Foundation, Places theme',
  link        text not null default 'https://overturemaps.org/attribution'
);
alter table public.place_seed_releases enable row level security;
drop policy if exists "place_seed_releases: everyone reads" on public.place_seed_releases;
create policy "place_seed_releases: everyone reads" on public.place_seed_releases for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.place_seed_releases from anon, authenticated;

/* ---------- 2. taxonomy → kind (suggestions; edit the rows, not code) ---------- */
create table if not exists public.taxonomy_kinds (
  taxonomy text primary key check (taxonomy ~ '^[a-z0-9_]{2,80}$'),
  kind     text not null check (kind in ('restaurant','shisha','icecream','coffee','matcha','dessert','burger','fastfood','cafeteria','karak','pizza','acai','froyo'))
);
alter table public.taxonomy_kinds enable row level security;
drop policy if exists "taxonomy_kinds: everyone reads" on public.taxonomy_kinds;
create policy "taxonomy_kinds: everyone reads" on public.taxonomy_kinds for select to anon, authenticated using (true);
-- TAXONOMY SEED START (the most specific match along a place's taxonomy hierarchy wins)
insert into public.taxonomy_kinds (taxonomy, kind) values
  ('restaurant','restaurant'),('casual_eatery','restaurant'),('buffet_restaurant','restaurant'),
  ('cafe','coffee'),('coffee_shop','coffee'),('coffee_roastery','coffee'),('internet_cafe','coffee'),
  ('burger_restaurant','burger'),('pizza_restaurant','pizza'),
  ('fast_food_restaurant','fastfood'),('chicken_restaurant','fastfood'),('sandwich_shop','fastfood'),('food_truck_stand','fastfood'),
  ('cafeteria','cafeteria'),('food_court','cafeteria'),
  ('ice_cream_shop','icecream'),('gelato_shop','icecream'),
  ('frozen_yogurt_shop','froyo'),('acai_bowls','acai'),('smoothie_juice_bar','acai'),
  ('dessert_shop','dessert'),('bakery','dessert'),('cake_shop','dessert'),('donut_shop','dessert'),('chocolatier','dessert'),
  ('patisserie','dessert'),('candy_store','dessert'),('cupcake_shop','dessert')
on conflict (taxonomy) do update set kind = excluded.kind;
-- TAXONOMY SEED END

-- a seed row's suggested kinds: the most specific taxonomy entry with a mapping
create or replace function public.seed_kinds(p_hierarchy jsonb) returns text[]
language sql stable set search_path = public as $$
  select coalesce(array(
    select k.kind from jsonb_array_elements_text(coalesce(p_hierarchy, '[]'::jsonb)) with ordinality h(t, n)
      join public.taxonomy_kinds k on k.taxonomy = h.t
     order by h.n desc limit 1), '{}')
$$;

-- search the seed by name, nearest first among equals (the app adds Koko places it already holds)
create or replace function public.search_place_seed(p_q text, p_lat double precision default null, p_lng double precision default null, p_limit integer default 8)
returns table (id text, name text, address text, zone text, lat double precision, lng double precision,
               taxonomy_primary text, kinds text[], score real)
language sql stable set search_path = public as $$
  with q as (select lower(trim(coalesce(p_q, ''))) as s,
                    '%' || replace(replace(replace(lower(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select s.id, s.name, s.address, s.zone, s.lat, s.lng, s.taxonomy_primary, public.seed_kinds(s.taxonomy_hierarchy),
         (word_similarity(q.s, lower(s.name))
           + case when lower(s.name) like q.s || '%' then 0.4 when s.name ilike q.pat then 0.2 else 0 end
           + coalesce(s.confidence, 0.5) * 0.1
           - case when p_lat is null or p_lng is null then 0
                  else least(sqrt(((s.lat - p_lat) * 110.57)^2 + ((s.lng - p_lng) * 100.75)^2), 30) / 60 end)::real as score
    from public.place_seed s, q
   where char_length(q.s) >= 2 and (s.name ilike q.pat or q.s <% s.name)
   order by score desc, s.name
   limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;
revoke all on function public.search_place_seed(text, double precision, double precision, integer) from public, anon;
grant execute on function public.search_place_seed(text, double precision, double precision, integer) to authenticated;
grant execute on function public.seed_kinds(jsonb) to authenticated;

/* ---------- 3. the places record: more on venues ---------- */
alter table public.venues add column if not exists seed_id       text references public.place_seed on delete set null;
alter table public.venues add column if not exists phone         text;
alter table public.venues add column if not exists website       text;
alter table public.venues add column if not exists instagram     text;
alter table public.venues add column if not exists other_socials jsonb not null default '[]'::jsonb;
alter table public.venues add column if not exists field_sources jsonb not null default '{}'::jsonb;
alter table public.venues add column if not exists verified_at   timestamptz;
alter table public.venues drop constraint if exists venues_phone_ok;
alter table public.venues add constraint venues_phone_ok check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$');
alter table public.venues drop constraint if exists venues_website_ok;
alter table public.venues add constraint venues_website_ok check (website is null or (website ~* '^https?://[^ ]+\.[^ ]+$' and char_length(website) <= 300));
-- an Instagram handle (no @, no URL): 1-30 of a-z 0-9 . _, no leading, trailing or doubled dot
alter table public.venues drop constraint if exists venues_instagram_ok;
alter table public.venues add constraint venues_instagram_ok check (instagram is null or (instagram ~ '^[a-z0-9._]{1,30}$' and instagram !~ '(^\.|\.$|\.\.)'));
alter table public.venues drop constraint if exists venues_other_socials_ok;
alter table public.venues add constraint venues_other_socials_ok check (jsonb_typeof(other_socials) = 'array' and jsonb_array_length(other_socials) <= 8
  and not jsonb_path_exists(other_socials, '$[*] ? (!(@ like_regex "^https?://[^ ]{3,250}$"))'));
alter table public.venues drop constraint if exists venues_field_sources_ok;
alter table public.venues add constraint venues_field_sources_ok check (jsonb_typeof(field_sources) = 'object'
  and not jsonb_path_exists(field_sources, '$.* ? (!(@ == "seed" || @ == "web" || @ == "user" || @ == "legacy_google"))'));
create index if not exists venues_seed on public.venues (seed_id);

-- where each existing place's values came from: Google-picked places carry Google-derived name and coordinates
-- (legacy_google, until the backfill replaces them); everything else was typed or pinned by someone (user)
update public.venues v set field_sources =
  jsonb_strip_nulls(jsonb_build_object(
    'name',       case when v.google_place_id is not null then 'legacy_google' else 'user' end,
    'coords',     case when v.lat is null then null when v.google_place_id is not null then 'legacy_google' else 'user' end,
    'address',    case when coalesce(v.address, '') = '' then null when v.google_place_id is not null then 'legacy_google' else 'user' end,
    'zone',       'user',
    'categories', 'user'))
 where v.field_sources = '{}'::jsonb;

-- a value someone typed or confirmed ('user') is never replaced by one from the seed or the web: the old value and
-- its 'user' mark are put back. (Changing it as a person, field_sources saying 'user', goes through.)
create or replace function public.venues_keep_user_fields() returns trigger
language plpgsql set search_path = public as $$
declare f record; was jsonb := coalesce(old.field_sources, '{}'::jsonb);
begin
  new.field_sources := coalesce(new.field_sources, '{}'::jsonb);
  for f in select * from (values ('name', array['name']), ('address', array['address']), ('coords', array['lat','lng']),
                                 ('zone', array['zone']), ('phone', array['phone']), ('website', array['website']),
                                 ('instagram', array['instagram']), ('other_socials', array['other_socials']),
                                 ('categories', array['categories'])) as x(field, cols)
  loop
    if was ->> f.field = 'user' and new.field_sources ->> f.field is distinct from 'user' then
      new := jsonb_populate_record(new, (select jsonb_object_agg(c, to_jsonb(old) -> c) from unnest(f.cols) c));
      new.field_sources := new.field_sources || jsonb_build_object(f.field, 'user');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists venues_keep_user_fields on public.venues;
create trigger venues_keep_user_fields before update on public.venues
  for each row execute function public.venues_keep_user_fields();

-- no new Google content: a new place never gets a Google place id (old ones keep theirs, as a matching key only)
create or replace function public.venues_no_new_google() returns trigger
language plpgsql set search_path = public as $$
begin
  -- (an upsert of a place that's already there keeps the id it had: it stays the key the backfill matches on)
  if not exists (select 1 from public.venues v where v.id = new.id and v.google_place_id is not distinct from new.google_place_id) then
    new.google_place_id := null; new.places_fetched_at := null;
  end if;
  return new;
end $$;
drop trigger if exists venues_no_new_google on public.venues;
create trigger venues_no_new_google before insert on public.venues
  for each row execute function public.venues_no_new_google();

/* ---------- 4. who can see a place ---------- */
-- only someone who can see a visit, a plan or a photo at it (each under its own rules), or who made it.
-- So a place logged only Just me stays with the person who logged it.
drop policy if exists "venues: read crew places" on public.venues;
drop policy if exists "venues: read places you can see a visit at" on public.venues;
create policy "venues: read places you can see a visit at" on public.venues for select to authenticated
  using (created_by = auth.uid()
      or exists (select 1 from public.entries e where e.venue_id = venues.id)
      or exists (select 1 from public.events ev where ev.venue_id = venues.id)
      or exists (select 1 from public.photos p where p.venue_id = venues.id));

/* ---------- 5. tags ---------- */
create table if not exists public.tags (
  id         text primary key check (id ~ '^[a-z0-9][a-z0-9 &''-]{0,29}$'),   -- the tag itself, lowercase ("rooftop")
  label      text not null check (char_length(label) between 1 and 30),
  kind_id    text,                                                          -- set on the 13 kinds
  is_system  boolean not null default false,
  created_at timestamptz not null default now()
);
insert into public.tags (id, label, kind_id, is_system) values
  ('restaurant','Restaurant','restaurant',true),('shisha','Shisha','shisha',true),('icecream','Ice cream','icecream',true),
  ('coffee','Coffee','coffee',true),('matcha','Matcha','matcha',true),('dessert','Dessert','dessert',true),
  ('burger','Burger','burger',true),('fastfood','Fast food','fastfood',true),('cafeteria','Cafeteria','cafeteria',true),
  ('karak','Karak','karak',true),('pizza','Pizza','pizza',true),('acai','Acai','acai',true),('froyo','Froyo','froyo',true)
on conflict (id) do update set label = excluded.label, kind_id = excluded.kind_id, is_system = true;

create table if not exists public.venue_tags (
  venue_id   text not null references public.venues on delete cascade,
  tag_id     text not null references public.tags on delete cascade,
  added_by   uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_id, tag_id)
);
create index if not exists venue_tags_tag on public.venue_tags (tag_id);
-- (a helper, so the tags and venue_tags rules don't read each other in a loop)
create or replace function public.tag_is_system(p_tag text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tags where id = p_tag and is_system) $$;
revoke all on function public.tag_is_system(text) from public, anon;
grant execute on function public.tag_is_system(text) to authenticated;
alter table public.tags enable row level security;
alter table public.venue_tags enable row level security;
-- a word someone added is visible only where you can see a place carrying it
drop policy if exists "tags: kinds, and tags on places you can see" on public.tags;
create policy "tags: kinds, and tags on places you can see" on public.tags for select to authenticated
  using (is_system or exists (select 1 from public.venue_tags vt where vt.tag_id = tags.id));
revoke insert, update, delete, truncate on public.tags from anon, authenticated;
drop policy if exists "venue_tags: on places you can see" on public.venue_tags;
create policy "venue_tags: on places you can see" on public.venue_tags for select to authenticated
  using (exists (select 1 from public.venues v where v.id = venue_tags.venue_id));
drop policy if exists "venue_tags: tag a place you can see" on public.venue_tags;
create policy "venue_tags: tag a place you can see" on public.venue_tags for insert to authenticated
  with check (added_by = auth.uid() and exists (select 1 from public.venues v where v.id = venue_tags.venue_id)
              and not public.tag_is_system(venue_tags.tag_id));
drop policy if exists "venue_tags: take off yours, or any on your place" on public.venue_tags;
create policy "venue_tags: take off yours, or any on your place" on public.venue_tags for delete to authenticated
  using (added_by = auth.uid() or exists (select 1 from public.venues v where v.id = venue_tags.venue_id and v.created_by = auth.uid()));

-- a new word becomes a tag the first time someone puts it on a place (nobody owns a tag: it's just the word)
create or replace function public.venue_tags_make_tag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.tags (id, label) values (new.tag_id, new.tag_id) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists venue_tags_make_tag on public.venue_tags;
create trigger venue_tags_make_tag before insert on public.venue_tags
  for each row execute function public.venue_tags_make_tag();

-- the kinds stay in venues.categories (the map, filters, books and stamps read them); their system tags follow
create or replace function public.venues_sync_kind_tags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.venue_tags vt using public.tags t
   where vt.venue_id = new.id and t.id = vt.tag_id and t.is_system and not (t.kind_id = any(new.categories));
  insert into public.venue_tags (venue_id, tag_id, added_by)
    select new.id, t.id, coalesce(auth.uid(), new.created_by) from public.tags t
     where t.is_system and t.kind_id = any(new.categories)
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists venues_sync_kind_tags on public.venues;
create trigger venues_sync_kind_tags after insert or update of categories on public.venues
  for each row execute function public.venues_sync_kind_tags();
-- and for the places already there
insert into public.venue_tags (venue_id, tag_id, added_by)
  select v.id, t.id, v.created_by from public.venues v join public.tags t on t.is_system and t.kind_id = any(v.categories)
on conflict do nothing;

grant select on public.place_seed, public.place_seed_releases, public.taxonomy_kinds, public.tags to authenticated;
grant select, insert, delete on public.venue_tags to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.venue_tags;
exception when others then null;   -- already there
end $$;

/* ---------- report: places still carrying Google-derived values (the backfill replaces or flags them) ---------- */
select count(*) as legacy_google_places from public.venues where field_sources::text like '%legacy_google%';
