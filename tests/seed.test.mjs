// node --test tests/seed.test.mjs
// The places record: tidying seed / web values into what Koko stores, the checks on save, and /api/places answering
// from the seed (here the dev fixture, dev/place-seed-sample.json) with no Google anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instagramFrom, validInstagram, cleanWebsite, cleanPhone, addressLine, validUrl } from '../placefields.js';

test('Instagram: a handle from a URL, @name or name; never a guess', ()=>{
  assert.equal(instagramFrom('https://www.instagram.com/KarakHouse/'), 'karakhouse');
  assert.equal(instagramFrom('instagram.com/karak.house?igsh=abc'), 'karak.house');
  assert.equal(instagramFrom('@karak_house'), 'karak_house');
  assert.equal(instagramFrom('https://www.instagram.com/p/Cxyz123/'), null);         // a post, not an account
  assert.equal(instagramFrom('https://www.instagram.com/explore/'), null);
  assert.equal(instagramFrom('karak house'), null);
  assert.equal(instagramFrom('.karak'), null); assert.equal(instagramFrom('karak..house'), null);
  assert.equal(instagramFrom('https://facebook.com/karak'), null);
  assert.equal(instagramFrom('a'.repeat(31)), null);
  assert.ok(validInstagram('karak.house')); assert.ok(!validInstagram('karak house')); assert.ok(validInstagram(''));
});
test('website: the place’s own site, tracking stripped; social and maps links are not websites', ()=>{
  assert.equal(cleanWebsite('https://www.oyorooms.com/ae/52314?utm_source=FB&utm_medium=x'), 'https://www.oyorooms.com/ae/52314');
  assert.equal(cleanWebsite('karakhouse.ae'), 'https://karakhouse.ae');
  assert.equal(cleanWebsite('https://www.facebook.com/karak'), null);
  assert.equal(cleanWebsite('https://instagram.com/karak'), null);
  assert.equal(cleanWebsite('https://maps.app.goo.gl/abc'), null);
  assert.equal(cleanWebsite('javascript:alert(1)'), null);
  assert.ok(validUrl('https://karakhouse.ae')); assert.ok(!validUrl('karakhouse'));
});
test('phone: one number in international form', ()=>{
  assert.equal(cleanPhone('050 986 6466'), '+971509866466');
  assert.equal(cleanPhone('04 333 4444'), '+97143334444');
  assert.equal(cleanPhone('00971 4 333 4444'), '+97143334444');
  assert.equal(cleanPhone('+9718000178152'), '+9718000178152');
  assert.equal(cleanPhone('call us'), null);
});
test('address: one line, Arabic city names in English', ()=>{
  assert.equal(addressLine([{ freeform:'Crescent Rd', locality:'دبي', country:'AE' }]), 'Crescent Rd, Dubai');
  assert.equal(addressLine([{ freeform:'Maurya, Palm Jumeirah Dubai', locality:'دبي' }]), 'Maurya, Palm Jumeirah Dubai');
  assert.equal(addressLine([]), null);
});

test('/api/places answers from the seed; the old Google actions say unavailable', async ()=>{
  process.env.SHARE_DEV_NO_AUTH = '1';
  const { POST } = await import('../api/places.js?dev=1');
  const call = async body => { const r = await POST(new Request('http://x/api/places', { method:'POST', headers:{ authorization:'Bearer dev', 'content-type':'application/json' }, body:JSON.stringify(body) })); return [r.status, await r.json()]; };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url)=>{ if (/google/.test(String(url))) throw new Error('Google must not be called'); return realFetch(url); };
  try{
    const [s1, j1] = await call({ action:'seed_search', input:'cafe', lat:25.2, lng:55.27 });
    assert.equal(s1, 200); assert.equal(j1.state, 'ok'); assert.ok(j1.results.length > 0);
    const first = j1.results[0];
    assert.match(first.id, /^overture:/); assert.ok(first.name.toLowerCase().includes('cafe')); assert.ok(Array.isArray(first.kinds));
    const [s2, j2] = await call({ action:'seed_details', id:first.id });
    assert.equal(s2, 200); assert.equal(j2.place.id, first.id); assert.ok('phone' in j2.place && 'instagram' in j2.place && 'website' in j2.place);
    assert.equal(j2.place.release, '2026-10-21.0');
    const [, j3] = await call({ action:'suggest', input:'cafe' });
    assert.equal(j3.state, 'unavailable');
    const [s4] = await call({ action:'seed_details', id:'ChIJ../../etc' });
    assert.equal(s4, 404);
  } finally { globalThis.fetch = realFetch; delete process.env.SHARE_DEV_NO_AUTH; }
});
