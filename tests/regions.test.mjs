// node --test tests/
// Regions (regions.js) grow the map by data alone: the frame covers every live and fogged region and every
// terrain whole (nothing cut off at the edge), fogged land has nothing on it, and places keep their real spot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../map.js');
const { REGIONS } = await import('../regions.js');
const { TERRAINS, isLandPx } = await import('../terrains.js');
const R = M.RAW;
R.buildData();

test('every region has an id, a stage and a status; live and fogged ones are on the map', ()=>{
  for (const rg of REGIONS){
    assert.ok(rg.id && rg.stage && ['live','fogged','locked'].includes(rg.status), rg.id);
    for (const [lat, lng] of rg.coast || []){ const p = M.toAI(lat, lng); if (rg.status !== 'locked') assert.ok(M.inMap(p.a, p.i), `${rg.id}: ${lat},${lng} is off the map`); }
    for (const z of rg.zones || []) if (rg.status === 'live') assert.ok(M.zoneById(z.id), 'no area ' + z.id);
  }
});

test('every terrain is whole on the map (none of its land past the edge, with room for the fog)', ()=>{
  for (const t of TERRAINS){
    const c = M.toAI(t.centre[0], t.centre[1]);
    for (let sy=0; sy<t.h; sy++) for (let sx=0; sx<t.w; sx++){
      if (!isLandPx(t, sy*t.w + sx)) continue;
      const dx = (sx + 0.5 - t.w/2)*t.scale/2, dy = (sy + 0.5 - t.h/2)*t.scale/2, dgx = (dx/8 + dy/4)/2, dgy = (dy/4 - dx/8)/2;
      const a = c.a - dgy*0.2, i = c.i + dgx*0.2;
      assert.ok(a > R.A_MIN + 1.2 && i > R.I_MIN + 1.2 && i < 21.6 - 1.2, `${t.id} land at ${a.toFixed(2)},${i.toFixed(2)} reaches the edge`);
    }
  }
});

test('Palm Jebel Ali: bare land in the data at its real middle; nothing built in the fogged region; no road there', ()=>{
  const p = M.toAI(25.010, 54.985), k = R.tileAt(p.a, p.i);
  assert.ok(k === R.L_BEACH || R.isWaterT(k), 'the palm’s middle');
  let sand = 0; for (let q=0; q<R.worldTile.length; q++) if (R.worldTile[q] && R.tType[q] === R.L_BEACH) sand++;
  assert.ok(sand > 300, 'terrain sand tiles: ' + sand);
  assert.ok(R.FOG_A > -Infinity && R.FOG_A < -15.6);
  for (const o of R.OBJECTS) assert.ok(R.worldToAI(o.x, o.y).a >= R.FOG_A, o.k + ' in the fog');
  for (const rd of R.ROADS_W) for (const [x, y] of rd.pts) assert.ok(R.worldToAI(x, y).a >= R.FOG_A - 0.06, 'a road in the fog');
});

test('places keep their real spot: lat/lng map to the same km as before the map grew', ()=>{
  // recorded before the frame changed (Burj Khalifa, Dubai Marina, Al Maktoum airport)
  for (const [lat, lng, a, i] of [[25.1972, 55.2744, 19.230736, 3.554011], [25.0805, 55.1403, 0.786244, 0.579808], [24.8883, 55.1604, -14.928100, 15.029732]]){
    const p = M.toAI(lat, lng);
    assert.ok(Math.abs(p.a - a) < 1e-5 && Math.abs(p.i - i) < 1e-5, `${lat},${lng} moved`);
    assert.ok(M.inMap(p.a, p.i));
  }
});
