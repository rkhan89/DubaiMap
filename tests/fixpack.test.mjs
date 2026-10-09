// node --test tests/
// The fix pack's rules, checked on the map's own data: boats only on open water, planes on a runway's centre
// line facing along it, roads and the Metro only over land (or a bridge or causeway), no cars on a landmark,
// sprites drawn 1:1 (whole pixels, never scaled), and the old placeholder shapes gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../map.js');
const L = await import('../landmarks.js');
const R = M.RAW;
R.buildData();
const O = R.OBJECTS;
const tileOf = (x, y)=>{ const ai = R.worldToAI(x, y), g = R.aiToGrid(ai.a, ai.i); return [Math.floor(g.gx), Math.floor(g.gy), ai]; };

test('boats: each sits on open water (its tile and all eight round it), never side by side, in one of the four headings', ()=>{
  const boats = O.filter(o=>o.k==='boat'), seen = new Set();
  assert.ok(boats.length >= 12, 'boats: ' + boats.length);
  for (const b of boats){
    const [c, r] = tileOf(b.x, b.y);
    for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) assert.ok(R.isWaterT(R.tType[(r+dr)*R.COLS + c+dc]), `${b.kind} at ${c},${r} touches land`);
    for (const k of seen){ const [c2, r2] = k.split(',').map(Number); assert.ok(Math.max(Math.abs(c-c2), Math.abs(r-r2)) >= 2, 'two boats side by side'); }
    seen.add(c+','+r);
    assert.ok(L.HEADINGS.includes(b.head), b.head);
    assert.ok(L.PROPS[b.kind + '_' + b.head], 'no sprite for ' + b.kind + '_' + b.head);
  }
});

test('planes: on a runway centre line, the nose along the runway (DXB and Al Maktoum run se/nw on screen)', ()=>{
  const planes = O.filter(o=>o.k==='plane');
  assert.ok(planes.length >= 4);
  for (const p of planes){
    const ai = R.worldToAI(p.x, p.y);
    const rw = R.RUNWAYS.find(rw=>Math.abs(ai.a - rw.a) < 0.01 && ai.i > rw.i[0] && ai.i < rw.i[1]);
    assert.ok(rw, `plane at ${ai.a.toFixed(2)},${ai.i.toFixed(2)} is not on a runway's axis`);
    // the runway's own direction on screen, snapped to the nearest heading, either way along it
    const a = R.aiToWorld(rw.a, rw.i[0]), b = R.aiToWorld(rw.a, rw.i[1]), dx = b.x - a.x, dy = b.y - a.y;
    const fwd = (dy < 0 ? 'n' : 's') + (dx < 0 ? 'w' : 'e'), back = (dy < 0 ? 's' : 'n') + (dx < 0 ? 'e' : 'w');
    assert.ok(p.head === fwd || p.head === back, `heading ${p.head}, runway runs ${fwd}/${back}`);
  }
});

test('roads: every stretch is on the map, over land, a short bridge over the creek or a causeway, never the sea', ()=>{
  for (const rd of R.ROADS_W){
    let creek = 0;
    for (let k=1; k<rd.pts.length; k++){
      const [x0, y0] = rd.pts[k-1], [x1, y1] = rd.pts[k], n = Math.ceil(Math.hypot(x1-x0, y1-y0)/2);
      for (let s=0; s<=n; s++){
        const ai = R.worldToAI(x0 + (x1-x0)*s/n, y0 + (y1-y0)*s/n), t = R.tileAt(ai.a, ai.i);
        assert.ok(t >= 0, 'a road runs off the map');
        if (rd.causeway || !R.isWaterT(t)){ creek = 0; continue; }
        assert.equal(t, R.W_CANAL, `a road over the sea at ${ai.a.toFixed(2)},${ai.i.toFixed(2)}`);
        creek += Math.hypot(x1-x0, y1-y0)/n;
      }
      assert.ok(creek < 120, 'a bridge longer than ' + R.BRIDGE_KM + ' km');
    }
  }
});

test('the Metro: over land or the creek only, never off the map or over the sea', ()=>{
  for (const o of O.filter(o=>o.k==='rail' || o.k==='station')){
    const ai = R.worldToAI(o.x, o.y), t = R.tileAt(ai.a, ai.i);
    assert.ok(t >= 0 && (!R.isWaterT(t) || t === R.W_CANAL), `${o.k} at ${ai.a.toFixed(2)},${ai.i.toFixed(2)}`);
  }
});

