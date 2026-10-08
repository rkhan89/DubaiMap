// Draws the landmarks the art pack doesn't have, in its style (1 px #121426 outline, shaded faces,
// a small palette, warm #ffd470 windows): the Jumeirah Beach Hotel (side-on, like the Burj Al Arab
// beside it) and Wild Wadi (isometric, on its own plot).
// Usage: npm i --no-save sharp && node tools/draw-landmarks.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PixelBuffer, fillPolys, line, thickRings, ellipseRing, rgba, scanPolys } from '../pixel.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = (await import(process.env.SHARP || 'sharp')).default;
const OUT = rgba('#121426'), LIT = rgba('#ffd470');
const hash = (x, y, s=0)=>{ let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2147483647); h = Math.imul(h ^ (h>>>13), 1274126177); return ((h ^ (h>>>16))>>>0)/4294967296; };

// a 1 px outline round everything drawn
function outline(b){
  const d = b.data, w = b.w, h = b.h, add = [];
  for (let y=0; y<h; y++) for (let x=0; x<w; x++){
    if (d[y*w+x]) continue;
    if ((x>0 && d[y*w+x-1]) || (x<w-1 && d[y*w+x+1]) || (y>0 && d[(y-1)*w+x]) || (y<h-1 && d[(y+1)*w+x])) add.push(y*w+x);
  }
  add.forEach(q=>{ d[q] = OUT; });
}
async function save(b, name){
  await sharp(Buffer.from(b.data.buffer), { raw:{ width:b.w, height:b.h, channels:4 } }).png({ compressionLevel:9 }).toFile(path.join(root, 'map-art', name + '.png'));
  console.log(name, b.w + 'x' + b.h);
}
const box = (b, cx, cy, ex, ey, z0, h, cl, cr, ct)=>{   // an iso box: ground centre (cx, cy), half-extents in x pixels
  const N=[cx-ex+ey, cy-ex/2-ey/2], E=[cx+ex+ey, cy+ex/2-ey/2], S=[cx+ex-ey, cy+ex/2+ey/2], W=[cx-ex-ey, cy-ex/2+ey/2];
  const up = p=>[p[0], p[1]-z0-h], dn = p=>[p[0], p[1]-z0];
  fillPolys(b, [[...dn(W), ...dn(S), ...up(S), ...up(W)]], cl);
  fillPolys(b, [[...dn(S), ...dn(E), ...up(E), ...up(S)]], cr);
  fillPolys(b, [[...up(N), ...up(E), ...up(S), ...up(W)]], ct);
  return { N, E, S, W };
};
const palm = (b, x, y, h)=>{
  for (let k=0; k<h; k++) b.put(x + (k > h*0.6 ? 1 : 0), y-k, rgba(k % 3 ? '#8a5a2b' : '#6b4320'));
  const tx = x+1, ty = y-h;
  for (const [dx, dy] of [[-4,1],[-3,0],[-2,-1],[-1,-1],[0,-2],[1,-1],[2,-1],[3,0],[4,1],[-2,1],[2,1],[0,-1],[-1,0],[1,0]]) b.put(tx+dx, ty+dy, rgba(dy < 0 ? '#4fa04a' : '#2f7a3a'));
};

/* ---------- the Jumeirah Beach Hotel: a breaking wave, 26 floors of blue glass and white bands ---------- */
{
  const W = 96, H = 70, b = new PixelBuffer(W, H), G = H - 4;
  const glass = ['#2e5c96','#3a6fae'].map(rgba), band = rgba('#eef2fa'), rim = rgba('#d2e2f4'), end = rgba('#1e406e');
  // the face's top edge: low at the land end, rising to the crest, which curls over at the sea end
  const top = x=>{ const t = (x-4)/80; if (x <= 84) return Math.round(14 + 46*Math.pow(Math.min(1, Math.max(0, t)), 1.6)); return Math.round(60 - (x-84)*1.6); };
  for (let x=4; x<=91; x++){
    const h = top(x);
    for (let y=G-h; y<G; y++){
      const v = G - y, rib = (x % 9) === 0;
      let c = v % 3 === 0 ? band : glass[(x >> 3) & 1];
      if (rib && v % 3) c = rgba('#5a86c0');
      if (x >= 88) c = end;                                  // the dark end of the wave
      if (v % 3 === 1 && hash(x, v) < 0.06 && x < 88) c = LIT;
      b.put(x, y, c);
    }
    b.put(x, G - h, rim); b.put(x, G - h - 1, rim);          // the light rim along the top
  }
  // a sandy podium with a pool, and palms along it
  fillPolys(b, [[2, G, 94, G, 92, G+3, 4, G+3]], rgba('#eed8ac'));
  for (let x=10; x<40; x++) b.put(x, G+1, rgba('#5cc8c8'));
  line(b, 2, G+3, 92, G+3, rgba('#a0825c'));
  palm(b, 8, G, 12); palm(b, 44, G, 10); palm(b, 60, G, 11);
  outline(b);
  await save(b, 'jumeirah_beach_hotel');
}

