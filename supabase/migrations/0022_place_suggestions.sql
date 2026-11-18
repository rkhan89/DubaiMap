-- 0022: gap fill as suggestions. Missing details for a place (address, phone, website, Instagram) are suggested
-- from a sourced fact, and only a person's Confirm writes one into the shared place (venues).
--
--   place_suggestions   one suggested value, with where it came from (source, URL or dataset id, licence), when it
--                       was fetched, a confidence, and for values read off a web page the exact text it was found in.
--                       Written only by the server job (the database role); nobody writes it from the app.
--   decide_suggestion   Confirm or Not right. Confirm copies the value into venues and marks that field 'user' (a
--                       person vouched for it, so the seed or the web never overwrites it), and retires any other
--                       pending suggestions for the same field.
--
-- Rules this enforces: no source, no suggestion; web values need their evidence text; AI never writes to venues
-- (only decide_suggestion does, and only when a person asks). Google content is never a source.
-- Safe to run again.

create table if not exists public.place_suggestions (
  id          bigint generated always as identity primary key,
  venue_id    text not null references public.venues on delete cascade,
  field       text not null check (field in ('address','phone','website','instagram')),
  value       text not null check (char_length(value) between 1 and 300),
  source      text not null check (source in ('seed','web')),          -- seed: Overture; web: the place's own site
  source_ref  text,                                                     -- the seed id (overture:…) for seed
  source_url  text check (source_url is null or (char_length(source_url) <= 300 and source_url ~* '^https?://[^ ]{3,}$')),
  license     text,                                                     -- e.g. CDLA-Permissive-2.0, for seed
  method      text not null check (method in ('dataset','extract_verbatim')),
  evidence    text check (evidence is null or char_length(evidence) <= 500),
  confidence  real not null check (confidence between 0 and 1),
  fetched_at  timestamptz not null default now(),
  status      text not null default 'pending' check (status in ('pending','confirmed','rejected','stale')),
  decided_by  uuid references public.profiles on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  -- every suggestion is sourced: a seed row id, or a web page plus the text the value was read from
  constraint place_suggestions_sourced check (
       (source = 'seed' and method = 'dataset' and source_ref is not null and source_ref ~ '^overture:')
    or (source = 'web' and method = 'extract_verbatim' and source_url is not null and evidence is not null
        and position(lower(value) in lower(evidence)) > 0)),
  -- the same formats venues accepts, so a Confirm can't fail on the value
  constraint place_suggestions_format check (
       (field = 'address')
    or (field = 'phone' and value ~ '^\+?[0-9 ()-]{7,20}$')
    or (field = 'website' and value ~* '^https?://[^ ]+\.[^ ]+$')
    or (field = 'instagram' and value ~ '^[a-z0-9._]{1,30}$' and value !~ '(^\.|\.$|\.\.)')),
  constraint place_suggestions_decided check ((status in ('pending','stale')) = (decided_at is null)),
  unique (venue_id, field, source, value)
);
create index if not exists place_suggestions_venue on public.place_suggestions (venue_id) where status = 'pending';

alter table public.place_suggestions enable row level security;
-- you see a place's suggestions when you can see the place (venues' own rules decide, so Just me stays private)
drop policy if exists "suggestions: read where you see the place" on public.place_suggestions;
create policy "suggestions: read where you see the place" on public.place_suggestions for select to authenticated
  using (exists (select 1 from public.venues v where v.id = place_suggestions.venue_id));
-- no insert, update or delete policy: the app can't write here; decide_suggestion does the deciding
revoke insert, update, delete on public.place_suggestions from anon, authenticated;

-- Confirm (p_ok true) or Not right (false). Only someone who can see a visit at the place (the same rule as the
-- entries read policy), or who added the place, can decide. A field someone already filled in by hand is not
-- replaced: the suggestion goes stale instead.
create or replace function public.decide_suggestion(p_id bigint, p_ok boolean) returns json
language plpgsql security definer set search_path = public as $$
declare s public.place_suggestions; v public.venues; me uuid := auth.uid(); cur text;
begin
  if me is null then return json_build_object('state','signed_out'); end if;
  select * into s from public.place_suggestions where id = p_id for update;
  if not found then return json_build_object('state','not_found'); end if;
  if s.status <> 'pending' then return json_build_object('state','already', 'status', s.status); end if;
  select * into v from public.venues where id = s.venue_id for update;
  if not (v.created_by = me or exists (
        select 1 from public.entries e where e.venue_id = v.id and e.kind = 'visit'
           and (e.user_id = me or me = any(e.tagged_ids) or (not e.private and public.shared_with_me(e.user_id, e.crew_ids))))) then
    return json_build_object('state','not_allowed');
  end if;

  if not p_ok then
    update public.place_suggestions set status = 'rejected', decided_by = me, decided_at = now() where id = s.id;
    return json_build_object('state','rejected');
  end if;

  cur := case s.field when 'address' then nullif(v.address, '') when 'phone' then v.phone
                      when 'website' then v.website when 'instagram' then v.instagram end;
  if cur is not null and v.field_sources ->> s.field = 'user' then
    update public.place_suggestions set status = 'stale' where id = s.id;
    return json_build_object('state','already_set');
  end if;

  update public.venues set
    address   = case when s.field = 'address'   then s.value else address end,
    phone     = case when s.field = 'phone'     then s.value else phone end,
    website   = case when s.field = 'website'   then s.value else website end,
    instagram = case when s.field = 'instagram' then s.value else instagram end,
    field_sources = field_sources || jsonb_build_object(s.field, 'user')
  where id = v.id;
  update public.place_suggestions set status = 'confirmed', decided_by = me, decided_at = now() where id = s.id;
  update public.place_suggestions set status = 'stale'
   where venue_id = s.venue_id and field = s.field and status = 'pending' and id <> s.id;
  return json_build_object('state','confirmed', 'field', s.field, 'value', s.value);
end $$;
revoke all on function public.decide_suggestion(bigint, boolean) from public, anon;
grant execute on function public.decide_suggestion(bigint, boolean) to authenticated;
