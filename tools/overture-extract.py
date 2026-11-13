# Extracts the Dubai area from one pinned Overture Maps release (places theme) into a local file that
# tools/overture-import.mjs loads into the read-only place_seed table. Run it once per release you want; the app
# never talks to Overture at runtime (releases are removed after about 60 days).
#
#   python -m pip install duckdb
#   python -I tools/overture-extract.py [release] [out.ndjson]
#
# Data from Overture Maps Foundation, Places theme (https://overturemaps.org/attribution), CDLA-Permissive-2.0
# with Apache-2.0 / CC0 for some source datasets: each row keeps its sources and licences.
# Schema note: `categories` was removed in the September 2026 release; this reads basic_category and taxonomy.
import sys, json, duckdb

RELEASE = sys.argv[1] if len(sys.argv) > 1 else '2026-10-21.0'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'overture-dubai-' + RELEASE + '.ndjson'
# a generous box around the emirate (tools/overture-import.mjs then keeps only what falls on Koko's map)
BOX = dict(xmin=54.8, xmax=55.7, ymin=24.7, ymax=25.5)

c = duckdb.connect()
c.sql("install httpfs; load httpfs; install spatial; load spatial; set s3_region='us-west-2';")
q = f"""
  select id, names.primary as name, st_x(geometry) as lng, st_y(geometry) as lat,
         confidence, websites, socials, phones, emails, addresses, basic_category,
         taxonomy.primary as taxonomy_primary, taxonomy.hierarchy as taxonomy_hierarchy,
         operating_status, brand.names.primary as brand,
         [{{'dataset': s.dataset, 'license': s.license, 'record_id': s.record_id, 'property': s.property}} for s in sources] as sources
  from read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*', hive_partitioning=1)
  where bbox.xmin between {BOX['xmin']} and {BOX['xmax']} and bbox.ymin between {BOX['ymin']} and {BOX['ymax']}
    and names.primary is not null
"""
# newline-delimited JSON, one place a line
c.sql(f"copy ({q}) to '{OUT}' (format json)")
n = c.execute(f"select count(*) from read_json('{OUT}')").fetchone()[0]
print(n, 'places from', RELEASE, '->', OUT)
