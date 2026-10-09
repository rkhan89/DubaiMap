// The map as pixel art: renders any rectangle of the city into a PixelBuffer at s art pixels per
// world unit (2 for the real thing, less for the wide-view overview). Same data as map.js (terrain,
// roads, ~7,400 objects); only the drawing is new. Pure JS, so it runs in mapworker.js.
//   ground: one 2:1 diamond per 200 m tile, textured by type (sand, dunes, paving, grass, water)
//   roads:  asphalt with kerbs and lane markings; the Marina tram
//   shadows: hard-edged, semi-transparent, cast down-left (light from the upper right)
//   buildings: three shaded faces (left dark, right mid, top light), a 1 px outline, a rim
//              highlight, windows by type and roof details by zone
//   everything else (trees, the Metro, landmarks…) through PixelCtx, so it shares the pixel grid
import { RAW as M } from './map.js';
import { PixelBuffer, PixelCtx, rgba, hex, mix, scale, scanPolys, fillPolys, line, thickRings } from './pixel.js';
import { NIGHT_FX } from './nightfx.js';
import { TERRAINS } from './terrains.js';

export const S = 2;          // art pixels per world unit (the approved scale)
// landmark and prop sprites (map-art/*.png), handed over by map.js: { name: { w, h, data:Uint32Array, ax, ay } }
// ax, ay = the anchor in the sprite: the bottom centre of its canvas (ground contact, or the waterline)
let SPRITES = {};
const spriteCache = new Map();
export function setSprites(sp){ SPRITES = sp || {}; spriteCache.clear(); chunkObjs = null; }
// sprites whose visible pixels the main thread needs for its overlays (the Burj light show, the fountain)
export const FX_SPRITES = ['burj_khalifa', 'dubai_fountain'];
export const CH = 256;       // chunk size in art pixels
let ready = false, chunkObjs = null, roadBoxes = null;

export function prepare(){
  if (ready) return;
  M.buildData();
  ready = true;
}
export const artSize = (s=S)=>({ w:Math.ceil(M.WORLD.w*s), h:Math.ceil(M.WORLD.h*s) });
export const chunkGrid = ()=>{ const a = artSize(); return { cols:Math.ceil(a.w/CH), rows:Math.ceil(a.h/CH) }; };

/* ---------- small helpers ---------- */
const h32 = (a, b=0, c=0)=>{ let h = Math.imul(a|0, 374761393) ^ Math.imul(b|0, 668265263) ^ Math.imul(c|0, 2147483647); h = Math.imul(h ^ (h>>>13), 1274126177); return ((h ^ (h>>>16))>>>0) / 4294967296; };
const night = ()=>M.NIGHT;
const N = col=>rgba(M.C(col));            // a day colour, through the night palette when it's dark
const objId = o=>h32(Math.round(o.x*8), Math.round(o.y*8), 7)*1e9|0;

// world-unit bounding box an object can draw into (generous where the shape is free-form)
function objBox(o){
  if (o.k==='box'){
    const w = 8*(o.hx+o.hy)+3, top = (o.z0||0)+o.h+(o.h>30?16:6), sh = o.h*0.55+2;
    return [o.x-w-sh, o.y-top, o.x+w+2, o.y+4*(o.hx+o.hy)+sh*0.5+3];
  }
  if (o.k==='sprite'){
    const sp = SPRITES[o.sprite]; if (!sp) return [o.x-4, o.y-4, o.x+4, o.y+4];
    // (and its shadow, which runs down-left by up to 0.55 of its height)
    return [o.x - sp.ax/S - 2 - SHADOW.cap/S, o.y - sp.ay/S - 2, o.x + (sp.w - sp.ax)/S + 2, o.y + (sp.h - sp.ay)/S + 2 + SHADOW.cap/S];
  }
  if (o.k==='rail') return [Math.min(o.x0,o.x1)-6, Math.min(o.y0,o.y1)-14, Math.max(o.x0,o.x1)+6, Math.max(o.y0,o.y1)+6];
  if (o.k==='lm') return [o.x-70, o.y-280, o.x+70, o.y+40];
  if (o.k==='lm2') return [o.x-70, o.y-140, o.x+70, o.y+40];
  if (o.k==='plane' || o.k==='crane') return [o.x-30, o.y-50, o.x+30, o.y+16];
  if (o.k==='ship' || o.k==='slot') return [o.x-48, o.y-56, o.x+48, o.y+8];
  return [o.x-20, o.y-40, o.x+20, o.y+12];
}
// which objects touch each chunk, in the global depth order
// where two city roads cross (world units), for the zebra crossings
let CROSSINGS = null;
function findCrossings(){
  CROSSINGS = [];
  const rd = M.ROADS_W.filter(r=>r.k >= 1);
  const segX = (p, q, a, b)=>{ const d = (q[0]-p[0])*(b[1]-a[1]) - (q[1]-p[1])*(b[0]-a[0]); if (!d) return null;
    const t = ((a[0]-p[0])*(b[1]-a[1]) - (a[1]-p[1])*(b[0]-a[0]))/d, u = ((a[0]-p[0])*(q[1]-p[1]) - (a[1]-p[1])*(q[0]-p[0]))/d;
    return t>0 && t<1 && u>0 && u<1 ? [p[0]+(q[0]-p[0])*t, p[1]+(q[1]-p[1])*t] : null; };
  for (let i=0; i<rd.length; i++) for (let j=i+1; j<rd.length; j++){
    const A = rd[i].pts, B = rd[j].pts;
    for (let a=0; a<A.length-1; a++) for (let b=0; b<B.length-1; b++){
      const x = segX(A[a], A[a+1], B[b], B[b+1]); if (!x) continue;
      CROSSINGS.push({ x:x[0], y:x[1], roads:[[A[a], A[a+1], rd[i].k], [B[b], B[b+1], rd[j].k]] });
    }
  }
}
function indexChunks(){
  const g = chunkGrid();
  chunkObjs = Array.from({length:g.cols*g.rows}, ()=>[]);
  M.OBJECTS.forEach((o, k)=>{
    const [x0,y0,x1,y1] = objBox(o);
    const c0 = Math.max(0, Math.floor(x0*S/CH)), c1 = Math.min(g.cols-1, Math.floor(x1*S/CH));
    const r0 = Math.max(0, Math.floor(y0*S/CH)), r1 = Math.min(g.rows-1, Math.floor(y1*S/CH));
    for (let r=r0; r<=r1; r++) for (let c=c0; c<=c1; c++) chunkObjs[r*g.cols+c].push(k);
  });
  roadBoxes = M.ROADS_W.map(rd=>{ const xs = rd.pts.map(p=>p[0]), ys = rd.pts.map(p=>p[1]), pad = M.RD[rd.k].w;
    return [Math.min(...xs)-pad, Math.min(...ys)-pad, Math.max(...xs)+pad, Math.max(...ys)+pad]; });
}
function objectsIn(x0, y0, x1, y1, s){
  // world rectangle -> object indices (chunk index when it's a whole chunk at full scale)
  if (!chunkObjs) indexChunks();
  const out = [];
  M.OBJECTS.forEach((o, k)=>{ const b = objBox(o); if (b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1) out.push(k); });
  return out;
}

/* =========================================================
   GROUND
   ========================================================= */
