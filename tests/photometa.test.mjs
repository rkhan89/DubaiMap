// node --test tests/
// Import Roll: a photo's date and place read from its EXIF, photos grouped into visits by day and place, and the
// nearest place on the map suggested (within 200 m only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPhotoMeta, groupPhotos, suggestPlace } from '../photometa.js';

// a tiny JPEG: SOI, an EXIF segment (little-endian TIFF: IFD0 -> Exif IFD with DateTimeOriginal, GPS IFD), EOI
function jpeg({ date, lat, lng }){
  const b = new ArrayBuffer(400), v = new DataView(b), le = true; let p = 0;
  const u16 = x=>{ v.setUint16(p, x, le); p += 2; }, u32 = x=>{ v.setUint32(p, x, le); p += 4; };
  const t0 = 0, tiff = new DataView(b, 0);
  // TIFF header
  v.setUint8(0, 0x49); v.setUint8(1, 0x49); p = 2; u16(42); u32(8);
  // IFD0 at 8: two entries (Exif pointer, GPS pointer)
  p = 8; u16(2);
  u16(0x8769); u16(4); u32(1); u32(50);       // Exif IFD at 50
  u16(0x8825); u16(4); u32(1); u32(100);      // GPS IFD at 100
  u32(0);
  // Exif IFD at 50: DateTimeOriginal (ASCII, 20 bytes at 200)
  p = 50; u16(1); u16(0x9003); u16(2); u32(20); u32(200); u32(0);
  [...(date + '\0')].forEach((c, i)=>v.setUint8(200 + i, c.charCodeAt(0)));
  // GPS IFD at 100: N, lat (3 rationals at 240), E, lng (3 rationals at 264)
  p = 100; u16(4);
  u16(1); u16(2); u32(2); v.setUint8(p, 'N'.charCodeAt(0)); p += 4;
  u16(2); u16(5); u32(3); u32(240);
  u16(3); u16(2); u32(2); v.setUint8(p, 'E'.charCodeAt(0)); p += 4;
  u16(4); u16(5); u32(3); u32(264);
  u32(0);
  const dms = (x, at)=>{ const d = Math.floor(x), m = Math.floor((x - d)*60), s = Math.round(((x - d)*60 - m)*60*1000);
    [[d,1],[m,1],[s,1000]].forEach(([n, den], k)=>{ v.setUint32(at + k*8, n, le); v.setUint32(at + k*8 + 4, den, le); }); };
  dms(lat, 240); dms(lng, 264);
  const tiffBytes = new Uint8Array(b, 0, 300);
  const seg = new Uint8Array(4 + 6 + tiffBytes.length), sv = new DataView(seg.buffer);
  sv.setUint16(0, 0xFFE1); sv.setUint16(2, 2 + 6 + tiffBytes.length); seg.set([0x45,0x78,0x69,0x66,0,0], 4); seg.set(tiffBytes, 10);
  return new Blob([new Uint8Array([0xFF,0xD8]), seg, new Uint8Array([0xFF,0xD9])]);
}

test('the date and place a photo was taken, from its EXIF', async ()=>{
  const m = await readPhotoMeta(jpeg({ date:'2026:09:14 19:42:10', lat:25.0805, lng:55.1403 }));
  assert.equal(m.date, '2026-09-14');
  assert.ok(Math.abs(m.lat - 25.0805) < 1e-4 && Math.abs(m.lng - 55.1403) < 1e-4, JSON.stringify(m));
});
test('a photo without EXIF (or not a JPEG) says nothing', async ()=>{
  assert.deepEqual(await readPhotoMeta(new Blob([new Uint8Array([0x89, 0x50, 0x4E, 0x47])])), {});
  assert.deepEqual(await readPhotoMeta(new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])])), {});
});
test('grouped by day and place: two places the same day are two visits; no-location photos join that day', ()=>{
  const g = groupPhotos([
    { id:1, date:'2026-09-14', time:1, lat:25.0805, lng:55.1403 },
    { id:2, date:'2026-09-14', time:2, lat:25.0807, lng:55.1405 },     // 30 m away: same visit
    { id:3, date:'2026-09-14', time:3, lat:25.1972, lng:55.2744 },     // Downtown: another
    { id:4, date:'2026-09-15', time:4 },                               // no place, next day
    { id:5, date:'2026-09-15', time:5 },
  ]);
  assert.deepEqual(g.map(x=>x.photos.map(p=>p.id)), [[1, 2], [3], [4, 5]]);
  assert.deepEqual(groupPhotos(Array.from({ length:12 }, (_, i)=>({ id:i, date:'2026-09-14' })), 10).map(x=>x.photos.length), [10, 2]);
});
test('the suggested place is the nearest one on the map within 200 m, else none', ()=>{
  const venues = [{ id:'a', name:'Trattoria', lat:25.0806, lng:55.1404 }, { id:'b', name:'Far', lat:25.09, lng:55.16 }, { id:'c', name:'No spot', zone:'marina' }];
  assert.equal(suggestPlace({ at:{ lat:25.0805, lng:55.1403 } }, venues).id, 'a');
  assert.equal(suggestPlace({ at:{ lat:25.0700, lng:55.1300 } }, venues), null);
  assert.equal(suggestPlace({ at:null }, venues), null);
});
