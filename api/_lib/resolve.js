// Working out which place a share points at. Called by api/resolve-share.js (authenticated,
// rate limited). Network access is deliberately narrow: only Google Maps and TikTok hosts are
// ever fetched, redirects are followed by hand (3 hops at most, 5 s each), private addresses
// are refused, and response bodies are never read. Places (New) is asked for five fields only.
import dns from 'node:dns/promises';
import net from 'node:net';
import { firstUrl, sourceOf, mayFetch, isShortMaps, parseMapsUrl, unwrapContinue, metres, nameScore } from './maps.js';
import { categoryFor } from './categories.js';

const UA = 'Koko/1.0';
const TIMEOUT = 5000, HOPS = 3;
const FIELDS = 'id,displayName,location,formattedAddress,types';

/* ---------- safe fetching ---------- */
function privateIp(ip){
  if (net.isIPv4(ip)){
    const [a,b] = ip.split('.').map(Number);
    return a===10 || a===127 || a===0 || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && b===168) || (a===100 && b>=64 && b<=127) || a>=224;
  }
  const s = ip.toLowerCase();
  return s==='::1' || s==='::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80') || s.startsWith('::ffff:127.') || s.startsWith('::ffff:10.') || s.startsWith('::ffff:192.168.');
}
export async function safeGet(url, deps){
  if (!mayFetch(url)) throw Object.assign(new Error('host not allowed'), { code:'blocked' });
  const host = new URL(url).hostname;
  const addrs = await (deps.lookup || dns.lookup)(host, { all:true });
  if (!addrs.length || addrs.some(a=>privateIp(a.address))) throw Object.assign(new Error('private address'), { code:'blocked' });
  const res = await (deps.fetch || fetch)(url, { redirect:'manual', headers:{ 'User-Agent':UA, 'Accept':'text/html' }, signal:AbortSignal.timeout(TIMEOUT) });
  try{ await res.body?.cancel(); }catch(_){}          // never read more than the headers
  return res;
}
// follow a short Google Maps link to the full URL it points at
export async function expandMaps(url, deps){
  let cur = url;
  for (let hop=0; hop<=HOPS; hop++){
    if (!isShortMaps(cur)) return cur;                 // full URLs are parsed, not fetched
    if (hop===HOPS) break;
    const res = await safeGet(cur, deps);
    const loc = res.headers.get('location');
    if (res.status>=300 && res.status<400 && loc){
      let next = new URL(loc, cur).href;
      next = unwrapContinue(next) || next;              // consent pages carry the real address
      if (!isShortMaps(next) && sourceOf(next)==='google_maps') return next;
      if (!mayFetch(next)) throw Object.assign(new Error('redirect to another host'), { code:'unreadable' });
      cur = next; continue;
    }
    throw Object.assign(new Error('no redirect (page wanted JavaScript)'), { code:'unreadable' });
  }
  throw Object.assign(new Error('too many redirects'), { code:'unreadable' });
}

