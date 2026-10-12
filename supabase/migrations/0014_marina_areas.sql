-- Koko 0014: the Marina pack's area aliases (areas_marina.json). Run once in the Supabase SQL editor, after 0013.
-- 0013 seeded the areas with "on conflict do nothing", so these three are updated here. Safe to run again.
update public.areas set aliases = array['marina','dubai marina','marina walk','marina mall']::text[] where id = 'marina';
update public.areas set aliases = array['jbr','jumeirah beach residence','the walk','the beach']::text[] where id = 'jbr';
update public.areas set aliases = array['bluewaters','blue waters','bluewaters island','ain dubai','the wheel','dubai eye']::text[] where id = 'bluewaters';
select id, aliases from public.areas where id in ('marina', 'jbr', 'bluewaters');
