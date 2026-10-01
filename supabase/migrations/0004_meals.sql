-- Koko: breakfast / lunch / dinner tags on a visit or a save (filterable on the map).
-- Run after 0003_multi_crew.sql. Safe to run again. Use plain Run in the SQL editor.
alter table public.entries add column if not exists meals text[] not null default '{}';
alter table public.entries drop constraint if exists entries_meals_known;
alter table public.entries add constraint entries_meals_known check (meals <@ array['breakfast','lunch','dinner']::text[]);