const T = M;   // terrain type constants live on RAW
function groundBase(){
  return (night() ? M.TILE_NIGHT : M.TILE_COLORS).map(c=>rgba(c));
}
// per-pixel ground colour: base tone plus a texture that depends on the land type
function groundPixel(t, base, x, y, edge){
  const hh = h32(x, y);
  switch (t){
    case T.W_SEA: case T.W_DEEP: case T.W_SHALLOW: case T.W_CANAL: {
      // short horizontal ripples, two tones, never a grid
      const rip = h32(x>>2, y, 3);
      if (rip < 0.035 && (x&3) !== 3) return scale(base, night() ? 1.25 : 1.1);
      if (rip > 0.975) return scale(base, 0.93);
      return base;
    }
    case T.L_SAND: case T.L_CREST:
      return hh < 0.045 ? scale(base, 0.94) : hh < 0.07 ? scale(base, 1.04) : base;
    case T.L_DUNE:
      if (((x + 2*y) % 11 === 0) && hh < 0.8) return scale(base, 0.95);   // wind ripples along the dunes
      return hh < 0.04 ? scale(base, 1.03) : base;
    case T.L_BEACH: case T.L_PALM:
      return hh < 0.06 ? scale(base, 1.03) : hh < 0.085 ? scale(base, 0.96) : base;
    case T.L_URBAN:
      if (edge) return scale(base, 0.955);                                  // paving seams on each tile's back edges
      return hh < 0.03 ? scale(base, 0.98) : base;
    case T.L_PARK: case T.L_FARM:
      if (hh < 0.11) return scale(base, 0.9);                               // grass tufts
      if (hh < 0.16) return scale(base, 1.06);
      return edge ? scale(base, 0.97) : base;
    case T.L_GOLF:
      if (hh < 0.05) return scale(base, 0.93);
      return (((x + 2*y) >> 4) & 1) ? scale(base, 1.035) : base;            // mown stripes
    case T.L_TARMAC:
      return hh < 0.05 ? scale(base, 0.96) : edge ? scale(base, 0.97) : base;
    case T.L_LOT:
      return hh < 0.06 ? scale(base, 0.95) : hh < 0.09 ? scale(base, 1.03) : base;
  }
  return base;
}
function drawGround(buf, s, groundMask){
  const TB = groundBase(), tt = M.tType, ROWS = M.ROWS, COLS = M.COLS, isW = M.isWaterT;
  const hw = 8*s, hh = 4*s, ox = M.WORLD.ox*s, oy = M.WORLD.oy*s, lip = Math.round(M.LIP*s), slab = Math.round(M.SLAB*s);
  const bx0 = buf.ox, by0 = buf.oy, bx1 = bx0+buf.w, by1 = by0+buf.h;
  // tiles whose diamond or front face could reach this rectangle: u = c-r, v = c+r
  const u0 = Math.floor((bx0 - hw - ox)/hw) - 1, u1 = Math.ceil((bx1 + hw - ox)/hw) + 1;
  const v0 = Math.floor((by0 - 2*hh - slab - oy)/hh) - 1, v1 = Math.ceil((by1 - oy)/hh) + 1;
  const clip = { x0:bx0, y0:by0, x1:bx1, y1:by1 }, rowClip = { x0:-1e9, y0:by0, x1:1e9, y1:by1 };
  const faces = [];
  const foamC = N('#FFFFFF'), wetC = night() ? 0 : rgba('#E9D3A6');
  for (let v=v0; v<=v1; v++) for (let u=u0; u<=u1; u++){
    if ((u+v) & 1) continue;
    const c = (u+v)/2, r = (v-u)/2;
    if (c<0 || r<0 || c>=COLS || r>=ROWS) continue;
    const k = r*COLS + c, t = M.worldTile[k] ? M.worldUnder[k] : tt[k], water = isW(t), base = TB[t];
    const X = (c-r)*hw + ox, Y = (c+r)*hh + oy;
    const backL = !water && c>0 && isW(tt[k-1]) && !M.worldTile[k-1], backR = !water && r>0 && isW(tt[k-COLS]) && !M.worldTile[k-COLS];
    const seam = t===T.L_URBAN || t===T.L_PARK || t===T.L_TARMAC;
    // spans come unclipped in x (edges are measured against the whole tile, so chunks join up)
    scanPolys([[X,Y, X+hw,Y+hh, X,Y+2*hh, X-hw,Y+hh]], (y, a, b)=>{
      const dy = y - Y, back = dy < hh, xa = Math.max(a, bx0), xb = Math.min(b, bx1);
      for (let x=xa; x<xb; x++){
        const left = x - a < 2, right = b - x <= 2;
        let col;
        if (back && ((left && backL) || (right && backR))) col = foamC;             // surf on the shore
        else if (back && s >= 2 && ((x - a === 2 && backL) || (b - x === 3 && backR))) col = wetC || base;
        else col = s >= 1 ? groundPixel(t, base, x, y, seam && back && (left || right)) : base;
        buf.data[(y-by0)*buf.w + (x-bx0)] = col;
        if (groundMask) groundMask[(y-by0)*buf.w + (x-bx0)] = t+1;
      }
    }, rowClip);
    // front faces: a low lip where land meets water, the deep slab along the map's front edges
    // (no deep slab along the map's front edges any more: the land fades into the fog there)
    const dR = c===COLS-1 ? 0 : (!water && isW(tt[k+1]) && !M.worldTile[k+1] ? lip : 0);
    const dL = r===ROWS-1 ? 0 : (!water && isW(tt[k+COLS]) && !M.worldTile[k+COLS] ? lip : 0);
    if (dR) faces.push([t, 'R', X, Y, dR]);
    if (dL) faces.push([t, 'L', X, Y, dL]);
  }
  const out = N(M.OUT);
  for (const [t, side, X, Y, d] of faces){
    // the deep slab along the map's edge is one earth tone under any land (no pale stripes under dune crests)
    const base = d > lip && !isW(t) ? TB[T.L_SAND] : TB[t], col = side==='R' ? scale(base, 0.66) : scale(base, isW(t) ? 0.8 : 0.82);
    const poly = side==='R' ? [X,Y+2*hh, X+hw,Y+hh, X+hw,Y+hh+d, X,Y+2*hh+d] : [X-hw,Y+hh, X,Y+2*hh, X,Y+2*hh+d, X-hw,Y+hh+d];
    scanPolys([poly], (y, a, b)=>{
      for (let x=a; x<b; x++){
        // rock strata on the deep slab, a darker band at the bottom of a lip
        const depth = side==='R' ? y - (Y+2*hh - (x-X)/2) : y - (Y+hh + (x-(X-hw))/2);
        let col2 = col;
        if (d > lip){ if ((depth|0) % 9 === 6 || (h32(x, y, 9) < 0.06)) col2 = scale(col, 0.88); }
        else if (depth >= d - 1.5) col2 = scale(col, 0.86);
        buf.data[(y-by0)*buf.w + (x-bx0)] = col2;
      }
    }, clip);
    if (s >= 1){
      // outline along the bottom of the face
      const [ax, ay, bx, by] = side==='R' ? [X, Y+2*hh+d, X+hw, Y+hh+d] : [X-hw, Y+hh+d, X, Y+2*hh+d];
      line(buf, ax, ay, bx-1, by + (side==='R' ? 0.5 : -0.5), out);
    }
  }
}

/* =========================================================
   TERRAINS (terrains.js): ground art out at sea, the World Islands
   ========================================================= */
// drawn on the ground, before anything stands on it: centred on its real point, each sprite pixel a whole
// number of art pixels (nearest neighbour), only where the map has ground. At night its own palette (warm
// blue-grey sand) and its few lit windows; land pixels count as land for what's drawn after.
const terrainNight = new Map();
function drawTerrains(buf, s, groundMask){
  for (const t of TERRAINS){
    const sp = SPRITES[t.sprite]; if (!sp) continue;
    let data = sp.data;
    if (night()){
      data = terrainNight.get(t.id);
      if (!data){
        const lit = new Set(t.lights), map = {}; for (const [d, n] of Object.entries(t.night || {})) map[rgba(d) & 0xffffff] = rgba(n);
        data = sp.data.map((c, k)=>!(c>>>24) ? 0 : lit.has(k) ? rgba('#ffd470') : (map[c & 0xffffff] || nightPx(c)));
        terrainNight.set(t.id, data);
      }
    }
    const [ca, ci] = M.G(t.centre[0], t.centre[1]), cw = M.aiToWorld(ca, ci), k = t.scale*s/S;
    const x0 = Math.round(cw.x*s - t.w*k/2), y0 = Math.round(cw.y*s - t.h*k/2);
    const bx0 = Math.max(x0, buf.ox), by0 = Math.max(y0, buf.oy), bx1 = Math.min(x0 + Math.ceil(t.w*k), buf.ox+buf.w), by1 = Math.min(y0 + Math.ceil(t.h*k), buf.oy+buf.h);
    for (let y=by0; y<by1; y++){
      const sy = Math.floor((y - y0)/k); if (sy < 0 || sy >= t.h) continue;
      for (let x=bx0; x<bx1; x++){
        const sx = Math.floor((x - x0)/k); if (sx < 0 || sx >= t.w) continue;
        const q = (y-buf.oy)*buf.w + (x-buf.ox), c = data[sy*t.w + sx];
        if ((c>>>24) < 128 || (groundMask && !groundMask[q])) continue;      // off the art, or off the map
        if (groundMask){ const g0 = groundMask[q]-1; if (!M.isWaterT(g0) && g0 !== M.L_BEACH && g0 !== M.L_SAND && g0 !== M.L_DUNE && g0 !== M.L_CREST) continue; }   // only over sea and sand
        buf.data[q] = (c | 0xff000000) >>> 0;
        const raw = sp.data[sy*t.w + sx], rr = raw & 255, gg = raw>>8 & 255, bb = raw>>16 & 255;
        if (groundMask && !(gg > rr + 20 && bb > rr + 20)) groundMask[q] = M.L_BEACH + 1;   // its sand and buildings are land
      }
    }
  }
}

