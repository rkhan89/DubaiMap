// The places record (Job 4, phase 1): logging from the place listing fills the card without typing, a second visit
// adds a visit (never a second place), "Add it yourself" needs a name and a pin, bad Instagram handles are refused,
// and Settings shows where the data comes from. Runs on the dev server's listing sample (dev/place-seed-sample.json).
//   node shot.mjs record 390 light
export default async function record(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('recfail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'me'});
  const text = ()=>h.js(()=>document.querySelector('.screen.in, .sheet.in')?.innerText || document.body.innerText);
  const type = (sel, v)=>h.js((s, v)=>{ const q=document.querySelector(s); q.value=v; q.dispatchEvent(new Event('input', { bubbles:true })); }, sel, v);
  const openLog = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); const {go}=await import('/go.js'); go.log({}); }); await h.sleep(800); };
  let seedId = null;

  await step('typing a name lists places from the Dubai listing', async ()=>{
    await openLog();
    await type('#logQ', 'starbucks'); await h.sleep(1200);
    const n = await h.js(()=>document.querySelectorAll('#lRes [data-seed]').length);
    if (!n) throw new Error('no listing results');
    if (!/Places in Dubai/.test(await text())) throw new Error('no Places in Dubai heading');
    if (/Google/.test(await text())) throw new Error('Google still mentioned');
    if (!await h.js(()=>!!document.querySelector('#lNew'))) throw new Error('no Add it yourself');
    await h.shot('rec-search');
  });
  await step('picking one opens a card filled in from the listing (name, address, phone), each labelled', async ()=>{
    // the first result that has a phone in the sample
    seedId = await h.js(async ()=>{ const ids=[...document.querySelectorAll('#lRes [data-seed]')].map(b=>b.dataset.seed); return ids[0]; });
    await h.js(id=>document.querySelector(`#lRes [data-seed="${id}"]`).click(), seedId); await h.sleep(1200);
    const f = await h.js(()=>({ name:document.querySelector('#vfN')?.value, addr:document.querySelector('#vfA')?.value, phone:document.querySelector('#vfP')?.value,
      labels:[...document.querySelectorAll('.sheet .src-tag')].map(s=>s.textContent), attr:document.querySelector('.sheet .g-attr')?.innerText || '' }));
    if (!f.name || !f.addr || !f.phone) throw new Error(JSON.stringify(f));
    if (!f.labels.includes('Listing')) throw new Error('no Listing labels: '+f.labels);
    if (!/Overture Maps Foundation/.test(f.attr)) throw new Error('no attribution');
    await h.shot('rec-card');
    await h.js(()=>{ const s=[...document.querySelectorAll('.sheet')].pop(); s.scrollTop = 99999; const i=s.querySelector('.sheet-inner'); if (i) i.scrollTop = 99999; }); await h.sleep(300);
    await h.shot('rec-card-end');
  });
  await step('suggested kinds are not applied until you tap one; editing a value makes it yours', async ()=>{
    const before = await h.js(()=>[...document.querySelectorAll('#vfC .cat-chip.on')].length);
    if (before) throw new Error('a kind was applied without asking');
    const sug = await h.js(()=>{ const b=document.querySelector('[data-suggest]'); if (b){ b.click(); return b.dataset.suggest; } document.querySelector('#vfC [data-cat]').click(); return null; }); await h.sleep(400);
    await h.js(()=>{ const i=document.querySelector('#vfT'); i.value='hidden gem'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); }); await h.sleep(300);
    await type('#vfI', '@koko.test_cafe'); await h.sleep(100);
    await h.js(()=>document.querySelector('#vfS').click()); await h.sleep(900);
    const v = await h.js(async id=>{ const S=await import('/store.js'); const v=S.venueBySeed(id); return v && { phone:v.phone, address:v.address, ig:v.instagram, fs:v.fieldSources, cats:v.categories, tags:S.venueTags(v.id) }; }, seedId);
    if (!v || !v.phone || !v.address) throw new Error('place not saved with its details: '+JSON.stringify(v));
    if (v.fs.name!=='seed' || v.fs.phone!=='seed' || v.fs.instagram!=='user' || v.fs.categories!=='user') throw new Error('sources '+JSON.stringify(v.fs));
    if (v.ig!=='koko.test_cafe' || !v.tags.includes('hidden gem')) throw new Error(JSON.stringify(v));
    console.log('     suggested kind:', sug || '(none, picked one)', '| saved', JSON.stringify(v.fs));
  });
  await step('then step 2, and the visit saves', async ()=>{
    if (!/Step 2/.test(await text())) throw new Error('not on step 2');
    await h.js(()=>{ const b=document.querySelector('#lWho [data-who]'); if (b) b.click(); }); await h.sleep(200);
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(2500);
  });
  await step('a second visit to the same place adds a visit, never a second place', async ()=>{
    await openLog();
    await type('#logQ', 'starbucks'); await h.sleep(1200);
    const listed = await h.js(id=>({ mine:!!document.querySelector('#lRes [data-v]'), seed:!!document.querySelector(`#lRes [data-seed="${id}"]`) }), seedId);
    if (listed.seed) throw new Error('the logged place is offered again from the listing');
    const vid = await h.js(async id=>{ const S=await import('/store.js'); return S.venueBySeed(id).id; }, seedId);
    await h.js(id=>document.querySelector(`#lRes [data-v="${id}"]`).click(), vid); await h.sleep(700);
    await h.js(()=>{ const b=document.querySelector('#lWho [data-who]'); if (b) b.click(); }); await h.sleep(200);
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(2500);
    const n = await h.js(async id=>{ const S=await import('/store.js'); const vs=S.venues().filter(v=>v.seedId===id); return { places:vs.length, visits:S.entries({ venueId:vs[0].id, kind:'visit' }).length }; }, seedId);
    if (n.places!==1 || n.visits!==2) throw new Error(JSON.stringify(n));
  });
  await step('not in the listing: Add it yourself asks for a pin, refuses a bad Instagram, then saves', async ()=>{
    await h.page.browserContext().overridePermissions(new URL(h.page.url()).origin, ['geolocation']);
    await h.page.setGeolocation({ latitude:25.2031, longitude:55.2502 });
    await openLog();
    await type('#logQ', 'Zzq Karak Shack'); await h.sleep(1200);
    if (!/Not in the list/.test(await text())) throw new Error('no not-in-the-list hint');
    await h.shot('rec-none');
    await h.click('#lNew'); await h.sleep(700);
    await h.js(()=>document.querySelector('#vfC [data-cat="karak"]')?.click() || document.querySelector('#vfC [data-cat]').click()); await h.sleep(300);
    await h.js(()=>document.querySelector('#vfS').click()); await h.sleep(500);
    if (!/Drop a pin/.test(await h.js(()=>document.querySelector('#toast').innerText))) throw new Error('saved without a pin');
    await h.js(()=>document.querySelector('#vfLoc').click()); await h.sleep(1200);
    await type('#vfI', 'not a handle!'); await h.sleep(100);
    await h.js(()=>document.querySelector('#vfS').click()); await h.sleep(500);
    if (!/isn’t an Instagram handle/.test(await h.js(()=>document.querySelector('#toast').innerText))) throw new Error('bad handle accepted');
    await type('#vfI', ''); await h.shot('rec-manual');
    await h.js(()=>document.querySelector('#vfS').click()); await h.sleep(900);
    const v = await h.js(async ()=>{ const S=await import('/store.js'); const v=S.venues().find(v=>v.name==='Zzq Karak Shack'); return v && { lat:v.lat, seed:v.seedId, fs:v.fieldSources, zone:v.zone }; });
    if (!v || v.lat==null || v.seed || v.fs.name!=='user' || v.fs.coords!=='user') throw new Error(JSON.stringify(v));
  });
  await step('Settings → About → Data sources credits Overture Maps', async ()=>{
    await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); const {go}=await import('/go.js'); go.dataSources(); }); await h.sleep(700);
    const t = await text();
    if (!/Data from Overture Maps Foundation, Places theme/.test(t) || !/overturemaps\.org\/attribution/.test(t)) throw new Error('attribution missing');
    await h.shot('rec-sources');
  });
}

// The same screens on any build, for before/after pictures: PFX=before BASE=<old build> node shot.mjs recordCompare 390
export async function recordCompare(h){
  const pfx = process.env.PFX || 'after';
  await h.seed({mode:'me'});
  const type = (sel, v)=>h.js((s, v)=>{ const q=document.querySelector(s); q.value=v; q.dispatchEvent(new Event('input', { bubbles:true })); }, sel, v);
  await h.js(async ()=>{ const {go}=await import('/go.js'); go.log({}); }); await h.sleep(800);
  await type('#logQ', 'starbucks'); await h.sleep(1500); await h.shot(pfx+'-checkin-search');
  await h.click('#lNew'); await h.sleep(700); await h.shot(pfx+'-add-yourself');
  await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); const {go}=await import('/go.js'); go.settings(); }); await h.sleep(800);
  await h.js(()=>{ const e=[...document.querySelectorAll('.eyebrow')].find(x=>x.textContent==='About'); const s=e.closest('.screen'); s.scrollTop = e.offsetTop - 120; }); await h.sleep(400);
  await h.shot(pfx+'-settings-about');
}
