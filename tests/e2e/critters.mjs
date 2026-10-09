// Critters: catch one by checking in at a (faked) spot, the catch moment once, never twice,
// a fuzzy fix catches nothing and gives no hint, favourite set and cleared, a crewmate's favourite
// on their pin, and scoring gone everywhere.
export default async function critters(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('crfail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const toastText = ()=>h.js(()=>document.querySelector('#toast').innerText);
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const caught = ()=>h.js(async ()=>{ const S=await import('/store.js'); return [...S.caughtIds()]; });
  await h.seed({mode:'crew'});

  await step('the collection before: 0 of 12, twelve grey silhouettes, no names, places or hints', async ()=>{
    await go('critters'); await h.sleep(800);
    const r = await h.js(()=>({ text:document.body.innerText, sil:document.querySelectorAll('.critter-card.unknown .critter-art.silhouette').length, q:(document.body.innerText.match(/\? \? \?/g)||[]).length }));
    if (!/0 of 12 found/.test(r.text)) throw new Error('count');
    if (r.sil!==12 || r.q!==12) throw new Error(JSON.stringify({sil:r.sil, q:r.q}));
    if (/Satwa|Fahidi|Etihad|Ras Al Khor|Meydan|Qudra|Falcon|Flamingo/i.test(r.text)) throw new Error('a hint is showing');
    await h.shot('cr-empty');
    await close();
  });
  await step('I’m here now on the Critters page, inside the Etihad Museum spot: the Falcon, with its catch moment', async ()=>{
    await h.load('at=25.2391,55.2741,20'); await h.sleep(600);
    await h.click('#navLog'); await h.sleep(400);
    if (!/Check in/.test(await text()) || /Check in where I am/.test(await text())) throw new Error('the + menu should have one Check in');
    await close();
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.checkInHere(); }); await h.sleep(1500);
    const m = await h.js(()=>document.querySelector('.catch-moment')?.innerText||'');
    if (!/New critter caught/i.test(m) || !/Falcon/.test(m) || !/Culture/i.test(m) || !/Etihad Museum/.test(m)) throw new Error('moment: '+m.replace(/\n/g,' | '));
    if (!/Fact being checked/i.test(m)) throw new Error('unverified fact not marked');
    await h.shot('cr-catch');
    const art = await h.js(()=>{ const i=document.querySelector('.catch-moment .critter-art'); return { w:i.getBoundingClientRect().width, r:getComputedStyle(i).imageRendering }; });
    if (art.w!==192 || !/pixelated|crisp/.test(art.r)) throw new Error(JSON.stringify(art));
    await h.js(()=>document.querySelector('[data-cm="fav"]').click()); await h.sleep(500);
    if (JSON.stringify(await caught())!=='["falcon"]') throw new Error('not recorded');
  });
  await step('checking in again: no second Falcon, no second moment', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.checkInHere(); }); await h.sleep(1200);
    if (await h.js(()=>!!document.querySelector('.catch-moment'))) throw new Error('moment again');
    if (!/Nothing new here/.test(await toastText())) throw new Error('toast: '+await toastText());
    const again = await h.js(async ()=>{ const S=await import('/store.js'); return S.recordCatch('falcon', {}); });
    if (again!==null || (await caught()).length!==1) throw new Error('caught twice');
  });
  await step('a fuzzy location inside a spot catches nothing and says only that the location is fuzzy', async ()=>{
    await h.load('at=25.2636,55.2995,200'); await h.sleep(600);      // Al Fahidi, ±200 m
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.checkInHere(); }); await h.sleep(1200);
    const t = await toastText();
    if ((await caught()).includes('gecko')) throw new Error('caught with a vague fix');
    if (!/fuzzy/i.test(t) || /gecko|critter|near|close/i.test(t)) throw new Error('toast: '+t);
    // the same fuzzy fix far from any spot gives exactly the same message (no hint)
    await h.load('at=25.30,55.50,200'); await h.sleep(600);
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.checkInHere(); }); await h.sleep(1200);
    if ((await toastText()).replace(/\d+/g,'') !== t.replace(/\d+/g,'')) throw new Error('different message away from spots');
  });
  await step('location refused: a clear message, nothing caught', async ()=>{
    await h.load(); await h.sleep(500);
    const ctx = h.page.browserContext(); await ctx.overridePermissions(new URL(h.page.url()).origin, []);
    await h.js(()=>{ navigator.geolocation.getCurrentPosition = (ok, err)=>err({ code:1 }); });
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.checkInHere(); }); await h.sleep(800);
    if (!/Location is off/.test(await toastText())) throw new Error('toast: '+await toastText());
  });
  await step('the collection after: 1 of 12, the Falcon shown as your favourite', async ()=>{
    await go('critters'); await h.sleep(800);
    const t = await text();
    if (!/1 of 12 found/.test(t) || !/Falcon/.test(t) || !/Favourite/i.test(t)) throw new Error(t.slice(0,300));
    await h.shot('cr-collection');
    await h.js(()=>document.querySelector('[data-critter="falcon"]').click()); await h.sleep(700);
    if (!/Etihad Museum/.test(await text())) throw new Error('detail');
    await h.shot('cr-detail');
    await close();
  });
  await step('favourite: clear it, then set it again from the picker', async ()=>{
    await go('favouritePicker'); await h.sleep(500);
    await h.shot('cr-picker');
    await h.js(()=>document.querySelector('[data-pick=""]').click()); await h.sleep(400);
    if (await h.js(async ()=>{ const S=await import('/store.js'); return S.favouriteOf(S.me().id); })) throw new Error('not cleared');
    await go('favouritePicker'); await h.sleep(500);
    await h.js(()=>document.querySelector('[data-pick="falcon"]').click()); await h.sleep(400);
    if (await h.js(async ()=>{ const S=await import('/store.js'); return S.favouriteOf(S.me().id); })!=='falcon') throw new Error('not set');
    await close();
  });
  await step('a crewmate’s favourite on their pins (32 px, crew view close up), not in the wide shot', async ()=>{
    await h.js(async ()=>{ const MAP=await import('/map.js'); MAP.flyToWorld(MAP.placeWorld({ lat:25.2, lng:55.27 }), 6); }); await h.sleep(1600);
    const r = await h.js(()=>[...document.querySelectorAll('.st-head .fav-critter .critter-art')].map(i=>({ src:i.getAttribute('src'), w:i.getBoundingClientRect().width, shown:getComputedStyle(i.closest('.st-head')).display!=='none' })));
    if (!r.some(x=>x.shown && /flamingo|street_cat|falcon/.test(x.src))) throw new Error(JSON.stringify(r.slice(0,4)));
    if (r.some(x=>x.shown && Math.abs(x.w-32)>0.5)) throw new Error('not 32 px: '+JSON.stringify(r[0]));
    await h.shot('cr-pins');
    await h.js(async ()=>{ const MAP=await import('/map.js'); MAP.fitCity(false); }); await h.sleep(1400);
    if (await h.js(()=>[...document.querySelectorAll('.st-head')].some(x=>getComputedStyle(x).display!=='none'))) throw new Error('shown in the wide shot');
  });
  await step('a crewmate’s profile shows their favourite', async ()=>{
    await go('profile', 'demo-maya'); await h.sleep(700);
    if (!/Favourite critter/i.test(await text()) || !/Flamingo/.test(await text())) throw new Error('no favourite');
    await h.shot('cr-profile-maya');
    await close();
  });
  await step('scoring is gone: profile, crew screen, sticker book, the leaderboard itself', async ()=>{
    await go('profile'); await h.sleep(700);
    const p = await text();
    if (/\bpts\b|points|Level \d|leaderboard|rank/i.test(p)) throw new Error('profile: '+(p.match(/.{0,30}(\bpts\b|points|Level \d|leaderboard|rank).{0,30}/i)||[])[0]);
    await h.shot('cr-profile-me'); await close();
    await h.click('[data-tab="crew"]'); await h.sleep(700);
    if (/leaderboard/i.test(await text())) throw new Error('crew screen leaderboard');
    await h.js(()=>history.back()); await h.sleep(400);
    await go('stickers'); await h.sleep(800);
    const s = await text();
    if (/\d+ \/ \d+|\d+ of \d+|Collected/.test(s) || await h.js(()=>!!document.querySelector('.st-prog, .cap-bar'))) throw new Error('sticker counters');
    await h.shot('cr-stickers'); await close();
    const gone = await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); return { lb:typeof go.leaderboard, add:typeof S.addPoints, el:!!document.querySelector('#points'), pts:'points' in (S.me()||{}) }; });
    if (gone.lb!=='undefined' || gone.add!=='undefined' || gone.el || gone.pts) throw new Error(JSON.stringify(gone));
  });
}