/* =========================================================
   ROADS (asphalt, kerbs, markings) and the tram
   ========================================================= */
function drawRoads(buf, s, groundMask){
  if (!roadBoxes) indexChunks();
  const W = buf.w, H = buf.h, mw = W+2, mh = H+2, mask = new Uint8Array(mw*mh);
  const mx0 = buf.ox-1, my0 = buf.oy-1, clip = { x0:mx0, y0:my0, x1:mx0+mw, y1:my0+mh };
  const vis = []; const wx0 = mx0/s, wy0 = my0/s, wx1 = (mx0+mw)/s, wy1 = (my0+mh)/s;
  M.ROADS_W.forEach((rd, k)=>{ const b = roadBoxes[k]; if (b[2] < wx0 || b[0] > wx1 || b[3] < wy0 || b[1] > wy1) return; vis.push(rd); });
  M.RUNWAYS_W.forEach(rw=>{ const rings=[rw.poly.flatMap(p=>[p[0]*s, p[1]*s])]; scanPolys(rings, (y,a,b)=>{ for (let x=a;x<b;x++) mask[(y-my0)*mw + x-mx0] = 4; }, clip); });
  for (const k of [2,1,0]) vis.filter(r=>r.k===k).forEach(rd=>{
    const pts = rd.pts.map(p=>[p[0]*s, p[1]*s]);
    scanPolys(thickRings(pts, M.RD[k].w*s), (y,a,b)=>{ for (let x=a;x<b;x++) mask[(y-my0)*mw + x-mx0] = k===0 ? 3 : 2; }, clip);
  });
  const asph = [0, 0, N('#9C928A'), N('#8E857E'), N('#B3ADA4')], kerb = N('#D8D1C6');
  const inMap = (x, y)=>!groundMask || groundMask[(y-buf.oy)*W + (x-buf.ox)] > 0;
  for (let y=0; y<H; y++) for (let x=0; x<W; x++){
    const m = mask[(y+1)*mw + x+1], ax = x+buf.ox, ay = y+buf.oy;
    if (!inMap(ax, ay)) continue;
    if (m){ const hh = h32(ax, ay, 5); buf.data[y*W+x] = hh < 0.05 ? scale(asph[m], 0.96) : asph[m]; continue; }
    if (s < 1) continue;
    const n = mask[y*mw + x+1] || mask[(y+2)*mw + x+1] || mask[(y+1)*mw + x] || mask[(y+1)*mw + x+2];
    if (n && n !== 4){ const t = groundMask ? groundMask[y*W+x]-1 : -1; if (!M.isWaterT(t)) buf.data[y*W+x] = kerb; }
  }
  if (s < 1) return;
  // lane markings: dashed lines along the major roads, a solid median on the highways
  const markC = N('#F4EEDF'), medC = N('#6F665F');
  const walk = (pts, off, col, dash)=>{
    let n = 0;
    for (let k=0; k<pts.length-1; k++){
      const [ax,ay] = pts[k], [bx,by] = pts[k+1], L = Math.hypot(bx-ax, by-ay); if (!L) continue;
      const nx = -(by-ay)/L*off, ny = (bx-ax)/L*off;
      for (let d=0; d<L; d+=1, n++){
        if (dash && (n % (dash[0]+dash[1])) >= dash[0]) continue;
        const x = Math.floor(ax + (bx-ax)*d/L + nx), y = Math.floor(ay + (by-ay)*d/L + ny);
        if (x < buf.ox || y < buf.oy || x >= buf.ox+W || y >= buf.oy+H || !inMap(x, y)) continue;
        if (mask[(y-my0)*mw + x-mx0] >= 2 && mask[(y-my0)*mw + x-mx0] <= 3) buf.data[(y-buf.oy)*W + x-buf.ox] = col;
      }
    }
  };
  vis.forEach(rd=>{
    const pts = rd.pts.map(p=>[p[0]*s, p[1]*s]), w = M.RD[rd.k].w*s;
    if (rd.k === 0){ walk(pts, 0, medC); walk(pts, w*0.27, markC, [4,4]); walk(pts, -w*0.27, markC, [4,4]); }
    else if (rd.k === 1) walk(pts, 0, markC, [3,4]);
  });
  M.RUNWAYS_W.forEach(rw=>walk(rw.line.map(p=>[p[0]*s, p[1]*s]), 0, N('#FFFFFF'), [6,5]));
  if (s >= 2) drawCrossings(buf, s, groundMask, mask, mw, mx0, my0);
  if (s >= 2) drawLamps(buf, s, groundMask, vis);
  // the Dubai Tram: twin teal rails on a dark bed
  const tram = M.TRAM.map(([a,i])=>{ const p = M.aiToWorld(a,i); return [p.x*s, p.y*s]; });
  fillPolys(buf, thickRings(tram, 3*s), N(M.OUT));
  fillPolys(buf, thickRings(tram, 1.8*s), N('#3FB8AF'));
}

// zebra crossings where two city roads meet (in town only)
function drawCrossings(buf, s, groundMask, mask, mw, mx0, my0){
  if (!CROSSINGS) findCrossings();
  const W = buf.w, H = buf.h, zc = N('#F7F3EA');
  for (const cr of CROSSINGS){
    const X = cr.x*s, Y = cr.y*s; if (X < buf.ox-30 || X > buf.ox+W+30 || Y < buf.oy-30 || Y > buf.oy+H+30) continue;
    const gx = Math.min(W-1, Math.max(0, Math.round(X)-buf.ox)), gy = Math.min(H-1, Math.max(0, Math.round(Y)-buf.oy));
    const t = groundMask ? groundMask[gy*W + gx]-1 : -1;
    if (t !== M.L_URBAN && t !== M.L_LOT) continue;
    cr.roads.forEach(([p, q, k], idx)=>{
      const other = cr.roads[1-idx][2], dx = q[0]-p[0], dy = q[1]-p[1], L = Math.hypot(dx, dy), ux = dx/L, uy = dy/L, nx = -uy, ny = ux;
      const w = M.RD[k].w*s, back = M.RD[other].w*s/2 + 3;
      for (const side of [-1, 1]) for (let a=-w/2+1; a<w/2-0.5; a+=2) for (let l=0; l<3; l++){
        const x = Math.floor(X + ux*side*(back+l) + nx*a), y = Math.floor(Y + uy*side*(back+l) + ny*a);
        if (x < buf.ox || y < buf.oy || x >= buf.ox+W || y >= buf.oy+H) continue;
        const m = mask[(y-my0)*mw + x-mx0]; if (m === 2 || m === 3) buf.data[(y-buf.oy)*W + x-buf.ox] = zc;
      }
    });
  }
}
// street lamps along the city roads: a post, a head, and at night a warm glow round the head
function drawLamps(buf, s, groundMask, vis){
  const W = buf.w, H = buf.h, post = N('#7B7F86'), head = night() ? rgba('#FFE7A6') : rgba('#D9DCE0'), glow = rgba('#FFD27A'), STEP = 24;
  vis.forEach(rd=>{
    if (rd.k === 2) return;
    const pts = rd.pts.map(p=>[p[0]*s, p[1]*s]), off = M.RD[rd.k].w*s/2 + 2;
    let walked = 0;
    for (let k=0; k<pts.length-1; k++){
      const [ax,ay] = pts[k], [bx,by] = pts[k+1], L = Math.hypot(bx-ax, by-ay); if (!L){ continue; }
      const nx = -(by-ay)/L, ny = (bx-ax)/L;
      for (let d = (STEP - walked % STEP) % STEP; d < L; d += STEP){
        for (const side of [-1, 1]){
          const x = Math.round(ax + (bx-ax)*d/L + nx*off*side), y = Math.round(ay + (by-ay)*d/L + ny*off*side);
          if (x < buf.ox-8 || y < buf.oy-8 || x >= buf.ox+W+8 || y >= buf.oy+H+12) continue;
          const gi = Math.min(H-1, Math.max(0, y-buf.oy))*W + Math.min(W-1, Math.max(0, x-buf.ox)), t = groundMask ? groundMask[gi]-1 : -1;
          if (t !== M.L_URBAN && t !== M.L_LOT && t !== M.L_TARMAC && t !== M.L_PARK) continue;
          if (night()){
            for (let gy=-7; gy<=7; gy++) for (let gx=-7; gx<=7; gx++){
              const r = Math.hypot(gx, gy*1.4); if (r > 7) continue;
              const px = x+gx, py = y-5+gy; if (px < buf.ox || py < buf.oy || px >= buf.ox+W || py >= buf.oy+H) continue;
              const q = (py-buf.oy)*W + px-buf.ox; buf.data[q] = mix(buf.data[q], glow, NIGHT_FX.lampGlowNight*(1 - r/7)**2);
            }
          }
          for (let k2=0; k2<5; k2++) buf.put(x, y-k2, post);
          buf.put(x, y-5, head); buf.put(x + side, y-5, head);
        }
      }
      walked += L;
    }
  });
}

