// node --test tests/
// Koko search on a small seeded world: area aliases, dish tags, typos, synonyms, ranking, the "from photo" marker,
// and places outside every area (reported, never dropped).
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { buildIndex, search, venueArea, osa, similarity } = await import('../search.js');
const { AREAS, SYNONYMS } = await import('../search-data.js');

const ME = 'me', CREW = 'u2';
const venues = [
  { id:'v1', name:'Trattoria del Porto', zone:'marina', lat:25.0805, lng:55.1403, categories:['restaurant'] },     // Dubai Marina
  { id:'v2', name:'Pasta Bar', zone:'downtown', lat:25.1950, lng:55.2780, categories:['restaurant'] },             // Downtown
  { id:'v3', name:'Shack 21', zone:'jumeirah', lat:25.2030, lng:55.2500, categories:['cafe'] },                     // Jumeirah: no text about ice cream
  { id:'v4', name:'Desert Camp Grill', zone:'sportscity', lat:24.8000, lng:55.6000, categories:['restaurant'] },    // nowhere
  { id:'v5', name:'Marina Lights Cafe', zone:'marina', lat:25.0812, lng:55.1410, categories:['coffee'] },
];
const entries = [
  { id:'e1', venueId:'v1', userId:ME, kind:'visit', date:'2026-09-01', notes:'', dishTags:['pasta'], taggedIds:[CREW] },
  { id:'e2', venueId:'v2', userId:CREW, kind:'visit', date:'2026-09-20', notes:'great pasta here', dishTags:[] },
  { id:'e3', venueId:'v3', userId:ME, kind:'visit', date:'2026-08-01', notes:'', dishTags:[] },                       // photo only
  { id:'e4', venueId:'v5', userId:ME, kind:'visit', date:'2026-09-25', notes:'flat white was good', dishTags:[] },
];
const photos = [{ id:'p1', entryId:'e3', userId:ME, caption:'', aiTags:['ice cream', 'dessert', 'cone', 'outdoor'] }];
const pages = { 'b|e4':{ entryId:'e4', note:'sunset by the water' } };
const users = { me:{ name:'Rahim', handle:'rahim' }, u2:{ name:'Kabir', handle:'kabir' } };
const index = buildIndex({ me:ME, venues, entries, photos, pages, users, areas:AREAS, synonyms:SYNONYMS, categories:{ restaurant:'Restaurant', cafe:'Cafe', coffee:'Coffee' } });
const ids = r=>r.map(x=>x.kind === 'place' ? x.venue.id : x.entry.id);

test('"pasta marina": the Marina visit with a pasta tag, and its place', ()=>{
  const r = search(index, 'pasta marina');
  assert.deepEqual(ids(r.entries), ['e1']);
  assert.equal(ids(r.places)[0], 'v1');
  assert.ok(!ids(r.places).includes('v2'), 'Downtown pasta is not in the Marina');
});

test('aliases: "dubai marina", "marina walk" and "the walk" resolve to their areas', ()=>{
  assert.ok(ids(search(index, 'dubai marina').places).includes('v1'));
  assert.ok(ids(search(index, 'marina walk').places).includes('v5'));
  assert.equal(index.areas.find(a=>a.id==='jbr').terms.includes('the walk'), true);
});

test('typos still match: "pasat", "pasat marnia", "trattria"', ()=>{
  assert.ok(ids(search(index, 'pasat').entries).includes('e1'));
  assert.deepEqual(ids(search(index, 'pasat marnia').entries), ['e1']);
  assert.ok(ids(search(index, 'trattria').places).includes('v1'));
  assert.ok(osa('pasat', 'pasta', 1) <= 1 && similarity('pasta', 'pasta') === 1);
});

test('synonyms: "latte" finds the flat white; "gelato" finds the ice cream photo', ()=>{
  assert.ok(ids(search(index, 'latte').entries).includes('e4'));
  assert.ok(ids(search(index, 'gelato').entries).includes('e3'));
});

test('"ice cream" finds a photo-only entry and marks it "from photo"', ()=>{
  const r = search(index, 'ice cream');
  const hit = r.entries.find(x=>x.entry.id === 'e3');
  assert.ok(hit && hit.fromPhoto);
  assert.ok(r.places.find(x=>x.venue.id === 'v3').fromPhoto);
  // a match on words isn't marked
  assert.ok(search(index, 'pasta').entries.every(x=>!x.fromPhoto));
});

test('ranking: your own dish tags and notes before the name, the area, then the rest; ties by most recent', ()=>{
  const r = search(index, 'pasta');
  assert.deepEqual(ids(r.entries), ['e1', 'e2']);                 // your tag (class 0) before a crewmate's note (class 3)
  assert.deepEqual(ids(r.places).slice(0, 2), ['v1', 'v2']);      // your tag, then the place named Pasta Bar
});

test('scrapbook text and who was there are searched', ()=>{
  assert.deepEqual(ids(search(index, 'sunset').entries), ['e4']);
  assert.ok(ids(search(index, 'kabir').entries).includes('e1'));
});

test('a place outside every area keeps no area but is still found by name', ()=>{
  assert.equal(venueArea(venues[3], AREAS), null);
  assert.ok(ids(search(index, 'desert camp').places).includes('v4'));
});

test('every word must match: no results for a word that matches nothing', ()=>{
  const r = search(index, 'pasta zzzzqq');
  assert.equal(r.places.length + r.entries.length, 0);
});
