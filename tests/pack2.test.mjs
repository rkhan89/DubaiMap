// node --test tests/
// Fix pack 2: calmer night effects (all in nightfx.js), the World Islands as terrain, Port Rashid as a quay
// with the QE2 moored along it and no cranes or towers on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
const M = await import('../map.js');
const W = await import('../world.js');
const { NIGHT_FX } = await import('../nightfx.js');
const L = await import('../landmarks.js');
const R = M.RAW;
R.buildData();
const O = R.OBJECTS;

test('night effects: one constant block, toned down, and nothing else hard-codes an intensity', ()=>{
  assert.ok(NIGHT_FX.glintsNight <= 80 && NIGHT_FX.glintAlphaNight <= 0.3 && NIGHT_FX.glintStepMs >= 600);
  assert.ok(NIGHT_FX.lampGlowNight <= 0.16 && NIGHT_FX.hazeNight <= 0.19 && NIGHT_FX.headlightAlpha <= 0.5);
  const src = fs.readFileSync(new URL('../map.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../mapraster.js', import.meta.url), 'utf8');
  assert.ok(!/0\.32\*\(1 - r\/7\)/.test(src) && !/rgba\(150,185,255,0\.55\)/.test(src), 'an old intensity is still inline');
  // the live layer stops under reduced motion
  assert.match(fs.readFileSync(new URL('../map.js', import.meta.url), 'utf8'), /function drawLive\(\)\{[^]*?reduceMotion/);
});

test('the World Islands: a world map of narrow islands, a breakwater, two developed spots; their tiles are sand in the data', ()=>{
  assert.ok(W.ISLES.length >= 120, 'islands: ' + W.ISLES.length);
  for (const s of W.ISLES) assert.ok(s.ra/s.rb >= 1.4, 'an island that isn’t narrow');
  const conts = new Set(W.ISLES.map(s=>s.continent)); assert.ok(conts.size >= 6);
  assert.ok(W.ISLES.some(s=>s.dev==='heart_of_europe') && W.ISLES.some(s=>s.dev==='lebanon'));
  // every island tile is in the map and sits over the sea the renderer draws under it
  let sand = 0;
  for (let k=0; k<R.worldTile.length; k++) if (R.worldTile[k]){ assert.ok(R.isWaterT(R.worldUnder[k])); if (R.tType[k] === R.L_BEACH) sand++; }
  assert.ok(sand > 10, 'sand tiles: ' + sand);
  // only the developed islands have anything on them
  for (const o of O.filter(o=>o.k==='box' || o.k==='palm' || o.k==='parasol')){
    const ai = R.worldToAI(o.x, o.y + 1);
    if (!W.inWorldBox(ai.a, ai.i)) continue;
    const hit = W.isleAt(ai.a, ai.i); assert.ok(hit.isle && hit.isle.dev, `${o.k} on a bare island or in the sea`);
  }
});

test('Port Rashid: a quay with the QE2 moored along it (ne or nw), no cranes or tall towers, the slots kept for their art', ()=>{
  const onQuay = o=>{ const ai = R.worldToAI(o.x, o.y); return ai.a > 24.4 && ai.a < 26.0 && ai.i > -1.0 && ai.i < 0.15; };
  assert.ok(!O.some(o=>o.k==='crane' && onQuay(o)), 'a crane on the quay');
  assert.ok(!O.some(o=>o.k==='box' && o.h > 2 && onQuay(o)), 'a building on the quay');
  assert.ok(!O.some(o=>o.k==='lm2' && o.lm==='qe2'), 'the old vector QE2');
  const ship = O.find(o=>o.k==='ship' && o.kind==='qe2');
  assert.ok(ship && ['ne','nw'].includes(ship.head));
  const ai = R.worldToAI(ship.x, ship.y);
  assert.ok(R.isWaterT(R.tileAt(ai.a, ai.i)) && ai.i < -1.0 && ai.i > -1.25, 'moored just off the quay');
  assert.ok(L.PROPS.qe2_ne && L.PROPS.qe2_nw);
  assert.equal(O.filter(o=>o.k==='slot').length, L.QUAY_SLOTS.length);
  // no boat sits on top of the QE2
  for (const b of O.filter(o=>o.k==='boat')) assert.ok(Math.hypot(b.x - ship.x, b.y - ship.y) > 16, 'a boat on the QE2');
});
