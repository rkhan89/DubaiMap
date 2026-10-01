// POST /api/resolve-share  { url?, text?, title? }  →  { state, place?, candidates?, ... }
// Signed-in users only (Supabase session token in Authorization). 30 a hour per person.
// Keys stay here on the server: GOOGLE_PLACES_API_KEY (and, from step 3, ANTHROPIC_API_KEY).
// Logs carry only the source type, the state and the timing, never the shared text.
import { resolveShare } from './_lib/resolve.js';
import { cacheKey, sourceOf, firstUrl } from './_lib/maps.js';

const SB_URL = process.env.SUPABASE_URL || 'https://crvadsjnqnxlkqzpywva.supabase.co';
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_9I39ztDfQcQ9dRkTIK392g_zP6HJsVg';
const CITY = { lat: 25.2048, lng: 55.2708, radius: 30000 };       // Dubai; the crew's city
const LIMIT = 30, MAX_BYTES = 4000;

const json = (status, body)=> new Response(JSON.stringify(body), { status, headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' } });

// who's asking (Supabase checks the token)
async function userFor(token){
  if (!token) return null;
  if (process.env.SHARE_DEV_NO_AUTH==='1') return { id:'dev' };          // local tests only
  const r = await fetch(SB_URL+'/auth/v1/user', { headers:{ apikey:SB_KEY, Authorization:'Bearer '+token }, signal:AbortSignal.timeout(5000) }).catch(()=>null);
  return r && r.ok ? r.json() : null;
}
// database helpers run as the user (row level security applies); memory fallback if missing
const mem = { hits:new Map(), cache:new Map() };
async function rpc(token, fn, args){
  if (process.env.SHARE_DEV_NO_AUTH==='1') throw new Error('dev');
  const r = await fetch(SB_URL+'/rest/v1/rpc/'+fn, { method:'POST', signal:AbortSignal.timeout(4000),
    headers:{ apikey:SB_KEY, Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body:JSON.stringify(args||{}) });
  if (!r.ok) throw new Error(fn+' '+r.status);
  return r.json();
}
async function overLimit(token, userId){
  try{ return (await rpc(token, 'share_rate_hit')) > LIMIT; }
  catch(_){
    const now = Date.now(), list = (mem.hits.get(userId)||[]).filter(t=>now-t < 3600e3);
    list.push(now); mem.hits.set(userId, list); return list.length > LIMIT;
  }
}
// the cache only keeps where a link leads (its full Maps URL), never Google's place content
async function cacheGet(token, key){
  try{ return await rpc(token, 'share_cache_get', { p_key:key }); }catch(_){ return mem.cache.get(key) || null; }
}
async function cachePut(token, key, value){
  try{ await rpc(token, 'share_cache_put', { p_key:key, p_value:value }); }catch(_){ mem.cache.set(key, value); }
}

export async function POST(request){
  const t0 = Date.now();
  let type = 'unknown', state = 'error';
  try{
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return json(413, { state:'error', message:'That’s too long. Paste just the link or the place name.' });
    let input; try{ input = JSON.parse(raw||'{}'); }catch(_){ return json(400, { state:'error', message:'Bad request' }); }
    const pick = v => typeof v==='string' ? v.slice(0, 2000) : '';
    input = { url:pick(input.url), text:pick(input.text), title:pick(input.title) };
    const token = (request.headers.get('authorization')||'').replace(/^Bearer\s+/i, '');
    const user = await userFor(token);
    if (!user) return json(401, { state:'signed_out', message:'Sign in to add places from links.' });
    if (await overLimit(token, user.id)) { state = 'rate_limited'; return json(429, { state, message:'That’s a lot of links in one go. Try again in a bit, or add it yourself.' }); }

    const link = firstUrl(input.url, input.text, input.title);
    type = link ? sourceOf(link) : 'text';
    const deps = { placesKey: process.env.GOOGLE_PLACES_API_KEY || '', cityBias: CITY };
    const key = link && type==='google_maps' ? cacheKey(link) : null;
    if (key){ const hit = await cacheGet(token, key); if (hit && hit.finalUrl) deps.finalUrl = hit.finalUrl; }
    const out = await resolveShare(input, deps);
    if (key && out.finalUrl && !deps.finalUrl) await cachePut(token, key, { finalUrl: out.finalUrl });
    state = out.state;
    delete out.finalUrl;                                     // the client doesn't need it
    return json(200, { ...out, places: !!deps.placesKey });
  }catch(e){
    state = 'error';
    return json(200, { state:'error', message:'Something went wrong reading that. It’s saved, try again in a moment.' });
  }finally{
    console.log(JSON.stringify({ evt:'resolve-share', type, state, ms: Date.now()-t0 }));
  }
}
export function GET(){ return json(405, { state:'error', message:'Use POST' }); }
