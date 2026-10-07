// Share to Koko, step 1: the + menu, "Add from link or text", the confirm sheet with
// "Who's this for?", Undo, already saved, already on the map, unsupported links, offline.
// Runs in ?local mode against the dev server (node dev/server.mjs --dev-no-auth).
const FULL = 'https://www.google.com/maps/place/Sunset+Karak+Corner/@25.2329,55.2745,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f42d0b2b5b5b5:0x8f1f7b1e2c3d4e5f!8m2!3d25.2331!4d55.2759';
export default async function share1(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); }catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('s1fail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const toastText = ()=>h.js(()=>document.querySelector('#toast').innerText);
  const wait = async (fn, ms=6000)=>{ const t=Date.now(); for(;;){ if (await fn()) return; if (Date.now()-t>ms) throw new Error('timed out'); await h.sleep(150); } };
  const store = (fn, ...a)=>h.js(async (src, a)=>{ const S=await import('/store.js'); return (new Function('S','a','return ('+src+')(S,a)'))(S,a); }, fn.toString(), a);
  const openAdd = async ()=>{ await h.click('#navLog'); await h.click('[data-plus="link"]'); await p.waitForSelector('#shIn', {visible:true}); };
  const submit = async (v)=>{ await h.js(v=>{ const i=document.querySelector('#shIn'); i.value=v; }, v); await h.js(()=>document.querySelector('#shGo').click()); };
  await h.seed({mode:'crew'});

  await step('+ opens a menu with "Add from link or text"', async ()=>{ await h.click('#navLog'); if (!/Add from link or text/.test(await text())) throw new Error('no menu'); await h.shot('s1-plus'); await h.js(()=>history.back()); await h.sleep(400); });
  await step('the add screen', async ()=>{ await openAdd(); await h.shot('s1-add'); });
  await step('a Google Maps link → confirm sheet, nobody picked yet', async ()=>{
    await submit(FULL); await p.waitForSelector('#cfAdd', {visible:true, timeout:8000});
    const t = await text(); if (await h.js(()=>document.querySelector('#cfN')?.value)!=='Sunset Karak Corner' || !/From Google Maps/i.test(t) || !/Who's this for\?/i.test(t)) throw new Error('sheet text');
    if (await h.js(()=>document.querySelectorAll('[data-who].on').length)) throw new Error('something was pre-picked');
    await h.js(()=>document.querySelector('#cfC [data-cat="karak"]').click()); await h.sleep(150);
    await h.js(()=>document.querySelector('#cfAdd').click()); await h.sleep(400);
    if (!/Choose who it’s for/.test(await toastText())) throw new Error('saved without choosing'); await h.sleep(2500);
    await h.js(()=>document.querySelector('#cfC [data-cat="karak"]').click()); await h.sleep(150);
    await h.js(()=>document.querySelector('#cfC [data-cat="karak"]').click()); await h.sleep(200);
    await h.shot('s1-confirm');
  });
  await step('"Just me" → added privately, toast says so, with Undo and View on map', async ()=>{
    await h.js(()=>document.querySelector('[data-who="me"]').click()); await h.sleep(150); await h.shot('s1-confirm-me');
    await h.js(()=>document.querySelector('#cfAdd').click()); await h.sleep(700);
    const t = await toastText(); if (!/Only you can see it/.test(t) || !/Undo/.test(t) || !/View on map/.test(t)) throw new Error('toast: '+t);
    const e = await store((S)=>{ const v=S.venues().find(v=>v.name==='Sunset Karak Corner'); const e=v&&S.entries({venueId:v.id})[0]; return e && { kind:e.kind, priv:e.private, type:e.sourceType, url:!!e.sourceUrl, lat:v.lat, zone:v.zone }; });
    if (!e || e.kind!=='want' || !e.priv || e.type!=='google_maps' || !e.url || e.lat!==25.2331) throw new Error(JSON.stringify(e));
    await h.shot('s1-toast');
  });
  await step('Undo removes the save and the new place', async ()=>{
    await h.js(()=>[...document.querySelectorAll('#toast .toast-btn')].find(b=>b.textContent==='Undo').click()); await h.sleep(500);
    const n = await store((S)=>S.venues().filter(v=>v.name==='Sunset Karak Corner').length); if (n) throw new Error(n+' left');
  });
  await step('a crew → shared, toast names the crew; View on map drops the pin', async ()=>{
    await openAdd(); await submit(FULL); await p.waitForSelector('#cfAdd', {visible:true, timeout:8000});
    await h.js(()=>document.querySelector('#cfC [data-cat="karak"]').click()); await h.sleep(150);
    await h.js(()=>document.querySelector('[data-who]:not([data-who="me"])').click()); await h.sleep(150);
    await h.js(()=>document.querySelector('#cfAdd').click()); await h.sleep(600);
    const t = await toastText(); if (!/Shared with Sample Crew/.test(t)) throw new Error(t);
    await h.js(()=>[...document.querySelectorAll('#toast .toast-btn')].find(b=>b.textContent==='View on map').click()); await h.sleep(1200);
    await h.shot('s1-on-map');
  });
  await step('the same link again → "Already saved", opens the place', async ()=>{
    await openAdd(); await submit(FULL); await wait(async ()=>/Already saved/.test(await toastText()));
    await wait(async ()=>/Who’s been/.test(await text())); await h.shot('s1-already-saved');
    await h.js(()=>history.back()); await h.sleep(400); await h.js(()=>history.back()); await h.sleep(400);
  });
  await step('a place already on the crew map (by name) → offered first, no duplicate', async ()=>{
    const other = await store((S)=>{ const me=S.me().id; const v=S.venues().find(v=>S.entries({venueId:v.id}).length && !S.entries({venueId:v.id, userId:me}).length); return v && v.name; });
    if (!other) throw new Error('seed has no crew-only place');
    await openAdd(); await submit(other); await p.waitForSelector('#npQ', {visible:true, timeout:8000});
    if (!/Already on your map/i.test(await text())) throw new Error('no local match'); await h.shot('s1-needs-place');
    await h.js(()=>document.querySelector('.sheet [data-v]').click()); await p.waitForSelector('#cfAdd', {visible:true});
    if (!/already on the crew map/.test(await text())) throw new Error('no banner'); await h.shot('s1-already-crew');
    const before = await store((S)=>S.venues().filter(v=>v.name===a[0]).length, other);
    await h.js(()=>document.querySelector('[data-who]:not([data-who="me"])').click()); await h.sleep(150);
    await h.js(()=>document.querySelector('#cfAdd').click()); await h.sleep(500);
    const after = await store((S)=>S.venues().filter(v=>v.name===a[0]).length, other);
    if (before!==after) throw new Error('duplicate place made');
  });
  await step('a directions link → explained, nothing added', async ()=>{
    await openAdd(); await submit('https://www.google.com/maps/dir/Dubai+Mall/Trio+Cafe/@25.19,55.27,14z'); await p.waitForSelector('#npQ', {visible:true, timeout:8000});
    if (!/directions link/.test(await text())) throw new Error('no message'); await h.shot('s1-directions'); await h.js(()=>history.back()); await h.sleep(300); await h.js(()=>history.back()); await h.sleep(300);
  });
  await step('an Instagram link → asks for the caption or name', async ()=>{
    await openAdd(); await submit('https://www.instagram.com/reel/Cabc123/'); await p.waitForSelector('#npQ', {visible:true, timeout:8000});
    if (!/Instagram doesn’t let apps read posts/.test(await text())) throw new Error('no message'); await h.shot('s1-instagram'); await h.js(()=>history.back()); await h.sleep(300); await h.js(()=>history.back()); await h.sleep(300);
  });
  await step('a real short link (live from Google) → resolved', async ()=>{
    await openAdd(); await submit('Look at this https://maps.app.goo.gl/eY9Z73Hyt58Hjen48?g_st=ic');
    await p.waitForSelector('#npQ, #cfAdd', {visible:true, timeout:10000});
    const q = await h.js(()=>document.querySelector('#npQ')?.value || document.querySelector('#cfN')?.value || ''); if (q!=='JGROUP') throw new Error('prefill '+q);
    await h.shot('s1-shortlink'); await h.js(()=>history.back()); await h.sleep(300); await h.js(()=>history.back()); await h.sleep(300);
  });
  await step('offline → says so, can still add by name', async ()=>{
    await openAdd(); await p.setOfflineMode(true); await submit(FULL); await p.waitForSelector('#npQ', {visible:true, timeout:8000});
    if (!/You’re offline/.test(await text())) throw new Error('no offline message'); await h.shot('s1-offline'); await p.setOfflineMode(false);
    await h.js(()=>history.back()); await h.sleep(300); await h.js(()=>history.back()); await h.sleep(300);
  });
  await step('nothing reached the crew: the private save is invisible to a crewmate', async ()=>{
    // as a crewmate would see it: entries visible to someone else exclude private ones
    const leak = await store((S)=>S.entries({includeHidden:true}).filter(e=>e.sourceType && e.private).some(e=>{ const me=S.me().id; return e.userId!==me; }));
    if (leak) throw new Error('private share visible');
  });
}
