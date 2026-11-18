-- 0021: faster short searches of the places listing (place_seed).
--   3+ characters: trigram match, exactly as 0020.
--   2 characters: the start of the name (or of a word in it), within about 5 km of the point the app sends
--                 (the map centre), nearest first. Without a point, 2 characters return nothing.
-- Measured on the live data: 2-letter searches went from 550-575 ms (4.2 s cold) to 40-137 ms; 3+ unchanged.
-- Safe to run again. Grants carry over (create or replace keeps them); restated below anyway.
create or replace function public.search_place_seed(p_q text, p_lat double precision default null,
       p_lng double precision default null, p_limit integer default 8)
returns table (id text, name text, address text, zone text, lat double precision, lng double precision,
               taxonomy_primary text, kinds text[], score real)
language sql stable set search_path = public as $$
  with q as (
    select lower(trim(coalesce(p_q, ''))) as s,
           replace(replace(replace(lower(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as e
  ),
  -- 3+ characters: trigram, as before
  long as (
    select s.*, (word_similarity(q.s, lower(s.name))
             + case when lower(s.name) like q.e || '%' then 0.4 when s.name ilike '%' || q.e || '%' then 0.2 else 0 end
             + coalesce(s.confidence, 0.5) * 0.1
             - case when p_lat is null or p_lng is null then 0
                    else least(sqrt(((s.lat - p_lat) * 110.57)^2 + ((s.lng - p_lng) * 100.75)^2), 30) / 60 end)::real as sc
      from public.place_seed s, q
     where char_length(q.s) >= 3 and (s.name ilike '%' || q.e || '%' or q.s <% s.name)
  ),
  -- 2 characters: name or word prefix, within about 5 km of the map centre, nearest first
  short as (
    select s.*, (1 - least(sqrt(((s.lat - p_lat) * 110.57)^2 + ((s.lng - p_lng) * 100.75)^2), 5) / 5)::real as sc
      from public.place_seed s, q
     where char_length(q.s) = 2 and p_lat is not null and p_lng is not null
       and s.lat between p_lat - 0.045 and p_lat + 0.045 and s.lng between p_lng - 0.05 and p_lng + 0.05
       and (lower(s.name) like q.e || '%' or lower(s.name) like '% ' || q.e || '%')
  )
  select x.id, x.name, x.address, x.zone, x.lat, x.lng, x.taxonomy_primary, public.seed_kinds(x.taxonomy_hierarchy), x.sc
    from (select * from long union all select * from short) x
   order by x.sc desc, x.name
   limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

revoke all on function public.search_place_seed(text, double precision, double precision, integer) from public, anon;
grant execute on function public.search_place_seed(text, double precision, double precision, integer) to authenticated;
