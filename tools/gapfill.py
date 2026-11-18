# Gap fill: suggests missing details (address, phone, website, Instagram) for places your crews have shared, from
# sourced facts only, into place_suggestions (0022). Nothing here writes to venues: a person's Confirm in the app does.
#
#   python -I tools/gapfill.py            dry run: prints what it would suggest, writes nothing
#   python -I tools/gapfill.py --apply    writes the suggestions
#   --no-web                              skip fetching the places' own websites
#
# Sources, in order:
#   1. the places listing (Overture, place_seed): the place is matched with tools/placematch.py; a match suggests
#      what the listing has, with its id, licence and confidence.
#   2. the place's own website (from the place, or from its listing match): the home page is fetched (robots.txt is
#      respected) and values are read straight off it: tel: links and phone numbers, Instagram profile links, and a
#      schema.org street address. No AI: each value is the literal text on the page, stored with the text around it,
#      and the database refuses a value that isn't in its evidence.
#
# Only places with at least one crew-shared visit are looked at (Just me places are never sent anywhere), and only
# the place's own site is fetched, with no user data. Google is never a source.
import sys, json, re, html, importlib.util, pathlib, urllib.request, urllib.parse, urllib.robotparser

ROOT = pathlib.Path(__file__).resolve().parent.parent
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / (name + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
pg, pm = load('pgconnect'), load('placematch')
sys.stdout.reconfigure(encoding='utf-8')
APPLY, WEB = '--apply' in sys.argv, '--no-web' not in sys.argv
UA = 'KokoPlaces/1.0 (+https://dubai-bites-pi.vercel.app)'

PHONE_OK = re.compile(r'^\+?[0-9 ()-]{7,20}$')
WEB_OK = re.compile(r'^https?://[^ ]+\.[^ ]+$', re.I)
IG_OK = re.compile(r'^[a-z0-9._]{1,30}$')
IG_NOT = {'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'about', 'developer', 'legal', 'direct'}


def evidence(text, i, j, pad=120):
    """The text around [i, j): at most 500 characters, whitespace squeezed (the value itself stays verbatim)."""
    a, b = max(0, i - pad), min(len(text), j + pad)
    return re.sub(r'\s+', ' ', text[a:b]).strip()[:500]


def fetch(url):
    p = urllib.parse.urlparse(url)
    if p.scheme not in ('http', 'https') or not p.hostname:
        return None, 'not a web address'
    rp = urllib.robotparser.RobotFileParser()
    try:
        req = urllib.request.Request(f'{p.scheme}://{p.netloc}/robots.txt', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=10) as r:
            rp.parse(r.read(200_000).decode('utf-8', 'replace').splitlines())
        if not rp.can_fetch(UA, url):
            return None, 'robots.txt says no'
    except Exception:
        pass                                  # no robots.txt: allowed
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
        with urllib.request.urlopen(req, timeout=15) as r:
            if 'html' not in (r.headers.get('content-type') or ''):
                return None, 'not a web page'
            return r.read(1_500_000).decode(r.headers.get_content_charset() or 'utf-8', 'replace'), None
    except Exception as e:
        return None, type(e).__name__


def from_page(raw, url):
    """Suggestions read off one page: (field, value, evidence, confidence)."""
    out, page = [], html.unescape(raw)
    # phones: tel: links first, then +971 numbers in the text
    for m in re.finditer(r'href=["\']tel:([^"\']{7,30})["\']', page, re.I):
        v = urllib.parse.unquote(m.group(1)).strip()
        if PHONE_OK.match(v) and len(re.sub(r'\D', '', v)) >= 8:
            out.append(('phone', v, evidence(page, m.start(), m.end()), 0.8))
    text = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', page, flags=re.S | re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    for m in re.finditer(r'(?<![\d+])(\+971[\s()-]*\d(?:[\s()-]*\d){6,9}|0[45]\d(?:[\s-]*\d){6,7})(?!\d)', text):
        v = m.group(1).strip()
        if PHONE_OK.match(v):
            out.append(('phone', v, evidence(text, m.start(1), m.end(1)), 0.6))
    # Instagram: profile links on their own site
    for m in re.finditer(r'instagram\.com/([A-Za-z0-9._]{1,30})/?(?=["\'?#\s<])', page):
        h = m.group(1).lower().rstrip('.')
        if IG_OK.match(h) and h not in IG_NOT and not re.search(r'(^\.|\.$|\.\.)', h):
            out.append(('instagram', h, evidence(page.lower(), m.start(), m.end()), 0.8))
    # address: schema.org streetAddress in the page's structured data
    for m in re.finditer(r'"streetAddress"\s*:\s*"([^"]{4,200})"', page):
        v = m.group(1).replace('\\/', '/').strip()
        if v:
            out.append(('address', v, evidence(page, m.start(1), m.end(1)), 0.7))
    # one per phone number (by digits) and per value; the value must sit in its evidence; Dubai numbers only
    seen, keep = set(), []
    for f, v, ev, conf in out:
        key = (f, digits(v) if f == 'phone' else v.lower())
        if key in seen or v.lower() not in ev.lower() or (f == 'phone' and not uae_phone(v)):
            continue
        seen.add(key); keep.append((f, v, ev, conf))
    # addresses: only the fullest one on the page
    addrs = sorted((k for k in keep if k[0] == 'address'), key=lambda k: -len(k[1]))
    return [k for k in keep if k[0] != 'address'] + addrs[:1]


def digits(v):
    d = re.sub(r'\D', '', v or '')
    return '971' + d[1:] if d.startswith('0') and not d.startswith('00') else d.removeprefix('00')


def uae_phone(v):
    """A UAE number: +971 / 00971 / a local 0-number, 9 to 12 digits in all."""
    d = digits(v)
    return d.startswith('971') and 11 <= len(d) <= 12


def main():
    con = pg.connect()
    places = con.run("""
      select v.id, v.name, v.lat, v.lng, v.zone, nullif(v.address, ''), v.phone, v.website, v.instagram, v.seed_id, v.field_sources
        from public.venues v
       where exists (select 1 from public.entries e where e.venue_id = v.id and e.kind = 'visit' and not e.private)
       order by v.name""")
    fields = ('address', 'phone', 'website', 'instagram')
    plan, report = [], []
    for vid, name, lat, lng, zone, address, phone, website, instagram, seed_id, fsrc in places:
        have = dict(zip(fields, (address, phone, website, instagram)))
        missing = [f for f in fields if not have[f]]
        line = {'place': name, 'missing': missing, 'seed': None, 'web': None, 'suggest': []}
        if not missing:
            report.append(line); continue
        # 1. the listing
        row = None
        if seed_id:
            r = con.run(pm.CANDIDATES_SQL.replace("where name ilike '%' || :w || '%' or :q <% name", 'where id = :w')
                        .replace(':q', 'null'), w=seed_id)
            row = r[0] if r else None
        else:
            cands = con.run(pm.CANDIDATES_SQL, w=pm.longest_word(name), q=name.lower())
            row = pm.best({'name': name, 'lat': lat, 'lng': lng, 'zone': zone}, cands)
        site = website
        if row:
            sid, sname, _, _, _, s_addr, s_phone, s_web, s_ig, lic, conf = row
            line['seed'] = sname
            vals = {'address': s_addr, 'phone': s_phone, 'website': s_web, 'instagram': s_ig}
            ok = {'address': lambda x: 1 <= len(x) <= 300, 'phone': PHONE_OK.match, 'website': WEB_OK.match, 'instagram': IG_OK.match}
            for f in missing:
                v = (vals[f] or '').strip()
                if v and ok[f](v) and (f != 'phone' or uae_phone(v)):
                    plan.append(dict(venue_id=vid, field=f, value=v, source='seed', source_ref=sid, source_url=None,
                                     license=','.join(lic or []) or None, method='dataset', evidence=None,
                                     confidence=round(float(conf if conf is not None else 0.5), 3)))
                    line['suggest'].append(f'{f} from the listing: {v}')
            site = site or s_web
        # 2. their own website
        if WEB and site:
            raw, why = fetch(site)
            line['web'] = site if raw else f'{site} ({why})'
            if raw:
                listed = {(p['field'], digits(p['value']) if p['field'] == 'phone' else p['value'].lower())
                          for p in plan if p['venue_id'] == vid}
                for f, v, ev, conf in from_page(raw, site):
                    if f in missing and (f, digits(v) if f == 'phone' else v.lower()) in listed:
                        line['suggest'].append(f'{f} on their website too (same as the listing): {v}')
                        continue
                    if f in missing:
                        plan.append(dict(venue_id=vid, field=f, value=v, source='web', source_ref=None, source_url=site,
                                         license=None, method='extract_verbatim', evidence=ev, confidence=conf))
                        line['suggest'].append(f'{f} from their website: {v}')
        report.append(line)

    print(json.dumps(report, indent=1, ensure_ascii=False))
    places_helped = len({p['venue_id'] for p in plan})
    print(f'\n{len(plan)} suggestions for {places_helped} of {len(places)} crew-shared places'
          f" ({sum(p['source'] == 'seed' for p in plan)} from the listing, {sum(p['source'] == 'web' for p in plan)} from websites)")
    if not APPLY:
        print('dry run: nothing written (add --apply)'); return
    con.run('begin')
    added = 0
    for p in plan:
        r = con.run("""insert into public.place_suggestions (venue_id, field, value, source, source_ref, source_url, license,
                         method, evidence, confidence)
                       values (:venue_id, :field, :value, :source, :source_ref, :source_url, :license, :method, :evidence, :confidence)
                       on conflict (venue_id, field, source, value) do nothing returning id""", **p)
        added += len(r)
    con.run('commit')
    print(f'written: {added} new ({len(plan) - added} were already there or decided)')


if __name__ == '__main__':
    main()
