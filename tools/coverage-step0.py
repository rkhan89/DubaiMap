# Step 0: how well the loaded seed covers places the crew has actually logged. Runs as the database role (it reads
# past row level security), but only ever looks at CREW-SHARED visits: Just me visits are left out entirely, so the
# test follows the same privacy rules as the app. Prints aggregate counts and place names only: no photos, notes or
# anything about who logged what.
#
#   python -I tools/coverage-step0.py [how-many=30]
#
# A place matches a seed row by the same rule the gap fill uses (tools/placematch.py): one normalised name contains
# the other as whole words, and the seed row is within 300 m of the place's pin; a place with no pin matches only
# when it's the one such row in the same zone.
import sys, json, importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / (name + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
pg, pm = load('pgconnect'), load('placematch')
sys.stdout.reconfigure(encoding='utf-8')
N = int(sys.argv[1]) if len(sys.argv) > 1 else 30

SHARED = """
select v.name, v.lat, v.lng, v.zone           -- places with at least one crew-shared visit (never a Just me one)
  from public.venues v join public.entries e on e.venue_id = v.id
 where e.kind = 'visit' and not e.private
 group by v.id order by count(e.id) desc, max(e.created_at) desc limit :n
"""


def main():
    con = pg.connect()
    try:
        con.run('set pg_trgm.similarity_threshold = 0.3')
        rows = []
        for name, lat, lng, zone in con.run(SHARED, n=N):
            cands = con.run(pm.CANDIDATES_SQL, w=pm.longest_word(name), q=name.lower())
            r = pm.best({'name': name, 'lat': lat, 'lng': lng, 'zone': zone}, cands)
            # (place, seed name, address, phone, website, instagram)
            rows.append((name, r[1], r[5], r[6], r[7], r[8]) if r else (name, None, None, None, None, None))
        sampled = len(rows)
        matched = [r for r in rows if r[1]]
        has = lambda i: sum(1 for r in matched if r[i])
        name_addr = sum(1 for r in matched if r[2])
        legacy = con.run("select count(*) from public.venues where field_sources::text like '%legacy_google%'")[0][0]
        report = {
            'sampled_places': sampled, 'matched': len(matched),
            'matched_pct': round(100 * len(matched) / sampled, 1) if sampled else 0,
            'matched_with_name_and_address_pct': round(100 * name_addr / sampled, 1) if sampled else 0,
            'of_matched': {'address': has(2), 'phone': has(3), 'website': has(4), 'instagram': has(5)},
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
