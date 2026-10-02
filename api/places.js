// POST /api/places  { action:'suggest', input, sessionToken }  → { state:'ok', suggestions:[{placeId,name,detail}] }
//                   { action:'details', placeId, sessionToken } → { state:'ok', place:{placeId,name,lat,lng,address,category} }
// Signed-in users only; 300 calls an hour per person. The Google key stays here on the server.
// Logs carry only the action, the outcome and the timing, never what was typed.
import { json, tokenOf, userFor, overLimit, readJSON, CITY } from './_lib/server.js';
import { suggest, details, validToken, validPlaceId } from './_lib/places.js';

const LIMIT = 300;

export async function POST(request){
  const t0 = Date.now(); let action = 'unknown', state = 'error';
  try{
    const { body, tooBig, bad } = await readJSON(request, 1000);
    if (tooBig || bad) return json(400, { state:'error', message:'Bad request' });
    action = body.action === 'details' ? 'details' : body.action === 'suggest' ? 'suggest' : 'unknown';
    if (action === 'unknown') return json(400, { state:'error', message:'Bad request' });
    const token = tokenOf(request), user = await userFor(token);
    if (!user){ state = 'signed_out'; return json(401, { state, message:'Sign in to search Google Maps.' }); }
    const placesKey = process.env.GOOGLE_PLACES_API_KEY || '';
    if (!placesKey){ state = 'unavailable'; return json(200, { state, suggestions:[] }); }
    if (await overLimit(token, user.id, 'places_rate_hit', LIMIT)){ state = 'rate_limited'; return json(429, { state, message:'That’s a lot of searching. Try again in a bit, or add the place yourself.' }); }
    const sessionToken = validToken(body.sessionToken) ? body.sessionToken : null;
    const deps = { placesKey, cityBias:CITY };
    if (action === 'suggest'){
      const input = typeof body.input === 'string' ? body.input.trim().slice(0, 100) : '';
      if (input.length < 2){ state = 'ok'; return json(200, { state, suggestions:[] }); }
      const suggestions = await suggest(input, sessionToken, deps);
      state = 'ok'; return json(200, { state, suggestions });
    }
    if (!validPlaceId(body.placeId)) return json(400, { state:'error', message:'Bad request' });
    const place = await details(body.placeId, sessionToken, deps);
    state = 'ok'; return json(200, { state, place });
  }catch(e){
    state = 'error';
    return json(502, { state, message:'Google Maps didn’t answer. Try again, or add the place yourself.' });
  }finally{
    console.log(JSON.stringify({ evt:'places', action, state, ms: Date.now()-t0 }));   // never what was typed
  }
}
export function GET(){ return json(405, { state:'error', message:'Use POST' }); }
