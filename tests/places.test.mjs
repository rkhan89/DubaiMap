// node --test tests/places.test.mjs
// Google suggestions while adding a place by hand (Autocomplete + Place Details, faked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest, details, validToken, validPlaceId } from '../api/_lib/places.js';

const CITY = { lat:25.2048, lng:55.2708, radius:30000 };
const TOKEN = '3f2b6c1e-8a4d-4f0e-9b7a-2c5d1e6f7a8b';
function google(){
  const calls = [];
  const fetch = async (url, opts)=>{
    calls.push({ url:String(url), opts });
    if (String(url).endsWith('places:autocomplete')) return new Response(JSON.stringify({ suggestions:[
      { placePrediction:{ placeId:'ChIJamr00001', structuredFormat:{ mainText:{ text:'Amritsr' }, secondaryText:{ text:'Al Karama, Dubai' } } } },
      { placePrediction:{ placeId:'ChIJamr00002', structuredFormat:{ mainText:{ text:'Amritsr Express' }, secondaryText:{ text:'JLT, Dubai' } } } },
      { queryPrediction:{ text:{ text:'amritsar restaurants' } } },
    ] }), { status:200 });
    return new Response(JSON.stringify({ id:'ChIJamr00001', displayName:{ text:'Amritsr' }, location:{ latitude:25.2453, longitude:55.3036 },
      formattedAddress:'Al Karama, Dubai', types:['indian_restaurant','restaurant'] }), { status:200 });
  };
  return { calls, deps:{ fetch, placesKey:'pk', cityBias:CITY } };
}

test('suggestions: places only, with name and area, near Dubai, in the UAE, one session', async ()=>{
  const g = google();
  const list = await suggest('amrit', TOKEN, g.deps);
  assert.deepEqual(list, [{ placeId:'ChIJamr00001', name:'Amritsr', detail:'Al Karama, Dubai' }, { placeId:'ChIJamr00002', name:'Amritsr Express', detail:'JLT, Dubai' }]);
  const body = JSON.parse(g.calls[0].opts.body);
  assert.equal(body.sessionToken, TOKEN); assert.deepEqual(body.includedRegionCodes, ['ae']);
  assert.equal(body.locationBias.circle.center.latitude, CITY.lat);
  assert.equal(g.calls[0].opts.headers['X-Goog-Api-Key'], 'pk');
  assert.match(g.calls[0].opts.headers['X-Goog-FieldMask'], /placePrediction\.placeId/);
});
test('details: the five fields, the same session (so the typing is free), category from its types', async ()=>{
  const g = google();
  const p = await details('ChIJamr00001', TOKEN, g.deps);
  assert.deepEqual(p, { placeId:'ChIJamr00001', name:'Amritsr', lat:25.2453, lng:55.3036, address:'Al Karama, Dubai', types:['indian_restaurant','restaurant'], category:'restaurant' });
  assert.match(g.calls[0].url, /sessionToken=3f2b6c1e/);
  assert.equal(g.calls[0].opts.headers['X-Goog-FieldMask'], 'id,displayName,location,formattedAddress,types');
});
test('only well-formed tokens and place ids get through', ()=>{
  assert.ok(validToken(TOKEN)); assert.ok(!validToken('x')); assert.ok(!validToken('../../etc'));
  assert.ok(validPlaceId('ChIJamr00001')); assert.ok(!validPlaceId('ChIJ/../x')); assert.ok(!validPlaceId('a'));
});
test('Google errors come back as errors (the app then offers to add it yourself)', async ()=>{
  const deps = { placesKey:'pk', cityBias:CITY, fetch: async ()=>new Response('{}', { status:403 }) };
  await assert.rejects(suggest('amrit', TOKEN, deps), /autocomplete 403/);
});
