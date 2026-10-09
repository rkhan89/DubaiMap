// Prepares art-pack sprites for the map, from the pack's original files:
//  - props (camel_a/b, palm, palm_short) at half size, pixel-art style: each 2x2
//    block takes its commonest colour (ties go to the darker, so outlines and thin parts survive),
//    then a 1 px outline is redrawn round the new silhouette
//  - museum_of_the_future and dubai_frame flattened to 16 colours, no dithering
// Usage: npm i --no-save sharp && node tools/art-prep.mjs <folder with the pack's PNGs>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = (await import(process.env.SHARP || 'sharp')).default;
const src = process.argv[2];
if (!src || !fs.existsSync(src)) throw new Error('give the folder with the original art pack PNGs');
const out = path.join(root, 'map-art');

const read = async f=>{ const { data, info } = await sharp(path.join(src, f)).ensureAlpha().raw().toBuffer({ resolveWithObject:true }); return { w:info.width, h:info.height, d:new Uint32Array(data.buffer, data.byteOffset, info.width*info.height).slice() }; };
const write = (img, f)=>sharp(Buffer.from(img.d.buffer), { raw:{ width:img.w, height:img.h, channels:4 } }).png({ compressionLevel:9 }).toFile(path.join(out, f));
const lum = c=>0.299*(c&255) + 0.587*(c>>8&255) + 0.114*(c>>16&255);

function halve(img){
  const w = Math.ceil(img.w/2), h = Math.ceil(img.h/2), d = new Uint32Array(w*h);
  let outline = 0, darkest = Infinity;
  for (const c of img.d) if ((c>>>24) >= 128 && lum(c) < darkest){ darkest = lum(c); outline = c; }
  for (let y=0; y<h; y++) for (let x=0; x<w; x++){
    const cs = [];
    for (let dy=0; dy<2; dy++) for (let dx=0; dx<2; dx++){ const X = x*2+dx, Y = y*2+dy; if (X<img.w && Y<img.h){ const c = img.d[Y*img.w + X]; if ((c>>>24) >= 128) cs.push((c | 0xff000000) >>> 0); } }
    if (cs.length < 2) continue;
    const n = new Map(); cs.forEach(c=>n.set(c, (n.get(c)||0) + 1));
    d[y*w + x] = [...n.entries()].sort((a,b)=>b[1]-a[1] || lum(a[0])-lum(b[0]))[0][0];
  }
  // the outline: every opaque pixel touching transparency (or the edge)
  const o = d.slice();
  for (let y=0; y<h; y++) for (let x=0; x<w; x++){
    if (!d[y*w + x]) continue;
    const edge = x===0 || y===0 || x===w-1 || y===h-1 || !d[y*w + x-1] || !d[y*w + x+1] || !d[(y-1)*w + x] || !d[(y+1)*w + x];
    if (edge) o[y*w + x] = (outline | 0xff000000) >>> 0;
  }
  return { w, h, d:o };
}
for (const f of ['camel_a','camel_b','palm','palm_short']){   // the boats come ready-made in four headings (fix pack)
  const img = halve(await read(f + '.png'));
  await write(img, f + '.png');
  console.log(f, img.w + 'x' + img.h);
}

// flatten to 16 colours: libimagequant without dithering, alpha kept hard
for (const f of ['museum_of_the_future','dubai_frame']){
  const img = await read(f + '.png');
  for (let q=0; q<img.d.length; q++) img.d[q] = (img.d[q]>>>24) >= 128 ? (img.d[q] | 0xff000000) >>> 0 : 0;
  const pal = await sharp(Buffer.from(img.d.buffer), { raw:{ width:img.w, height:img.h, channels:4 } }).png({ palette:true, colours:16, dither:0, effort:10 }).toBuffer();
  const back = await sharp(pal).ensureAlpha().raw().toBuffer();
  const d = new Uint32Array(back.buffer, back.byteOffset, img.w*img.h).slice();
  for (let q=0; q<d.length; q++) d[q] = (d[q]>>>24) >= 128 ? (d[q] | 0xff000000) >>> 0 : 0;
  await write({ w:img.w, h:img.h, d }, f + '.png');
  console.log(f, img.w + 'x' + img.h, new Set(d.filter(c=>c)).size, 'colours');
}
