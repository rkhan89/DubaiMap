-- Koko 0015: the invite welcome. Run once in the Supabase SQL editor, after 0014. Safe to run again.
--
-- Someone who opens an invite link isn't signed in yet, and crew_preview is for signed-in people only.
-- This narrow preview lets the welcome screen show which crew they're joining and who started it:
-- the crew's name, how many people are in it, and its owner's name and pixel avatar (never a photo). No ids, no
-- handles, no other members. It answers only for a full invite code (10 random characters since
-- 0006), so it can't be used to look crews up by guessing.
create or replace function public.crew_invite_preview(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', c.name,
    'count', (select count(*) from public.crew_members m where m.crew_id = c.id),
    'owner', json_build_object('name', coalesce(nullif(p.name, ''), p.handle), 'avatar', json_build_object('pixel', p.avatar->'pixel')))
  from public.crews c left join public.profiles p on p.id = c.owner_id
  where upper(trim(p_code)) ~ '^[0-9A-F]{10}$' and c.code = upper(trim(p_code))
$$;
revoke all on function public.crew_invite_preview(text) from public;
grant execute on function public.crew_invite_preview(text) to anon, authenticated;

select public.crew_invite_preview('0000000000') as should_be_null;
