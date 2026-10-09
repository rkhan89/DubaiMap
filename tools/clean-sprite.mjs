// Takes leftover pieces out of a sprite: every pixel of the given colours goes, then any pixel of a "with"
// colour touching what went (a highlight along the removed edge), then outline pixels left touching nothing.
// The newly bare edges get the 1 px outline back. The canvas size (and so the anchor) stays the same.
//   npm i --no-save sharp && node tools/clean-sprite.mjs <map-art/name.png> <#hex,#hex,...> [with=#hex,...]
// Used on atlantis_the_palm.png: the navy waterline triangles (#1c3864) and the tan driveway wedge
// (#d6c8aa, its edge #7e6e5c and its highlight #fcecc8) under the hotel.
import fs from 'fs';
const sharp = (await import(process.env.SHARP || 'sharp')).default;
const [file, cols, withArg] = process.argv.slice(2);
if (!file || !fs.existsSync(file) || !cols) throw new Error('usage: clean-sprite.mjs <png> <#hex,...> [with=#hex,...]');
const key = h=>parseInt(h.replace('#',''), 16);
const gone = new Set(cols.split(',').map(key)), along = new Set((withArg||'').replace('with=','').split(',').filter(Boolean).map(key));
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
const W = info.width, H = info.height, px = (x,y)=>(y*W+x)*4;
const rgb = q=>(data[q]<<16)|(data[q+1]<<8)|data[q+2], opaque = (x,y)=>x>=0 && y>=0 && x<W && y<H && data[px(x,y)+3] > 0;
// the outline is the sprite's darkest colour
let OUT = 0, dark = Infinity;
for (let q=0; q<W*H*4; q+=4) if (data[q+3]){ const l = data[q]*0.299 + data[q+1]*0.587 + data[q+2]*0.114; if (l < dark){ dark = l; OUT = rgb(q); } }
const removed = new Uint8Array(W*H);
for (let y=0; y<H; y++) for (let x=0; x<W; x++){ const q = px(x,y); if (data[q+3] && gone.has(rgb(q))){ data[q+3] = 0; removed[y*W+x] = 1; } }
// the highlight along a removed edge goes with it
for (let grew = true; grew; ){ grew = false;
  for (let y=0; y<H; y++) for (let x=0; x<W; x++){ const q = px(x,y); if (!data[q+3] || !along.has(rgb(q))) continue;
    let near = false; for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++){ const X=x+dx, Y=y+dy; if (X>=0 && Y>=0 && X<W && Y<H && removed[Y*W+X]) near = true; }
    if (near){ data[q+3] = 0; removed[y*W+x] = 1; grew = true; } } }
// outline pixels that now outline nothing
const isBody = (x,y)=>opaque(x,y) && rgb(px(x,y)) !== OUT;
for (let y=0; y<H; y++) for (let x=0; x<W; x++){ const q = px(x,y); if (!data[q+3] || rgb(q) !== OUT) continue;
  if (!isBody(x-1,y) && !isBody(x+1,y) && !isBody(x,y-1) && !isBody(x,y+1)) data[q+3] = 0; }
// the bare edges get their outline back
const add = [];
for (let y=0; y<H; y++) for (let x=0; x<W; x++) if (!opaque(x,y) && (isBody(x-1,y) || isBody(x+1,y) || isBody(x,y-1) || isBody(x,y+1))) add.push(px(x,y));
for (const q of add){ data[q] = OUT>>16 & 255; data[q+1] = OUT>>8 & 255; data[q+2] = OUT & 255; data[q+3] = 255; }
await sharp(data, { raw:{ width:W, height:H, channels:4 } }).png({ compressionLevel:9 }).toFile(file + '.tmp');
fs.renameSync(file + '.tmp', file);
console.log(file, W + 'x' + H, 'removed', removed.reduce((s,v)=>s+v, 0), 'px, outline added', add.length);
