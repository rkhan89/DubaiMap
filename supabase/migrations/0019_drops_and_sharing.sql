-- Koko: crew layers, the monthly drop and sharing (phase 3 of the scrapbook rebuild). Run after 0018_stickers.sql.
-- Safe to run again. In the Supabase SQL editor use plain Run: this file keeps RLS on for every table.
--
--   monthly_spreads  one per crew per month ("<crew id>|2026-10"), made when the crew's first shared visit of the month
--                    is logged. Members can decorate it while the month is open. At 00:00 Asia/Dubai on the 1st
--                    (20:00 UTC on the last day) it drops: drop_due_spreads() locks it and keeps the month's numbers
--                    and photos. pg_cron runs that every day at 20:00 UTC (if pg_cron isn't enabled, the app still
--                    treats a past month as dropped, and the server still refuses stickers on it).
--                    Only crew-shared visits ever reach a spread: never a Just me one.
--   share_links      a read-only link to one page or spread: a random token, 30 days unless renewed, revocable.
--                    Someone with the link sees the page's picture (rendered on the owner's phone and kept in the
--                    private shared-pages bucket) and the place, date, first names and pixel avatars, nothing else.
--                    A Just me page can only be shared by its owner; a crew page by someone in a crew it's shared
--                    with. Both are checked again every time the link is opened, so un-sharing a visit or leaving
--                    the crew turns the link off.
-- Also: leaving a crew removes your stickers from that crew's pages and spreads.

/* ---------- the monthly spread ---------- */
create table if not exists public.monthly_spreads (
  id          text primary key check (id ~ '^[0-9a-f-]{36}\|\d{4}-\d{2}$'),
  crew_id     uuid not null references public.crews on delete cascade,
  month       text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status      text not null default 'open' check (status in ('open','dropped')),
  stats       jsonb not null default '{}'::jsonb,
  photo_ids   text[] not null default '{}' check (cardinality(photo_ids) <= 6),
  dropped_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (crew_id, month),
  check (id = crew_id::text || '|' || month)
);
alter table public.monthly_spreads enable row level security;
drop policy if exists "monthly_spreads: crew members read" on public.monthly_spreads;
create policy "monthly_spreads: crew members read" on public.monthly_spreads for select to authenticated
  using (crew_id in (select public.my_crew_ids()));
-- (rows are only made and dropped by the functions below)

-- when a month ends in Dubai: 00:00 Asia/Dubai on the 1st of the next month
create or replace function public.spread_month_end(p_month text) returns timestamptz
language sql immutable set search_path = public as $$
  select ((p_month || '-01')::date + interval '1 month')::timestamp at time zone 'Asia/Dubai'
$$;

-- a crew's first shared visit of a month makes that month's spread
create or replace function public.make_spreads() returns trigger
language plpgsql security definer set search_path = public as $$
declare c uuid; m text;
begin
  if new.kind <> 'visit' or new.private or new.date is null then return new; end if;
  m := to_char(new.date, 'YYYY-MM');
  foreach c in array coalesce(new.crew_ids, '{}') loop
    insert into public.monthly_spreads (id, crew_id, month) values (c::text || '|' || m, c, m) on conflict (id) do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists entries_make_spreads on public.entries;
create trigger entries_make_spreads after insert or update of crew_ids, private, date on public.entries
  for each row execute function public.make_spreads();

-- lock every spread whose month has ended, keeping its numbers and up to six photos:
-- each member's top-rated photo of the month first, then photos from the places with the most ratings
create or replace function public.drop_due_spreads() returns integer
language plpgsql security definer set search_path = public as $$
declare s record; n integer := 0; v_stats jsonb; v_photos text[];
begin
  for s in select * from public.monthly_spreads where status = 'open' and public.spread_month_end(month) <= now() loop
    with visits as (
      select e.* from public.entries e
       where e.kind = 'visit' and not e.private and s.crew_id = any(e.crew_ids) and to_char(e.date, 'YYYY-MM') = s.month
         and exists (select 1 from public.crew_members m where m.crew_id = s.crew_id and m.user_id = e.user_id)
    ), earlier as (
      select distinct e.venue_id from public.entries e
       where e.kind = 'visit' and not e.private and s.crew_id = any(e.crew_ids) and e.date < (s.month || '-01')::date
    )
    select jsonb_build_object(
      'visits', (select count(*) from visits),
      'places', (select count(distinct venue_id) from visits),
      'newPlaces', (select count(distinct venue_id) from visits where venue_id not in (select venue_id from earlier)),
      'districts', (select count(distinct v.zone) from visits x join public.venues v on v.id = x.venue_id))
      into v_stats;
    with visits as (
      select e.* from public.entries e
       where e.kind = 'visit' and not e.private and s.crew_id = any(e.crew_ids) and to_char(e.date, 'YYYY-MM') = s.month
         and exists (select 1 from public.crew_members m where m.crew_id = s.crew_id and m.user_id = e.user_id)
    ), shots as (
      select p.id, p.user_id, x.venue_id, coalesce(x.rating, 0) as rating, p.created_at,
             (select count(*) from public.visit_ratings r join visits y on y.id = r.entry_id where y.venue_id = x.venue_id) + (select count(*) from visits y where y.venue_id = x.venue_id and y.rating > 0) as raters
        from public.photos p join visits x on x.id = p.entry_id
       where not p.private and s.crew_id = any(p.crew_ids)
    ), best as (
      select distinct on (user_id) id, rating, created_at from shots order by user_id, rating desc, created_at desc
    ), rest as (
      select id from shots where id not in (select id from best) order by raters desc, rating desc, created_at desc
    )
    select coalesce(array_agg(id), '{}') into v_photos from (
      (select id from best order by rating desc, created_at desc) union all (select id from rest)
    ) t;
    update public.monthly_spreads set status = 'dropped', dropped_at = now(), stats = v_stats, photo_ids = v_photos[1:6] where id = s.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.drop_due_spreads() from public, anon, authenticated;

