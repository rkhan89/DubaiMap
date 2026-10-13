// Import Roll: when and where each photo was taken (from the JPEG's EXIF, read before the photo is shrunk, which drops
// it), photos grouped into visits by day and place, and the place each group most likely is (the nearest place
// already on the map you can see). Pure except readPhotoMeta, which reads a File; nothing leaves the phone.
// Phones often strip GPS from photos picked in a browser; then the group is by day only and nothing is suggested.

// { date:'YYYY-MM-DD', time:ms, lat, lng } as far as the file says; {} if it says nothing (or isn't a JPEG)
export async function readPhotoMeta(file){
  try{
    const v = new DataView(await file.slice(0, 256*1024).arrayBuffer());
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return {};
    for (let o = 2; o + 10 < v.byteLength; ){
      const m = v.getUint16(o); if ((m & 0xFF00) !== 0xFF00) break;
      if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return parseTiff(v, o + 10);   // "Exif"
      o += 2 + v.getUint16(o + 2);
    }
  }catch(_){}
  return {};
}
// the TIFF block inside the EXIF segment (all offsets are from its start, t)
export function parseTiff(v, t){
  const le = v.getUint16(t) === 0x4949, u16 = p=>v.getUint16(p, le), u32 = p=>v.getUint32(p, le);
  const ifd = off=>{ const tags = {}, n = u16(t + off); for (let k=0; k<n; k++){ const e = t + off + 2 + k*12; tags[u16(e)] = { count:u32(e + 4), at:e + 8 }; } return tags; };
  const ascii = tg=>{ const p = tg.count > 4 ? t + u32(tg.at) : tg.at; let s = ''; for (let i=0; i<tg.count - 1; i++) s += String.fromCharCode(v.getUint8(p + i)); return s; };
  const rationals = tg=>{ const p = t + u32(tg.at), r = k=>u32(p + k*8) / (u32(p + k*8 + 4) || 1); return [r(0), r(1), r(2)]; };
  const out = {}, ifd0 = ifd(u32(t + 4));
  const stamp = s=>{ const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || ''); if (!m) return;
    out.date = `${m[1]}-${m[2]}-${m[3]}`; out.time = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); };
  if (ifd0[0x8769]){ const ex = ifd(u32(ifd0[0x8769].at)), d = ex[0x9003] || ex[0x9004]; if (d) stamp(ascii(d)); }    // DateTimeOriginal
  if (!out.date && ifd0[0x0132]) stamp(ascii(ifd0[0x0132]));                                                         // DateTime
  if (ifd0[0x8825]){
    const g = ifd(u32(ifd0[0x8825].at));
    if (g[2] && g[4]){
      const la = rationals(g[2]), lo = rationals(g[4]);
      let lat = la[0] + la[1]/60 + la[2]/3600, lng = lo[0] + lo[1]/60 + lo[2]/3600;
      if (g[1] && String.fromCharCode(v.getUint8(g[1].at)) === 'S') lat = -lat;
      if (g[3] && String.fromCharCode(v.getUint8(g[3].at)) === 'W') lng = -lng;
      if (isFinite(lat) && isFinite(lng) && (lat || lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180){ out.lat = lat; out.lng = lng; }
    }
  }
  return out;
}

const km = (a, b)=>Math.hypot((a.lat - b.lat)*110.57, (a.lng - b.lng)*100.75*Math.cos(a.lat*Math.PI/180)/Math.cos(25.2*Math.PI/180));
// photos ({ date, time?, lat?, lng?, ... }) into visits: the same day, and with a location, within 500 m of the
// group's first located photo; photos without one join that day's group without a location. At most `max` a group.
export function groupPhotos(list, max){
  max = max || 10;
  const sorted = list.slice().sort((a, b)=>(a.date||'').localeCompare(b.date||'') || (a.time||0) - (b.time||0));
  const groups = [];
  for (const p of sorted){
    const geo = typeof p.lat === 'number';
    let g = groups.find(x=>x.date === p.date && x.photos.length < max && (geo ? x.at && km(x.at, p) <= 0.5 : !x.at));
    if (!g){ g = { date:p.date, at:geo ? { lat:p.lat, lng:p.lng } : null, photos:[] }; groups.push(g); }
    g.photos.push(p);
  }
  return groups;
}
// the place a group most likely is: the nearest place on the map (with an exact spot) within 200 m of it
export function suggestPlace(group, venues){
  if (!group.at) return null;
  let best = null, bd = 0.2;
  for (const v of venues){ if (typeof v.lat !== 'number' || typeof v.lng !== 'number') continue; const d = km(group.at, v); if (d <= bd){ bd = d; best = v; } }
  return best;
}
