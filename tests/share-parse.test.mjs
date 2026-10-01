// node --test tests/share-parse.test.mjs
// Google Maps link parsing, short-link expansion and the resolver's decisions, with fixtures
// (no network: fetch, DNS and Places are faked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMapsUrl, firstUrl, sourceOf, mayFetch, cacheKey, unwrapContinue } from '../api/_lib/maps.js';
import { expandMaps, resolveShare, safeGet, shortName } from '../api/_lib/resolve.js';
import { categoryFor } from '../api/_lib/categories.js';

const F = {
  fullPlace: 'https://www.google.com/maps/place/Ravi+Restaurant/@25.2329,55.2745,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f42d0b2b5b5b5:0x8f1f7b1e2c3d4e5f!8m2!3d25.2331!4d55.2759!16s%2Fg%2F1tfz9w0x?entry=ttu&g_ep=abc',
  centreOnly: 'https://www.google.com/maps/place/Trio+Cafe/@25.1972,55.2793,17z',
  q: 'https://maps.google.com/?q=Arabian+Tea+House+Dubai',
  qCoords: 'https://maps.google.com/?q=25.2635,55.2972',
  cid: 'https://maps.google.com/?cid=1234567890123456789',
  search: 'https://www.google.com/maps/search/karak+near+Satwa/@25.23,55.27,15z',
  apiQuery: 'https://www.google.com/maps/search/?api=1&query=Knot+Bakehouse&query_place_id=ChIJabc123',
  directions: 'https://www.google.com/maps/dir/Dubai+Mall/Trio+Cafe/@25.19,55.27,14z',
  list: 'https://www.google.com/maps/placelists/list/abcdEFGHijkl?g_ep=x',
  arabic: 'https://www.google.com/maps/place/%D9%85%D8%B7%D8%B9%D9%85+%D8%B1%D8%A7%D9%81%D9%8A/@25.23,55.27,17z/data=!4m6!3m5!8m2!3d25.2331!4d55.2759',
};

test('full place URL: name, the place\'s own coordinates (not the map centre) and CID', ()=>{
  const p = parseMapsUrl(F.fullPlace);
  assert.equal(p.kind, 'place'); assert.equal(p.name, 'Ravi Restaurant');
  assert.deepEqual(p.place, { lat:25.2331, lng:55.2759 });
  assert.deepEqual(p.centre, { lat:25.2329, lng:55.2745 });
  assert.equal(p.cid, BigInt('0x8f1f7b1e2c3d4e5f').toString());
});
test('place URL with only the @ centre: name, no place coordinates', ()=>{
  const p = parseMapsUrl(F.centreOnly);
  assert.equal(p.kind, 'place'); assert.equal(p.name, 'Trio Cafe'); assert.equal(p.place, null); assert.deepEqual(p.centre, { lat:25.1972, lng:55.2793 });
});
test('?q= with a name, and ?q= with coordinates', ()=>{
  assert.deepEqual([parseMapsUrl(F.q).kind, parseMapsUrl(F.q).query], ['query', 'Arabian Tea House Dubai']);
  const c = parseMapsUrl(F.qCoords); assert.equal(c.kind, 'coords'); assert.deepEqual(c.place, { lat:25.2635, lng:55.2972 });
});
test('?cid= URL', ()=>{ const p = parseMapsUrl(F.cid); assert.equal(p.kind, 'cid'); assert.equal(p.cid, '1234567890123456789'); });
test('search URL and api=1 query URL (with a place id)', ()=>{
  const s = parseMapsUrl(F.search); assert.equal(s.kind, 'search'); assert.equal(s.query, 'karak near Satwa');
  const a = parseMapsUrl(F.apiQuery); assert.equal(a.placeId, 'ChIJabc123'); assert.equal(a.query, 'Knot Bakehouse');
});
test('directions and lists are recognised', ()=>{
  assert.equal(parseMapsUrl(F.directions).kind, 'directions');
  assert.equal(parseMapsUrl(F.list).kind, 'list');
});
test('Arabic place names decode', ()=>{ assert.equal(parseMapsUrl(F.arabic).name, 'مطعم رافي'); });
test('the link inside shared text, and which service it is', ()=>{
  assert.equal(firstUrl('', 'Check this out! https://maps.app.goo.gl/AbC123 via Google Maps'), 'https://maps.app.goo.gl/AbC123');
  assert.equal(firstUrl('', 'no link here'), null);
  assert.equal(sourceOf('https://maps.app.goo.gl/x'), 'google_maps');
  assert.equal(sourceOf('https://goo.gl/maps/x'), 'google_maps');
  assert.equal(sourceOf('https://www.google.com/maps/place/x'), 'google_maps');
  assert.equal(sourceOf('https://www.google.com/search?q=x'), 'other');
  assert.equal(sourceOf('https://vm.tiktok.com/ZS123/'), 'tiktok');
  assert.equal(sourceOf('https://www.instagram.com/reel/abc/'), 'instagram');
});
test('only Google Maps and TikTok hosts may ever be fetched', ()=>{
  assert.equal(mayFetch('https://maps.app.goo.gl/x'), true);
  assert.equal(mayFetch('https://evil.example.com/x'), false);
  assert.equal(mayFetch('https://maps.app.goo.gl.evil.com/x'), false);
  assert.equal(mayFetch('file:///etc/passwd'), false);
});
test('cache key drops tracking parameters', ()=>{ assert.equal(cacheKey(F.list), 'https://www.google.com/maps/placelists/list/abcdEFGHijkl'); });
test('consent interstitials carry the real address', ()=>{ assert.equal(unwrapContinue('https://consent.google.com/m?continue=https://www.google.com/maps/place/X'), 'https://www.google.com/maps/place/X'); });
test('category from Places types', ()=>{ assert.equal(categoryFor(['coffee_shop','cafe','food']), 'coffee'); assert.equal(categoryFor(['tourist_attraction']), null); });

