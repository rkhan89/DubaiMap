// node --test tests/
// Scrapbook pages: which book a visit is a page in, the old per-day settings, "on this day",
// and crew challenges. (The server rules are checked in tests/e2e/sqltest.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { belongs, bookPages, legacyPageRows, onThisDay, withText, crewChallenges, recapData, pageId } from '../pages.js';

const ME='me', KABIR='kabir', MAYA='maya', OMAR='omar';
const crewA = { id:'A', memberIds:[ME, KABIR, MAYA] }, crewB = { id:'B', memberIds:[ME, OMAR] };
const venues = { v1:{ id:'v1', zone:'satwa', categories:['karak'] }, v2:{ id:'v2', zone:'deira', categories:['dessert'] }, v3:{ id:'v3', zone:'jbr', categories:['cafeteria'] } };
const V = (id, o) => ({ id, kind:'visit', venueId:'v1', userId:ME, rating:4, date:'2026-10-01', createdAt:1, private:false, crewIds:[], taggedIds:[], ...o });
const world = (entries, extra) => ({ meId:ME, entries, photos:[], pages:{}, crews:{ A:crewA, B:crewB }, venue:id=>venues[id], ...extra });
const personal = { id:'pb', kind:'personal', ownerId:ME }, tagged = { id:'tb', kind:'tagged', ownerId:ME };
const bookA = { id:'cbA', kind:'crew', crewId:'A' }, bookB = { id:'cbB', kind:'crew', crewId:'B' };

test('a Just me visit is only a page in your personal book', ()=>{
  const e = V('e1', { private:true }), w = world([e]);
  assert.equal(belongs(personal, e, w), true);
  assert.equal(belongs(bookA, e, w), false);
  assert.equal(belongs(bookB, e, w), false);
});
test('a visit shared with crew A is in crew A’s book and yours, never crew B’s', ()=>{
  const e = V('e1', { crewIds:['A'] }), w = world([e]);
  assert.deepEqual([personal, bookA, bookB].map(b=>belongs(b, e, w)), [true, true, false]);
});
test('shared with two crews: a page in both crew books', ()=>{
  const e = V('e1', { crewIds:['A','B'] }), w = world([e]);
  assert.equal(belongs(bookA, e, w) && belongs(bookB, e, w), true);
});
test('a crewmate’s visit that tagged you: in the crew book and your Tagged book, not your personal one', ()=>{
  const e = V('e1', { userId:KABIR, crewIds:['A'], taggedIds:[ME] }), w = world([e]);
  assert.deepEqual([personal, tagged, bookA, bookB].map(b=>belongs(b, e, w)), [false, true, true, false]);
});
test('after someone leaves a crew, their visits leave its book', ()=>{
  const e = V('e1', { userId:MAYA, crewIds:['A'] });
  const left = { ...crewA, memberIds:[ME, KABIR] };
  assert.equal(belongs(bookA, e, world([e])), true);
  assert.equal(belongs(bookA, e, world([e], { crews:{ A:left } })), false);
});
test('a "want to try" save is never a page', ()=>{
  const e = V('e1', { kind:'want', crewIds:['A'] }), w = world([e]);
  assert.equal([personal, bookA].some(b=>belongs(b, e, w)), false);
});
test('every visit is a page, photos or not, newest first, one per visit', ()=>{
  const es = [V('e1', { date:'2026-09-01' }), V('e2', { date:'2026-10-02' }), V('e3', { date:'2026-10-02', createdAt:5 })];
  const w = world(es, { photos:[{ id:'p1', entryId:'e2', userId:ME, createdAt:1 }] });
  const ps = bookPages(personal, w);
  assert.deepEqual(ps.map(p=>p.entry.id), ['e3','e2','e1']);
  assert.equal(new Set(ps.map(p=>p.id)).size, 3);
  assert.equal(ps.find(p=>p.entry.id==='e2').photos.length, 1);
  assert.equal(ps.find(p=>p.entry.id==='e1').photos.length, 0);
  // the same visits give the same pages every time
  assert.deepEqual(bookPages(personal, w).map(p=>p.id), ps.map(p=>p.id));
});
test('a page’s saved photo order is used', ()=>{
  const e = V('e1'), photos = [{ id:'a', entryId:'e1', createdAt:1 }, { id:'b', entryId:'e1', createdAt:2 }];
  const ps = bookPages(personal, world([e], { photos, pages:{ [pageId('pb','e1')]:{ order:['b','a'] } } }));
  assert.deepEqual(ps[0].photos.map(p=>p.id), ['b','a']);
});
test('your old photos without a visit still show, as a page per day', ()=>{
  const w = world([], { photos:[{ id:'x', userId:ME, entryId:null, date:'2026-01-01', venueId:'v1', createdAt:1 }] });
  const ps = bookPages(personal, w);
  assert.equal(ps.length, 1); assert.equal(ps[0].loose, true);
});

