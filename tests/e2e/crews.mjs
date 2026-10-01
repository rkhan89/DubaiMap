import path from 'path';
// Several crews + tagging (local mode, sample Karak Crew): start a second crew, switch between
// them on the Crew tab and the map, choose crews on save, tag who you were with, get tagged,
// "Not me", the scrapbook "Tagged with" filter, leaving a crew.
export default async function crews(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('cfail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'crew'});
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const back = async ()=>{ await h.js(()=>history.back()); await h.sleep(450); };
  const text = ()=>h.js(()=>document.body.innerText);
  const toastText = ()=>h.js(()=>document.querySelector('#toast').innerText);
  const store = (fn, ...a)=>h.js(async (src, a)=>{ const S=await import('/store.js'); return (new Function('S','a','return ('+src+')(S,a)'))(S,a); }, fn.toString(), a);
  const clickText = (sel, re)=>h.js((sel, src)=>{ const b=[...document.querySelectorAll(sel)].find(x=>new RegExp(src).test(x.textContent)); if (!b) throw new Error('no '+src); b.click(); }, sel, re.source);
  const karak = await store(S=>S.myCrew().id);

  await step('start a second crew; the first one stays', async ()=>{
    await go('crewSetup', {}); await h.sleep(600);
    await h.js(()=>{ const i=document.querySelector('#cName'); i.value='Family'; i.dispatchEvent(new Event('input')); });
    await h.js(()=>document.querySelector('#cGo').click()); await h.sleep(900);
    const r = await store(S=>({ n:S.myCrews().length, active:S.myCrew().name }));
    if (r.n!==2 || r.active!=='Family') throw new Error(JSON.stringify(r));
  });
  await step('Crew tab: switcher shows both', async ()=>{
    await h.click('[data-tab="crew"]'); await h.sleep(700);
    if (!/Karak Crew/.test(await text()) || !/Family/.test(await text())) throw new Error('switcher');
    await h.shot('c-switch-family');
    await h.js(()=>[...document.querySelectorAll('.crew-switch [data-crew]')].find(b=>/Karak/.test(b.textContent)).click()); await h.sleep(600);
    if (await store(S=>S.myCrew().name)!=='Karak Crew') throw new Error('did not switch');
    await h.shot('c-switch-karak'); await back();
  });
  await step('map: Crew pill names the crew; tapping again switches', async ()=>{
    await h.js(()=>{ const b=document.querySelector('#mapMode [data-v="crew"]'); if (!b.classList.contains('on')) b.click(); }); await h.sleep(400);
    const lbl = await h.js(()=>document.querySelector('#mapMode [data-v="crew"]').textContent);
    if (!/Karak/.test(lbl)) throw new Error('label '+lbl);
    await h.js(()=>document.querySelector('#mapMode [data-v="crew"]').click()); await h.sleep(500);
    if (!/Show which crew/.test(await text())) throw new Error('no picker'); await h.shot('c-map-pick');
    await back();
    if (await h.js(()=>!!document.querySelector('.sheet.in'))) throw new Error('sheet still open after back');
  });
  const raviId = await store(S=>S.venues().find(v=>v.name==='Ravi Restaurant').id);
  await step('log: nothing pre-picked; Family only; tag @maya', async ()=>{
    await go('log', { venueId: raviId }); await h.sleep(800);
    if (await h.js(()=>document.querySelectorAll('#lWho [data-who].on').length)) throw new Error('pre-picked');
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(400);
    if (!/Choose who it’s for/.test(await toastText())) throw new Error('saved without choosing');
    await clickText('#lWho [data-who]', /Family/); await h.sleep(300);
    await h.js(()=>document.querySelector('#lTags [data-tag="demo-maya"]').click()); await h.sleep(300);
    await h.js(()=>{ const n=document.querySelector('#lNotes'); n.value='Matcha with @omar'; n.dispatchEvent(new Event('input')); });
    const input = await p.$('#lPh'); await input.uploadFile(path.resolve('fixture.jpg')); await h.sleep(1500);
    await h.js(()=>document.querySelector('#lWho').scrollIntoView({block:'start'})); await h.sleep(200); await h.shot('c-log-who');
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(1500);
    const e = await store((S, a)=>{ const e=S.entries({venueId:a[0], userId:S.me().id}).sort((x,y)=>y.createdAt-x.createdAt)[0]; return { crews:e.crewIds, tags:e.taggedIds, priv:e.private, here:S.sharedHere(e) }; }, raviId);
    const fam = await store(S=>S.myCrews().find(c=>c.name==='Family').id);
    if (e.crews.length!==1 || e.crews[0]!==fam || e.priv) throw new Error('crews '+JSON.stringify(e));
    if (!(e.tags.includes('demo-maya') && e.tags.includes('demo-omar'))) throw new Error('tags '+JSON.stringify(e.tags));
    if (e.here) throw new Error('shows as shared with Karak');
  });
  await step('place page: "with @maya, @omar" and Change who sees it', async ()=>{
    await go('place', raviId); await h.sleep(900);
    if (!/with @maya, @omar/.test(await text())) throw new Error('no tags shown');
    if (!/Shared with Karak Crew and Family/.test(await text())) throw new Error('no who line');   // earlier visits here were shared with Karak
    await h.shot('c-place');
    await h.js(()=>document.querySelector('#pShare').click()); await h.sleep(500); await h.shot('c-change-who');
    await clickText('.sheet [data-who]', /Family/); await h.sleep(200);   // untick Family
    await h.js(()=>document.querySelector('#awGo').click()); await h.sleep(500);
    if (!/^Shared with Karak Crew./.test(await toastText())) throw new Error('toast '+await toastText());
    await back();
  });
  await step('someone tags you → bell; "Not me"', async ()=>{
    await store((S, a)=>{ const me=S.me().id; S.restoreEntry({ entry:{ id:'demo-tag1', userId:'demo-layla', venueId:a[0], kind:'visit', rating:4.5, notes:'Karak run', date:new Date().toISOString().slice(0,10), private:false, crewIds:[], taggedIds:[me], createdAt:Date.now() }, photos:[] }); }, raviId);
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.refresh(); }); await h.sleep(500);
    await h.click('#btnBell'); await h.sleep(500);
    if (!/Layla tagged you at Ravi Restaurant/.test(await text())) throw new Error('no tag in bell'); await h.shot('c-bell'); await back();
    await go('place', raviId); await h.sleep(900);
    if (!/with you/.test(await text())) throw new Error('no "with you"');
    await h.js(()=>document.querySelector('[data-untag]').click()); await h.sleep(500);
    const still = await store(S=>(S.entry('demo-tag1').taggedIds||[]).length);
    if (still) throw new Error('still tagged'); await back();
  });
  await step('scrapbook filter: Tagged with', async ()=>{
    await h.click('[data-tab="shelf"]'); await h.sleep(700);
    await h.js(()=>document.querySelector('.book-spine').click()); await h.sleep(900);
    await h.js(()=>document.querySelector('#bkFilter').click()); await h.sleep(600);
    if (!/Tagged with/i.test(await text())) throw new Error('no Tagged with section');
    await h.js(()=>document.querySelector('[data-with="demo-maya"]').scrollIntoView({block:'center'})); await h.sleep(200);
    await h.js(()=>document.querySelector('[data-with="demo-maya"]').click()); await h.sleep(300);
    await h.shot('c-book-filter');
    const btn = await h.js(()=>document.querySelector('[data-x="apply"]').textContent);
    if (!/1 Photo/.test(btn)) throw new Error('apply says '+btn);
    await h.js(()=>document.querySelector('[data-x="apply"]').click()); await h.sleep(800); await h.shot('c-book-tagged');
    await back();
  });
  await step('leave Family: what you shared only with them becomes yours', async ()=>{
    await h.click('[data-tab="crew"]'); await h.sleep(600);
    await h.js(()=>[...document.querySelectorAll('.crew-switch [data-crew]')].find(b=>/Family/.test(b.textContent)).click()); await h.sleep(500);
    await h.js(()=>document.querySelector('#soInvite, #cLeave') && 0); // (Family is just you: solo screen)
    const r = await store(async (S)=>{ const fam=S.myCrews().find(c=>c.name==='Family'); await S.leaveCrew(fam.id); return { n:S.myCrews().length, active:S.myCrew().name }; });
    if (r.n!==1 || r.active!=='Karak Crew') throw new Error(JSON.stringify(r));
    const e = await store((S, a)=>{ const e=S.entries({venueId:a[0], userId:S.me().id}).sort((x,y)=>y.createdAt-x.createdAt)[0]; return { crews:e.crewIds, priv:e.private }; }, raviId);
    if (e.crews.length!==1 || e.priv) throw new Error('after leave '+JSON.stringify(e));   // still shared with Karak
    // a Family-only save becomes just yours
    const solo = await store(async (S, a)=>{ const fam2 = await S.createCrew({ name:'Family 2' }); const e=S.addEntry({ venueId:a[0], kind:'want', crewIds:[fam2.id] }); await S.leaveCrew(fam2.id); const x=S.entry(e.id); return { crews:x.crewIds, priv:x.private }; }, raviId);
    if (solo.crews.length || !solo.priv) throw new Error('family-only '+JSON.stringify(solo));
    await back();
  });
  await step('five crews at most', async ()=>{
    const r = await store(async (S)=>{ for (const n of ['A','B','C','D']) await S.createCrew({ name:'Crew '+n }); let err=null; try{ await S.createCrew({ name:'Six' }); }catch(e){ err=e.message; } return { n:S.myCrews().length, err }; });
    if (r.n!==5 || r.err!=='max') throw new Error(JSON.stringify(r));
    await go('crewSetup', {}); await h.sleep(600);
    if (!/You're in 5 crews/.test(await text())) throw new Error('no limit note'); await h.shot('c-max'); await back();
  });
}
