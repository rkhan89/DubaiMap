// POST /api/resolve-share  { url?, text?, title? }  →  { state, place?, candidates?, ... }
// Signed-in users only (Supabase session token in Authorization). 30 a hour per person.
// Keys stay here on the server: GOOGLE_PLACES_API_KEY (and, from step 3, ANTHROPIC_API_KEY).
// Logs carry only the source type, the state and the timing, never the shared text.
import { resolveShare } from './_lib/resolve.js';
import { cacheKey, sourceOf, firstUrl } from './_lib/maps.js';

import { json, userFor, rpc, overLimit as overHourly, CITY } from './_lib/server.js';
const LIMIT = 30, MAX_BYTES = 4000;
const mem = { cache:new Map() };   // link cache fallback when the database helper isn't there
const overLimit = (token, userId)=>overHourly(token, userId, 'share_rate_hit', LIMIT);
// the cache only keeps where a link leads (its full Maps URL), never Google's place content
async function cacheGet(token, key){
  try{ return await rpc(token, 'share_cache_get', { p_key:key }); }catch(_){ return mem.cache.get(key) || null; }
}
async function cachePut(token, key, value){
  try{ await rpc(token, 'share_cache_put', { p_key:key, p_value:value }); }catch(_){ mem.cache.set(key, value); }
}

export async function POST(request){
  const t0 = Date.now();
  let type = 'unknown', state = 'error', via = null;
  try{
    if (+(request.headers.get('content-length')||0) > MAX_BYTES) return json(413, { state:'error', message:'That’s too long. Paste just the link or the place name.' });
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
    const deps = { placesKey: process.env.GOOGLE_PLACES_API_KEY || '', anthropicKey: process.env.ANTHROPIC_API_KEY || '', cityBias: CITY };
    // cache: where a Maps link leads; for a TikTok, just the place names its caption mentions (never the caption)
    const key = link && type==='google_maps' ? cacheKey(link) : link && type==='tiktok' ? 'tt:'+cacheKey(link) : null;
    if (key){ const hit = await cacheGet(token, key);
      if (hit && hit.finalUrl) deps.finalUrl = hit.finalUrl;
      if (hit && Array.isArray(hit.places) && hit.places.length){ deps.captionPlaces = hit.places; deps.captionAuthor = hit.author || null; } }
    const out = await resolveShare(input, deps);
    if (key && out.finalUrl && !deps.finalUrl) await cachePut(token, key, { finalUrl: out.finalUrl });
    if (key && type==='tiktok' && !deps.captionPlaces && out.found && out.found.length) await cachePut(token, key, { places: out.found, author: out.author || null });
    via = out.via || null;
    state = out.state;
    delete out.finalUrl;                                     // the client doesn't need it
    return json(200, { ...out, places: !!deps.placesKey });
  }catch(e){
    state = 'error';
    // never send the error itself back: a generic message, the details stay out of the response
    return json(500, { state:'error', message:'Something went wrong reading that. Try again in a moment, or type the place name.' });
  }finally{
    console.log(JSON.stringify({ evt:'resolve-share', type, state, via, ms: Date.now()-t0 }));   // never the shared text
  }
}
export function GET(){ return json(405, { state:'error', message:'Use POST' }); }