/* ---------- network behaviour with fakes ---------- */
const publicDns = async ()=>[{ address:'142.250.0.1', family:4 }];
const redirects = map => async (url)=>{ const to = map[url]; return to ? new Response(null, { status:302, headers:{ location:to } }) : new Response('<html>js</html>', { status:200 }); };
const deps = (map, extra)=>({ lookup:publicDns, fetch:redirects(map), placesKey:'', ...extra });

for (const [name, target] of Object.entries({ fullPlace:F.fullPlace, centreOnly:F.centreOnly, q:F.q, cid:F.cid, search:F.search, directions:F.directions, list:F.list })){
  test(`short link expands to: ${name}`, async ()=>{
    const short = 'https://maps.app.goo.gl/'+name;
    assert.equal(await expandMaps(short, deps({ [short]:target })), target);
  });
}
test('short link via a consent page', async ()=>{
  const short = 'https://maps.app.goo.gl/consent';
  assert.equal(await expandMaps(short, deps({ [short]:'https://consent.google.com/m?continue='+encodeURIComponent(F.fullPlace) })), F.fullPlace);
});
test('a redirect to another host is never followed', async ()=>{
  const short = 'https://maps.app.goo.gl/bad';
  await assert.rejects(expandMaps(short, deps({ [short]:'https://evil.example.com/' })), /another host/);
});
test('redirect chains stop after 3 hops', async ()=>{
  const m = {}; for (let i=0;i<6;i++) m['https://maps.app.goo.gl/h'+i] = 'https://maps.app.goo.gl/h'+(i+1);
  await assert.rejects(expandMaps('https://maps.app.goo.gl/h0', deps(m)), /too many/);
});
test('private addresses are refused', async ()=>{
  await assert.rejects(safeGet('https://maps.app.goo.gl/x', { lookup: async ()=>[{ address:'10.0.0.5', family:4 }], fetch:()=>{ throw new Error('should not fetch'); } }), /private/);
});
test('a short link that answers with a page (no redirect) → needs_place, not a failure', async ()=>{
  const r = await resolveShare({ url:'https://maps.app.goo.gl/js' }, deps({}));
  assert.equal(r.state, 'needs_place'); assert.equal(r.sourceType, 'google_maps');
});

