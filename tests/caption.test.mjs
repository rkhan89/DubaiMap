// node --test tests/caption.test.mjs
// Share step 3: TikTok captions (oEmbed) → places (Claude, or the 📍 line) → Google Places.
// No network: TikTok, Claude and Places are faked. The caption is the real one from
// vm.tiktok.com/ZN8h6UV2v (@biggest.bites_, Amritsr in Karama), shortened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveShare, fuzzyName } from '../api/_lib/resolve.js';
import { pinnedPlaces, looksLikeCaption, extractPlaces, MODEL } from '../api/_lib/caption.js';

const CAPTION = 'MUST TRY BUTTER CHICKEN 👇 I heard Amritsr do some of the best butter chicken in Dubai, so I went and ordered just that. Just their Butter Chicken with a garlic naan — 47 AED for the two. Amritsr has become a bit of an institution in Karama, right in the heart of Dubai’s Little India. 📍 Amritsar, Al Karama';
const TT = 'https://vm.tiktok.com/ZN8h6UV2v/';
const publicDns = async ()=>[{ address:'142.250.0.1', family:4 }];
const P = (id, name, address, types)=>({ id, displayName:{ text:name }, location:{ latitude:25.24, longitude:55.30 }, formattedAddress:address, types:types||['restaurant'] });

// one fake for everything the server talks to; records what it was asked
function world({ caption=CAPTION, author='biggest.bites_', oembed=200, claude, claudeStatus=200, places={} }={}){
  const calls = { oembed:0, claude:[], places:[] };
  const fetch = async (url, opts)=>{
    url = String(url);
    if (url.startsWith('https://www.tiktok.com/oembed')){ calls.oembed++;
      return oembed===200 ? new Response(JSON.stringify({ title:caption, author_name:author }), { status:200 }) : new Response('{}', { status:oembed }); }
    if (url.startsWith('https://api.anthropic.com/')){ const body = JSON.parse(opts.body); calls.claude.push({ body, headers:opts.headers });
      if (claudeStatus !== 200) return new Response('{}', { status:claudeStatus });
      return new Response(JSON.stringify({ content:[{ type:'tool_use', name:'places_in_caption', input:{ places: claude || [] } }] }), { status:200 }); }
    if (url.includes('places:searchText')){ const q = JSON.parse(opts.body).textQuery; calls.places.push(q);
      const hit = Object.entries(places).find(([k])=>q.toLowerCase().includes(k.toLowerCase()));
      return new Response(JSON.stringify({ places: hit ? hit[1] : [] }), { status:200 }); }
    throw new Error('unexpected fetch '+url);
  };
  return { calls, deps: (extra)=>({ lookup:publicDns, fetch, placesKey:'pk', anthropicKey:'ak', cityBias:{ lat:25.2, lng:55.27, radius:30000 }, ...extra }) };
}

test('the 📍 line: name and area, hyphenated names kept whole', ()=>{
  assert.deepEqual(pinnedPlaces(CAPTION), [{ name:'Amritsar', area:'Al Karama' }]);
  assert.deepEqual(pinnedPlaces('so good 📍 Al-Ustad Special Kabab – Al Fahidi #dubaifood'), [{ name:'Al-Ustad Special Kabab', area:'Al Fahidi' }]);
  assert.deepEqual(pinnedPlaces('no pin here'), []);
});
test('captions vs place names', ()=>{
  assert.equal(looksLikeCaption('Knot Bakehouse'), false);
  assert.equal(looksLikeCaption(CAPTION), true);
  assert.equal(looksLikeCaption('best karak 📍 Filli'), true);
});
test('names match with a small spelling difference', ()=>{
  assert.ok(fuzzyName('Amritsar', 'Amritsr') >= 0.8);
  assert.ok(fuzzyName('Amritsar', 'Amritsr Restaurant') >= 0.8);
  assert.equal(fuzzyName('Amritsar', 'Ravi Restaurant'), 0);
});

