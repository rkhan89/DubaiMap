// Bakes the terrain sprites' land masks into terrains.js, so the map's data (which tiles are land, for pins and
// areas) follows the art without loading any image. Run after changing a terrain PNG or its placement:
//   npm i --no-save sharp && node tools/terrain-prep.mjs
// A terrain sprite is drawn centred on a real point at a whole-number scale picked from its real size, and its
// pixels classed: land (sand, faces, buildings), water (its own shallows halo) or empty.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = (await import(process.env.SHARP || 'sharp')).default;

// placement: centre (real lat/lng), scale (art px per sprite px at full size, 2 art px per world unit), and why
const TERRAINS = [
  { id:'the_world_islands', sprite:'the_world_islands', centre:[25.21667, 55.16667], scale:4,
    source:'Wikipedia, The World (archipelago): 25°13′N 55°10′E, 9 x 6 km. At this projection 9 km east-west is ~1,010 art px; the art is 239 px, so x4 (956 px)',
    // the Heart of Europe's lit windows at night (its pale-blue glass pixels), and its warm blue-grey night palette
    lights:['#a0c8e8'],
    night:{ '#f4e2b0':'#8a8092', '#c4a270':'#6c6476', '#a88860':'#564f62', '#96e2d6':'#23436c', '#7ad4cc':'#1e3c63', '#68c8c4':'#19345a' } },
  { id:'palm_jebel_ali', sprite:'palm_jebel_ali', centre:[25.010, 54.985], scale:4,
    source:'Wikipedia, 25.010 N 54.985 E; 13.4 km², about twice Palm Jumeirah (Nakheel). Its trunk-to-crescent and coast-wise spans come to ~1,080 art px here; the art is 271 px, so x4',
    lights:[],   // mid-redevelopment: bare, no lights
    night:{ '#f4e2b0':'#8a8092', '#e8cc96':'#7e7586', '#c4a270':'#6c6476', '#a88860':'#564f62', '#d6b67e':'#746b7c', '#cec0a4':'#7a7484', '#96e2d6':'#23436c', '#7ad4cc':'#1e3c63', '#68c8c4':'#19345a' } },
];
const water = (r, g, b)=>g > r + 20 && b > r + 20;     // the shallows halo: turquoise
const out = [];
for (const t of TERRAINS){
  const { data, info } = await sharp(path.join(root, 'map-art', t.sprite + '.png')).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const W = info.width, H = info.height, land = new Uint8Array(Math.ceil(W*H/8)), lights = [];
  for (let y=0; y<H; y++) for (let x=0; x<W; x++){
    const q = (y*W + x)*4, r = data[q], g = data[q+1], b = data[q+2];
    if (data[q+3] < 128) continue;
    const hex = '#' + [r, g, b].map(v=>v.toString(16).padStart(2, '0')).join('');
    if (!water(r, g, b) || t.lights.includes(hex)){ const k = y*W + x; land[k>>3] |= 1 << (k & 7); }
    if (t.lights.includes(hex)) lights.push(y*W + x);
  }
  out.push({ id:t.id, sprite:t.sprite, centre:t.centre, scale:t.scale, w:W, h:H, source:t.source, night:t.night, lights, land:Buffer.from(land).toString('base64') });
}
fs.writeFileSync(path.join(root, 'terrains.js'), `// Terrain sprites (map-art/<sprite>.png): drawn on the ground, centred on a real point at a whole-number scale
// picked from the real size (scale = art px per sprite px at full size). land: one bit per sprite pixel (1 = land),
// so the map's tiles follow the art for pins and areas. lights: pixels lit at night. Made by tools/terrain-prep.mjs.
export const TERRAINS = ${JSON.stringify(out, null, 1)};
// is sprite pixel k land?
export const isLandPx = (t, k)=>{ if (!t._land) t._land = typeof atob === 'function' ? Uint8Array.from(atob(t.land), c=>c.charCodeAt(0)) : Uint8Array.from(Buffer.from(t.land, 'base64')); return (t._land[k>>3] >> (k & 7)) & 1; };
`);
console.log(out.map(t=>`${t.id} ${t.w}x${t.h} x${t.scale}, ${t.lights.length} lights`).join('\n'));
