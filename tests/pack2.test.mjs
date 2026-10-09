// node --test tests/
// Fix packs 2 and 3: calmer night effects (all in nightfx.js), the World Islands as a terrain sprite at its real
// size and place, Port Rashid as a quay: the QE2 moored along it, quay cranes on the edge, container stacks behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
const M = await import('../map.js');
const { TERRAINS, isLandPx } = await import('../terrains.js');
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

test('the World Islands: the art centred on the real centre at a whole-number scale; its land is sand in the data, nothing built on it', ()=>{
  const t = TERRAINS.find(t=>t.id==='the_world_islands');
  assert.ok(t && Number.isInteger(t.scale) && t.scale >= 1);
  assert.deepEqual(t.centre, [25.21667, 55.16667]);                       // Wikipedia
  // the real archipelago is ~9 km east-west: on this projection that's ~1,010 art px; the art at its scale is within a sprite pixel's scale of it
  assert.ok(Math.abs(t.w*t.scale - 1012) <= t.scale*15, 'width ' + t.w*t.scale);
  assert.equal(t.lights.length, 9);
  let sand = 0;
  for (let k=0; k<R.worldTile.length; k++) if (R.worldTile[k]){ assert.ok(R.isWaterT(R.worldUnder[k])); if (R.tType[k] === R.L_BEACH) sand++; }
  assert.ok(sand > 20, 'sand tiles: ' + sand);
  // the tile at the art's middle is what the mask says it is
  const c = R.G(t.centre[0], t.centre[1]), g = R.aiToGrid(c[0], c[1]), k = Math.floor(g.gy)*R.COLS + Math.floor(g.gx);
  if (R.worldTile[k]){ const p = R.proj(Math.floor(g.gx)+0.5, Math.floor(g.gy)+0.5), w = R.aiToWorld(c[0], c[1]);
    const sx = Math.floor((p.x - w.x)*2/t.scale + t.w/2), sy = Math.floor((p.y - w.y)*2/t.scale + t.h/2);
    assert.equal(R.tType[k] === R.L_BEACH, !!isLandPx(t, sy*t.w + sx)); }
  for (const o of O.filter(o=>o.k==='box' || o.k==='palm' || o.k==='parasol' || o.k==='tree')){
    const ai = R.worldToAI(o.x, o.y), gg = R.aiToGrid(ai.a, ai.i), kk = Math.floor(gg.gy)*R.COLS + Math.floor(gg.gx);
    assert.ok(!R.worldTile[kk], o.k + ' on the World');
  }
});

test('Port Rashid: a quay with the QE2 moored along it (ne or nw), quay cranes on the edge booms seaward, stacks behind, no old cranes or towers', ()=>{
  const onQuay = o=>{ const ai = R.worldToAI(o.x, o.y); return ai.a > 24.4 && ai.a < 26.0 && ai.i > -1.0 && ai.i < 0.15; };
  assert.ok(!O.some(o=>o.k==='crane' && onQuay(o)), 'an old crane on the quay');
  const cranes = O.filter(o=>o.k==='slot' && o.sprite.startsWith('quay_crane')), stacks = O.filter(o=>o.k==='slot' && o.sprite.startsWith('container_stack'));
  assert.ok(cranes.length >= 2 && stacks.length >= 2);
  for (const c of cranes){ const ai = R.worldToAI(c.x, c.y); assert.ok(c.sprite === 'quay_crane_nw' && ai.i < -0.85 && ai.i > -1.0, 'a crane off the edge or facing inland'); assert.ok(L.PROPS[c.sprite]); }
  for (const c of stacks){ const ai = R.worldToAI(c.x, c.y); assert.ok(c.sprite.endsWith('_ne') && ai.i > -0.8, 'a stack on the edge or across the quay'); assert.ok(L.PROPS[c.sprite]); }
  assert.ok(L.QUAY_SLOTS.some(sl=>sl.terrain && sl.sprite==='port_rashid_pier'), 'the pier tile slot');
  assert.ok(!O.some(o=>o.k==='box' && o.h > 2 && onQuay(o)), 'a building on the quay');
  assert.ok(!O.some(o=>o.k==='lm2' && o.lm==='qe2'), 'the old vector QE2');
  const ship = O.find(o=>o.k==='ship' && o.kind==='qe2');
  assert.ok(ship && ['ne','nw'].includes(ship.head));
  const ai = R.worldToAI(ship.x, ship.y);
  assert.ok(R.isWaterT(R.tileAt(ai.a, ai.i)) && ai.i < -1.0 && ai.i > -1.25, 'moored just off the quay');
  assert.ok(L.PROPS.qe2_ne && L.PROPS.qe2_nw);
  assert.equal(O.filter(o=>o.k==='slot').length, L.QUAY_SLOTS.filter(sl=>!sl.terrain).length);
  // no boat sits on top of the QE2
  for (const b of O.filter(o=>o.k==='boat')) assert.ok(Math.hypot(b.x - ship.x, b.y - ship.y) > 16, 'a boat on the QE2');
});
