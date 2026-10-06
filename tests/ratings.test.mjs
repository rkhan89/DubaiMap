// node --test tests/
// The one place-rating calculation: per person, overall, counts and wording, and which ratings
// count in which view. (Who may see a rating at all is checked on the server: tests/e2e/sqltest.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeRating, ratingText, visitPeople, visitRatings, inCrew } from '../ratings.js';

const ME='me', RABIA='rabia', OMAR='omar', NOOR='noor';
const crewA = { id:'A', memberIds:[ME, RABIA, OMAR] }, crewB = { id:'B', memberIds:[ME, NOOR] };
const V = (id, o) => ({ id, kind:'visit', venueId:'v1', userId:ME, rating:0, private:false, crewIds:['A'], taggedIds:[], ...o });
const world = (extra, meId) => ({ meId:meId||ME, ratingsOf:id=>(extra||[]).filter(r=>r.entryId===id) });
const T = (entryId, userId, rating, note) => ({ entryId, userId, rating, note:note||'' });
const crew = c => ({ kind:'crew', crew:c }), friends = { kind:'friends' }, me = { kind:'me' };

test('per person = their average; overall = the average of people, not of visits', ()=>{
  const es = [V('a', { rating:5 }), V('b', { rating:4 }), V('c', { rating:3 }), V('d', { userId:RABIA, rating:2 })];
  const r = placeRating(es, crew(crewA), world());
  assert.deepEqual(r.people.map(p=>[p.userId, p.rating, p.n]), [[ME, 4, 3], [RABIA, 2, 1]]);
  assert.equal(r.rating, 3);          // (4 + 2) / 2, not (5+4+3+2)/4 = 3.5
  assert.equal(r.raters, 2);
});
test('half stars and rounding to one decimal', ()=>{
  const es = [V('a', { rating:4.5 }), V('b', { rating:4 }), V('c', { userId:RABIA, rating:3.5 }), V('d', { userId:OMAR, rating:5 })];
  const r = placeRating(es, crew(crewA), world());
  assert.equal(r.people.find(p=>p.userId===ME).rating, 4.3);   // 4.25 → 4.3
  assert.equal(r.rating, 4.3);                                   // (4.25 + 3.5 + 5) / 3 = 4.25 → 4.3
});
test('a tagged friend’s own rating counts for them; unrated people count for nothing', ()=>{
  const e = V('a', { rating:4, taggedIds:[RABIA, OMAR] });
  const r = placeRating([e], crew(crewA), world([T('a', RABIA, 3)]));
  assert.equal(r.raters, 2); assert.equal(r.rating, 3.5);
  assert.deepEqual(visitPeople(e, crew(crewA), world([T('a', RABIA, 3, 'Good chai')])).map(p=>[p.userId, p.rating, p.note]),
    [[ME, 4, ''], [RABIA, 3, 'Good chai'], [OMAR, null, '']]);
});
test('a rating from someone no longer tagged never counts', ()=>{
  const e = V('a', { rating:4, taggedIds:[] });
  assert.equal(placeRating([e], crew(crewA), world([T('a', RABIA, 1)])).raters, 1);
});
test('wording: nothing / 1 rating / Crew avg … n ratings', ()=>{
  assert.equal(ratingText({ raters:0, rating:0 }), '');
  assert.equal(ratingText({ raters:1, rating:4.5 }, 'Crew'), '★ 4.5 · 1 rating');
  assert.equal(ratingText({ raters:3, rating:4.3 }, 'Crew'), 'Crew avg ★ 4.3 · 3 ratings');
  assert.equal(ratingText({ raters:2, rating:4 }, 'Friends'), 'Friends avg ★ 4 · 2 ratings');
});
test('crew A’s view: only visits shared with A, only ratings from people in A', ()=>{
  const es = [
    V('a', { rating:5, crewIds:['A'] }),
    V('b', { userId:NOOR, rating:1, crewIds:['B'] }),                 // shared with B only
    V('c', { rating:1, private:true, crewIds:[] }),                   // Just me
    V('d', { rating:4, crewIds:['A','B'], taggedIds:[NOOR] }),        // Noor isn't in A
  ];
  const w = world([T('d', NOOR, 1)]);
  const a = placeRating(es, crew(crewA), w);
  assert.deepEqual(a.people.map(p=>[p.userId, p.rating]), [[ME, 4.5]]);
  assert.equal(a.raters, 1);
  // crew B sees Noor’s ratings, not the Just me one
  const b = placeRating(es, crew(crewB), w);
  assert.deepEqual(b.people.map(p=>p.userId).sort(), [ME, NOOR]);
  assert.ok(!visitRatings(es[2], crew(crewB), w).length);
});
test('someone who left the crew: their visits and ratings drop out of its view', ()=>{
  const left = { ...crewA, memberIds:[ME, OMAR] };
  const es = [V('a', { userId:RABIA, rating:2 }), V('b', { rating:4, taggedIds:[RABIA] })];
  const w = world([T('b', RABIA, 1)]);
  assert.equal(placeRating(es, crew(crewA), w).raters, 2);
  const r = placeRating(es, crew(left), w);
  assert.deepEqual(r.people.map(p=>p.userId), [ME]); assert.equal(r.rating, 4);
  assert.equal(inCrew(es[0], left), false);
});
test('friends view (your own books): everything you can see; me view: only yours', ()=>{
  const es = [V('a', { rating:5, private:true, crewIds:[] }), V('b', { userId:NOOR, rating:3, crewIds:['B'] }), V('c', { userId:RABIA, rating:4, taggedIds:[ME] })];
  const w = world([T('c', ME, 2)]);
  assert.equal(placeRating(es, friends, w).raters, 3);
  const mine = placeRating(es, me, w);
  assert.deepEqual(mine.people.map(p=>[p.userId, p.rating]), [[ME, 3.5]]);   // 5 (own) and 2 (on Rabia’s visit)
});
test('wants and unrated visits are not ratings', ()=>{
  const r = placeRating([V('a', { kind:'want', rating:5 }), V('b', { rating:0 })], crew(crewA), world());
  assert.equal(r.raters, 0); assert.equal(r.rating, 0);
});