test('old per-day settings become the day’s visit page, and only once', ()=>{
  const es = [V('e1', { date:'2026-09-02', createdAt:2 }), V('e2', { date:'2026-09-02', createdAt:1 })];
  const photos = [{ id:'p1', entryId:'e1' }, { id:'p2', entryId:'e2' }];
  const book = { ...personal, pages:{ '2026-09-02':{ layout:'hero', note:'old', order:['p1','p2'], stickers:['first'] }, '2025-01-01':{ layout:'grid' } } };
  const rows = legacyPageRows(book, world(es, { photos }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entryId, 'e1');                // its photo was first on the old page
  assert.deepEqual(rows[0].order, ['p1']);
  assert.equal(rows[0].layout, 'hero');
  const pages = { [rows[0].id]:rows[0] };
  assert.deepEqual(legacyPageRows(book, world(es, { photos, pages })), []);   // again: nothing new
});
test('old settings for a crew book only land on a visit shared with that crew', ()=>{
  const es = [V('e1', { date:'2026-09-02', private:true }), V('e2', { date:'2026-09-02', crewIds:['B'] })];
  assert.deepEqual(legacyPageRows({ ...bookA, pages:{ '2026-09-02':{ layout:'grid' } } }, world(es)), []);
});

test('on this day: a year ago beats a month ago', ()=>{
  const es = [V('a', { date:'2026-09-05', taggedIds:[KABIR] }), V('b', { date:'2025-10-05', taggedIds:[KABIR] })];
  const r = onThisDay('2026-10-05', world(es));
  assert.equal(r.entry.id, 'b'); assert.equal(r.when, 'A year ago today'); assert.deepEqual(r.withIds, [KABIR]);
});
test('on this day: months ago, the longest ago first', ()=>{
  const es = [V('a', { date:'2026-09-05' }), V('b', { date:'2026-07-05' })];
  assert.equal(onThisDay('2026-10-05', world(es)).when, '3 months ago today');
});
test('on this day: only your visits and ones you were tagged on', ()=>{
  const es = [V('a', { date:'2025-10-05', userId:KABIR, crewIds:['A'] })];
  assert.equal(onThisDay('2026-10-05', world(es)), null);
  const t = onThisDay('2026-10-05', world([V('b', { date:'2025-10-05', userId:KABIR, crewIds:['A'], taggedIds:[ME] })]));
  assert.equal(t.entry.id, 'b'); assert.deepEqual(t.withIds, [KABIR]);
});
test('on this day: never today, never a want, nothing once dismissed', ()=>{
  assert.equal(onThisDay('2026-10-05', world([V('a', { date:'2026-10-05' })])), null);
  assert.equal(onThisDay('2026-10-05', world([V('a', { date:'2025-10-05', kind:'want' })])), null);
  assert.equal(onThisDay('2026-10-05', world([V('a', { date:'2025-10-05' })]), '2026-10-05'), null);
  assert.ok(onThisDay('2026-10-05', world([V('a', { date:'2025-10-05' })]), '2026-10-04'));
});
test('on this day: the 31st has no match in a 30-day month', ()=>{
  assert.equal(onThisDay('2026-09-30', world([V('a', { date:'2026-08-31' })])), null);
  assert.equal(onThisDay('2026-10-31', world([V('a', { date:'2026-08-31' })])).when, '2 months ago today');
});
test('on this day: ties go to the visit with photos', ()=>{
  const es = [V('a', { date:'2025-10-05', rating:5 }), V('b', { date:'2025-10-05', rating:3 })];
  assert.equal(onThisDay('2026-10-05', world(es, { photos:[{ id:'p', entryId:'b' }] })).entry.id, 'b');
});
test('"with" text', ()=>{
  assert.equal(withText(['Kabir']), 'with Kabir');
  assert.equal(withText(['Kabir','Maya']), 'with Kabir and Maya');
  assert.equal(withText(['Kabir','Maya','Omar','Noor']), 'with Kabir, Maya and 2 more');
});

test('challenges: three, the same for the whole crew, with shared progress', ()=>{
  const es = [V('a', { userId:KABIR, venueId:'v3', crewIds:['A'], date:'2026-10-02' }), V('b', { userId:MAYA, crewIds:['A'], date:'2026-10-03', meals:['breakfast'] })];
  const c1 = crewChallenges(crewA, '2026-10', world(es)), c2 = crewChallenges(crewA, '2026-10', world(es, { meId:KABIR }));
  assert.equal(c1.length, 3);
  assert.deepEqual(c1, c2);
  // done or not done, never a count
  assert.ok(c1.every(c=>typeof c.done==='boolean' && !('have' in c) && !('target' in c) && !('pct' in c)));
  assert.notDeepEqual(crewChallenges(crewA, '2026-11', world(es)).map(c=>c.name), []);
});
test('recap for a crew: its shared visits; for you: yours and tagged', ()=>{
  const es = [V('a', { userId:KABIR, crewIds:['A'], date:'2026-10-02' }), V('b', { date:'2026-10-03', private:true, venueId:'v2' }), V('c', { userId:OMAR, crewIds:['B'], date:'2026-10-03', taggedIds:[ME], venueId:'v3' })];
  const crew = recapData({ crew:crewA }, '2026-10', world(es)), me = recapData({}, '2026-10', world(es));
  assert.equal(crew.visits, 1);
  assert.equal(me.visits, 2); assert.deepEqual(me.people, [OMAR]);
});
