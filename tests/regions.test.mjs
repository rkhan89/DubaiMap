// node --test tests/
// Regions (regions.js) grow the map by data alone. Until one goes live the frame is exactly the city's own, so
// tile (0,0), every pin and every crew record stay put.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../map.js');
const { REGIONS } = await import('../regions.js');
const R = M.RAW;

test('with no live regions the frame is the city’s own (tile 0,0 unchanged)', ()=>{
  if (REGIONS.length) return;
  assert.equal(R.A_MIN, -15.6); assert.equal(R.I_MIN, -9.0);
  assert.equal(R.ROWS, 258); assert.equal(R.COLS, 153);
});

test('places keep their real spot: lat/lng map to the same km as before', ()=>{
  // recorded before the region code went in (Burj Khalifa, Dubai Marina, Al Maktoum airport)
  for (const [lat, lng, a, i] of [[25.1972, 55.2744, 19.230736, 3.554011], [25.0805, 55.1403, 0.786244, 0.579808], [24.8883, 55.1604, -14.928100, 15.029732]]){
    const p = M.toAI(lat, lng);
    assert.ok(Math.abs(p.a - a) < 1e-5 && Math.abs(p.i - i) < 1e-5, `${lat},${lng} moved`);
    assert.ok(M.inMap(p.a, p.i));
  }
});
