// node --test tests/
// Regions (regions.js) grow the map by data alone: the frame covers each one, its coast, palm, zoning, roads and
// area labels join the city's, and places stored as lat/lng stay where they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../map.js');
const { REGIONS } = await import('../regions.js');
const R = M.RAW;
R.buildData();
const tileType = (lat, lng)=>{ const p = M.toAI(lat, lng); return R.tileAt(p.a, p.i); };

test('every region is inside the map: its coast, palm, zoning, roads and area labels', ()=>{
  for (const rg of REGIONS){
    for (const [lat, lng] of [...rg.coast, ...rg.roads.flatMap(r=>r.pts), ...rg.zoning.flatMap(z=>[z.sw, z.ne]), ...rg.palms.flatMap(p=>[p.base, p.hub])]){
      const p = M.toAI(lat, lng); assert.ok(M.inMap(p.a, p.i), `${rg.id}: ${lat},${lng} is off the map`);
    }
    for (const z of rg.zones) assert.ok(M.zoneById(z.id), 'no area ' + z.id);
  }
});

test('Palm Jebel Ali is bare sand at its sourced middle, with sea round its crescent; Ghantoot is on land by the sea', ()=>{
  assert.equal(tileType(25.0016, 55.0061), R.L_BEACH);                // its hub
  const P = R.REGION_PALMS[0];
  assert.ok(R.isWaterT(R.tileAt(P.hub[0], P.hub[1] - P.cr - 0.6)), 'open sea past the crescent');
  assert.ok(!R.isWaterT(tileType(24.895, 54.875)), 'Ghantoot is land');
  assert.ok(R.isWaterT(tileType(24.893, 54.850)), 'the sea off Ghantoot');
  // nothing built on the palm yet
  const g = R.aiToGrid(P.hub[0], P.hub[1]);
  assert.ok(!R.OBJECTS.some(o=>o.k==='box' && Math.hypot(o.x - R.proj(g.gx, g.gy).x, o.y - R.proj(g.gx, g.gy).y) < 20));
});

test('places keep their real spot: lat/lng map to the same km as before the map grew', ()=>{
  // recorded before the frame changed (Burj Khalifa, Dubai Marina, Al Maktoum airport)
  for (const [lat, lng, a, i] of [[25.1972, 55.2744, 19.230736, 3.554011], [25.0805, 55.1403, 0.786244, 0.579808], [24.8883, 55.1604, -14.928100, 15.029732]]){
    const p = M.toAI(lat, lng);
    assert.ok(Math.abs(p.a - a) < 1e-5 && Math.abs(p.i - i) < 1e-5, `${lat},${lng} moved`);
    assert.ok(M.inMap(p.a, p.i));
  }
});
