# Loads place_seed from the rows tools/overture-prep.mjs made, in ONE transaction over a direct Postgres
# connection (not the pooler), with COPY. Also runs the places-record migration first if asked, and prints the
# legacy_google count. The connection string comes from DATABASE_URL in .env.local (gitignored) and is never
# printed.
#
#   python -m pip install pg8000
#   python -I tools/overture-import.py <seed.ndjson> <release> [--migrate] [--dry-run]
#
#   --migrate   run supabase/migrations/0020_places_record.sql before loading (it is safe to run again)
#   --dry-run   do everything, report, then roll back
#
# Pinning: rows from other releases are removed, except ones a Koko place still links to (seed_id), so a place
# never loses its link. The release goes in place_seed_releases with the attribution the app shows.
import sys, io, json, pathlib, importlib.util

ROOT = pathlib.Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = {a for a in sys.argv[1:] if a.startswith('--')}
if len(args) < 2:
    sys.exit('usage: python -I tools/overture-import.py <seed.ndjson> <release> [--migrate] [--dry-run]')
seed_file, release = args[0], args[1]


spec = importlib.util.spec_from_file_location('pgconnect', ROOT / 'tools' / 'pgconnect.py')
pg = importlib.util.module_from_spec(spec); spec.loader.exec_module(pg)


def main():
    con = pg.connect()
    con.run('begin')
    try:
        if '--migrate' in flags:
            con.run((ROOT / 'supabase/migrations/0020_places_record.sql').read_text(encoding='utf-8'))
            print('migration 0020 applied')
        if not con.run("select to_regclass('public.place_seed') is not null")[0][0]:
            raise SystemExit('place_seed does not exist: run with --migrate (or run 0020 first)')
        con.run('create temp table seed_in (raw jsonb) on commit drop')
        buf = io.StringIO()
        n = 0
        with open(seed_file, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if r.get('release') != release:
                    raise SystemExit('row from release %s in a %s load' % (r.get('release'), release))
                # CSV with a quote character that never appears in the data, so the JSON goes in untouched
                buf.write(line.replace('\x01', '') + '\n')
                n += 1
        buf.seek(0)
        con.run("copy seed_in (raw) from stdin with (format csv, quote e'\\x01', delimiter e'\\x02')", stream=buf)
        print(n, 'rows copied')
        con.run("""
          insert into public.place_seed (id, source, source_id, release, name, address, lat, lng, zone, phone, website,
                 instagram, socials, basic_category, taxonomy_primary, taxonomy_hierarchy, confidence, brand, licenses, sources)
          select raw->>'id', 'overture', raw->>'source_id', raw->>'release', raw->>'name', raw->>'address',
                 (raw->>'lat')::float8, (raw->>'lng')::float8, raw->>'zone', raw->>'phone', raw->>'website',
                 raw->>'instagram', coalesce(raw->'socials', '[]'), raw->>'basic_category', raw->>'taxonomy_primary',
                 coalesce(raw->'taxonomy_hierarchy', '[]'), (raw->>'confidence')::real, raw->>'brand',
                 coalesce(raw->'licenses', '[]'), coalesce(raw->'sources', '[]')
            from seed_in
          on conflict (id) do update set release = excluded.release, name = excluded.name, address = excluded.address,
                 lat = excluded.lat, lng = excluded.lng, zone = excluded.zone, phone = excluded.phone,
                 website = excluded.website, instagram = excluded.instagram, socials = excluded.socials,
                 basic_category = excluded.basic_category, taxonomy_primary = excluded.taxonomy_primary,
                 taxonomy_hierarchy = excluded.taxonomy_hierarchy, confidence = excluded.confidence,
                 brand = excluded.brand, licenses = excluded.licenses, sources = excluded.sources""")
        removed = con.run("""
          with gone as (delete from public.place_seed s where s.release <> :r
                          and not exists (select 1 from public.venues v where v.seed_id = s.id) returning 1)
          select count(*) from gone""", r=release)[0][0]
        kept_old = con.run('select count(*) from public.place_seed where release <> :r', r=release)[0][0]
        con.run("""insert into public.place_seed_releases (release, row_count, bbox) values (:r, :n, :b)
                   on conflict (release) do update set row_count = excluded.row_count, loaded_at = now(), bbox = excluded.bbox""",
                r=release, n=n, b=json.dumps({'xmin': 54.8, 'xmax': 55.7, 'ymin': 24.7, 'ymax': 25.5, 'clip': 'Koko map extent'}))
        total = con.run('select count(*) from public.place_seed')[0][0]
        legacy = con.run("select count(*) from public.venues where field_sources::text like '%legacy_google%'")[0][0]
        con.run('analyze public.place_seed')
        print(json.dumps({'release': release, 'loaded': n, 'in_table': total, 'old_release_rows_removed': removed,
                          'old_release_rows_kept_for_links': kept_old, 'legacy_google_places': legacy}, indent=1))
        if '--dry-run' in flags:
            con.run('rollback')
            print('dry run: rolled back')
        else:
            con.run('commit')
            print('committed')
    except BaseException:
        con.run('rollback')
        raise
    finally:
        con.close()


main()
