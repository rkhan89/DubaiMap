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
