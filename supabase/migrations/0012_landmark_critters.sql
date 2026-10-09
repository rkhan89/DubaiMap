-- Koko: landmark critters (the bonus tier). Run after 0011_critters.sql. Safe to run again.
-- In the Supabase SQL editor use plain Run: RLS stays on.
--
-- A landmark critter is found like any critter: one row per person per critter in critter_catches (never edited,
-- read by you and your crewmates). It also records which landmark it was found at. critter_finds is the same
-- rows under the names the brief uses: (user_id, critter_id, landmark_id, found_at, lat, lng, accuracy_m).
-- Tester stage: the check is on the phone; lat, lng (to ~100 m, as for every catch) and accuracy are kept so
-- spoofing can be spotted later.

alter table public.critter_catches add column if not exists landmark_id text
  check (landmark_id is null or landmark_id ~ '^[a-z0-9_]{2,40}$');

create or replace view public.critter_finds with (security_invoker = on) as
  select user_id, critter_id, landmark_id, caught_at as found_at, lat, lng, accuracy_m
  from public.critter_catches
  where landmark_id is not null;
grant select on public.critter_finds to authenticated;