-- run it every day at 20:00 UTC (00:00 in Dubai), where pg_cron is enabled
do $$ begin
  begin
    create extension if not exists pg_cron;
    perform cron.unschedule('koko-monthly-drop') where exists (select 1 from cron.job where jobname = 'koko-monthly-drop');
    perform cron.schedule('koko-monthly-drop', '0 20 * * *', 'select public.drop_due_spreads()');
  exception when others then raise notice 'pg_cron is not available here: enable it, then run this file again (spreads still lock on time)';
  end;
end $$;

/* ---------- decorations on spreads; crew layers ---------- */
-- page ids for a spread are "<spread id>:L" and "<spread id>:R" (its left and right page)
create or replace function public.can_see_page(p_type text, p_id text) returns boolean
language plpgsql stable set search_path = public as $$
begin
  if p_type = 'visit' then return exists (select 1 from public.entries e where e.id = p_id and e.kind = 'visit'); end if;
  if p_type = 'spread' then return exists (select 1 from public.monthly_spreads s where s.id = split_part(p_id, ':', 1)); end if;
  return false;
end $$;
-- …and may it still be decorated? A spread only while its month is open
create or replace function public.can_decorate_page(p_type text, p_id text) returns boolean
language plpgsql stable set search_path = public as $$
begin
  if not public.can_see_page(p_type, p_id) then return false; end if;
  if p_type = 'spread' then
    return exists (select 1 from public.monthly_spreads s where s.id = split_part(p_id, ':', 1) and s.status = 'open' and public.spread_month_end(s.month) > now());
  end if;
  return true;
end $$;
drop policy if exists "page_decorations: add yours" on public.page_decorations;
create policy "page_decorations: add yours" on public.page_decorations for insert to authenticated
  with check (user_id = auth.uid() and public.can_decorate_page(page_type, page_id));
drop policy if exists "page_decorations: move yours" on public.page_decorations;
create policy "page_decorations: move yours" on public.page_decorations for update to authenticated
  using (user_id = auth.uid() and public.can_decorate_page(page_type, page_id)) with check (user_id = auth.uid() and public.can_decorate_page(page_type, page_id));
drop policy if exists "page_decorations: remove yours" on public.page_decorations;
create policy "page_decorations: remove yours" on public.page_decorations for delete to authenticated
  using (user_id = auth.uid() and public.can_decorate_page(page_type, page_id));

-- leaving a crew takes your stickers off its pages: its spreads, and crew visits that aren't yours or yours to see
create or replace function public.unstick_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.page_decorations d using public.monthly_spreads s
   where d.user_id = old.user_id and d.page_type = 'spread' and s.id = split_part(d.page_id, ':', 1) and s.crew_id = old.crew_id;
  delete from public.page_decorations d using public.entries e
   where d.user_id = old.user_id and d.page_type = 'visit' and e.id = d.page_id and old.crew_id = any(e.crew_ids)
     and e.user_id <> old.user_id and not (old.user_id = any(e.tagged_ids))
     and not exists (select 1 from public.crew_members m where m.user_id = old.user_id and m.crew_id <> old.crew_id and m.crew_id = any(e.crew_ids));
  return old;
end $$;
drop trigger if exists crew_members_unstick on public.crew_members;
create trigger crew_members_unstick after delete on public.crew_members for each row execute function public.unstick_on_leave();

