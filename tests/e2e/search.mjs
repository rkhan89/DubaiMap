// Koko search, end to end: dish tags on the visit form (new and edited), the search box, "pasta marina", a typo,
// tapping a place (the map flies, its card opens), Show on map, a photo-only match with its "from photo" marker,
// opening a scrapbook entry, and with photo tagging off: no AI call and no AI note.   node shot.mjs search 390 light|dark
export default async function searchE2E(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('srfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  const aiCalls = []; h.page.on('request', r=>{ if (r.url().includes('/api/photo-tags')) aiCalls.push(r.method()); });
  await h.seed({mode:'me'});
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(400); };
  // a Marina place and a visit, then a photo-only visit in Jumeirah
  const ids = await h.js(async ()=>{ const S = await import('/store.js');
    const v = S.addVenue({ name:'Trattoria del Porto', zone:'marina', categories:['restaurant'], lat:25.0805, lng:55.1403 });
    const e = S.addEntry({ venueId:v.id, kind:'visit', rating:4, notes:'', date:'2026-10-01' });
    const v2 = S.addVenue({ name:'Shack 21', zone:'jumeirah', categories:['cafe'], lat:25.2030, lng:55.2500 });
    const e2 = S.addEntry({ venueId:v2.id, kind:'visit', rating:4, notes:'', date:'2026-09-01' });
    const cv = document.createElement('canvas'); cv.width = cv.height = 8; const blob = await new Promise(r=>cv.toBlob(r, 'image/jpeg'));
    const [p] = await S.addPhotos([{ blob, caption:'', venueId:v2.id, entryId:e2.id, date:'2026-09-01' }]);
    S.setPhotoAiTags(p.id, ['ice cream', 'dessert', 'cone', 'outdoor']); S.flush();
    return { v:v.id, e:e.id, v2:v2.id, e2:e2.id }; });

  await step('the visit form: "What did you have?" suggestions; two taps add pasta; editing takes it off and back', async ()=>{
    await h.js(async id=>{ const { go } = await import('/go.js'); go.log({ entryId:id }); }, ids.e); await h.sleep(800);
    const sug = await h.js(()=>[...document.querySelectorAll('#lDishSug [data-dish-add]')].map(b=>b.dataset.dishAdd));
    if (!sug.includes('pasta')) throw new Error('suggestions: ' + sug.join(','));
    if (await h.js(()=>!!document.querySelector('.ai-note'))) throw new Error('an AI note with tagging off');
    await h.js(()=>document.querySelector('[data-dish-add="pasta"]').click()); await h.sleep(250);
    await h.js(()=>{ const i = document.querySelector('#lDish'); i.value = '  Truffle  Fries '; i.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); }); await h.sleep(250);
    await h.shot('sr-dish-form');
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(1200);
    let t = await h.js(async id=>{ const S = await import('/store.js'); return S.entry(id).dishTags; }, ids.e);
    if (JSON.stringify(t) !== '["pasta","truffle fries"]') throw new Error('saved ' + JSON.stringify(t));
    await close();
    await h.js(async id=>{ const { go } = await import('/go.js'); go.log({ entryId:id }); }, ids.e); await h.sleep(700);
    await h.js(()=>document.querySelector('[data-dish-rm="truffle fries"]').click()); await h.sleep(200);
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(1200);
    t = await h.js(async id=>{ const S = await import('/store.js'); return S.entry(id).dishTags; }, ids.e);
    if (JSON.stringify(t) !== '["pasta"]') throw new Error('edited ' + JSON.stringify(t));
    await close();
  });

  const type = async q=>{ await h.js(q=>{ const i = document.querySelector('#srQ'); i.value = q; i.dispatchEvent(new Event('input', { bubbles:true })); }, q); await h.sleep(250); };
  const results = ()=>h.js(()=>({ places:[...document.querySelectorAll('#srOut [data-sv]')].map(b=>b.dataset.sv), entries:[...document.querySelectorAll('#srOut [data-se]')].map(b=>b.dataset.se),
    photo:[...document.querySelectorAll('#srOut [data-se] .sr-photo')].map(x=>x.closest('[data-se]').dataset.se), text:(document.querySelector('#srOut')||{}).innerText||'' }));

  await step('the search icon opens one box; "pasta marina" finds the Marina visit and its place', async ()=>{
    await h.js(()=>document.querySelector('#btnSearch').click()); await h.sleep(400);
    await type('pasta marina'); const r = await results();
    if (!r.entries.includes(ids.e) || r.places[0] !== ids.v) throw new Error(JSON.stringify(r).slice(0, 200));
    await h.shot('sr-pasta-marina');
  });
  await step('a typo still matches: "pasat marnia"', async ()=>{ await type('pasat marnia'); const r = await results(); if (!r.entries.includes(ids.e)) throw new Error(r.text.slice(0,120)); });
  await step('nothing matches: plain words, no AI language', async ()=>{ await type('zzqqxx'); const r = await results(); if (!/Nothing matches/.test(r.text) || /\bAI\b/.test(r.text)) throw new Error(r.text); });
  await step('Show on map dims every pin but the matches; clearing puts them back', async ()=>{
    await type('pasta marina');
    await h.js(()=>{ const c = document.querySelector('#srMap'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true })); });
    await h.js(async ()=>{ const M = await import('/map.js'); M.fitCity(false); }); await h.sleep(900);
    const dim = await h.js(()=>({ dim:document.querySelectorAll('.stamp-anchor.dim, .map-dot.dim').length, all:document.querySelectorAll('.stamp-anchor, .map-dot').length }));
    await h.shot('sr-show-on-map');
    await type(''); await h.sleep(300);
    const after = await h.js(()=>document.querySelectorAll('.dim').length);
    if (!(dim.dim > 0 && dim.dim < dim.all) || after !== 0) throw new Error(JSON.stringify({ ...dim, after }));
  });
  await step('tap a place: the map flies to its pin and its card opens', async ()=>{
    await type('trattoria');
    await h.js(id=>document.querySelector(`[data-sv="${id}"]`).click(), ids.v); await h.sleep(1400);
    const peek = await h.js(()=>{ const p = document.querySelector('#peek'); return p && !p.hidden ? p.innerText : ''; });
    const at = await h.js(async ()=>{ const M = await import('/map.js'); const c = M.centerLatLng(); return c; });
    await h.shot('sr-fly-card');
    if (!/Trattoria del Porto/.test(peek) || Math.abs(at.lat - 25.0805) > 0.02 || Math.abs(at.lng - 55.1403) > 0.02) throw new Error(JSON.stringify({ peek:peek.slice(0,40), at }));
  });
  await step('"ice cream" finds the photo-only visit with a "from photo" marker; gelato too', async ()=>{
    await type('ice cream'); let r = await results();
    if (await h.js(()=>document.querySelector('.search-panel').classList.contains('min'))) throw new Error('results still hidden after typing');
    if (!r.photo.includes(ids.e2)) throw new Error(JSON.stringify(r).slice(0,200));
    await h.shot('sr-from-photo');
    await type('gelato'); r = await results(); if (!r.entries.includes(ids.e2)) throw new Error('gelato');
  });
  await step('tap a scrapbook entry: its page opens', async ()=>{
    await type('pasta'); await h.js(id=>document.querySelector(`[data-se="${id}"]`).click(), ids.e); await h.sleep(1200);
    const t = await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || '');
    await h.shot('sr-page'); await close();
    if (!/Trattoria del Porto/.test(t)) throw new Error(t.slice(0,100));
  });
  await step('search in the scrapbooks: from the Shelf, entries first; an entry opens its page', async ()=>{
    await h.js(async ()=>{ const { go } = await import('/go.js'); go.shelf(); }); await h.sleep(900);
    await h.js(()=>document.querySelector('#shSearch').click()); await h.sleep(500);
    await h.js(()=>{ const i = document.querySelector('#ssQ'); i.value = 'pasta'; i.dispatchEvent(new Event('input', { bubbles:true })); }); await h.sleep(300);
    const first = await h.js(()=>(document.querySelector('#ssOut .eyebrow')||{}).innerText || '');
    await h.shot('sr-shelf-search');
    if (!/Scrapbook entries/i.test(first)) throw new Error('first group: ' + first);
    await h.js(id=>document.querySelector(`#ssOut [data-se="${id}"]`).click(), ids.e); await h.sleep(1200);
    const t2 = await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || '');
    if (!/Trattoria del Porto/.test(t2)) throw new Error(t2.slice(0,100));
    await close();
  });
  await step('search inside a book: a place goes to the map and opens its card', async ()=>{
    await h.js(async ()=>{ const S = await import('/store.js'), { go } = await import('/go.js'); go.book(S.books().find(b=>b.kind==='personal').id); }); await h.sleep(1500);
    await h.js(()=>document.querySelector('#bkSearch').click()); await h.sleep(500);
    await h.js(()=>{ const i = document.querySelector('#ssQ'); i.value = 'trattoria'; i.dispatchEvent(new Event('input', { bubbles:true })); }); await h.sleep(300);
    await h.js(id=>document.querySelector(`#ssOut [data-sv="${id}"]`).click(), ids.v); await h.sleep(1600);
    const peek = await h.js(()=>{ const p = document.querySelector('#peek'); return p && !p.hidden ? p.innerText : ''; });
    const screens = await h.js(()=>document.querySelectorAll('.screen.in').length);
    if (!/Trattoria del Porto/.test(peek) || screens) throw new Error(JSON.stringify({ peek:peek.slice(0,40), screens }));
  });
  await step('photo tagging off: no AI call was made and no AI note appeared', async ()=>{ if (aiCalls.filter(m=>m === 'POST').length) throw new Error(aiCalls.join(',')); });
}
