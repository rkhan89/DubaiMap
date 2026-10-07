// node --test tests/
// Catching critters: distance, the accuracy rule, triggers, once per critter; and the content file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, accuracyNeeded, critterCheck } from '../catch.js';
import { CRITTERS, THEMES } from '../critters.js';

const CFG = { accuracyShare:0.5, accuracyFloorM:50 };
const SPOTS = {
  falcon:     [{ name:'Etihad Museum', lat:25.2390, lng:55.2740, radius:150, trigger:'checkin' }],
  street_cat: [{ name:'Satwa', lat:25.2215, lng:55.2770, radius:600, trigger:'checkin' }, { name:'Karama', lat:25.2440, lng:55.3020, radius:600, trigger:'checkin' }],
  camel:      [{ name:'Al Marmoom', lat:24.8170, lng:55.4300, radius:1500, trigger:'venue' }],
};
const at = (lat, lng, accuracy, venue) => ({ lat, lng, accuracy, venue:!!venue });

test('haversine: about 111 m per 0.001° of latitude', ()=>{
  const d = haversine({ lat:25.2, lng:55.27 }, { lat:25.201, lng:55.27 });
  assert.ok(Math.abs(d - 111.2) < 1, String(d));
});
test('accuracy needed is half the radius, never under the floor', ()=>{
  assert.equal(accuracyNeeded({ radius:150 }, CFG), 75);
  assert.equal(accuracyNeeded({ radius:60 }, CFG), 50);
  assert.equal(accuracyNeeded({ radius:5000 }, CFG), 2500);
});
test('inside the radius with a good fix: caught', ()=>{
  const r = critterCheck(at(25.2391, 55.2741, 20), SPOTS, new Set(), CFG);
  assert.deepEqual(r.caught.map(c=>c.id), ['falcon']);
});
test('just outside the radius: nothing', ()=>{
  assert.equal(critterCheck(at(25.2420, 55.2740, 10), SPOTS, new Set(), CFG).caught.length, 0);   // ~330 m away
});
test('inside, but the fix is too vague: not caught, and says why', ()=>{
  const r = critterCheck(at(25.2391, 55.2741, 120), SPOTS, new Set(), CFG);
  assert.equal(r.caught.length, 0);
  assert.deepEqual(r.tooVague.map(t=>[t.id, t.need]), [['falcon', 75]]);
});
test('either of a critter’s spots works', ()=>{
  assert.deepEqual(critterCheck(at(25.2441, 55.3021, 30), SPOTS, new Set(), CFG).caught.map(c=>[c.id, c.spot.name]), [['street_cat','Karama']]);
});
test('a critter you already have is never caught again', ()=>{
  assert.equal(critterCheck(at(25.2391, 55.2741, 20), SPOTS, new Set(['falcon']), CFG).caught.length, 0);
});
test('a venue-only spot needs a place check-in', ()=>{
  assert.equal(critterCheck(at(24.8171, 55.4301, 40), SPOTS, new Set(), CFG).caught.length, 0);
  assert.deepEqual(critterCheck(at(24.8171, 55.4301, 40, true), SPOTS, new Set(), CFG).caught.map(c=>c.id), ['camel']);
});
test('no position (denied, no GPS): nothing, no error', ()=>{
  assert.deepEqual(critterCheck(null, SPOTS, new Set(), CFG), { caught:[], tooVague:[] });
  assert.deepEqual(critterCheck({ lat:NaN }, SPOTS, new Set(), CFG), { caught:[], tooVague:[] });
});
test('the content: 12 critters, unique ids, known themes, an image each', async ()=>{
  const fs = await import('fs');
  assert.equal(CRITTERS.length, 12);
  assert.equal(new Set(CRITTERS.map(c=>c.id)).size, 12);
  CRITTERS.forEach(c=>{ assert.ok(THEMES[c.theme], c.id); assert.ok(fs.existsSync(new URL('../critters/'+c.id+'.png', import.meta.url)), c.id); });
  assert.deepEqual(CRITTERS.filter(c=>c.needsVerification).map(c=>c.id).sort(), ['falcon','hawksbill_turtle','parakeet','sand_gazelle']);
});
test('every critter has at least one spot, all marked as placeholders', async ()=>{
  globalThis.location = globalThis.location || { origin:'http://x' };
  const { CRITTER_SPOTS } = await import('../config.js');
  CRITTERS.forEach(c=>{ const s = CRITTER_SPOTS[c.id]; assert.ok(s && s.length, c.id); s.forEach(p=>{ assert.equal(p.placeholder, true); assert.ok(['checkin','venue'].includes(p.trigger)); assert.ok(p.radius>0); }); });
});