/* =========================================================
   SHADOWS: hard edges, soft tone, cast down-left
   ========================================================= */
function hull(pts){
  pts = pts.slice().sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  const cr = (o,a,b)=>(a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lo = [], up = [];
  for (const p of pts){ while (lo.length>=2 && cr(lo[lo.length-2], lo[lo.length-1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()){ while (up.length>=2 && cr(up[up.length-2], up[up.length-1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0,-1).concat(up.slice(0,-1));
}
// cast shadows: hard edged and flat, falling left and down, on land only; length = height x k, capped (art px at full scale)
const SHADOW = { colour:'#121426', day:0.28, night:0.10, k:0.5, cap:18 };
const SH_X = 0.894, SH_Y = 0.447;   // the direction (down-left along the iso diagonal)
// the lowest opaque row of each column of a sprite (where that column stands), -1 if empty
function spriteFeet(sp){
  if (sp.feet) return sp.feet;
  const f = new Int16Array(sp.w).fill(-1);
  for (let x=0; x<sp.w; x++) for (let y=sp.h-1; y>=0; y--) if ((sp.data[y*sp.w + x]>>>24) >= 128){ f[x] = y; break; }
  return (sp.feet = f);
}
function drawShadows(buf, s, list, groundMask){
  const W = buf.w, H = buf.h, sm = new Uint8Array(W*H), clip = { x0:buf.ox, y0:buf.oy, x1:buf.ox+W, y1:buf.oy+H };
  for (const k of list){
    const o = M.OBJECTS[k]; if (o.k !== 'box' || (o.z0||0) > 0 || o.h < 3) continue;
    const g = geom(o, s), L = Math.min(SHADOW.cap*s/2, o.h*s*SHADOW.k), dx = -L*SH_X, dy = L*SH_Y;   // along +gy on screen: left and down
    const base = [g.N, g.E, g.S, g.W];
    const ring = hull(base.concat(base.map(p=>[p[0]+dx, p[1]+dy]))).flat();
    scanPolys([ring], (y,a,b)=>{ for (let x=a;x<b;x++) sm[(y-buf.oy)*W + x-buf.ox] = 1; }, clip);
  }
  // landmark and mall sprites too: each pixel at height z over its column's foot throws its shadow the
  // same way, so the shadow is the sprite's own silhouette, sheared and capped
  if (s >= 1) for (const k of list){
    const o = M.OBJECTS[k]; if (o.k !== 'sprite') continue;
    const sp = spriteFor(o.sprite, s); if (!sp) continue;
    const [x0, y0] = spriteOrigin(o, sp, s), foot = spriteFeet(sp);
    for (let x=0; x<sp.w; x++){ const fy = foot[x]; if (fy < 0) continue;
      for (let y=0; y<=fy; y++){ if ((sp.data[y*sp.w + x]>>>24) < 128) continue;
        const z = fy - y, off = Math.min(SHADOW.cap*s/2, z*SHADOW.k), X = Math.round(x0 + x - off*SH_X), Y = Math.round(y0 + fy + off*SH_Y);
        if (X >= buf.ox && Y >= buf.oy && X < buf.ox+W && Y < buf.oy+H) sm[(Y-buf.oy)*W + X-buf.ox] = 1; } }
  }
  const shade = rgba(SHADOW.colour), t = night() ? SHADOW.night : SHADOW.day;
  for (let q=0; q<W*H; q++) if (sm[q] && (!groundMask || (groundMask[q] && !M.isWaterT(groundMask[q]-1)))) buf.data[q] = mix(buf.data[q], shade, t);
}

/* =========================================================
   BUILDINGS
   ========================================================= */
// art-pixel geometry of a box object: corners on the ground, snapped so every edge is an exact 2:1 stair
function geom(o, s, hxOver, hyOver){
  const hx = hxOver ?? o.hx, hy = hyOver ?? o.hy;
  // half-extents along gx and gy, in x pixels (whole pixels at full scale; proportional in the small overviews)
  const ex = s >= 2 ? Math.max(1, Math.round(8*hx*s)) : Math.max(0.6, 8*hx*s), ey = s >= 2 ? Math.max(1, Math.round(8*hy*s)) : Math.max(0.6, 8*hy*s);
  const cx = Math.round(o.x*s), cy = Math.round(o.y*s);
  // gx runs right-down (2:1), gy runs left-down; corners N (back), E (right), S (front), W (left)
  return { cx, cy, ex, ey,
    N:[cx - ex + ey, cy - ex/2 - ey/2], E:[cx + ex + ey, cy + ex/2 - ey/2],
    S:[cx + ex - ey, cy + ex/2 + ey/2], W:[cx - ex - ey, cy - ex/2 + ey/2] };
}
// generated glass towers: muted and a little dark, so the landmark towers (Burj Khalifa, Emirates Towers) read as the light ones
const GLASS_STEEL = ['#5E6A76','#66717C','#6E7883','#56626D','#76808A'];
const GLASS_TEAL  = ['#57696C','#5F7174','#677A7C','#506265','#6F8183'];
const OLD_SAND    = ['#E6D1A6','#DCBD8A','#E2C698','#D3AD76','#EAD8B6'];
const WARM_LIT = ['#FFD27A','#FFC56B','#FFE0A3','#FFB85C'];
const WARM = WARM_LIT.map(rgba), SKY = rgba('#EAF4FB'), NIGHT_GLASS_L = rgba('#141C2C'), NIGHT_GLASS_R = rgba('#1A2436');
const WIN_L = rgba('#4B5B6B'), WIN_R = rgba('#5A6C7D'), WIN_HI = rgba('#8FA6B8'), WIN_NIGHT = rgba('#232B3A');

// palette and character for a building, from its style and where it stands
function material(o){
  const st = o.st, id = objId(o), pick = arr=>arr[Math.floor(h32(id, 11)*arr.length)];
  let base;
  if (st === 'glass'){ const ai = M.worldToAI(o.x, o.y); base = pick(ai.a < 6.2 ? GLASS_TEAL : GLASS_STEEL); }
  else if (st === 'old') base = pick(OLD_SAND);
  else base = o.opts && o.opts.left ? scale(rgba(o.opts.left), 1/0.9) : rgba('#E8D6B4');
  if (typeof base === 'string') base = rgba(base);
  const topOver = o.opts && o.opts.top && st === 'villa' ? rgba(o.opts.top) : 0;   // terracotta or white roofs
  return { st, id, base, topOver };
}
// a local, reusable canvas for one building: colour plus an "is filled" test via alpha
class Local {
  constructor(){ this.cap = 0; this.data = null; }
  reset(x0, y0, w, h){
    this.ox = x0; this.oy = y0; this.w = w; this.h = h;
    if (w*h > this.cap){ this.cap = w*h; this.data = new Uint32Array(this.cap); }
    else this.data.fill(0, 0, w*h);
  }
  set(x, y, c){ x -= this.ox; y -= this.oy; if (x<0||y<0||x>=this.w||y>=this.h) return; this.data[y*this.w+x] = c; }
  at(x, y){ x -= this.ox; y -= this.oy; return (x<0||y<0||x>=this.w||y>=this.h) ? 0 : this.data[y*this.w+x]; }
}
const LOC = new Local();
const N2 = c=>night() ? rgba(M.C('#' + [c&255, c>>8&255, c>>16&255].map(v=>v.toString(16).padStart(2,'0')).join(''))) : c;

// one box part: faces with their patterns. kind: 'main' | 'setback' | 'crown' | 'ac' | 'tank' | 'tower'
function boxPart(L, g, z0, h, mat, kind, s){
  const left = [g.W[0], g.W[1]-z0, g.S[0], g.S[1]-z0, g.S[0], g.S[1]-z0-h, g.W[0], g.W[1]-z0-h];
  const right = [g.S[0], g.S[1]-z0, g.E[0], g.E[1]-z0, g.E[0], g.E[1]-z0-h, g.S[0], g.S[1]-z0-h];
  const top = [g.N[0], g.N[1]-z0-h, g.E[0], g.E[1]-z0-h, g.S[0], g.S[1]-z0-h, g.W[0], g.W[1]-z0-h];
  const nt = night(), b = N2(mat.base), id = mat.id;
  const fL = scale(b, nt ? DEPTH.leftNight : DEPTH.left), fR = scale(b, nt ? DEPTH.rightNight : DEPTH.right);
  const fT = mat.topOver && kind === 'main' ? N2(mat.topOver) : scale(b, nt ? DEPTH.topNight : DEPTH.top);
  const foot = z0 === 0 && kind === 'main' ? (s >= 2 ? 2 : 1) : 0;   // the contact band's rows
  const detail = s >= 2 && (kind === 'main' || kind === 'setback' || kind === 'crown' || kind === 'tower');
  const U0 = { L: g.W[0], R: g.S[0] };
  const face = (poly, side, fc)=>{
    const ux0 = U0[side], baseY = side === 'L' ? g.W[1]-z0 : g.S[1]-z0, U = side === 'L' ? g.S[0]-g.W[0] : g.E[0]-g.S[0];
    scanPolys([poly], (y, a, bb)=>{
      for (let x=a; x<bb; x++){
        const u = x - ux0, by = side === 'L' ? baseY + (u+0.5)/2 : baseY - (u+0.5)/2, v = Math.floor(by - (y+0.5));
        const c = detail ? wallPixel(mat, side, fc, u, v, U, h, id) : fc;
        L.set(x, y, v < foot ? scale(c, DEPTH.contact) : c);
      }
    });
  };
  face(left, 'L', fL);
  face(right, 'R', fR);
  // the front corner: a 1 px dark vertical line where the two faces meet
  if (s >= 1 && kind !== 'ac'){ const cx = g.S[0] - 1, cl = scale(fL, DEPTH.corner); for (let y = Math.ceil(g.S[1]-z0-h); y < g.S[1]-z0; y++) L.set(cx, y, cl); }
  // roof, with a light rim along its front edges
  const rows = new Map();
  scanPolys([top], (y, a, bb)=>{ rows.set(y, [a, bb]); for (let x=a; x<bb; x++) L.set(x, y, roofPixel(mat, fT, x, y, kind, s)); });
  if (s >= 1){
    const rim = scale(fT, nt ? 1.25 : 1.12);
    for (const [y, [a, bb]] of rows){ const nx = rows.get(y+1); for (let x=a; x<bb; x++) if (!nx || x < nx[0] || x >= nx[1]) L.set(x, y, rim); }
  }
}
function inPoly(p, x, y){ let inside = false; for (let i=0, j=p.length/2-1; i<p.length/2; j=i++){ const xi=p[2*i], yi=p[2*i+1], xj=p[2*j], yj=p[2*j+1]; if (((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside = !inside; } return inside; }

// the facade, pixel by pixel: u across the face from its left end, v up from the ground
function wallPixel(mat, side, fc, u, v, U, H, id){
  const nt = night(), st = mat.st;
  if (u < 0 || v < 0) return fc;
  if (st === 'glass' || st === 'campus' || st === 'resort'){
    const band = st === 'glass' ? 3 : 4, floor = Math.floor(v/band), r = v % band;
    if (v < 2) return scale(fc, nt ? 0.5 : 0.78);                                       // the plinth
    if (r === 0) return scale(fc, nt ? 0.55 : 0.84);                                    // spandrel under each floor
    if (side === 'R' && u % 6 === 5) return scale(fc, nt ? 0.65 : 0.93);                // mullions on the lit face
    if (nt){
      const lit = h32(id, floor>>1, 1) < 0.32 && h32(id, floor, u>>3) < 0.75;           // whole floors lit, in clusters
      return lit ? WARM[(floor + (u>>2)) & 3] : (side === 'L' ? NIGHT_GLASS_L : NIGHT_GLASS_R);
    }
    const sheen = (u + (H - v)*0.5 + (id & 15)) % 34;                                   // one broad sky reflection
    if (sheen < 5) return mix(fc, SKY, side === 'R' ? 0.3 : 0.18);
    return r === band-1 ? scale(fc, 1.05) : fc;
  }
  if (st === 'old' && U <= 7){                                                        // a wind tower: vertical slits
    return (u % 2 === 1 && v > 1 && v < H - 2) ? (nt ? rgba('#2A1E14') : scale(fc, 0.62)) : fc;
  }
  if (st === 'old'){
    const win = (u % 6 === 2 || u % 6 === 3) && (v % 6 >= 2 && v % 6 <= 4) && u > 1 && u < U-2 && v < H-2;
    if (!win) return fc;
    if (nt) return h32(id, v/6|0, u/6|0) < 0.25 ? rgba('#FFB85C') : rgba('#2A2018');
    return scale(fc, 0.52);
  }
  if (st === 'villa'){
    const wv = Math.max(3, Math.round(H*0.35)), wins = [Math.round(U*0.22), Math.round(U*0.62)];
    const win = v >= wv && v <= wv+1 && wins.some(w0=>u >= w0 && u <= w0+2);
    if (!win) return (v === H-2 && H > 6) ? scale(fc, 0.94) : fc;                    // a parapet line
    if (nt) return h32(id, side === 'L' ? 1 : 2, u > U/2 ? 1 : 0) < 0.55 ? rgba('#FFC56B') : rgba('#232B3A');
    return rgba(side === 'L' ? '#516272' : '#62788A');
  }
  if (st === 'ind' || st === 'shed' || st === 'cont'){
    if (st === 'cont') return (u % 2 === 0) ? scale(fc, 0.84) : fc;
    if (side === 'R' && u >= U*0.3 && u < U*0.62 && v < H*0.55) return (v & 1) ? rgba(nt ? '#2E3340' : '#9C9B96') : rgba(nt ? '#262A35' : '#8C8B86');   // roller door
    if (u % 3 === 0) return scale(fc, 0.93);                                            // cladding ribs
    if (v === H-3 && (u % 4 < 2)) return nt ? rgba('#3A4152') : rgba('#AFC3D0');        // a strip of high windows
    return fc;
  }
  // apartments and offices (mid, busy, low): a window grid, some balconies, a few lit windows
  const balcony = h32(id, 5) < 0.45;
  const cu = u % 4, cv = v % 4, inside = u >= 1 && u <= U-3 && v >= 2 && v <= H-3;
  if (inside && (cu === 1 || cu === 2) && (cv === 1 || cv === 2)){
    if (nt){ const fl = v >> 2; return (h32(id, fl, 3) < 0.3 && h32(id, fl, u>>2) < 0.55) ? WARM[(fl + (u>>2)) & 3] : WIN_NIGHT; }
    return (cu === 1 && cv === 2) ? WIN_HI : (side === 'L' ? WIN_L : WIN_R);
  }
  if (balcony && inside && cv === 0) return scale(fc, nt ? 1.2 : 1.1);                 // balcony ledges under each row
  return fc;
}
function roofPixel(mat, fT, x, y, kind, s){
  if (s < 2) return fT;
  const st = mat.st;
  if (kind === 'ac') return fT;
  if ((st === 'ind' || st === 'shed') && kind === 'main'){
    if (((x - 2*y) & 3) === 0) return scale(fT, 0.94);                                // corrugated roof
    return fT;
  }
  if (h32(x, y, 13) < 0.03) return scale(fT, 0.96);
  return fT;
}

// a whole building: main body, then setbacks and crown for towers, then roof details
function drawBuilding(buf, o, s){
  const mat = material(o), id = mat.id, z0 = Math.round((o.z0||0)*s), H = Math.max(2, Math.round(o.h*s));
  const g = geom(o, s);
  const parts = [];
  const tall = !!o.tower && (o.z0||0) === 0;
  const top = h32(id, 30);   // which rooftop kit a tower gets
  if (tall){
    // a tower: its top fifth set back, 20 % narrower
    const h1 = Math.round(H*0.8);
    parts.push([g, z0, h1, 'main']);
    parts.push([geom(o, s, o.hx*0.8, o.hy*0.8), z0+h1, H-h1, 'setback']);
  } else parts.push([g, z0, H, 'main']);
  const topZ = z0 + H, roof = [];
  // roof details: a few small parts on top, placed in the roof's own coordinates
  const at = (fu, fv)=>({ x:o.x + ((fu*2-1)*o.hx*8 - (fv*2-1)*o.hy*8), y:o.y + ((fu*2-1)*o.hx*4 + (fv*2-1)*o.hy*4) });
  const small = (fu, fv, hx, hy)=>{ const p = at(fu, fv); return geom({ x:p.x, y:p.y, hx, hy }, s); };
  if (s >= 2 && (o.z0||0) === 0){
    const r1 = h32(id, 21), r2 = h32(id, 22);
    if (['mid','busy','low','campus','resort'].includes(o.st) && o.hx > 0.2){
      parts.push([small(0.3, 0.35, 0.05, 0.05), topZ, 2, 'ac']);
      if (r1 < 0.6) parts.push([small(0.68, 0.3, 0.05, 0.04), topZ, 2, 'ac']);
      if (r2 < 0.5) roof.push(['tank', at(0.6, 0.7)]);
    } else if ((o.st === 'ind' || o.st === 'shed') && o.hx > 0.3){
      parts.push([small(0.25, 0.5, 0.05, 0.05), topZ, 3, 'ac']);
      if (r1 < 0.5) parts.push([small(0.75, 0.5, 0.05, 0.05), topZ, 3, 'ac']);
    } else if (tall){
      // the rooftop kit on the setback: a mast, a helipad, plant rooms, plant and a tank, or a crown
      if (top < 0.25) roof.push(['antenna', at(0.5, 0.5)]);
      else if (top < 0.42) roof.push(['helipad', at(0.5, 0.5)]);
      else if (top < 0.62){ parts.push([small(0.35, 0.4, 0.06, 0.06), topZ, 2, 'ac']); parts.push([small(0.62, 0.6, 0.05, 0.05), topZ, 3, 'ac']); }
      else if (top < 0.8){ parts.push([small(0.4, 0.45, 0.06, 0.05), topZ, 2, 'ac']); roof.push(['tank', at(0.62, 0.62)]); }
      else parts.push([geom(o, s, o.hx*0.45, o.hy*0.45), topZ, Math.max(2, Math.round(H*0.06)), 'crown']);
    } else if (o.st === 'glass' && r1 < 0.5) parts.push([small(0.4, 0.4, 0.07, 0.07), topZ, 3, 'ac']);
    else if (o.st === 'villa' && r1 < 0.3) parts.push([small(0.3, 0.3, 0.07, 0.07), topZ, 3, 'ac']);   // a stair housing
  }
  // bounds of everything, then draw into the local canvas
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [pg, pz, ph] of parts) for (const p of [pg.N, pg.E, pg.S, pg.W]){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]-pz-ph); y1 = Math.max(y1, p[1]-pz); }
  y0 -= 18; x0 -= 3; x1 += 3; y1 += 3;
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  // nothing of this building is in the buffer: skip
  if (x1 < buf.ox || y1 < buf.oy || x0 >= buf.ox+buf.w || y0 >= buf.oy+buf.h) return;
  const L = LOC; L.reset(x0, y0, x1-x0, y1-y0);
  const acMat = { st:'ac', id, base:rgba(night() ? '#5A6070' : '#C9CDD2') };
  for (const [pg, pz, ph, kind] of parts) boxPart(L, pg, pz, ph, kind === 'ac' ? acMat : mat, kind, s);
  for (const [what, p] of roof){
    const X = Math.round(p.x*s), Y = Math.round(p.y*s) - topZ;
    if (what === 'antenna'){
      const n = 8 + Math.floor(h32(id, 23)*8), c = night() ? rgba('#6B7385') : rgba('#8D96A0');
      for (let k=0; k<n; k++) L.set(X, Y-k, c);
      L.set(X, Y-n, night() ? rgba('#FF4D3D') : rgba('#D9443A'));
    } else if (what === 'helipad'){
      const c = night() ? rgba('#5D6B82') : rgba('#B9C6D1'), rx = Math.max(3, Math.round(geomR(o, s)*0.55)), ry = rx/2;
      for (let a=0; a<64; a++){ const t = a/64*Math.PI*2; L.set(Math.round(X + Math.cos(t)*rx), Math.round(Y + Math.sin(t)*ry), c); }
      [[-1,-1],[-1,0],[-1,1],[0,0],[1,-1],[1,0],[1,1]].forEach(([dx,dy])=>L.set(X+dx, Y+dy, c));          // H
    } else if (what === 'tank'){
      const c = night() ? rgba('#7C8798') : rgba('#E9EEF2'), d = night() ? rgba('#5F6878') : rgba('#B9C3CC');
      for (let dy=0; dy<4; dy++) for (let dx=-1; dx<=1; dx++) L.set(X+dx, Y-dy, dx < 0 ? d : c);
      L.set(X, Y-4, c);
    }
  }
  // 1 px outline round the whole silhouette
  if (s >= 1){
    const out = N(M.OUT), w = L.w, hgt = L.h, d = L.data, ol = new Uint8Array(w*hgt);
    for (let y=0; y<hgt; y++) for (let x=0; x<w; x++){
      const q = y*w+x; if (d[q]) continue;
      if ((x>0 && d[q-1]) || (x<w-1 && d[q+1]) || (y>0 && d[q-w]) || (y<hgt-1 && d[q+w])) ol[q] = 1;
    }
    for (let q=0; q<w*hgt; q++) if (ol[q]) d[q] = out;
  }
  // into the buffer
  const bx0 = Math.max(L.ox, buf.ox), by0 = Math.max(L.oy, buf.oy), bx1 = Math.min(L.ox+L.w, buf.ox+buf.w), by1 = Math.min(L.oy+L.h, buf.oy+buf.h);
  for (let y=by0; y<by1; y++){
    const lrow = (y-L.oy)*L.w - L.ox, brow = (y-buf.oy)*buf.w - buf.ox;
    for (let x=bx0; x<bx1; x++){ const c = L.data[lrow+x]; if (c) buf.data[brow+x] = c; }
  }
}
const geomR = (o, s)=>8*Math.min(o.hx, o.hy)*s;

/* =========================================================
   SPRITES (landmarks and props from the art pack)
   ========================================================= */
// the night version of a sprite pixel: the same dusk mapping as the rest of the city, a touch brighter
const LIT_WINDOW = rgba('#ffd470') & 0xffffff;
function nightPx(c){
  const a = c>>>24; if (!a) return 0;
  if ((c & 0xffffff) === LIT_WINDOW) return c;   // the art's lit windows stay lit at night
  const r = c&255, g = c>>8&255, b = c>>16&255, l = (0.299*r + 0.587*g + 0.114*b)/255;
  const k = v=>Math.max(0, Math.min(255, Math.round(v)));
  return hex(k(r*0.16 + 22 + l*44), k(g*0.18 + 28 + l*46), k(b*0.24 + 46 + l*52), a);
}
// a sprite at scale s (native at full scale; averaged down for the overviews), in the current theme
function spriteFor(name, s){
  const sp = SPRITES[name]; if (!sp) return null;
  const f = Math.max(1, Math.round(S/s)), key = name + '|' + (night() ? 1 : 0) + '|' + f;
  let out = spriteCache.get(key); if (out) return out;
  let data = night() ? sp.data.map(nightPx) : sp.data, w = sp.w, h = sp.h;
  if (f > 1){
    // average f x f blocks (colour weighted by alpha); a block shows if at least half of it is opaque
    const W = Math.ceil(w/f), H = Math.ceil(h/f), d2 = new Uint32Array(W*H);
    for (let y=0; y<H; y++) for (let x=0; x<W; x++){
      let r=0, g=0, b=0, a=0, n=0;
      for (let dy=0; dy<f; dy++) for (let dx=0; dx<f; dx++){ const X = x*f+dx, Y = y*f+dy; if (X>=w || Y>=h) continue; n++; const c = data[Y*w+X], al = c>>>24; if (!al) continue; r += (c&255)*al; g += (c>>8&255)*al; b += (c>>16&255)*al; a += al; }
      if (a >= 255*n/2) d2[y*W+x] = hex(Math.round(r/a), Math.round(g/a), Math.round(b/a), 255);
    }
    data = d2; w = W; h = H;
  }
  out = { w, h, data, ax:sp.ax/f, ay:sp.ay/f };
  spriteCache.set(key, out);
  return out;
}
function spriteOrigin(o, sp, s){ return [Math.round(o.x*s) - Math.round(sp.ax), Math.round(o.y*s) - Math.round(sp.ay)]; }
function drawSprite(buf, o, s){
  const sp = spriteFor(o.sprite, s); if (!sp) return;
  const [x0, y0] = spriteOrigin(o, sp, s);
  const bx0 = Math.max(x0, buf.ox), by0 = Math.max(y0, buf.oy), bx1 = Math.min(x0+sp.w, buf.ox+buf.w), by1 = Math.min(y0+sp.h, buf.oy+buf.h);
  for (let y=by0; y<by1; y++){
    const srow = (y-y0)*sp.w - x0, brow = (y-buf.oy)*buf.w - buf.ox;
    for (let x=bx0; x<bx1; x++){ const c = sp.data[srow+x]; if ((c>>>24) >= 128) buf.data[brow+x] = (c | 0xff000000) >>> 0; }
  }
}
// the paved plaza a landmark stands on: light stone, an iso grid of joints, a kerb round the edge
function drawPlazas(buf, s, list, groundMask){
  const stone = N('#E8DCC6'), joint = N('#D6C8AE'), kerbC = N('#BFAF92'), clip = { x0:buf.ox, y0:buf.oy, x1:buf.ox+buf.w, y1:buf.oy+buf.h };
  for (const k of list){
    const o = M.OBJECTS[k]; if (o.k !== 'sprite' || (o.plot !== 'plaza' && o.plot !== 'parking')) continue;
    const L = o.plotL, hw = 8*s*L, hh = 4*s*L, cx = o.px*s, cy = o.py*s;
    const ring = [cx, cy-hh, cx+hw, cy, cx, cy+hh, cx-hw, cy];
    if (o.plot === 'parking'){
      // an iso rectangle round the building's footprint
      const ex = 8*s*o.plotHx, ey = 8*s*o.plotHy;
      const rect = [cx-ex+ey, cy-ex/2-ey/2, cx+ex+ey, cy+ex/2-ey/2, cx+ex-ey, cy+ex/2+ey/2, cx-ex-ey, cy-ex/2+ey/2];
      drawParking(buf, s, o, rect, cx, cy, ex, ey, groundMask, clip); continue;
    }
    scanPolys([ring], (y, a, b)=>{
      for (let x=a; x<b; x++){
        if (groundMask && M.isWaterT(groundMask[(y-buf.oy)*buf.w + x-buf.ox]-1)) continue;   // never pave the water
        const u = ((x + 2*y) % 16 + 16) % 16, v = ((x - 2*y) % 16 + 16) % 16;
        const edge = x - a < 2 || b - x <= 2;
        buf.data[(y-buf.oy)*buf.w + x-buf.ox] = edge && s >= 1 ? kerbC : (s >= 2 && (u < 2 || v < 2)) ? joint : stone;
      }
    }, clip);
    // a few people out on the plaza: a head, a top and legs, 1 x 4 pixels
    if (s >= 2){
      const n = 3 + L*2;
      for (let p=0; p<n; p++){
        const u = h32(k, p, 41) - 0.5, v = h32(k, p, 42) - 0.5;
        const x = Math.round(cx + (u - v)*hw*0.9), y = Math.round(cy + (u + v)*hh*0.9), top = N2(PEOPLE_TOPS[(p*3 + k) % PEOPLE_TOPS.length]);
        if (groundMask && M.isWaterT(groundMask[Math.min(buf.h-1, Math.max(0, y-buf.oy))*buf.w + Math.min(buf.w-1, Math.max(0, x-buf.ox))]-1)) continue;
        buf.put(x, y-3, N2(PEOPLE_SKIN[p % 4])); buf.put(x, y-2, top); buf.put(x, y-1, top); buf.put(x, y, N('#3A3A44'));
      }
    }
  }
}
const PEOPLE_SKIN = ['#F1C27D','#DDA46F','#B97A4C','#8D5A36'].map(rgba), PEOPLE_TOPS = ['#E86A5C','#3F7FD9','#F4F0E6','#2FA59A','#E5A93C','#1D1712','#8E5BD6'].map(rgba);
const CAR_COLS = ['#F7F4EE','#F7F4EE','#C7CED6','#C7CED6','#34343C','#34343C','#8A8F96','#3F7FD9','#E5533D'].map(rgba);
function drawParking(buf, s, o, ring, cx, cy, ex, ey, groundMask, clip){
  const asph = N('#9A938B'), bay = N('#E9E4DA'), kerb = N('#C9C1B2');
  scanPolys([ring], (y, a, b)=>{
    for (let x=a; x<b; x++){
      if (groundMask && M.isWaterT(groundMask[(y-buf.oy)*buf.w + x-buf.ox]-1)) continue;
      const edge = x - a < 2 || b - x <= 2;
      // rows of bays across one iso axis, a driving aisle between every pair of rows
      const u = ((x + 2*y) % 24 + 24) % 24, v = ((x - 2*y) % 6 + 6) % 6;
      buf.data[(y-buf.oy)*buf.w + x-buf.ox] = edge && s >= 1 ? kerb : (s >= 2 && v === 0 && u > 4) ? bay : asph;
    }
  }, clip);
  if (s < 2) return;
  // parked cars, mostly white, silver and black like a real car park, in the bay rows
  const n = Math.round(o.plotHx*o.plotHy*3);
  for (let p=0; p<n; p++){
    const u = h32(o.px|0, p, 51)*2 - 1, v = h32(o.py|0, p, 52)*2 - 1;
    const x = Math.round(cx + u*ex - v*ey), y = Math.round(cy + (u*ex + v*ey)/2), c = N2(CAR_COLS[Math.floor(h32(p, o.px|0, 53)*CAR_COLS.length)]);
    if (groundMask){ const q = Math.min(buf.h-1, Math.max(0, y-buf.oy))*buf.w + Math.min(buf.w-1, Math.max(0, x-buf.ox)); if (M.isWaterT(groundMask[q]-1)) continue; }
    for (let dx=0; dx<3; dx++){ buf.put(x+dx, y, c); buf.put(x+dx, y+1, scale(c, 0.78)); }
    buf.put(x+1, y-1, scale(c, 1.12));
  }
}
// which of an overlay sprite's pixels are still showing once everything in front is drawn
export function fxMasks(buf, s=S){
  const out = [];
  if (!chunkObjs) indexChunks();
  for (const o of M.OBJECTS){
    if (o.k !== 'sprite' || !FX_SPRITES.includes(o.id)) continue;
    const sp = spriteFor(o.sprite, s); if (!sp) continue;
    const [x0, y0] = spriteOrigin(o, sp, s);
    const bx0 = Math.max(x0, buf.ox), by0 = Math.max(y0, buf.oy), bx1 = Math.min(x0+sp.w, buf.ox+buf.w), by1 = Math.min(y0+sp.h, buf.oy+buf.h);
    if (bx1 <= bx0 || by1 <= by0) continue;
    const w = bx1-bx0, h = by1-by0, mask = new Uint8Array(w*h);
    for (let y=by0; y<by1; y++) for (let x=bx0; x<bx1; x++){
      const c = sp.data[(y-y0)*sp.w + x-x0];
      if ((c>>>24) >= 128 && buf.data[(y-buf.oy)*buf.w + x-buf.ox] === ((c | 0xff000000) >>> 0)) mask[(y-by0)*w + x-bx0] = 255;
    }
    out.push({ id:o.id, x:bx0-x0, y:by0-y0, w, h, sw:sp.w, sh:sp.h, mask });
  }
  return out;
}

/* =========================================================
   A RECTANGLE OF THE CITY
   ========================================================= */
// x0, y0, w, h in art pixels at scale s. Returns a PixelBuffer.
export function renderRect(x0, y0, w, h, s=S){
  prepare();
  const buf = new PixelBuffer(w, h, x0, y0), groundMask = new Uint8Array(w*h);
  drawGround(buf, s, groundMask);
  drawTerrains(buf, s, groundMask);
  const list = s === S && w === CH && h === CH && x0 % CH === 0 && y0 % CH === 0
    ? (chunkObjs || (indexChunks(), chunkObjs))[(y0/CH)*chunkGrid().cols + x0/CH]
    : objectsIn(x0/s, y0/s, (x0+w)/s, (y0+h)/s, s);
  drawPlazas(buf, s, list, groundMask);
  drawRoads(buf, s, groundMask);
  const ground = s >= 2 ? buf.data.slice() : null;   // to tell which water nothing stands in front of
  if (s >= 1) drawShadows(buf, s, list, groundMask);
  const ctx = new PixelCtx(buf, s);
  M.setLineWidth(1/s);
  for (const k of list){
    const o = M.OBJECTS[k];
    if (o.k === 'boat' && s >= 2 && propOk(propOf(o))){
      // a pale V of wake trailing behind the boat, away from its bow (along the 2:1 iso diagonal)
      const wc = night() ? rgba('rgba(170,200,255,0.35)') : rgba('rgba(255,255,255,0.75)'), X = Math.round(o.x*s), Y = Math.round(o.y*s);
      const bx = o.head[1] === 'e' ? 1 : -1, by = o.head[0] === 's' ? 1 : -1;
      for (let d=0; d<14; d++){ if (d % 3 === 2) continue; const t = 9 + d, x = X - bx*t, y = Y - 2 - by*(t>>1), sp = 1 + (d>>2);
        buf.put(x, y - sp, wc); buf.put(x, y + sp, wc); }
    }
    if (o.k === 'box') drawBuilding(buf, o, s);
    else if (o.k === 'sprite') drawSprite(buf, o, s);
    else if (o.k === 'camel' && propOk('camel_a')) continue;   // walking camels are drawn live by map.js
    else if (propOk(propOf(o))) drawSprite(buf, { x:o.x, y:o.y, sprite:propOf(o) }, s);
    else if (o.k === 'boat' || o.k === 'plane' || o.k === 'ship' || o.k === 'slot') continue;       // no sprite, no boat (the old vector ones are gone)
    else { try { M.drawObjectVector(ctx, o); } catch(e){ /* one odd shape never stops the city */ } }
  }
  // the water you can see (not under a boat, a bridge or a building in front)
  if (ground){
    let any = false; const water = new Uint8Array(w*h);
    for (let q=0; q<w*h; q++) if (groundMask[q] && M.isWaterT(groundMask[q]-1) && buf.data[q] === ground[q]){ water[q] = 1; any = true; }
    buf.water = any ? water : null;
  }
  if (POST){ addHaze(buf, s); addHorizon(buf, s); if (buf.water) for (let q=0; q<w*h; q++) if ((buf.data[q]>>>24) < 230) buf.water[q] = 0; }
  return buf;
}
// the soft passes over the finished pixels (edge haze, horizon); tests turn them off to compare pixels exactly
let POST = true;
export function setPost(on){ POST = !!on; }
// depth: face shading (left in shade, right lit) and the horizon's tint
// light from the upper right: the left face is in shade, the right one lit, the roof lightest
const DEPTH = { left:0.62, right:0.86, top:1.12, leftNight:0.72, rightNight:0.92, topNight:1.05,
  corner:0.78,            // the 1 px vertical line down each building's front corner (times the left face)
  contact:0.82,           // the 1-2 px band at each building's foot (times its face)
  // the horizon: three hard bands toward the sky colour, strongest at the back edge (share of the map's height)
  horizonDay:'#CFE0EC', horizonNight:'#2A3654', bands:[[0.12, 0.18], [0.24, 0.12], [0.36, 0.06]], nightBands:0.6 };
// further away (higher up the map) things take on a little of the sky: cooler and lighter
function addHorizon(buf, s){
  const col = rgba(night() ? DEPTH.horizonNight : DEPTH.horizonDay), H = M.WORLD.h, k = night() ? DEPTH.nightBands : 1;
  for (let y=0; y<buf.h; y++){
    const wy = (y + buf.oy + 0.5)/s, band = DEPTH.bands.find(([f])=>wy < H*f); if (!band) continue;
    const t = band[1]*k, row = y*buf.w;
    for (let x=0; x<buf.w; x++){ const q = row + x; if (buf.data[q]) buf.data[q] = mix(buf.data[q], col, t); }
  }
}
// the fog: the map has no hard edge, its land and sea fade through a pale haze to nothing over the last
// FOG.edge tiles (the page's own background shows through), and a fogged region (regions.js) lies under haze
const FOG = { edge:6, dayCol:'#F3E6D8', nightCol:'#121A2E', region:0.62, regionRamp:1.2 };   // ramp: km over which a region's fog thickens
function addHaze(buf, s){
  const fc = rgba(night() ? FOG.nightCol : FOG.dayCol), ox = M.WORLD.ox, oy = M.WORLD.oy, edgeTint = night() ? NIGHT_FX.hazeNight : NIGHT_FX.hazeDay;
  const fogA = M.FOG_A, aMax = M.A_MAX;
  for (let y=0; y<buf.h; y++){
    const wy = (y + buf.oy + 0.5)/s;
    for (let x=0; x<buf.w; x++){
      const q = y*buf.w + x; if (!buf.data[q]) continue;
      const wx = (x + buf.ox + 0.5)/s, a = (wx - ox)/8, b = (wy - oy)/4, gx = (a + b)/2, gy = (b - a)/2;
      const d = Math.min(gx, gy, M.COLS - gx, M.ROWS - gy);
      const te = d >= FOG.edge ? 0 : Math.min(1, (FOG.edge - Math.max(d, 0))/FOG.edge);
      const ka = aMax - gy*0.2, tr = ka < fogA ? FOG.region*Math.min(1, (fogA - ka)/FOG.regionRamp) : 0;
      if (!te && !tr) continue;
      let c = mix(buf.data[q], fc, Math.max(tr, te*edgeTint*2));
      if (te > 0){ const al = Math.round(255*(1 - te*te)); c = ((c & 0xffffff) | (al << 24)) >>> 0; }
      buf.data[q] = c;
    }
  }
}
// a prop sprite is only used once it's the new half-size art (see PROPS in landmarks.js)
let PROP_MAX = {};
export function setPropLimits(p){ PROP_MAX = p || {}; }
// which prop sprite stands in for one of the map's small things
function propOf(o){
  if (o.k === 'camel') return o.f ? 'camel_b' : 'camel_a';
  if (o.k === 'palm') return (o.s || 1) < 0.95 ? 'palm_short' : 'palm';
  if (o.k === 'boat') return o.kind + '_' + o.head;   // dhow, abra, yacht in one of four headings
  if (o.k === 'plane') return 'plane_' + o.head;
  if (o.k === 'ship') return o.kind + '_' + o.head;   // the QE2 (moored: ne or nw only)
  if (o.k === 'slot') return o.sprite;                // quay crane, container stack: once their art is in
  return null;
}
function propOk(name){ if (!name) return false; const sp = SPRITES[name], m = PROP_MAX[name]; return sp && m && sp.w <= m[0] && sp.h <= m[1]; }
export function renderChunk(cx, cy){ return renderRect(cx*CH, cy*CH, CH, CH, S); }
export function setNight(on){ M.setNight(on); }
