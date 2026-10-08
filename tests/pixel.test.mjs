// node --test tests/
// The map's pixel rasteriser: exact isometric diamonds, no gaps or overlaps between shapes that share
// an edge, colour parsing, and a whole chunk of the city rendering the same way every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PixelBuffer, PixelCtx, fillPolys, rgba, scanPolys } from '../pixel.js';

test('colours: hex and rgba() pack to the same little-endian RGBA', ()=>{
  assert.equal(rgba('#ff8000'), (255<<24 | 0<<16 | 0x80<<8 | 0xff) >>> 0);
  assert.equal(rgba('rgba(255,128,0,0.5)') >>> 24, 128);
  assert.equal(rgba('#fff'), rgba('#ffffff'));
});

test('a 32x16 tile is a clean 2:1 diamond: rows 2, 6, 10 … 30, 30 … 2 pixels wide', ()=>{
  const widths = [];
  scanPolys([[16,0, 32,8, 16,16, 0,8]], (y, a, b)=>{ widths[y] = b - a; });
  assert.deepEqual(widths, [2,6,10,14,18,22,26,30,30,26,22,18,14,10,6,2]);
});

test('neighbouring tiles share their edges with no gap and no overlap', ()=>{
  const buf = new PixelBuffer(64, 32), hits = new Uint8Array(64*32);
  const tile = (X, Y)=>[X,Y, X+16,Y+8, X,Y+16, X-16,Y+8];
  for (const [X, Y] of [[32,0],[48,8],[16,8],[32,16]]) scanPolys([tile(X, Y)], (y, a, b)=>{ for (let x=a; x<b; x++) if (x>=0&&x<64&&y>=0&&y<32) hits[y*64+x]++; });
  // the middle of the four-tile patch is covered exactly once everywhere
  for (let y=8; y<24; y++) for (let x=28; x<36; x++) assert.equal(hits[y*64+x], 1, `pixel ${x},${y}`);
  assert.ok(buf);
});

test('PixelCtx draws hard pixels: one colour inside, untouched outside, 1 px strokes', ()=>{
  const buf = new PixelBuffer(40, 40), ctx = new PixelCtx(buf, 2);
  ctx.fillStyle = '#336699'; ctx.beginPath(); ctx.rect(5, 5, 10, 10); ctx.fill();
  const c = rgba('#336699'), colours = new Set(buf.data);
  assert.deepEqual([...colours].sort(), [0, c].sort());          // nothing blended: just empty and the fill
  assert.equal(buf.get(10, 10), c); assert.equal(buf.get(9, 9), 0); assert.equal(buf.get(30, 30), 0);
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(1, 1); ctx.lineTo(1, 15); ctx.stroke();
  let n = 0; for (let x=0; x<40; x++) if (buf.get(x, 20) === rgba('#000000')) n++;
  assert.equal(n, 1);                                               // a hairline stays one pixel wide
});

test('a chunk of the city renders the same pixels every time (so chunks join up)', async ()=>{
  const R = await import('../mapraster.js');
  const a = R.renderChunk(15, 5), b = R.renderChunk(15, 5);
  assert.equal(a.data.length, R.CH*R.CH);
  assert.deepEqual(a.data, b.data);
  // it isn't empty: ground everywhere in the middle of the city
  let empty = 0; for (const v of a.data) if (!v) empty++;
  assert.ok(empty < a.data.length*0.01, 'empty pixels: '+empty);
});

test('a building straddling two chunks lines up across the seam', async ()=>{
  const R = await import('../mapraster.js');
  const whole = R.renderRect(15*R.CH, 5*R.CH, R.CH*2, R.CH);
  const left = R.renderChunk(15, 5), right = R.renderChunk(16, 5);
  for (let y=0; y<R.CH; y++) for (const [x, part, px] of [[R.CH-1, left, R.CH-1], [R.CH, right, 0]])
    assert.equal(whole.data[y*R.CH*2 + x], part.data[y*R.CH + px], `row ${y}`);
});

test('the shipped map overviews match the current art revision (rebuild with tools/build-overviews.mjs)', async ()=>{
  const fs = await import('fs');
  const rev = Number((fs.readFileSync(new URL('../map.js', import.meta.url), 'utf8').match(/const ART_REV = (\d+)/) || [])[1]);
  for (const t of ['day','night']) for (const s of ['lo','mid'])
    assert.ok(fs.existsSync(new URL(`../map-art/overview/r${rev}-${t}-${s}.webp`, import.meta.url)), `missing r${rev}-${t}-${s}.webp`);
});
