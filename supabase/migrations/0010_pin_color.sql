-- Koko: your pin colour (the ring on your pins on everyone's map). Run after 0009_visit_ratings.sql.
-- Safe to run again. Empty means "not chosen": you see your own as coral, friends get a free colour.
alter table public.profiles add column if not exists pin_color text;
alter table public.profiles drop constraint if exists profiles_pin_color_check;
alter table public.profiles add constraint profiles_pin_color_check check (pin_color is null or pin_color ~ '^#[0-9A-Fa-f]{6}$');
-- (editing it goes through "profiles: edit yourself", like the rest of your profile)
