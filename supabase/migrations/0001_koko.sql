-- Koko: schema, privacy rules, crew functions, photo storage and realtime.
-- Run once in the Supabase SQL editor (or with the Supabase CLI). Safe to read top to bottom:
--   1. tables   2. who-can-see-what helpers   3. row level security   4. crew/RSVP/bookmark functions
--   5. photo storage   6. realtime
--
-- Privacy model (same as the app): a private visit or photo is visible to its owner only.
-- Everything else is visible to the owner's crew. Nobody can write anyone else's rows;
-- the few shared actions (join a crew, RSVP, bookmark a photo) go through checked functions.

create extension if not exists citext;

/* =========================================================
   1. TABLES
   ========================================================= */
create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  handle        citext unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  name          text not null default '' check (char_length(name) <= 40),
  tagline       text not null default '' check (char_length(tagline) <= 60),
  avatar        jsonb not null default '{}'::jsonb,
  share_default text not null default 'crew' check (share_default in ('crew','private')),
  points        integer not null default 0,
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.crews (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 40),
  tagline    text not null default '' check (char_length(tagline) <= 80),
  code       text not null unique check (code ~ '^[A-Z0-9]{4,10}$'),
  owner_id   uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

-- one crew per person (user_id is unique), up to 15 per crew (enforced in join_crew)
create table public.crew_members (
  crew_id   uuid not null references public.crews on delete cascade,
  user_id   uuid not null unique references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

-- ids for venues, entries, photos, books and events are made on the phone (so the app
-- works offline and replays later); they're text
create table public.venues (
  id         text primary key check (char_length(id) between 1 and 80),
  name       text not null check (char_length(name) between 1 and 80),
  zone       text not null,
  categories text[] not null default '{}',
  lat        double precision,
  lng        double precision,
  address    text not null default '',
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table public.entries (
  id         text primary key check (char_length(id) between 1 and 80),
  venue_id   text not null references public.venues on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  kind       text not null check (kind in ('visit','want')),
  rating     numeric(2,1) not null default 0 check (rating between 0 and 5),
  notes      text not null default '' check (char_length(notes) <= 400),
  date       date not null default current_date,
  private    boolean not null default false,
  checkin    boolean not null default false,
  created_at timestamptz not null default now()
);
create index entries_venue on public.entries (venue_id);
create index entries_user on public.entries (user_id);

create table public.photos (
  id            text primary key check (char_length(id) between 1 and 80),
  user_id       uuid not null default auth.uid() references public.profiles on delete cascade,
  venue_id      text not null references public.venues on delete cascade,
  entry_id      text references public.entries on delete cascade,
  caption       text not null default '' check (char_length(caption) <= 80),
  date          date not null default current_date,
  private       boolean not null default false,
  path          text not null unique,
  bookmarked_by uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index photos_user on public.photos (user_id);

create table public.books (
  id             text primary key check (char_length(id) between 1 and 80),
  owner_id       uuid not null default auth.uid() references public.profiles on delete cascade,
  crew_id        uuid references public.crews on delete cascade,
  kind           text not null check (kind in ('personal','crew','album')),
  title          text not null default '' check (char_length(title) <= 80),
  byline         text not null default '' check (char_length(byline) <= 80),
  texture        text,
  tint           text,
  pin            text,
  cover_photo_id text,
  filter         jsonb not null default '{}'::jsonb,
  pages          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create unique index books_one_crew_book on public.books (crew_id) where kind = 'crew';

create table public.events (
  id         text primary key check (char_length(id) between 1 and 80),
  crew_id    uuid references public.crews on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  venue_id   text not null references public.venues on delete cascade,
  starts_at  text not null check (starts_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),   -- Dubai local time
  note       text not null default '' check (char_length(note) <= 120),
  rsvps      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- every new account gets an (empty) profile row
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/* =========================================================
   2. WHO CAN SEE WHAT (helpers, security definer so policies don't recurse)
   ========================================================= */
create or replace function public.my_crew_id() returns uuid
language sql stable security definer set search_path = public as $$
  select crew_id from public.crew_members where user_id = auth.uid()
$$;

-- me plus everyone in my crew
create or replace function public.crewmate_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select auth.uid()
  union
  select m.user_id from public.crew_members m where m.crew_id = public.my_crew_id()
$$;

/* =========================================================
   3. ROW LEVEL SECURITY
   ========================================================= */
alter table public.profiles     enable row level security;
alter table public.crews        enable row level security;
alter table public.crew_members enable row level security;
alter table public.venues       enable row level security;
alter table public.entries      enable row level security;
alter table public.photos       enable row level security;
alter table public.books        enable row level security;
alter table public.events       enable row level security;

-- profiles: you and your crew; you edit only yourself
create policy "profiles: crew can read" on public.profiles for select to authenticated
  using (id in (select public.crewmate_ids()));
create policy "profiles: create yourself" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles: edit yourself" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- crews: members read; the owner renames. Creating and joining go through functions.
create policy "crews: members read" on public.crews for select to authenticated
  using (id = public.my_crew_id());
create policy "crews: owner edits" on public.crews for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "crew_members: members read" on public.crew_members for select to authenticated
  using (crew_id = public.my_crew_id());
create policy "crew_members: leave, or owner removes" on public.crew_members for delete to authenticated
  using (user_id = auth.uid()
      or exists (select 1 from public.crews c where c.id = crew_id and c.owner_id = auth.uid()));

-- entries: yours, plus your crew's shared ones
create policy "entries: read yours and crew's shared" on public.entries for select to authenticated
  using (user_id = auth.uid() or (not private and user_id in (select public.crewmate_ids())));
create policy "entries: add yours" on public.entries for insert to authenticated
  with check (user_id = auth.uid());
create policy "entries: edit yours" on public.entries for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "entries: delete yours" on public.entries for delete to authenticated
  using (user_id = auth.uid());

-- venues: ones you or your crew added, and any place a visible visit or plan points at
create policy "venues: read crew places" on public.venues for select to authenticated
  using (created_by in (select public.crewmate_ids())
      or exists (select 1 from public.entries e where e.venue_id = venues.id)
      or exists (select 1 from public.events ev where ev.venue_id = venues.id));
create policy "venues: add" on public.venues for insert to authenticated
  with check (created_by = auth.uid());
create policy "venues: edit yours" on public.venues for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "venues: delete yours" on public.venues for delete to authenticated
  using (created_by = auth.uid());

-- photos: same rule as entries
create policy "photos: read yours and crew's shared" on public.photos for select to authenticated
  using (user_id = auth.uid() or (not private and user_id in (select public.crewmate_ids())));
create policy "photos: add yours" on public.photos for insert to authenticated
  with check (user_id = auth.uid());
create policy "photos: edit yours" on public.photos for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "photos: delete yours" on public.photos for delete to authenticated
  using (user_id = auth.uid());

-- books: yours, and your crew's shared book (any member can edit its pages)
create policy "books: read yours and your crew's" on public.books for select to authenticated
  using (owner_id = auth.uid() or (kind = 'crew' and crew_id = public.my_crew_id()));
create policy "books: add" on public.books for insert to authenticated
  with check ((kind <> 'crew' and owner_id = auth.uid()) or (kind = 'crew' and crew_id = public.my_crew_id()));
create policy "books: edit yours or the crew book" on public.books for update to authenticated
  using (owner_id = auth.uid() or (kind = 'crew' and crew_id = public.my_crew_id()))
  with check (owner_id = auth.uid() or (kind = 'crew' and crew_id = public.my_crew_id()));
create policy "books: delete your albums" on public.books for delete to authenticated
  using (owner_id = auth.uid() and kind = 'album');

-- events: your crew's plans; the host edits or cancels; RSVPs go through rsvp()
create policy "events: read crew plans" on public.events for select to authenticated
  using (created_by = auth.uid() or crew_id = public.my_crew_id());
create policy "events: plan one" on public.events for insert to authenticated
  with check (created_by = auth.uid() and (crew_id is null or crew_id = public.my_crew_id()));
create policy "events: host edits" on public.events for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "events: host cancels" on public.events for delete to authenticated
  using (created_by = auth.uid());

/* =========================================================
   4. FUNCTIONS FOR SHARED ACTIONS
   ========================================================= */
create or replace function public.handle_available(p_handle text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where handle = lower(p_handle)::citext and id <> auth.uid())
$$;

-- leave your crew (the crew goes when its last member leaves; ownership passes on)
create or replace function public.leave_crew() returns void
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_crew_id(); next_owner uuid;
begin
  if c is null then return; end if;
  delete from public.crew_members where user_id = auth.uid();
  if not exists (select 1 from public.crew_members where crew_id = c) then
    delete from public.crews where id = c;
  elsif exists (select 1 from public.crews where id = c and owner_id = auth.uid()) then
    select user_id into next_owner from public.crew_members where crew_id = c order by joined_at limit 1;
    update public.crews set owner_id = next_owner where id = c;
  end if;
end $$;

create or replace function public.create_crew(p_name text, p_tagline text default '') returns public.crews
language plpgsql security definer set search_path = public as $$
declare letters text; new_code text; crew public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.leave_crew();
  letters := left(regexp_replace(upper(coalesce(p_name,'')), '[^A-Z]', '', 'g'), 5);
  if char_length(letters) < 3 then letters := rpad(letters, 3, 'X'); end if;   -- (rpad alone would also cut longer names down to 3)
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

-- join by code: returns 'ok', 'invalid' or 'full'
create or replace function public.join_crew(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from public.crews where code = upper(trim(p_code));
  if not found then return 'invalid'; end if;
  if public.my_crew_id() = c.id then return 'ok'; end if;
  if (select count(*) from public.crew_members where crew_id = c.id) >= 15 then return 'full'; end if;
  perform public.leave_crew();
  insert into public.crew_members (crew_id, user_id) values (c.id, auth.uid());
  return 'ok';
end $$;

-- what an invite link shows before you join: name, motto, headcount, up to six faces
create or replace function public.crew_preview(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', c.id, 'name', c.name, 'tagline', c.tagline, 'code', c.code,
    'count', (select count(*) from public.crew_members m where m.crew_id = c.id),
    'members', coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'handle', p.handle, 'avatar', p.avatar))
                           from (select p.* from public.crew_members m join public.profiles p on p.id = m.user_id
                                 where m.crew_id = c.id order by m.joined_at limit 6) p), '[]'::json))
  from public.crews c where c.code = upper(trim(p_code))
$$;

create or replace function public.rsvp(p_event text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('going','maybe','no') then raise exception 'bad status'; end if;
  update public.events set rsvps = rsvps || jsonb_build_object(auth.uid()::text, p_status)
   where id = p_event and (created_by = auth.uid() or crew_id = public.my_crew_id());
end $$;

create or replace function public.toggle_bookmark(p_photo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare on_now boolean;
begin
  update public.photos p
     set bookmarked_by = case when auth.uid() = any(p.bookmarked_by) then array_remove(p.bookmarked_by, auth.uid())
                              else array_append(p.bookmarked_by, auth.uid()) end
   where p.id = p_photo
     and (p.user_id = auth.uid() or (not p.private and p.user_id in (select public.crewmate_ids())))
  returning auth.uid() = any(bookmarked_by) into on_now;
  return coalesce(on_now, false);
end $$;

revoke all on function public.leave_crew, public.create_crew, public.join_crew, public.crew_preview,
  public.rsvp, public.toggle_bookmark, public.handle_available from public, anon;
grant execute on function public.leave_crew, public.create_crew, public.join_crew, public.crew_preview,
  public.rsvp, public.toggle_bookmark, public.handle_available to authenticated;

/* =========================================================
   5. PHOTO STORAGE: a private bucket; files live under <your user id>/<photo id>.jpg
   You can read a file only if you can see its photo row (so private stays private).
   ========================================================= */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "photo files: upload your own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photo files: replace your own" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photo files: delete your own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photo files: read what you can see" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.photos p where p.path = storage.objects.name)));

/* =========================================================
   6. REALTIME: crewmates' changes arrive live (row level security still applies)
   ========================================================= */
alter publication supabase_realtime add table
  public.profiles, public.crews, public.crew_members, public.venues,
  public.entries, public.photos, public.books, public.events;
