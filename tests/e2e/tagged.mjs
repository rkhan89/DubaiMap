// Tagged on someone else's visit: the place says "Add your rating & photos" (your rating already there), the sheet
// says who tagged you and adds your stars and photos to their visit, a new visit of your own is a separate button,
// the log screen offers "Add to their visit", and the scrapbook page has Add yours / Log a new visit.
//   node shot.mjs tagged 390 light
import path from 'path';
export default async function tagged(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('tgfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  const text = ()=>h.js(()=>[...document.querySelectorAll('.screen.in, .sheet')].map(x=>x.innerText).join('\n'));
  await h.seed({mode:'crew'});
  // Kabir logs a visit at a new place, tags you; you've already rated it 3.5
  const ids = await h.js(async ()=>{
    const S = await import('/store.js');
    const v = S.addVenue({ name:'Gyu Test', zone:'downtown', categories:['restaurant'] });
    const crew = S.myCrew(), me = S.me().id; S.flush();
    const raw = JSON.parse(localStorage.getItem('bites-db-v2'));
    raw.entries['demo-tg1'] = { id:'demo-tg1', userId:'demo-kabir', venueId:v.id, kind:'visit', rating:4, private:false, crewIds:[crew.id], taggedIds:[me], meals:[], notes:'Beef bowls', date:'2026-10-09', createdAt:Date.now() };
    raw.ratings = raw.ratings || {}; raw.ratings['demo-tg1|'+me] = { id:'demo-tg1|'+me, entryId:'demo-tg1', userId:me, rating:3.5, note:'', updatedAt:Date.now() };
    localStorage.setItem('bites-db-v2', JSON.stringify(raw));
    return { v:v.id, me, crew:crew.id };
  });
  await h.load();

  await step('the place: "Edit your part of the visit" (you rated it) and a separate "Log a new visit of your own"', async ()=>{
    await h.js(async id=>{ const {go}=await import('/go.js'); go.place(id); }, ids.v); await h.sleep(900);
    const r = await h.js(()=>({ add:document.querySelector('#pAdd')?.innerText||'', log:document.querySelector('#pLog')?.innerText||'', t:document.querySelector('.screen.in')?.innerText||'' }));
    await h.shot('tg-place');
    if (!/Edit your part of the visit/.test(r.add) || !/Log a new visit of your own/.test(r.log) || !/Kabir tagged you on this visit/.test(r.t)) throw new Error(JSON.stringify({ add:r.add, log:r.log }));
  });
  await step('the sheet: who tagged you, your 3.5 already there, a photo goes on their visit', async ()=>{
    await h.js(()=>document.querySelector('#pAdd').click()); await h.sleep(600);
    const t = await text();
    if (!/Kabir tagged you/.test(t) || !/Beef bowls/.test(t) || !/Take photo/.test(t)) throw new Error(t.slice(0, 200));
    const on = await h.js(()=>({ on:document.querySelectorAll('#rsStars .on').length, half:document.querySelectorAll('#rsStars .half').length }));
    if (on.on !== 3 || on.half !== 1) throw new Error('stars ' + JSON.stringify(on));
    const input = await p.$('#rsPh'); await input.uploadFile(path.resolve('fixture.jpg')); await h.sleep(1500);
    await h.shot('tg-sheet');
    await h.js(()=>document.querySelector('#rsSave').click()); await h.sleep(1200);
    const r = await h.js(async a=>{ const S=await import('/store.js'); return { rating:S.myRatingOn('demo-tg1')?.rating, photos:S.photos({ entryId:'demo-tg1' }).map(p=>({ u:p.userId, c:p.crewIds, priv:p.private })) }; }, ids);
    if (r.rating !== 3.5 || r.photos.length !== 1 || r.photos[0].u !== ids.me || JSON.stringify(r.photos[0].c) !== JSON.stringify([ids.crew]) || r.photos[0].priv) throw new Error(JSON.stringify(r));
  });
  await step('"Log a new visit of your own" opens the log screen, which offers "Add to their visit"', async ()=>{
    await h.js(()=>document.querySelector('#pLog').click()); await h.sleep(900);
    const t = await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || '');
    await h.shot('tg-log');
    if (!/tagged you on their visit/.test(t) || !/Add to their visit/.test(t)) throw new Error(t.slice(0, 300));
    await h.js(()=>document.querySelector('#lJoin').click()); await h.sleep(700);
    if (!/Kabir tagged you/.test(await text())) throw new Error('join sheet');
    await close();
  });
  await step('the scrapbook page you were tagged on: Edit yours and Log a new visit', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); const b=S.books().find(b=>b.kind==='tagged'); go.bookPage(b.id, b.id+'|demo-tg1'); }); await h.sleep(1500);
    const r = await h.js(()=>{ const pg=document.querySelector('.page.flash') || document.querySelector('[data-page-id$="|demo-tg1"]'); return pg && pg.querySelector('.pg-actions')?.innerText || ''; });
    await h.shot('tg-page');
    if (!/Edit yours/.test(r) || !/Log a new visit/.test(r)) throw new Error(r);
    await close();
  });
}
