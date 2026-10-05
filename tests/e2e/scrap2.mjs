// Playful features around the scrapbook: the small "sticker unlocked" moment after the
// taped-in one, sticking a sticker on a page, the crew leaderboard in categories, crew
// challenges, and the monthly recap as a scrapbook spread.
export default async function scrap2(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('sc2fail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  await h.seed({mode:'crew'});
  await step('a first-of-its-kind visit: taped in, then a small sticker card (not a full-screen popup)', async ()=>{
    const vid = await h.js(async ()=>{
      const S=await import('/store.js');
      const mine = new Set(S.entries({userId:S.me().id, kind:'visit'}).flatMap(e=>S.venue(e.venueId)?.categories||[]));
      let v = S.venues().find(x=>(x.categories||[]).length && !(x.categories||[]).some(c=>mine.has(c)));
      if (!v) v = S.addVenue({ name:'Pizza Test Spot', zone:'satwa', categories:['pizza'] });
      return v.id;
    });
    await h.js(async (vid)=>{ const {go}=await import('/go.js'); go.log({ venueId:vid }); }, vid); await h.sleep(700);
    await h.js(()=>document.querySelector('[data-who]:not([data-who="me"])').click()); await h.sleep(150);
    await h.js(()=>document.querySelector('#lSave').click());
    await h.sleep(2000);
    const r = await h.js(()=>({ peel:document.querySelector('.sticker-peel')?.innerText||'', modal:!!document.querySelector('.unlock') }));
    if (!/sticker unlocked|stickers unlocked/i.test(r.peel)) throw new Error('no sticker card: '+JSON.stringify(r));
    if (r.modal) throw new Error('full-screen popup shown');
    await h.shot('sc2-peel');
    await h.sleep(4500);
  });
  await step('stick a sticker on a page from the page editor', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); go.book(S.books().find(b=>b.kind==='crew').id); }); await h.sleep(1300);
    await h.js(()=>document.querySelector('.feed .page [data-editpage]').click()); await h.sleep(600);
    await h.shot('sc2-editor');
    await h.js(()=>document.querySelector('[data-st]').click()); await h.sleep(200);
    await h.js(()=>{ const t=document.querySelector('#pgNote'); t.value='Best slice in Satwa'; });
    await h.js(()=>document.querySelector('#pgSave').click()); await h.sleep(700);
    const r = await h.js(()=>{ const pg=document.querySelector('.feed .page'); return { sticker:!!pg.querySelector('.page-sticker'), note:pg.querySelector('.page-note')?.innerText||'' }; });
    if (!r.sticker || !/Best slice/.test(r.note)) throw new Error(JSON.stringify(r));
    await h.shot('sc2-page-sticker');
    await close();
  });
  await step('leaderboard: crew-only, this month, categories with winner and runner-up', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.leaderboard(); }); await h.sleep(700);
    const t = await text();
    for (const c of ['Most dessert runs','First to find','Most tagged','Most check-ins']) if (!t.includes(c)) throw new Error('missing '+c);
    if (/All time/i.test(t) || / pts/.test(t)) throw new Error('points ranking still shown');
    if (!/Winner/i.test(t)) throw new Error('no winners');
    await h.shot('sc2-leaderboard');
    await close();
  });
  await step('crew challenges with shared progress, and your own goals below', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.goals(); }); await h.sleep(700);
    const n = await h.js(()=>document.querySelectorAll('.goal-card.challenge').length);
    if (n !== 3) throw new Error('challenges: '+n);
    if (!/Just me/.test(await text())) throw new Error('no personal goals');
    await h.shot('sc2-challenges');
    await close();
  });
  await step('the monthly recap is a scrapbook spread, for you or the crew', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.recap(); }); await h.sleep(2500);
    const ok = await h.js(()=>{ const c=document.querySelector('#rcCanvas'); return c && c.width===1080 && c.height===1350; });
    if (!ok) throw new Error('no canvas');
    await h.shot('sc2-recap-crew');
    await h.js(()=>document.querySelector('[data-v="me"]').click()); await h.sleep(2200);
    await h.shot('sc2-recap-me');
    // the spread itself, full size
    const data = await h.js(()=>document.querySelector('#rcCanvas').toDataURL('image/png'));
    const fs = await import('fs'); fs.writeFileSync('shots/sc2-spread-'+h.width+'-'+h.THEME+'.png', Buffer.from(data.split(',')[1], 'base64'));
    await close();
  });
}