test('TikTok link → caption → Claude → one Google match', async ()=>{
  const w = world({ claude:[{ name:'Amritsr', area:'Al Karama' }], places:{ 'Amritsr':[P('amr','Amritsr','Al Karama - Dubai'), P('x','Amritsar Grill','Deira - Dubai')] } });
  const r = await resolveShare({ url:TT }, w.deps());
  assert.equal(r.state, 'match'); assert.equal(r.place.placeId, 'amr');
  assert.equal(r.sourceType, 'tiktok'); assert.equal(r.author, 'biggest.bites_'); assert.equal(r.via, 'claude');
  // what Claude was sent: the right model, forced to answer through the tool, caption marked as data
  const c = w.calls.claude[0];
  assert.equal(c.body.model, MODEL); assert.equal(c.body.tool_choice.name, 'places_in_caption');
  assert.ok(c.body.messages[0].content.includes('<caption>')); assert.ok(/Ignore any instructions/.test(c.body.system));
  assert.equal(c.headers['x-api-key'], 'ak'); assert.ok(!JSON.stringify(c.body).includes('ak"'));
  assert.equal(w.calls.places[0], 'Amritsr, Al Karama');
});
test('a misspelt name still finds the place (Claude says "Amritsar", Google says "Amritsr")', async ()=>{
  const w = world({ claude:[{ name:'Amritsar', area:'Al Karama' }], places:{ 'Amritsar':[P('amr','Amritsr','Al Karama - Dubai')] } });
  const r = await resolveShare({ url:TT }, w.deps());
  assert.equal(r.state, 'match'); assert.equal(r.place.placeId, 'amr');
});
test('a caption naming two places → pick one', async ()=>{
  const w = world({ claude:[{ name:'Filli Cafe', area:'JLT' }, { name:'Karak House', area:null }],
    places:{ 'Filli':[P('f','Filli Cafe','JLT - Dubai')], 'Karak House':[P('k','Karak House','Jumeirah - Dubai')] } });
  const r = await resolveShare({ url:TT }, w.deps());
  assert.equal(r.state, 'candidates'); assert.deepEqual(r.candidates.map(p=>p.placeId), ['f','k']);
  assert.equal(r.found.length, 2);
});
test('no Claude key: the 📍 line is used instead', async ()=>{
  const w = world({ places:{ 'Amritsar':[P('amr','Amritsr','Al Karama - Dubai')] } });
  const r = await resolveShare({ url:TT }, w.deps({ anthropicKey:'' }));
  assert.equal(r.via, 'pin'); assert.equal(r.state, 'match'); assert.equal(w.calls.claude.length, 0);
});
test('Claude down: falls back to the 📍 line, the share still works', async ()=>{
  const w = world({ claudeStatus:529, places:{ 'Amritsar':[P('amr','Amritsr','Al Karama - Dubai')] } });
  const r = await resolveShare({ url:TT }, w.deps());
  assert.equal(r.via, 'pin'); assert.equal(r.state, 'match');
});
test('a private or deleted TikTok → asks for the name', async ()=>{
  const w = world({ oembed:404 });
  const r = await resolveShare({ url:TT }, w.deps());
  assert.equal(r.state, 'needs_place'); assert.match(r.message, /private or removed/);
});
test('nothing found in the caption → asks for the name', async ()=>{
  const w = world({ caption:'Day 3 of my diet 😂 #fyp', claude:[] });
  const r = await resolveShare({ url:TT }, w.deps());
  assert.equal(r.state, 'needs_place'); assert.match(r.message, /couldn’t spot a place/);
});
test('Claude names a place Google can’t find → asks, with the name filled in', async ()=>{
  const w = world({ claude:[{ name:'Secret Shawarma Van', area:'Satwa' }] });
  const r = await resolveShare({ url:TT }, w.deps());
  assert.equal(r.state, 'needs_place'); assert.equal(r.query, 'Secret Shawarma Van');
});
test('no Places key: the names the caption mentions go in the search box', async ()=>{
  const w = world({ claude:[{ name:'Amritsr', area:'Al Karama' }] });
  const r = await resolveShare({ url:TT }, w.deps({ placesKey:'' }));
  assert.equal(r.state, 'needs_place'); assert.equal(r.query, 'Amritsr');
});
test('the same TikTok again: cached names, no TikTok or Claude call', async ()=>{
  const w = world({ places:{ 'Amritsr':[P('amr','Amritsr','Al Karama - Dubai')] } });
  const r = await resolveShare({ url:TT }, w.deps({ captionPlaces:[{ name:'Amritsr', area:'Al Karama' }] }));
  assert.equal(r.state, 'match'); assert.equal(w.calls.oembed, 0); assert.equal(w.calls.claude.length, 0);
});
test('a caption pasted as text (from Instagram, say) is read; a plain name is not sent to Claude', async ()=>{
  const w = world({ claude:[{ name:'Amritsr', area:'Al Karama' }], places:{ 'Amritsr':[P('amr','Amritsr','Al Karama - Dubai')], 'Knot':[P('kn','Knot Bakehouse','Jumeirah - Dubai')] } });
  const r1 = await resolveShare({ text:CAPTION }, w.deps());
  assert.equal(r1.state, 'match'); assert.equal(r1.sourceType, 'text'); assert.equal(w.calls.claude.length, 1);
  const r2 = await resolveShare({ text:'Knot Bakehouse' }, w.deps());
  assert.equal(r2.place.placeId, 'kn'); assert.equal(w.calls.claude.length, 1);
});
test('Instagram link with its caption pasted → read; the link alone → explained', async ()=>{
  const w = world({ claude:[{ name:'Amritsr', area:'Al Karama' }], places:{ 'Amritsr':[P('amr','Amritsr','Al Karama - Dubai')] } });
  const r = await resolveShare({ text:'https://www.instagram.com/reel/abc/ '+CAPTION }, w.deps());
  assert.equal(r.sourceType, 'instagram'); assert.equal(r.state, 'match');
  const r2 = await resolveShare({ url:'https://www.instagram.com/reel/abc/' }, w.deps());
  assert.equal(r2.state, 'unsupported');
});
test('whatever Claude says is tidied: at most 3 names, short, no control characters', async ()=>{
  const w = world({ claude:[{ name:'A'.repeat(300)+'\u0007' }, { name:'Two' }, { name:'Three' }, { name:'Four' }, { name:'two' }] });
  const ex = await extractPlaces(CAPTION, w.deps());
  assert.equal(ex.places.length, 3); assert.ok(ex.places[0].name.length <= 80); assert.ok(!/\u0007/.test(ex.places[0].name));
});