test('the Metro passes under a landmark sprite it crosses', ()=>{
  for (const f of R.FOOTPRINTS.filter(f=>f.o)) for (const o of O.filter(o=>o.k==='rail' || o.k==='station')){
    const ai = R.worldToAI(o.x, o.y);
    if (Math.abs(ai.a - f.a) <= f.ha + 0.2 && Math.abs(ai.i - f.i) <= f.hi + 0.2) assert.ok(o.d < f.o.d, `${o.k} drawn over ${f.o.id}`);
  }
});

test('cars: no car within a tile of any landmark or mall footprint', ()=>{
  R.prepCarRoads();
  let checked = 0;
  for (const rd of R.ROADS_W) for (let s=0; s<rd.occ.length; s++){
    const ai = R.worldToAI(...(()=>{ // the road point at s*1.5 world units
      let k = 1; const d = s*1.5; while (k < rd.cum.length-1 && rd.cum[k] < d) k++;
      const a = rd.pts[k-1], b = rd.pts[k], t = Math.max(0, Math.min(1, (d - rd.cum[k-1])/((rd.cum[k]-rd.cum[k-1]) || 1)));
      return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]; })());
    if (R.inFootprint(ai.a, ai.i)){ checked++; assert.equal(rd.occ[s], 1, `a car could drive at ${ai.a.toFixed(2)},${ai.i.toFixed(2)}`); }
  }
  assert.ok(checked > 0);
});

test('the old placeholder shapes are gone: Ski Dubai wedge, IMG Worlds box, the stacked Royal; Atlantis The Royal is a sprite', ()=>{
  assert.ok(!O.some(o=>o.k==='lm2' && ['ski','img','royal'].includes(o.lm)));
  const royal = O.find(o=>o.k==='sprite' && o.id==='atlantis_the_royal');
  assert.ok(royal && R.tileAt(...Object.values(R.worldToAI(royal.px, royal.py))) === R.L_PALM, 'Atlantis The Royal stands on the Palm');
});

test('every landmark, mall, boat and plane sprite is drawn 1:1 at the map scale (whole pixels, no scaling)', async ()=>{
  const MR = await import('../mapraster.js');
  // a sprite of random colours: drawn at any scale but 1:1, almost none of its pixels would land unchanged
  const fake = (w, h, seed)=>{ const d = new Uint32Array(w*h); let x = seed; for (let q=0; q<d.length; q++){ x = (x*1103515245 + 12345) >>> 0; d[q] = (0xff000000 | (x >>> 8)) >>> 0; } return { w, h, data:d, ax:w/2, ay:h }; };
  // (not those in the soft haze along the map's edges, which tints every pixel there)
  const inHaze = o=>{ const ai = R.worldToAI(o.x, o.y), g = R.aiToGrid(ai.a, ai.i); return Math.min(g.gx, g.gy, R.COLS - g.gx, R.ROWS - g.gy) < 16; };
  const objs = O.filter(o=>(o.k==='sprite' || o.k==='boat' || o.k==='plane') && !inHaze(o));
  assert.ok(objs.length > 40, 'sprites checked: ' + objs.length);
  for (const o of objs){
    const name = o.k==='sprite' ? o.sprite : o.k==='boat' ? o.kind + '_' + o.head : 'plane_' + o.head;
    const [w, h] = o.k==='sprite' ? [o.w*2, o.h*2] : L.PROPS[name];
    const sp = fake(w, h, w*7 + h);
    MR.setSprites({ [name]:sp }); MR.setPropLimits(L.PROPS);
    const x0 = Math.round(o.x*MR.S) - w/2, y0 = Math.round(o.y*MR.S) - h;
    const buf = MR.renderRect(Math.floor(x0), y0, Math.ceil(w), h, MR.S);
    let same = 0; for (let y=0; y<h; y++) for (let x=0; x<w; x++) if (buf.data[y*buf.w + x] === sp.data[y*w + x]) same++;
    assert.ok(same > 0.25*w*h, `${name}: only ${same} of ${w*h} pixels land 1:1`);
  }
  MR.setSprites({});
});
