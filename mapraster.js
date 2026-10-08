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

export const S = 2;          // art pixels per world unit (the approved scale)
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
  if (o.k==='rail') return [Math.min(o.x0,o.x1)-6, Math.min(o.y0,o.y1)-14, Math.max(o.x0,o.x1)+6, Math.max(o.y0,o.y1)+6];
  if (o.k==='lm') return [o.x-70, o.y-280, o.x+70, o.y+40];
  if (o.k==='lm2') return [o.x-70, o.y-140, o.x+70, o.y+40];
  if (o.k==='plane' || o.k==='crane') return [o.x-30, o.y-50, o.x+30, o.y+16];
  return [o.x-20, o.y-40, o.x+20, o.y+12];
}
// which objects touch each chunk, in the global depth order
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
    const k = r*COLS + c, t = tt[k], water = isW(t), base = TB[t];
    const X = (c-r)*hw + ox, Y = (c+r)*hh + oy;
    const backL = !water && c>0 && isW(tt[k-1]), backR = !water && r>0 && isW(tt[k-COLS]);
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
    const dR = c===COLS-1 ? slab : (!water && isW(tt[k+1]) ? lip : 0);
    const dL = r===ROWS-1 ? slab : (!water && isW(tt[k+COLS]) ? lip : 0);
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
        if (x < buf.ox || y < buf.oy || x >= buf.ox+W || y >= buf.oy+H) continue;
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
  // the Dubai Tram: twin teal rails on a dark bed
  const tram = M.TRAM.map(([a,i])=>{ const p = M.aiToWorld(a,i); return [p.x*s, p.y*s]; });
  fillPolys(buf, thickRings(tram, 3*s), N(M.OUT));
  fillPolys(buf, thickRings(tram, 1.8*s), N('#3FB8AF'));
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
function drawShadows(buf, s, list, groundMask){
  const W = buf.w, H = buf.h, sm = new Uint8Array(W*H), clip = { x0:buf.ox, y0:buf.oy, x1:buf.ox+W, y1:buf.oy+H };
  for (const k of list){
    const o = M.OBJECTS[k]; if (o.k !== 'box' || (o.z0||0) > 0 || o.h < 3) continue;
    const g = geom(o, s), L = o.h*0.55*s, dx = -L*0.894, dy = L*0.447;   // along +gy on screen: left and down
    const base = [g.N, g.E, g.S, g.W];
    const ring = hull(base.concat(base.map(p=>[p[0]+dx, p[1]+dy]))).flat();
    scanPolys([ring], (y,a,b)=>{ for (let x=a;x<b;x++) sm[(y-buf.oy)*W + x-buf.ox] = 1; }, clip);
  }
  const shade = night() ? rgba('#05070D') : rgba('#3A3150'), t = night() ? 0.35 : 0.24;
  for (let q=0; q<W*H; q++) if (sm[q] && (!groundMask || groundMask[q])) buf.data[q] = mix(buf.data[q], shade, t);
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
const GLASS_STEEL = ['#6E8FB0','#7B9BBA','#88A6C3','#5F80A2','#93AFC9'];
const GLASS_TEAL  = ['#5C9DA7','#6CADB4','#7BB9BD','#4D8D98','#8AC4C5'];
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
  const fL = scale(b, nt ? 0.8 : 0.72), fR = scale(b, nt ? 0.95 : 0.88);
  const fT = mat.topOver && kind === 'main' ? N2(mat.topOver) : scale(b, nt ? 1.05 : 1.08);
  const detail = s >= 2 && (kind === 'main' || kind === 'setback' || kind === 'crown' || kind === 'tower');
  const U0 = { L: g.W[0], R: g.S[0] };
  const face = (poly, side, fc)=>{
    const ux0 = U0[side], baseY = side === 'L' ? g.W[1]-z0 : g.S[1]-z0, U = side === 'L' ? g.S[0]-g.W[0] : g.E[0]-g.S[0];
    scanPolys([poly], (y, a, bb)=>{
      for (let x=a; x<bb; x++){
        const u = x - ux0, by = side === 'L' ? baseY + (u+0.5)/2 : baseY - (u+0.5)/2, v = Math.floor(by - (y+0.5));
        L.set(x, y, detail ? wallPixel(mat, side, fc, u, v, U, h, id) : fc);
      }
    });
  };
  face(left, 'L', fL);
  face(right, 'R', fR);
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
  const tall = o.st === 'glass' && o.h > 34 && (o.z0||0) === 0;
  const top = h32(id, 30);   // tower tops: a spire, a stepped top, one setback, or flat
  if (tall && top < 0.22){
    const h1 = Math.round(H*0.78), h2 = Math.round(H*0.14), h3 = H - h1 - h2;
    parts.push([g, z0, h1, 'main']);
    parts.push([geom(o, s, o.hx*0.78, o.hy*0.78), z0+h1, h2, 'setback']);
    parts.push([geom(o, s, o.hx*0.5, o.hy*0.5), z0+h1+h2, h3, 'crown']);
  } else if (tall && top < 0.5){
    const h1 = Math.round(H*0.84);
    parts.push([g, z0, h1, 'main']);
    parts.push([geom(o, s, o.hx*0.72, o.hy*0.72), z0+h1, H-h1, 'setback']);
  } else if (tall && top < 0.68){
    const h1 = Math.round(H*0.9);
    parts.push([g, z0, h1, 'main']);
    parts.push([geom(o, s, o.hx, o.hy*0.55), z0+h1, H-h1, 'setback']);
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
      if (top < 0.22 || r1 < 0.3) roof.push(['antenna', at(0.5, 0.5)]);
      else if (top >= 0.68 && r1 < 0.75) roof.push(['helipad', at(0.5, 0.5)]);
      else parts.push([small(0.35, 0.4, 0.06, 0.06), topZ, 2, 'ac']);
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
   A RECTANGLE OF THE CITY
   ========================================================= */
// x0, y0, w, h in art pixels at scale s. Returns a PixelBuffer.
export function renderRect(x0, y0, w, h, s=S){
  prepare();
  const buf = new PixelBuffer(w, h, x0, y0), groundMask = new Uint8Array(w*h);
  drawGround(buf, s, groundMask);
  drawRoads(buf, s, groundMask);
  const list = s === S && w === CH && h === CH && x0 % CH === 0 && y0 % CH === 0
    ? (chunkObjs || (indexChunks(), chunkObjs))[(y0/CH)*chunkGrid().cols + x0/CH]
    : objectsIn(x0/s, y0/s, (x0+w)/s, (y0+h)/s, s);
  if (s >= 1) drawShadows(buf, s, list, groundMask);
  const ctx = new PixelCtx(buf, s);
  M.setLineWidth(1/s);
  for (const k of list){
    const o = M.OBJECTS[k];
    if (o.k === 'box') drawBuilding(buf, o, s);
    else { try { M.drawObjectVector(ctx, o); } catch(e){ /* one odd shape never stops the city */ } }
  }
  return buf;
}
export function renderChunk(cx, cy){ return renderRect(cx*CH, cy*CH, CH, CH, S); }
export function setNight(on){ M.setNight(on); }
