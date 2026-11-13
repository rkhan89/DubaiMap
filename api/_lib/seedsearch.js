// Searching the place seed (Overture, loaded into our own database by tools/overture-import.py) from the server
// routes. Runs as the signed-in person (row level security applies; the seed is readable by anyone signed in).
// In local dev (dev/server.mjs --dev-no-auth) it answers from dev/place-seed-sample.json instead, so the app can be
// clicked through without a database. Nothing here talks to Google or to Overture at runtime.
import fs from 'node:fs';
import { SB_URL, SB_KEY, DEV_NO_AUTH } from './server.js';

const COLS = 'id,name,address,zone,lat,lng,phone,website,instagram,socials,taxonomy_primary,taxonomy_hierarchy,licenses,sources,release';
let sample = null;
function devSample(){
  if (!sample){
    try{ sample = JSON.parse(fs.readFileSync(new URL('../../dev/place-seed-sample.json', import.meta.url), 'utf8')); }
    catch(_){ sample = []; }
  }
  return sample;
}
// the same rule as public.seed_kinds(): the most specific mapped taxonomy entry (dev copy of taxonomy_kinds)
const DEV_KINDS = { restaurant:'restaurant', casual_eatery:'restaurant', cafe:'coffee', coffee_shop:'coffee', burger_restaurant:'burger',
  pizza_restaurant:'pizza', fast_food_restaurant:'fastfood', cafeteria:'cafeteria', ice_cream_shop:'icecream', frozen_yogurt_shop:'froyo',
  dessert_shop:'dessert', bakery:'dessert', smoothie_juice_bar:'acai', chocolatier:'dessert', donut_shop:'dessert' };
const devKinds = h => { for (const t of [...(h || [])].reverse()) if (DEV_KINDS[t]) return [DEV_KINDS[t]]; return []; };
const km = (a, b) => Math.hypot((a.lat - b.lat) * 110.57, (a.lng - b.lng) * 100.75);

async function rest(token, path, init){
  const r = await fetch(SB_URL + '/rest/v1/' + path, { ...init, signal: AbortSignal.timeout(5000),
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init && init.headers) } });
  if (!r.ok) throw Object.assign(new Error('seed ' + r.status), { status: r.status });
  return r.json();
}

// name (and optionally where you are) → up to `limit` seed places: { id, name, address, zone, lat, lng, kinds }
export async function searchSeed(token, q, near, limit){
  q = String(q || '').trim().slice(0, 100); limit = Math.min(Math.max(limit || 8, 1), 20);
  if (q.length < 2) return [];
  if (DEV_NO_AUTH){
    const s = q.toLowerCase();
    return devSample().filter(p=>p.name.toLowerCase().includes(s))
      .map(p=>({ p, sc: (p.name.toLowerCase().startsWith(s) ? 1 : 0.5) - (near ? Math.min(km(p, near), 30) / 60 : 0) }))
      .sort((a, b)=>b.sc - a.sc).slice(0, limit)
      .map(({ p })=>({ id:p.id, name:p.name, address:p.address, zone:p.zone, lat:p.lat, lng:p.lng, kinds:devKinds(p.taxonomy_hierarchy) }));
  }
  const rows = await rest(token, 'rpc/search_place_seed', { method:'POST',
    body: JSON.stringify({ p_q:q, p_lat: near ? near.lat : null, p_lng: near ? near.lng : null, p_limit:limit }) });
  return (rows || []).map(r=>({ id:r.id, name:r.name, address:r.address, zone:r.zone, lat:r.lat, lng:r.lng, kinds:r.kinds || [] }));
}

// one seed place, everything the prefilled card shows
export async function seedDetails(token, id){
  if (!/^overture:[0-9a-f-]{8,64}$/.test(String(id || ''))) return null;
  let p;
  if (DEV_NO_AUTH) p = devSample().find(x=>x.id === id) || null;
  else p = ((await rest(token, 'place_seed?select=' + COLS + '&id=eq.' + encodeURIComponent(id), { method:'GET' })) || [])[0] || null;
  if (!p) return null;
  const kinds = DEV_NO_AUTH ? devKinds(p.taxonomy_hierarchy)
    : ((await rest(token, 'rpc/seed_kinds', { method:'POST', body: JSON.stringify({ p_hierarchy: p.taxonomy_hierarchy || [] }) })) || []);
  return { id:p.id, name:p.name, address:p.address || null, zone:p.zone || null, lat:p.lat, lng:p.lng, phone:p.phone || null,
    website:p.website || null, instagram:p.instagram || null, socials:p.socials || [], taxonomy:p.taxonomy_primary || null,
    kinds, release:p.release, licenses:p.licenses || [], datasets:[...new Set((p.sources || []).map(s=>s.dataset).filter(Boolean))] };
}

// for the link resolver: a name (and the link's pin, if any) → seed places shaped like its old results
export const seedSearcher = token => async (name, near)=>{
  const rows = await searchSeed(token, name, near, 5);
  return rows.map(r=>({ seedId:r.id, placeId:null, name:r.name, lat:r.lat, lng:r.lng, address:r.address || '', zone:r.zone,
    types:[], category:(r.kinds || [])[0] || null, source:'seed' }));
};