/* ---------- Wild Wadi: lagoons, a rock tower and three slides on a sandy plot ---------- */
{
  const W = 92, H = 78, b = new PixelBuffer(W, H), cx = W/2, base = H - 6, ex = 23, ey = 23;
  // the plot: a 2:1 diamond with a low lip
  const g = box(b, cx, base - 0, ex, ey, 0, 4, rgba('#c4a072'), rgba('#a0825c'), rgba('#eed8ac'));
  const topY = base - 4;
  // lagoons: two pools with a lighter rim
  for (const [px, py, rx, ry] of [[cx-14, topY-4, 13, 6], [cx+16, topY-2, 11, 5]]){
    fillPolys(b, [ellipseRing(px, py, rx, ry, 0, Math.PI*2)], rgba('#9fe3e8'));
    fillPolys(b, [ellipseRing(px, py+0.5, rx-2, ry-1.5, 0, Math.PI*2)], rgba('#46b3c4'));
    for (let k=0; k<6; k++) b.put(Math.round(px - rx/2 + k*rx/6), Math.round(py), rgba('#c9f2f4'));
  }
  // the rock tower at the back of the plot
  const t = box(b, cx+2, topY - 12, 6, 6, 0, 30, rgba('#b98457'), rgba('#94653f'), rgba('#d9a877'));
  for (let k=0; k<30; k+=4){ b.put(Math.round(t.W[0]+3), Math.round(t.W[1])-k-2, rgba('#7c5332')); b.put(Math.round(t.E[0]-3), Math.round(t.E[1])-k-3, rgba('#7c5332')); }
  // three slides from the top of the tower down to the pools: a dark edge, then the tube
  const slides = [
    { c:'#e86a5c', pts:[[cx+2, topY-44],[cx-8, topY-36],[cx+2, topY-26],[cx-10, topY-16],[cx-16, topY-6]] },
    { c:'#f2b84b', pts:[[cx+4, topY-44],[cx+14, topY-34],[cx+6, topY-24],[cx+18, topY-14],[cx+14, topY-4]] },
    { c:'#3f7fd9', pts:[[cx+3, topY-44],[cx-2, topY-30],[cx-22, topY-20],[cx-26, topY-8]] },
  ];
  for (const sl of slides){ fillPolys(b, thickRings(sl.pts, 4.2), OUT); fillPolys(b, thickRings(sl.pts, 2.4), rgba(sl.c)); }
  // palms and parasols round the edge
  palm(b, Math.round(g.W[0]+8), Math.round(g.W[1])-4, 11); palm(b, Math.round(g.E[0]-8), Math.round(g.E[1])-4, 12); palm(b, Math.round(cx-2), Math.round(g.S[1])-6, 10);
  for (const [px, py, c] of [[cx-26, topY+6, '#e86a5c'], [cx+24, topY+6, '#f2b84b'], [cx+4, topY+10, '#ffffff']]){ for (let dx=-2; dx<=2; dx++) b.put(px+dx, py-4, rgba(c)); b.put(px, py-3, rgba('#6b4320')); b.put(px, py-2, rgba('#6b4320')); }
  outline(b);
  await save(b, 'wild_wadi');
}

