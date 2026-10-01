-- Koko, Phase 1c: Share to Koko. Run after 0001_koko.sql. Safe to run again.
-- In the Supabase SQL editor use plain Run: this file already turns on RLS for every table.
--   venues get a Google place id; visits get a source type (TikTok, Google Maps…)
--   the source LINK is private to its owner, so it lives in its own owner-only table
--   share_inbox: shares to finish later; a type→category map; rate limit + link cache helpers

/* venues: the Google place id is the stable key (Google allows storing it indefinitely).
   Coordinates from Places may be cached for 30 days, so we note when they were fetched. */
alter table public.venues add column if not exists google_place_id text;
alter table public.venues add column if not exists places_fetched_at timestamptz;
create index if not exists venues_google_place on public.venues (google_place_id);

/* visits: where it came from. Crewmates may see the type ("Saved from TikTok"), never the link. */
alter table public.entries add column if not exists source_type text
  check (source_type in ('google_maps','tiktok','instagram','text','manual'));

create table if not exists public.entry_sources (
  entry_id   text primary key references public.entries on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  source_url text not null check (char_length(source_url) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.entry_sources enable row level security;
drop policy if exists "entry_sources: only yours" on public.entry_sources;
create policy "entry_sources: only yours" on public.entry_sources for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

/* the inbox: shares that couldn't be resolved, were saved for later, or arrived offline */
create table if not exists public.share_inbox (
  id                text primary key check (char_length(id) between 1 and 80),
  user_id           uuid not null default auth.uid() references public.profiles on delete cascade,
  source_url        text check (char_length(source_url) <= 2000),
  source_type       text check (source_type in ('google_maps','tiktok','instagram','text','manual')),
  raw_text          text check (char_length(raw_text) <= 2000),
  title             text check (char_length(title) <= 300),
  status            text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  candidates        jsonb not null default '[]'::jsonb,
  resolved_venue_id text references public.venues on delete set null,
  created_at        timestamptz not null default now()
);
alter table public.share_inbox enable row level security;
drop policy if exists "share_inbox: only yours" on public.share_inbox;
create policy "share_inbox: only yours" on public.share_inbox for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

/* Google Places types → Koko categories (mirrors api/_lib/categories.js) */
create table if not exists public.place_type_categories (
  google_type text primary key,
  category    text not null check (category in ('coffee','matcha','dessert','burger','fastfood','cafeteria','karak','pizza','acai','froyo'))
);
alter table public.place_type_categories enable row level security;
drop policy if exists "place_type_categories: everyone signed in reads" on public.place_type_categories;
create policy "place_type_categories: everyone signed in reads" on public.place_type_categories for select to authenticated using (true);
insert into public.place_type_categories (google_type, category) values
  ('coffee_shop','coffee'),('cafe','coffee'),('coffee_roastery','coffee'),('coffee_stand','coffee'),
  ('tea_house','karak'),
  ('dessert_shop','dessert'),('dessert_restaurant','dessert'),('bakery','dessert'),('confectionery','dessert'),('chocolate_shop','dessert'),
  ('donut_shop','dessert'),('candy_store','dessert'),('cake_shop','dessert'),('pastry_shop','dessert'),
  ('ice_cream_shop','froyo'),('frozen_yogurt_shop','froyo'),
  ('acai_shop','acai'),('juice_shop','acai'),('smoothie_shop','acai'),
  ('hamburger_restaurant','burger'),
  ('fast_food_restaurant','fastfood'),('sandwich_shop','fastfood'),('chicken_restaurant','fastfood'),('hot_dog_restaurant','fastfood'),
  ('pizza_restaurant','pizza'),('italian_restaurant','pizza'),
  ('cafeteria','cafeteria'),('diner','cafeteria'),('food_court','cafeteria'),('breakfast_restaurant','cafeteria'),('brunch_restaurant','cafeteria'),
  ('middle_eastern_restaurant','cafeteria'),('lebanese_restaurant','cafeteria'),('indian_restaurant','cafeteria'),('pakistani_restaurant','cafeteria'),
  ('turkish_restaurant','cafeteria'),('afghani_restaurant','cafeteria'),('persian_restaurant','cafeteria'),('restaurant','cafeteria')
on conflict (google_type) do nothing;

/* rate limit: each resolve call records a hit; the function returns this hour's count */
create table if not exists public.share_rate (
  user_id uuid not null references public.profiles on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists share_rate_user_at on public.share_rate (user_id, at);
alter table public.share_rate enable row level security;   -- no policies: only the function below
create or replace function public.share_rate_hit() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.share_rate where user_id = auth.uid() and at < now() - interval '1 hour';
  insert into public.share_rate (user_id) values (auth.uid());
  select count(*) into n from public.share_rate where user_id = auth.uid();
  return n;
end $$;

/* link cache: where a short link leads (its full Maps URL). No Google place content is cached. */
create table if not exists public.share_cache (
  key        text primary key check (char_length(key) <= 600),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.share_cache enable row level security;  -- no policies: only the functions below
create or replace function public.share_cache_get(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.share_cache where key = p_key and updated_at > now() - interval '30 days'
$$;
create or replace function public.share_cache_put(p_key text, p_value jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.share_cache (key, value) values (left(p_key, 600), p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now()
$$;

revoke all on function public.share_rate_hit, public.share_cache_get, public.share_cache_put from public, anon;
grant execute on function public.share_rate_hit, public.share_cache_get, public.share_cache_put to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.share_inbox;
exception when duplicate_object then null;
end $$;