/* ---------- read-only page links ---------- */
create table if not exists public.share_links (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  owner_user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  target_type   text not null check (target_type in ('page','spread')),
  target_id     text not null check (char_length(target_id) between 1 and 100),
  image_path    text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{24,64}\.(png|webp|jpg)$'),
  expires_at    timestamptz not null default now() + interval '30 days',
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.share_links enable row level security;

-- may this person share this page? A Just me visit only by its owner; a crew visit by someone in a crew it's shared
-- with (or its owner); a spread by someone in its crew. Security definer, so it gives the same answer when an
-- anonymous visitor opens the link.
create or replace function public.can_share(p_user uuid, p_type text, p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'page' then exists (select 1 from public.entries e where e.id = p_id and e.kind = 'visit' and (
      e.user_id = p_user or (not e.private and exists (select 1 from public.crew_members m where m.user_id = p_user and m.crew_id = any(e.crew_ids)))))
    when 'spread' then exists (select 1 from public.monthly_spreads s join public.crew_members m on m.crew_id = s.crew_id where s.id = p_id and m.user_id = p_user)
    else false end
$$;
create or replace function public.share_link_ok(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.share_links l where l.token = p_token and l.revoked_at is null and l.expires_at > now()
                  and public.can_share(l.owner_user_id, l.target_type, l.target_id))
$$;

drop policy if exists "share_links: read yours" on public.share_links;
create policy "share_links: read yours" on public.share_links for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists "share_links: make one for what you may share" on public.share_links;
create policy "share_links: make one for what you may share" on public.share_links for insert to authenticated
  with check (owner_user_id = auth.uid() and expires_at <= now() + interval '31 days' and revoked_at is null and public.can_share(auth.uid(), target_type, target_id)
              and (image_path is null or split_part(image_path, '/', 1) = auth.uid()::text));
drop policy if exists "share_links: renew or turn off yours" on public.share_links;
create policy "share_links: renew or turn off yours" on public.share_links for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid() and expires_at <= now() + interval '31 days'
              and (image_path is null or split_part(image_path, '/', 1) = auth.uid()::text));
drop policy if exists "share_links: delete yours" on public.share_links;
create policy "share_links: delete yours" on public.share_links for delete to authenticated using (owner_user_id = auth.uid());

-- what someone with the link sees, besides the picture: the place, the date, the area, first names and pixel avatars
create or replace function public.shared_page(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l record; e record; s record; people uuid[];
begin
  select * into l from public.share_links where token = p_token;
  if not found or not public.share_link_ok(p_token) then return null; end if;
  if l.target_type = 'page' then
    select en.*, v.name as venue_name, v.zone as zone into e from public.entries en join public.venues v on v.id = en.venue_id where en.id = l.target_id;
    people := array(select distinct unnest(array[e.user_id] || coalesce(e.tagged_ids, '{}')));
    return jsonb_build_object('type', 'page', 'title', e.venue_name, 'date', e.date, 'zone', e.zone, 'image', l.image_path, 'expires', l.expires_at,
      'people', (select coalesce(jsonb_agg(jsonb_build_object('name', split_part(coalesce(nullif(p.name, ''), 'Friend'), ' ', 1), 'avatar', p.avatar)), '[]'::jsonb)
                   from public.profiles p where p.id = any(people)));
  end if;
  select ms.*, c.name as crew_name into s from public.monthly_spreads ms join public.crews c on c.id = ms.crew_id where ms.id = l.target_id;
  return jsonb_build_object('type', 'spread', 'title', s.crew_name, 'month', s.month, 'image', l.image_path, 'expires', l.expires_at,
    'people', (select coalesce(jsonb_agg(jsonb_build_object('name', split_part(coalesce(nullif(p.name, ''), 'Friend'), ' ', 1), 'avatar', p.avatar)), '[]'::jsonb)
                 from public.crew_members m join public.profiles p on p.id = m.user_id where m.crew_id = s.crew_id));
end $$;
grant execute on function public.shared_page(text) to anon, authenticated;

/* ---------- the pictures behind page links ---------- */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shared-pages', 'shared-pages', false, 4194304, array['image/png','image/webp','image/jpeg'])
on conflict (id) do nothing;
drop policy if exists "shared pages: upload your own" on storage.objects;
create policy "shared pages: upload your own" on storage.objects for insert to authenticated
  with check (bucket_id = 'shared-pages' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "shared pages: replace your own" on storage.objects;
create policy "shared pages: replace your own" on storage.objects for update to authenticated
  using (bucket_id = 'shared-pages' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "shared pages: delete your own" on storage.objects;
create policy "shared pages: delete your own" on storage.objects for delete to authenticated
  using (bucket_id = 'shared-pages' and (storage.foldername(name))[1] = auth.uid()::text);
-- anyone (signed in or not) with a live link reads its picture; the file's name is the link's token
drop policy if exists "shared pages: read with a live link" on storage.objects;
create policy "shared pages: read with a live link" on storage.objects for select to anon, authenticated
  using (bucket_id = 'shared-pages' and public.share_link_ok(split_part(split_part(name, '/', 2), '.', 1)));

do $$ begin
  begin alter publication supabase_realtime add table public.monthly_spreads; exception when others then null; end;
end $$;

-- spreads for the months crews already have visits in (dropped where the month is over)
insert into public.monthly_spreads (id, crew_id, month)
select distinct c::text || '|' || to_char(e.date, 'YYYY-MM'), c, to_char(e.date, 'YYYY-MM')
  from public.entries e, unnest(e.crew_ids) c
 where e.kind = 'visit' and not e.private and e.date is not null and exists (select 1 from public.crews where id = c)
on conflict (id) do nothing;
select public.drop_due_spreads();
