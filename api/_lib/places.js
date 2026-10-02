// Google place suggestions while you type a new place's name (Places API (New) Autocomplete), and
// the chosen place's details. One session token per search: Google doesn't charge for the
// suggestions in a session that ends with the details call, so typing costs nothing; picking costs
// one Place Details. Only five fields are asked for: id, name, location, address, types.
import { categoryFor } from './categories.js';
const TIMEOUT = 4000;
const FIELDS = 'id,displayName,location,formattedAddress,types';

export const validToken = t => typeof t === 'string' && /^[0-9a-f-]{20,64}$/i.test(t);
export const validPlaceId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{10,300}$/.test(id);

export async function suggest(input, sessionToken, deps){
  const r = await (deps.fetch || fetch)('https://places.googleapis.com/v1/places:autocomplete', {
    method:'POST', signal:AbortSignal.timeout(TIMEOUT),
    headers:{ 'Content-Type':'application/json', 'X-Goog-Api-Key':deps.placesKey,
      'X-Goog-FieldMask':'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat' },
    body: JSON.stringify({ input, sessionToken, languageCode:'en', includedRegionCodes:['ae'],
      locationBias:{ circle:{ center:{ latitude:deps.cityBias.lat, longitude:deps.cityBias.lng }, radius:deps.cityBias.radius } } }),
  });
  if (!r.ok) throw Object.assign(new Error('autocomplete '+r.status), { status:r.status });
  const j = await r.json();
  return (j.suggestions||[]).map(s=>s.placePrediction).filter(Boolean).slice(0, 5).map(p=>({
    placeId: p.placeId,
    name: p.structuredFormat?.mainText?.text || '',
    detail: p.structuredFormat?.secondaryText?.text || '',
  })).filter(p=>p.placeId && p.name);
}

export async function details(placeId, sessionToken, deps){
  const url = 'https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId)+'?languageCode=en'+(sessionToken ? '&sessionToken='+encodeURIComponent(sessionToken) : '');
  const r = await (deps.fetch || fetch)(url, { signal:AbortSignal.timeout(TIMEOUT), headers:{ 'X-Goog-Api-Key':deps.placesKey, 'X-Goog-FieldMask':FIELDS } });
  if (!r.ok) throw Object.assign(new Error('details '+r.status), { status:r.status });
  const p = await r.json();
  return { placeId:p.id, name:p.displayName?.text || '', lat:p.location?.latitude ?? null, lng:p.location?.longitude ?? null,
           address:p.formattedAddress || '', types:p.types || [], category:categoryFor(p.types) };
}