/* ---------- decisions ---------- */
test('directions and lists → unsupported with a message', async ()=>{
  for (const u of [F.directions, F.list]){ const r = await resolveShare({ url:u }, deps({})); assert.equal(r.state, 'unsupported'); assert.ok(r.message); }
});
test('no Places key: a full place link still matches from the link itself', async ()=>{
  const r = await resolveShare({ text:'look '+F.fullPlace }, deps({}));
  assert.equal(r.state, 'match'); assert.equal(r.place.name, 'Ravi Restaurant'); assert.equal(r.place.lat, 25.2331); assert.equal(r.place.placeId, null);
});
const fakePlaces = places => async (url, opts)=>{
  if (String(url).includes('places:searchText')) return new Response(JSON.stringify({ places }), { status:200 });
  if (String(url).includes('/v1/places/')) return new Response(JSON.stringify(places[0]), { status:200 });
  return redirects({})(url);
};
const P = (id, name, lat, lng, types) => ({ id, displayName:{ text:name }, location:{ latitude:lat, longitude:lng }, formattedAddress:'Dubai', types:types||['restaurant'] });
test('with Places: the result at the link\'s pin wins', async ()=>{
  const r = await resolveShare({ url:F.fullPlace }, { lookup:publicDns, placesKey:'k', fetch:fakePlaces([P('far','Ravi Restaurant',25.30,55.40), P('ravi','Ravi Restaurant',25.2332,55.2758,['indian_restaurant'])]) });
  assert.equal(r.state, 'match'); assert.equal(r.place.placeId, 'ravi'); assert.equal(r.place.category, 'cafeteria');
});
test('with Places: several plausible results → candidates (up to 3)', async ()=>{
  const r = await resolveShare({ url:F.search }, { lookup:publicDns, placesKey:'k', fetch:fakePlaces([P('a','Karak House',25.23,55.27), P('b','Karak Spot',25.231,55.271), P('c','Chai Karak',25.232,55.272), P('d','Karak 4',25.233,55.273)]) });
  assert.equal(r.state, 'candidates'); assert.equal(r.candidates.length, 3);
});
test('api=1 link with a place id → details lookup', async ()=>{
  const r = await resolveShare({ url:F.apiQuery }, { lookup:publicDns, placesKey:'k', fetch:fakePlaces([P('ChIJabc123','Knot Bakehouse',25.2,55.25,['bakery'])]) });
  assert.equal(r.state, 'match'); assert.equal(r.place.placeId, 'ChIJabc123'); assert.equal(r.place.category, 'dessert');
});
test('Instagram is never fetched → unsupported, link kept', async ()=>{
  const r = await resolveShare({ url:'https://www.instagram.com/reel/abc/' }, { lookup:publicDns, fetch:()=>{ throw new Error('must not fetch'); } });
  assert.equal(r.state, 'unsupported'); assert.equal(r.sourceUrl, 'https://www.instagram.com/reel/abc/');
});
test('a plain place name with no Places key → needs_place with the name as the query', async ()=>{
  const r = await resolveShare({ text:'Ravi Restaurant' }, deps({}));
  assert.equal(r.state, 'needs_place'); assert.equal(r.query, 'Ravi Restaurant');
});

test('a ?q= link with name and address pre-fills just the name', ()=>{
  assert.equal(shortName('JGROUP, GBS Building - 2nd floor - Al Sufouh - Dubai Media City - Dubai'), 'JGROUP');
  assert.equal(shortName('Dubai Multi Commodities Centre - 1st Floor, Almas Tower'), 'Dubai Multi Commodities Centre');
});
test('with Places: a city is not a place to save', async ()=>{
  const r = await resolveShare({ url:'https://www.google.com/maps/place/Dubai/@25.2,55.27,10z/data=!3d25.2048!4d55.2708' }, { lookup:async()=>[{address:'1.1.1.1'}], placesKey:'k', fetch: async ()=>new Response(JSON.stringify({ places:[{ id:'dxb', displayName:{text:'Dubai'}, location:{latitude:25.2048,longitude:55.2708}, types:['locality','political'] }] }), { status:200 }) });
  assert.equal(r.state, 'needs_place');
});
