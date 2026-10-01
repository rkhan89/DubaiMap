-- Koko: three more kinds of place (Restaurant, Shisha, Ice cream). Run after 0004_meals.sql.
-- Safe to run again. Use plain Run in the SQL editor. (Places' categories column has no fixed
-- list, so this only updates the Google-type → category map that mirrors api/_lib/categories.js.)
alter table public.place_type_categories drop constraint if exists place_type_categories_category_check;
alter table public.place_type_categories add constraint place_type_categories_category_check
  check (category in ('restaurant','shisha','icecream','coffee','matcha','dessert','burger','fastfood','cafeteria','karak','pizza','acai','froyo'));
insert into public.place_type_categories (google_type, category) values
  ('ice_cream_shop','icecream'),('gelato_shop','icecream'),('hookah_bar','shisha'),
  ('middle_eastern_restaurant','restaurant'),('lebanese_restaurant','restaurant'),('indian_restaurant','restaurant'),
  ('pakistani_restaurant','restaurant'),('turkish_restaurant','restaurant'),('afghani_restaurant','restaurant'),
  ('persian_restaurant','restaurant'),('restaurant','restaurant')
on conflict (google_type) do update set category = excluded.category;
