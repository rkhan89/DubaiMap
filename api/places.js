// POST /api/places  { action:'seed_search', input, lat?, lng? } → { state:'ok', results:[{id,name,address,zone,lat,lng,kinds}] }
//                   { action:'seed_details', id }               → { state:'ok', place:{id,name,address,lat,lng,zone,phone,website,instagram,socials,kinds,…} }
// Searches Koko's own copy of Overture Maps (place_seed); nothing here calls Google. Older app versions asking for
// 'suggest' / 'details' (the Google search this replaced) get 'unavailable', which they already handle by offering
// "add it yourself". Signed-in users only; 300 calls an hour per person.
// Logs carry only the action, the outcome and the timing, never what was typed.
import { json, tokenOf, userFor, overLimit, readJSON } from './_lib/server.js';
import { searchSeed, seedDetails } from './_lib/seedsearch.js';

const LIMIT = 300;
const num = v => typeof v === 'number' && isFinite(v) ? v : null;

export async function POST(request){
  const t0 = Date.now(); let action = 'unknown', state = 'error';
  try{
    const { body, tooBig, bad } = await readJSON(request, 1000);
    if (tooBig || bad) return json(400, { state:'error', message:'Bad request' });
    action = ['seed_search', 'seed_details', 'suggest', 'details'].includes(body.action) ? body.action : 'unknown';
    if (action === 'unknown') return json(400, { state:'error', message:'Bad request' });
    if (action === 'suggest' || action === 'details'){ state = 'unavailable'; return json(200, { state, suggestions:[] }); }
    const token = tokenOf(request), user = await userFor(token);
    if (!user){ state = 'signed_out'; return json(401, { state, message:'Sign in to search places.' }); }
    if (await overLimit(token, user.id, 'places_rate_hit', LIMIT)){ state = 'rate_limited'; return json(429, { state, message:'That’s a lot of searching. Try again in a bit, or add the place yourself.' }); }
    if (action === 'seed_search'){
      const input = typeof body.input === 'string' ? body.input.trim().slice(0, 100) : '';
      const near = num(body.lat) != null && num(body.lng) != null ? { lat:body.lat, lng:body.lng } : null;
      const results = input.length < 2 ? [] : await searchSeed(token, input, near, 8);
      state = 'ok'; return json(200, { state, results });
    }
    const place = await seedDetails(token, body.id);
    if (!place){ state = 'not_found'; return json(404, { state, message:'That place isn’t in the list any more. Add it yourself.' }); }
    state = 'ok'; return json(200, { state, place });
  }catch(e){
    state = 'error';
    return json(502, { state, message:'Search didn’t answer. Try again, or add the place yourself.' });
  }finally{
    console.log(JSON.stringify({ evt:'places', action, state, ms: Date.now()-t0 }));   // never what was typed
  }
}
export function GET(){ return json(405, { state:'error', message:'Use POST' }); }
