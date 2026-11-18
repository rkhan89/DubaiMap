# Matching a Koko place to a row of the places listing (place_seed). Used by gapfill.py and coverage-step0.py.
#
# Both names are normalised (lower case, bracketed text and filler words like "the", "dubai", "restaurant & bar"
# dropped). A seed row matches when one normalised name contains the other as whole words, and:
#   - the place has a pin: the seed row is within 300 m;
#   - no pin: the seed row is in the same zone, and it's the only such row there (an ambiguous name never matches).
import math, re

FILLER = {'the', 'dubai', 'uae', 'restaurant', 'restaurants', 'cafe', 'café', 'coffee', 'bar', 'lounge', 'grill',
          'kitchen', 'and', 'by', 'llc', 'l', 'c'}


def norm(name):
    s = (name or '').lower()
    s = re.sub(r'\(.*?\)', ' ', s)
    s = s.replace('&', ' and ')
    words = [w for w in re.split(r'[^a-z0-9؀-ۿ]+', s) if w and w not in FILLER]
    return words


def contains(a, b):
    """True when the word list a appears, in order and whole, inside b (or b inside a)."""
    if not a or not b:
        return False
    def inside(x, y):
        n = len(x)
        return any(y[i:i + n] == x for i in range(len(y) - n + 1))
    return inside(a, b) or inside(b, a)


def km(lat1, lng1, lat2, lng2):
    return math.hypot((lat1 - lat2) * 110.57, (lng1 - lng2) * 100.75)


# candidates: rows of (id, name, lat, lng, zone, ...) from place_seed whose names look alike (trigram); this picks one
def best(place, candidates):
    """place: dict(name, lat, lng, zone). Returns the matching candidate row or None."""
    pn = norm(place['name'])
    named = [c for c in candidates if contains(pn, norm(c[1]))]
    if place.get('lat') is not None and place.get('lng') is not None:
        near = [(km(place['lat'], place['lng'], c[2], c[3]), c) for c in named]
        near = [x for x in near if x[0] <= 0.3]
        return min(near, key=lambda x: x[0])[1] if near else None
    same = [c for c in named if c[4] == place.get('zone')]
    return same[0] if len(same) == 1 else None


CANDIDATES_SQL = """
  select id, name, lat, lng, zone, address, phone, website, instagram, licenses, confidence
    from public.place_seed
   where name ilike '%' || :w || '%' or :q <% name
   limit 200"""


def longest_word(name):
    ws = norm(name)
    return max(ws, key=len) if ws else (name or '').lower()
