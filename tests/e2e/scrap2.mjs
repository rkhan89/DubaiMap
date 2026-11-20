// The small "sticker unlocked" moment after the taped-in one: a card that peels in, not a full-screen popup.
// (Stickers on a page are checked in decorate.mjs, the monthly spread in drops.mjs.)
export default async function scrap2(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('sc2fail-'+name.replace(/\W+/g,'-')); } };
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
    await h.js(()=>document.querySelector('[data-save]:not([data-save="me"])').click());
    let r = {};   // the card follows the taped-in toast, a moment after saving
    for (let k = 0; k < 40; k++){ r = await h.js(()=>({ peel:document.querySelector('.sticker-peel')?.innerText||'', modal:!!document.querySelector('.unlock') })); if (r.peel || r.modal) break; await h.sleep(200); }
    if (!/sticker unlocked|stickers unlocked/i.test(r.peel)) throw new Error('no sticker card: '+JSON.stringify(r));
    if (r.modal) throw new Error('full-screen popup shown');
    await h.shot('sc2-peel');
    await h.sleep(4500);
  });
}