/* ---------- Google Places (New) ---------- */
const toPlace = (p, src) => ({
  placeId: p.id, name: p.displayName?.text || '', lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null,
  address: p.formattedAddress || '', types: p.types || [], category: categoryFor(p.types), source: src || 'places',
});
export async function placesSearch(query, bias, deps){
  if (!deps.placesKey) return null;
  const body = { textQuery: query, maxResultCount: 5, languageCode: 'en' };
  if (bias) body.locationBias = { circle:{ center:{ latitude:bias.lat, longitude:bias.lng }, radius: bias.radius || 2000 } };
  const r = await (deps.fetch || fetch)('https://places.googleapis.com/v1/places:searchText', {
    method:'POST', signal:AbortSignal.timeout(TIMEOUT),
    headers:{ 'Content-Type':'application/json', 'X-Goog-Api-Key':deps.placesKey, 'X-Goog-FieldMask':FIELDS.split(',').map(f=>'places.'+f).join(',') },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Object.assign(new Error('places '+r.status), { code:'places' });
  const j = await r.json();
  return (j.places || []).map(p=>toPlace(p));
}
export async function placeDetails(id, deps){
  if (!deps.placesKey) return null;
  const r = await (deps.fetch || fetch)('https://places.googleapis.com/v1/places/'+encodeURIComponent(id), {
    signal:AbortSignal.timeout(TIMEOUT), headers:{ 'X-Goog-Api-Key':deps.placesKey, 'X-Goog-FieldMask':FIELDS },
  });
  if (!r.ok) return null;
  return toPlace(await r.json());
}

/* ---------- deciding ---------- */
// rank Places results against what the link told us
function pick(results, want){
  const scored = results.map(p=>{
    const d = want.at && p.lat!=null ? metres(want.at, p) : null;
    const n = want.name ? nameScore(want.name, p.name) : 0.5;
    return { p, d, n, s: (d===null ? 0 : Math.max(0, 1 - d/400)) * 0.6 + n * 0.4 };
  }).sort((a,b)=>b.s-a.s);
  return scored;
}

// how many words of a in b (place-name and address words)
const words = s => new Set(String(s||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>1));
const wordsIn = (a, b) => { const B = words(b); let n = 0; words(a).forEach(x=>{ if (B.has(x)) n++; }); return n; };

// "JGROUP, GBS Building - 2nd floor - Al Sufouh" → "JGROUP" (for the search box; Places gets the full text)
export const shortName = q => String(q||'').split(/\s+-\s+|,/)[0].trim() || String(q||'').trim();
// cities, areas and countries aren't places you save
const NOT_A_VENUE = new Set(['locality','political','country','administrative_area_level_1','administrative_area_level_2','sublocality','sublocality_level_1','neighborhood','postal_code','route','geocode']);
const isVenue = p => !(p.types||[]).length || !(p.types||[]).every(t=>NOT_A_VENUE.has(t));

const MSG = {
  directions: 'That’s a directions link. Share the place itself (open the place, then Share).',
  list: 'That’s a saved list. Share one place at a time.',
  unreadable: 'We couldn’t read that link. Type the place name and we’ll find it.',
  instagram: 'Instagram doesn’t let apps read posts. Paste the caption or type the place name.',
  other: 'We can’t read links from that site. Paste the caption or type the place name.',
  noplace: 'We couldn’t tell which place that is. Type the name and we’ll find it.',
  area: 'That link is an area, not a place. Type the place name and we’ll find it.',
};

export async function resolveMaps(url, deps){
  let final = deps.finalUrl || url;
  if (!deps.finalUrl && isShortMaps(url)){
    try{ final = await expandMaps(url, deps); }
    catch(e){ return { state:'needs_place', message: e.name==='TimeoutError' ? 'That link took too long to open. Type the place name instead.' : MSG.unreadable, error:e.code||e.name }; }
  }
  const p = parseMapsUrl(final);
  const base = { finalUrl: final, parsed:{ kind:p.kind } };
  if (p.kind==='directions') return { ...base, state:'unsupported', message:MSG.directions };
  if (p.kind==='list') return { ...base, state:'unsupported', message:MSG.list };
  // the link names the exact Places id
  if (p.placeId){
    const d = await placeDetails(p.placeId, deps).catch(()=>null);
    if (d) return { ...base, state:'match', place:d };
  }
  const at = p.place || null, near = p.place || p.centre || null;
  const name = p.name || p.query || null;
  if (name){
    let results = null;
    try{ results = await placesSearch(name, near ? { ...near, radius: p.place ? 300 : 3000 } : deps.cityBias, deps); }catch(_){ results = null; }
    if (results) results = results.filter(isVenue);
    if (results && results.length){
      const ranked = pick(results, { at, name });
      const top = ranked[0];
      // the place's own pin and a matching name: that's it
      if (at && top.d!==null && top.d < 150 && top.n >= 0.5) return { ...base, state:'match', place:top.p };
      if (!at && p.kind==='place' && top.n >= 0.8 && (ranked.length===1 || ranked[1].s < top.s*0.7)) return { ...base, state:'match', place:top.p };
      // several branches with the same name: the link's own address ("…, Al Karama - Dubai") picks one
      const named = ranked.filter(r=>r.n >= 0.8);
      if (!at && p.kind==='place' && named.length){
        const byAddr = named.map(r=>({ r, a: wordsIn(name, r.p.name+' '+r.p.address) })).sort((x,y)=>y.a-x.a);
        if (named.length===1 || byAddr[0].a >= byAddr[1].a + 2) return { ...base, state:'match', place:byAddr[0].r.p };
      }
      return { ...base, state:'candidates', candidates: ranked.slice(0,3).map(r=>r.p), query:shortName(name) };
    }
    if (results && !results.length && deps.placesKey) return { ...base, state:'needs_place', query:shortName(name), location:near, message:MSG.area };
    // no Places key (or no result): fall back to what the link itself says
    if (p.kind==='place' && at) return { ...base, state:'match', place:{ placeId:null, name, lat:at.lat, lng:at.lng, address:'', types:[], category:null, source:'link' } };
    return { ...base, state:'needs_place', query:shortName(name), location:near, message:MSG.noplace };
  }
  if (p.kind==='coords' || at) return { ...base, state:'needs_place', location:at || near, message:'That link is a pin, not a named place. Type the name and we’ll put it there.' };
  return { ...base, state:'needs_place', message:MSG.noplace };
}

// plain text: a link inside it, or a place name. (Captions with several places: step 3.)
export async function resolveShare(input, deps){
  const { url:rawUrl, text:rawText, title } = input;
  const url = firstUrl(rawUrl, rawText, title);
  const text = String(rawText || title || '').replace(url||'', '').trim();
  if (url){
    const type = sourceOf(url);
    if (type==='google_maps') return { sourceType:'google_maps', sourceUrl:url, ...(await resolveMaps(url, deps)) };
    if (type==='tiktok') return { sourceType:'tiktok', sourceUrl:url, state:'needs_place', query:text||null, message:'Reading TikTok links is coming next. Type the place name for now.' };
    if (type==='instagram') return { sourceType:'instagram', sourceUrl:url, state:'unsupported', query:text||null, message:MSG.instagram };
    if (!text) return { sourceType:'manual', sourceUrl:url, state:'unsupported', message:MSG.other };
  }
  const q = text.slice(0, 120);
  if (!q) return { sourceType:'text', state:'needs_place', message:'Paste a link or type a place name.' };
  let results = null;
  try{ results = await placesSearch(q, deps.cityBias, deps); }catch(_){}
  if (results && results.length){
    const ranked = pick(results, { name:q });
    if (ranked[0].n >= 0.8 && (ranked.length===1 || ranked[1].n < 0.8)) return { sourceType:'text', state:'match', place:ranked[0].p, query:q };
    return { sourceType:'text', state:'candidates', candidates:ranked.slice(0,3).map(r=>r.p), query:q };
  }
  return { sourceType:'text', state:'needs_place', query:q, message: deps.placesKey ? 'No place found with that name. Check the spelling or add it yourself.' : 'Add it yourself: pick the area and kind of place.' };
}
