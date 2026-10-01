// Reading a Google Maps link: which kind of link it is, and whatever it tells us about the place
// (name, the place's own coordinates, its ids). Pure functions, no network, unit-tested.

export const MAPS_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'google.com', 'www.google.com', 'maps.google.com', 'google.ae', 'www.google.ae'];
export const TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'];
const ALLOWED = new Set([...MAPS_HOSTS, ...TIKTOK_HOSTS]);

// the first http(s) URL in a piece of text (Android often puts the link inside the text)
export function firstUrl(...texts){
  for (const t of texts){
    const m = String(t||'').match(/https?:\/\/[^\s<>"'）)]+/i);
    if (m) return m[0].replace(/[.,!?;:]+$/, '');
  }
  return null;
}

// which service a URL belongs to (only hosts we may ever fetch)
export function sourceOf(url){
  let u; try{ u = new URL(url); }catch(_){ return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const h = u.hostname.toLowerCase();
  if (h==='maps.app.goo.gl' || (h==='goo.gl' && u.pathname.startsWith('/maps'))) return 'google_maps';
  if (['google.com','www.google.com','maps.google.com','google.ae','www.google.ae'].includes(h) && (h.startsWith('maps.') || u.pathname.startsWith('/maps'))) return 'google_maps';
  if (TIKTOK_HOSTS.includes(h)) return 'tiktok';
  if (/(^|\.)instagram\.com$/.test(h) || h==='instagr.am') return 'instagram';
  return 'other';
}
export function mayFetch(url){
  try{ const u = new URL(url); return (u.protocol==='https:' || u.protocol==='http:') && ALLOWED.has(u.hostname.toLowerCase()); }catch(_){ return false; }
}
export const isShortMaps = url => { try{ const u = new URL(url); return u.hostname==='maps.app.goo.gl' || (u.hostname==='goo.gl' && u.pathname.startsWith('/maps')); }catch(_){ return false; } };

// a normalised key for caching: no tracking parameters, lower-case host
export function cacheKey(url){
  try{
    const u = new URL(url); u.hash = '';
    ['g_st','g_ep','entry','utm_source','utm_medium','utm_campaign','_r','_t','is_from_webapp','sender_device','share_app_id'].forEach(k=>u.searchParams.delete(k));
    return u.protocol+'//'+u.hostname.toLowerCase()+u.pathname.replace(/\/+$/,'')+(u.search||'');
  }catch(_){ return String(url).slice(0,500); }
}

const num = s => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const plusDecode = s => { try{ return decodeURIComponent(String(s).replace(/\+/g,' ')).trim(); }catch(_){ return String(s).replace(/\+/g,' ').trim(); } };
const latlng = (lat, lng) => (lat!==null && lng!==null && Math.abs(lat)<=90 && Math.abs(lng)<=180) ? { lat, lng } : null;
const COORD_TEXT = /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/;

/* parse a full Google Maps URL.
   returns { kind, name, place:{lat,lng}|null, centre:{lat,lng}|null, placeId, cid, query }
   kind: place | search | query | cid | coords | directions | list | unknown */
export function parseMapsUrl(url){
  let u; try{ u = new URL(url); }catch(_){ return { kind:'unknown' }; }
  const path = decodeURIComponent(u.pathname);
  const raw = u.pathname + u.search;
  const out = { kind:'unknown', name:null, place:null, centre:null, placeId:null, cid:null, query:null };
  // the place's own coordinates sit in the data blob as !3d<lat>!4d<lng> (the last pair is the place)
  const d = [...raw.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)].pop();
  if (d) out.place = latlng(num(d[1]), num(d[2]));
  // the map's centre (where the camera was), not the place
  const at = raw.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) out.centre = latlng(num(at[1]), num(at[2]));
  // feature id 0x…:0x… → the second half is the CID
  const ftid = raw.match(/!1s(0x[0-9a-f]+):(0x[0-9a-f]+)/i) || raw.match(/[?&]ftid=(0x[0-9a-f]+):(0x[0-9a-f]+)/i);
  if (ftid){ try{ out.cid = BigInt(ftid[2]).toString(); }catch(_){} }
  const qp = k => u.searchParams.get(k);
  if (qp('query_place_id')) out.placeId = qp('query_place_id');
  if (qp('cid')) out.cid = qp('cid').replace(/\D/g,'') || out.cid;

  if (/\/maps\/dir(\/|$)/.test(path) || qp('saddr') || qp('daddr') || qp('api')==='1' && u.pathname.includes('/dir')) { out.kind = 'directions'; return out; }
  if (/\/maps\/placelists?\//.test(path) || /\/maps\/@[^/]*\/data=.*!11m/.test(raw) || qp('lists')) { out.kind = 'list'; return out; }
  const place = path.match(/\/maps\/place\/([^/]+)/);
  if (place){
    const seg = plusDecode(place[1]);
    const c = seg.match(COORD_TEXT);
    if (c){ out.kind = 'coords'; out.place = out.place || latlng(num(c[1]), num(c[2])); return out; }
    out.kind = 'place'; out.name = seg; return out;
  }
  const search = path.match(/\/maps\/search\/([^/]+)/);
  if (search){
    const q = plusDecode(search[1]); const c = q.match(COORD_TEXT);
    if (c){ out.kind = 'coords'; out.place = latlng(num(c[1]), num(c[2])); return out; }
    out.kind = 'search'; out.query = q; return out;
  }
  const q = qp('q') || qp('query');
  if (q){
    const c = q.match(COORD_TEXT);
    if (c){ out.kind = 'coords'; out.place = latlng(num(c[1]), num(c[2])); return out; }
    out.kind = 'query'; out.query = plusDecode(q); return out;
  }
  if (out.placeId){ out.kind = 'query'; return out; }
  if (out.cid){ out.kind = 'cid'; return out; }
  return out;
}

// a consent / interstitial page that carries the real destination in ?continue=
export function unwrapContinue(url){
  try{ const u = new URL(url); const c = u.searchParams.get('continue'); if (c && /^https?:\/\//.test(c)) return c; }catch(_){}
  return null;
}

// distance in metres
export function metres(a, b){
  const R = 6371e3, t = x=>x*Math.PI/180, dLat = t(b.lat-a.lat), dLng = t(b.lng-a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
// rough name similarity 0..1 (shared words)
export function nameScore(a, b){
  const w = s => new Set(String(s||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>1));
  const A = w(a), B = w(b); if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(x=>{ if (B.has(x)) n++; });
  return n / Math.min(A.size, B.size);
}
