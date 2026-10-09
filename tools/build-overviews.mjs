// Renders the whole pixel city (day and night) at full scale and averages it down into the two
// overviews the map shows when zoomed out: mid (1/2) and lo (1/4), as WebP in map-art/overview/.
// Run after changing anything mapraster.js draws (and bump ART_REV in map.js first):
//   npm i --no-save sharp && node tools/build-overviews.mjs
// The map loads these instead of building its overviews on the phone.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = (await import(process.env.SHARP || 'sharp')).default;
const R = await import(new URL('../mapraster.js', import.meta.url));
const L = await import(new URL('../landmarks.js', import.meta.url));
const rev = Number((fs.readFileSync(path.join(root, 'map.js'), 'utf8').match(/const ART_REV = (\d+)/) || [])[1]);
if (!rev) throw new Error('ART_REV not found in map.js');

// the sprites, as map.js hands them over (anchor = bottom centre of the canvas)
const sprites = {};
for (const n of L.SPRITE_FILES){
  const f = path.join(root, 'map-art', n + '.png'); if (!fs.existsSync(f)) continue;
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const d = new Uint32Array(data.buffer, data.byteOffset, info.width*info.height).slice();
  sprites[n] = { w:info.width, h:info.height, data:d, ax:info.width/2, ay:info.height };
}
R.setSprites(sprites); R.setPropLimits(L.PROPS);

// average f x f blocks, colour weighted by alpha (the same "average down" the map uses)
function boxDown(src, W, H, f){
  const w = Math.ceil(W/f), h = Math.ceil(H/f), out = new Uint8ClampedArray(w*h*4);
  for (let y=0; y<h; y++) for (let x=0; x<w; x++){
    let r=0, g=0, b=0, a=0, n=0;
    for (let dy=0; dy<f; dy++) for (let dx=0; dx<f; dx++){
      const X = x*f+dx, Y = y*f+dy; if (X>=W || Y>=H) continue; n++;
      const c = src[Y*W + X], al = c>>>24; if (!al) continue;
      r += (c&255)*al; g += (c>>8&255)*al; b += (c>>16&255)*al; a += al;
    }
    const q = (y*w + x)*4;
    if (a){ out[q] = r/a; out[q+1] = g/a; out[q+2] = b/a; out[q+3] = a/n; }
  }
  return { w, h, data:out };
}
const dir = path.join(root, 'map-art', 'overview');
fs.mkdirSync(dir, { recursive:true });
for (const f of fs.readdirSync(dir)) if (!f.startsWith(`r${rev}-`)) fs.unlinkSync(path.join(dir, f));   // older revisions go
for (const theme of ['day', 'night']){
  const t0 = Date.now();
  R.setNight(theme === 'night');
  const a = R.artSize(), g = R.chunkGrid(), CH = R.CH, full = new Uint32Array(a.w*a.h);
  for (let cy=0; cy<g.rows; cy++) for (let cx=0; cx<g.cols; cx++){
    const b = R.renderChunk(cx, cy);
    for (let y=0; y<CH; y++){ const Y = cy*CH + y; if (Y >= a.h) break; const n = Math.min(CH, a.w - cx*CH); full.set(b.data.subarray(y*CH, y*CH + n), Y*a.w + cx*CH); }
  }
  for (const [name, f] of [['mid', 2], ['lo', 4]]){
    const d = boxDown(full, a.w, a.h, f);
    const file = path.join(dir, `r${rev}-${theme}-${name}.webp`);
    await sharp(Buffer.from(d.data.buffer), { raw:{ width:d.w, height:d.h, channels:4 } }).webp({ quality:90, alphaQuality:100, effort:6 }).toFile(file);
    console.log(path.relative(root, file), d.w + 'x' + d.h, (fs.statSync(file).size/1e6).toFixed(2) + ' MB');
  }
  console.log(theme, 'done in', Date.now()-t0, 'ms');
}