/* ---------- the malls: their real footprint, glass shopfronts, a sign band, the roof ---------- */
const { MALLS, mallBox } = await import('../landmarks.js');
const WALLS = [['#efe4cf','#d9c9ab'], ['#f4f1ea','#dcd8cf'], ['#e9d8b8','#cdb58f'], ['#e2e2dc','#c6c6be']];
const SIGNS = ['#d9443a','#3f7fd9','#2fa59a','#e5a93c','#8e5bd6','#1d1712'].map(rgba);
function mallSprite(m, k){
  const B = mallBox(m), b = new PixelBuffer(B.w, B.hgt), ex = B.ex, ey = B.ey, H = B.h;
  const cx = Math.floor(B.w/2), cy = B.hgt - 2 - (ex+ey)/2;   // footprint centre; its front corner sits on the bottom row
  const N=[cx-ex+ey, cy-ex/2-ey/2], E=[cx+ex+ey, cy+ex/2-ey/2], S=[cx+ex-ey, cy+ex/2+ey/2], W=[cx-ex-ey, cy-ex/2+ey/2];
  // walls: left the darker of the pair, right the lighter (the city's light comes from the right)
  const [wr, wl] = WALLS[k % WALLS.length].map(rgba), roofC = rgba('#f2ece0'), sign = SIGNS[k % SIGNS.length];
  const glass = rgba('#4f7fb8'), glassHi = rgba('#8fb4d8'), mull = rgba('#2e5c96');
  const shop = Math.max(3, Math.round(H*0.45)), door = Math.max(4, Math.round(H*0.6));
  const face = (A, Bp, side, base)=>{
    const poly = [A[0], A[1], Bp[0], Bp[1], Bp[0], Bp[1]-H, A[0], A[1]-H], U = Bp[0]-A[0], slope = (Bp[1]-A[1])/U;
    scanPolys([poly], (y, a, c)=>{ for (let x=a; x<c; x++){
      const u = x - A[0], v = Math.floor(A[1] + (u+0.5)*slope - (y+0.5));
      let col = base;
      if (v >= 1 && v < shop) col = (u % 6 === 0) ? mull : (v === shop-1 ? glassHi : glass);            // shopfronts
      if (v === H-3 || v === H-4) col = sign;                                                           // the sign band
      if (side === 'R' && Math.abs(u - U/2) < 3 && v < door) col = v === door-1 ? rgba('#f4f1ea') : rgba('#2e3f5c');   // the entrance under its canopy
      b.put(x, y, col);
    } });
  };
  face(W, S, 'L', wl); face(S, E, 'R', wr);
  const top = [N[0], N[1]-H, E[0], E[1]-H, S[0], S[1]-H, W[0], W[1]-H];
  scanPolys([top], (y, a, c)=>{ for (let x=a; x<c; x++){
    let col = roofC;
    if (m.roof === 'skylight' && ((x - 2*y) % 10 + 10) % 10 < 2) col = rgba('#9fc4e0');                 // skylight strips
    if (m.roof === 'garden' && hash(x, y, k) < 0.35) col = rgba(hash(x, y, k+1) < 0.5 ? '#6db35a' : '#4f9a45');
    if (m.roof === 'scales') col = (((x + 2*y) >> 2) + ((x - 2*y) >> 2)) & 1 ? rgba('#3f7fd9') : rgba('#2e5c96');   // Dragon Mart's blue scales
    b.put(x, y, col);
  } });
  line(b, W[0], W[1]-H, S[0]-1, S[1]-H, rgba('#fbf8f2')); line(b, S[0], S[1]-H, E[0]-1, E[1]-H, rgba('#fbf8f2'));   // the roof's front rim
  const rx = cx, ry = cy - H;   // the middle of the roof
  if (m.roof === 'atrium'){      // a glass dome over the atrium
    fillPolys(b, [ellipseRing(rx, ry-2, 9, 9, Math.PI, 0)], rgba('#8fb4d8'));
    for (let a=-8; a<=8; a+=4) line(b, rx+a, ry-2, rx+a*0.4, ry-10, rgba('#5a86c0'));
    fillPolys(b, [ellipseRing(rx, ry-2, 9, 3, 0, Math.PI*2)], rgba('#cfe2f2'));
  }
  if (m.roof === 'pyramids'){     // Wafi's pyramids, gold and sand
    for (const [dx, h, c] of [[-8, 12, '#e5c27a'], [7, 9, '#d9b35b']]){
      const x0 = rx+dx, y0 = ry+2;
      fillPolys(b, [[x0-7, y0, x0, y0-h, x0, y0+3]], rgba(c));
      fillPolys(b, [[x0, y0-h, x0+7, y0, x0, y0+3]], rgba('#b58f45'));
    }
  }
  if (m.roof === 'domes'){        // a row of domes along Ibn Battuta's length (it runs along the coast: from W to N on the roof)
    const n = 6;
    for (let q=0; q<n; q++){
      const t = (q+0.5)/n, x0 = Math.round((W[0] + (N[0]-W[0])*t + S[0] + (E[0]-S[0])*t)/2), y0 = Math.round((W[1] + (N[1]-W[1])*t + S[1] + (E[1]-S[1])*t)/2 - H);
      fillPolys(b, [ellipseRing(x0, y0, 4, 4, Math.PI, 0)], rgba(q % 2 ? '#e8c890' : '#7fb0c8'));
      fillPolys(b, [ellipseRing(x0, y0, 4, 1.5, 0, Math.PI*2)], rgba('#f4e6c8'));
    }
  }
  if (m.roof !== 'garden' && m.roof !== 'scales') for (const [fx, fy] of [[-0.4, -0.2], [0.35, 0.25]]){   // rooftop units
    const x0 = Math.round(rx + fx*ex), y0 = Math.round(ry + fy*ey*0.5);
    fillPolys(b, [[x0-2, y0, x0, y0+1, x0, y0-2, x0-2, y0-3]], rgba('#9aa0a7'));
    fillPolys(b, [[x0, y0+1, x0+2, y0, x0+2, y0-3, x0, y0-2]], rgba('#b9bec4'));
    fillPolys(b, [[x0-2, y0-3, x0, y0-4, x0+2, y0-3, x0, y0-2]], rgba('#d9dde1'));
  }
  outline(b);
  return b;
}
for (const [k, m] of MALLS.entries()) await save(mallSprite(m, k), 'mall_' + m.id);

