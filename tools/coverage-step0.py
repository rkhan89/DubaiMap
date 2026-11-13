# Step 0: how well the loaded seed covers places the crew has actually logged. Runs as the database role (it reads
# past row level security), but only ever looks at CREW-SHARED visits: Just me visits are left out entirely, so the
# test follows the same privacy rules as the app. Prints aggregate counts and place names only: no photos, notes or
# anything about who logged what.
#
#   python -I tools/coverage-step0.py [how-many=30]
#
# A place matches a seed row when the names are close (trigram similarity, or one name contains the other) and the
# seed row is within 300 m of the place's pin; a place with no pin matches only on a near-identical name in the same
# area. The same rule is what the phase 3 backfill uses (tools/places-backfill.py).
import sys, json, importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('imp', ROOT / 'tools' / 'pgconnect.py')
pg = importlib.util.module_from_spec(spec); spec.loader.exec_module(pg)
N = int(sys.argv[1]) if len(sys.argv) > 1 else 30

MATCH = """
with shared as (           -- places with at least one crew-shared visit (never a Just me one)
  select v.id, v.name, v.lat, v.lng, v.zone, count(e.id) as visits
    from public.venues v join public.entries e on e.venue_id = v.id
   where e.kind = 'visit' and not e.private
   group by v.id order by count(e.id) desc, max(e.created_at) desc limit :n),
best as (
  select sh.id, sh.name, s.id as seed_id, s.name as seed_name, s.address, s.phone, s.website, s.instagram, s.socials,
         row_number() over (partition by sh.id order by similarity(lower(sh.name), lower(s.name)) desc,
           coalesce(sqrt(((s.lat - sh.lat) * 110570)^2 + ((s.lng - sh.lng) * 100750)^2), 0)) as k
    from shared sh join public.place_seed s
      on (similarity(lower(sh.name), lower(s.name)) >= 0.45 or lower(s.name) like '%' || lower(sh.name) || '%'
          or lower(sh.name) like '%' || lower(s.name) || '%')
     and ((sh.lat is not null and sqrt(((s.lat - sh.lat) * 110570)^2 + ((s.lng - sh.lng) * 100750)^2) <= 300)
       or (sh.lat is null and s.zone = sh.zone and similarity(lower(sh.name), lower(s.name)) >= 0.7)))
select sh.name, b.seed_name, b.address, b.phone, b.website, b.instagram, b.socials
  from shared sh left join best b on b.id = sh.id and b.k = 1 order by sh.name
"""


def main():
    con = pg.connect()
    try:
        con.run('set pg_trgm.similarity_threshold = 0.3')
        rows = con.run(MATCH, n=N)
        sampled = len(rows)
        matched = [r for r in rows if r[1]]
        has = lambda i: sum(1 for r in matched if r[i])
        social = sum(1 for r in matched if r[5] or (r[6] and len(r[6]) > 0))
        name_addr = sum(1 for r in matched if r[2])
        legacy = con.run("select count(*) from public.venues where field_sources::text like '%legacy_google%'")[0][0]
        report = {
            'sampled_places': sampled, 'matched': len(matched),
            'matched_pct': round(100 * len(matched) / sampled, 1) if sampled else 0,
            'matched_with_name_and_address_pct': round(100 * name_addr / sampled, 1) if sampled else 0,
            'of_matched': {'address': has(2), 'phone': has(3), 'website': has(4), 'instagram': has(5), 'any_social': social},
            'legacy_google_places': legacy,
            'matched_places': sorted(r[0] for r in matched),
            'unmatched_places': sorted(r[0] for r in rows if not r[1]),
        }
        print(json.dumps(report, indent=1, ensure_ascii=False))
        if sampled and name_addr / sampled < 0.7:
            print('\nBelow ~70% matched with name and address: layer 2 (AI gap fill) will carry more weight.')
    finally:
        con.close()


main()
