// The World Islands: an archipelago in the shape of a world map, ~6 km off Jumeirah, inside a breakwater.
// Pure data and geometry (no DOM), shared by map.js (the terrain tiles under the islands, so pins and areas
// on them keep working) and mapraster.js (which draws each island's own organic shape, pixel by pixel).
// Positions are in the map's km frame: a along the coast (towards Deira), i inland (negative = out to sea).
//
// Smaller than life (the real one is ~9 x 6 km) so it fits between the coast and the map's seaward edge.
// The layout is a world map turned to match the real compass: north is (a, i) = (0.797, -0.604).

const C = [14.8, -6.2];                 // the archipelago's middle (the real one: ~25.22 N, 55.17 E)
const HALF = [2.15, 1.05];              // half its width east-west and height north-south, km
const E = [0.604, 0.797], NO = [0.797, -0.604];   // east and north as (a, i) directions
const toAI = (x, y)=>[C[0] + x*HALF[0]*E[0] + y*HALF[1]*NO[0], C[1] + x*HALF[0]*E[1] + y*HALF[1]*NO[1]];

// the continents, in map units (x east -1..1, y north -1..1)
const CONTINENTS = {
  northAmerica: [[-0.97,0.72],[-0.6,0.95],[-0.36,0.78],[-0.4,0.48],[-0.52,0.28],[-0.6,0.1],[-0.78,0.25],[-0.95,0.5]],
  southAmerica: [[-0.56,0.02],[-0.38,-0.06],[-0.33,-0.34],[-0.44,-0.78],[-0.52,-0.84],[-0.58,-0.4],[-0.63,-0.12]],
  europe:       [[-0.14,0.88],[0.12,0.95],[0.2,0.72],[0.08,0.56],[-0.1,0.56],[-0.18,0.7]],
  africa:       [[-0.17,0.42],[0.14,0.46],[0.26,0.18],[0.2,-0.22],[0.08,-0.58],[-0.03,-0.52],[-0.09,0.08],[-0.22,0.24]],
  middleEast:   [[0.19,0.46],[0.36,0.46],[0.4,0.24],[0.28,0.14]],
  asia:         [[0.24,0.97],[0.86,0.92],[0.97,0.6],[0.78,0.34],[0.6,0.14],[0.44,0.24],[0.32,0.5],[0.22,0.66]],
  australia:    [[0.6,-0.34],[0.86,-0.3],[0.92,-0.56],[0.72,-0.68],[0.6,-0.52]],
};
const inPoly = (p, x, y)=>{ let r = false; for (let k=0, j=p.length-1; k<p.length; j=k++){ const [xi,yi]=p[k], [xj,yj]=p[j]; if (((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) r = !r; } return r; };
const hash = (a, b)=>{ let h = Math.imul(a|0, 374761393) + Math.imul(b|0, 668265263) | 0; h = Math.imul(h ^ (h>>>13), 1274126177); return ((h ^ (h>>>16))>>>0)/4294967295; };

// the islands: on a jittered grid inside each continent, narrow and long, with channels between.
// ra, rb = half length and half width (km), th = the long axis's angle in the (a, i) plane
export const ISLES = [];
{
  const step = 0.085;                   // grid step in map units (~0.18 km east-west, ~0.11 km north-south)
  for (const [name, poly] of Object.entries(CONTINENTS)){
    for (let gx=-1; gx<=1; gx+=step) for (let gy=-1; gy<=1; gy+=step*1.25){
      const k = Math.round(gx*100)*7919 + Math.round(gy*100);
      const x = gx + (hash(k, 1)-0.5)*step*0.5, y = gy + (hash(k, 2)-0.5)*step*0.4;
      if (!inPoly(poly, x, y) || hash(k, 3) < 0.12) continue;      // a few gaps: open channels
      const [a, i] = toAI(x, y);
      const long = 0.07 + hash(k, 4)*0.045, wide = 0.03 + hash(k, 5)*0.02;
      // most lie east-west like the real ones, some turned a little
      const th = Math.atan2(E[1], E[0]) + (hash(k, 6)-0.5)*0.9;
      ISLES.push({ a, i, ra:long, rb:wide, th, cos:Math.cos(th), sin:Math.sin(th), seed:k, continent:name, x, y, dev:'' });
    }
  }
  // the developed ones: the Heart of Europe (a cluster of six) and Lebanon
  const nearest = (x, y, n, cont)=>ISLES.filter(s=>!cont || s.continent===cont).sort((p, q)=>Math.hypot(p.x-x, p.y-y) - Math.hypot(q.x-x, q.y-y)).slice(0, n);
  nearest(0.0, 0.76, 6, 'europe').forEach(s=>s.dev = 'heart_of_europe');
  nearest(0.21, 0.42, 1, 'middleEast').forEach(s=>s.dev = 'lebanon');
}

// the breakwater: a thin crescent on the seaward side of an oval round the archipelago, with two gaps
export const BREAKWATER = { a:C[0], i:C[1], ra:2.55, ri:2.35, w:0.022 };

// where the islands' pixels are drawn (km): everything else is untouched
export const WORLD_BOX = { a0:C[0] - 3.1, a1:C[0] + 3.1, i0:Math.max(-8.95, C[1] - 2.8), i1:C[1] + 2.7 };
export const inWorldBox = (a, i)=>a > WORLD_BOX.a0 && a < WORLD_BOX.a1 && i > WORLD_BOX.i0 && i < WORLD_BOX.i1;

// a grid of the islands (0.4 km cells) so a point only measures the few nearby
const CELL = 0.4, grid = new Map(), key = (u, v)=>u + ',' + v;
for (const s of ISLES){ const u0 = Math.floor((s.a - s.ra)/CELL), u1 = Math.floor((s.a + s.ra)/CELL), v0 = Math.floor((s.i - s.ra)/CELL), v1 = Math.floor((s.i + s.ra)/CELL);
  for (let u=u0; u<=u1; u++) for (let v=v0; v<=v1; v++){ const kk = key(u, v); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(s); } }

// how far a/i is from the nearest island's edge, in km (negative inside), and which island; the edge wobbles
// a little so no two islands are the same smooth ellipse
export function isleAt(a, i){
  const list = grid.get(key(Math.floor(a/CELL), Math.floor(i/CELL)));
  let best = 1, who = null;
  if (list) for (const s of list){
    const da = a - s.a, di = i - s.i, u = da*s.cos + di*s.sin, v = -da*s.sin + di*s.cos;
    const ang = Math.atan2(v/s.rb, u/s.ra), wob = 0.1*Math.sin(ang*3 + s.seed) + 0.06*Math.sin(ang*5 + s.seed*1.7);
    const d = (Math.hypot(u/s.ra, v/s.rb) - 1 - wob) * s.rb;
    if (d < best){ best = d; who = s; }
  }
  return { d:best, isle:who };
}
// the breakwater: inside its thin band, on the seaward half (i below the middle), outside the two gaps
export function onBreakwater(a, i){
  const B = BREAKWATER, x = (a - B.a)/B.ra, y = (i - B.i)/B.ri, r = Math.hypot(x, y);
  if (y > 0.05) return false;                                           // the seaward side only
  const ang = Math.atan2(y, x); if (Math.abs(ang + 1.0) < 0.06 || Math.abs(ang + 2.15) < 0.06) return false;   // the gaps
  return Math.abs(r - 1) * Math.min(B.ra, B.ri) < B.w;
}