/* ---------- Global Village: pavilions round a square, the big wheel, the gate ---------- */
{
  const W = 108, H = 96, b = new PixelBuffer(W, H), cx = 54, ex = 25, ey = 25, cy = H - 4 - (ex+ey)/2;
  const ground = box(b, cx, cy, ex, ey, 0, 3, rgba('#a0825c'), rgba('#c4a072'), rgba('#e8dcc6'));
  const at = (u, v)=>[cx + (u - v)*ex, cy - 3 + (u + v)*ey/2];     // u, v in -1..1 across the plot
  line(b, ...at(-1, 0), ...at(1, 0), rgba('#d6c8ae')); line(b, ...at(0, -1), ...at(0, 1), rgba('#d6c8ae'));   // paths
  // the ring of country pavilions, each its own colour (left face dark, right mid, top light)
  const cols = [['#e86a5c','#c94f43','#f4a196'], ['#3f7fd9','#2e5c96','#8fb4e8'], ['#e5a93c','#b8862a','#f6d38a'], ['#2fa59a','#1f7d74','#7fd0c8'], ['#8e5bd6','#6a3fb0','#c3a2ef'], ['#5f9e3e','#457a2c','#a6d38a'], ['#e1699a','#b84a78','#f3a9c6'], ['#f4f1ea','#d9d4c9','#ffffff']].map(c=>c.map(rgba));
  const ring = [[-0.7,-0.7],[-0.15,-0.8],[0.45,-0.75],[0.8,-0.2],[0.8,0.45],[-0.8,0.2],[-0.75,0.7],[0.3,0.8]];
  ring.sort((p,q)=>(p[0]+p[1])-(q[0]+q[1])).forEach(([u,v], k)=>{
    const [x,y] = at(u,v), c = cols[k % cols.length], h = 6 + (k % 3)*2;
    box(b, x, y, 5, 4, 0, h, c[1], c[0], c[2]);
  });
  { const [x,y] = at(0,0); box(b, x, y, 5, 5, 0, 3, rgba('#3e3226'), rgba('#5a4a3a'), rgba('#7a6650')); fillPolys(b, [[x-6, y-3, x, y-9, x+6, y-3, x, y-6]], rgba('#d9443a')); }   // the main stage
  // the big wheel at the back
  { const [x, y] = at(-0.35, -0.35), wcy = y - 34, R = 16;
    line(b, x-7, y, x, wcy, rgba('#9aa0a7')); line(b, x+7, y, x, wcy, rgba('#9aa0a7')); line(b, x-6, y, x+1, wcy, rgba('#7b8087'));
    for (let a=0; a<12; a++){ const t = a/12*Math.PI*2; line(b, x, wcy, x + Math.cos(t)*R, wcy + Math.sin(t)*R, rgba('#c9ced4')); }
    for (let a=0; a<96; a++){ const t = a/96*Math.PI*2; b.put(Math.round(x + Math.cos(t)*R), Math.round(wcy + Math.sin(t)*R), rgba('#f4f1ea')); }
    for (let a=0; a<12; a++){ const t = a/12*Math.PI*2, gx = Math.round(x + Math.cos(t)*R), gy = Math.round(wcy + Math.sin(t)*R), c = cols[a % cols.length][0];
      b.put(gx, gy+1, c); b.put(gx+1, gy+1, c); b.put(gx, gy+2, c); b.put(gx+1, gy+2, c); b.put(gx-1, gy, rgba('#ffd470')); }
    b.put(x, wcy, rgba('#ffd470'));
  }
  // the gate at the front: two pillars and a rainbow arch
  { const [x, y] = at(0.92, 0.92), gx = x, gy = y - 2;
    for (const dx of [-7, 6]) fillPolys(b, [[gx+dx, gy, gx+dx+2, gy, gx+dx+2, gy-14, gx+dx, gy-14]], rgba('#b84a3a'));
    ['#e86a5c','#e5a93c','#5f9e3e','#3f7fd9','#8e5bd6'].forEach((c, k)=>fillPolys(b, [ellipseRing(gx, gy-13, 9-k, 6-k*0.8, Math.PI, 0)], rgba(c)));
  }
  palm(b, Math.round(ground.W[0]+10), Math.round(ground.W[1])-2, 11); palm(b, Math.round(ground.E[0]-10), Math.round(ground.E[1])-2, 10); palm(b, Math.round(ground.S[0]-14), Math.round(ground.S[1])-6, 9);
  outline(b);
  await save(b, 'global_village');
}
