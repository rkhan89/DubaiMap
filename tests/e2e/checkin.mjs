// One Check in for both "I'm here" and "I went there": the + menu has a single Check in; "I'm here now"
// lists places near you; saved today at the place it's a check-in, saved for another day it's a visit.
//   node shot.mjs checkin 390 light
export default async function checkin(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('cifail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'me'});
  // a place with an exact spot, and a fake location right at it (dev only: ?at=)
  const v = await h.js(async ()=>{ const S=await import('/store.js'); const v=S.addVenue({ name:'Check-in Test Café', zone:'jumeirah', categories:['cafe'], lat:25.2031, lng:55.2502 }); S.flush(); return { id:v.id, name:v.name, lat:v.lat, lng:v.lng }; });
  await h.load(`at=${v.lat},${v.lng},15`);
  const text = ()=>h.js(()=>document.body.innerText);
  await step('the + menu has one Check in (and Add from link or text)', async ()=>{
    await h.click('#navLog'); await h.sleep(400);
    const rows = await h.js(()=>[...document.querySelectorAll('[data-plus]')].map(b=>b.dataset.plus));
    if (rows.filter(r=>r!=='inbox').join(',') !== 'log,link') throw new Error('rows: '+rows);
    if (!/Check in/.test(await text()) || /Log a place I've been|Check in where I am/.test(await text())) throw new Error('old wording still there');
    await h.shot('ci-menu');
    await h.js(()=>document.querySelector('[data-plus="log"]').click()); await h.sleep(700);
  });
  await step('I’m here now lists the places near you, nearest first, with how far', async ()=>{
    await h.js(()=>document.querySelector('#lHere').click()); await h.sleep(1200);
    const first = await h.js(()=>document.querySelector('#lRes [data-v]')?.innerText || '');
    if (!first.includes(v.name) || !/\d+ m away/.test(first)) throw new Error('first: '+first.replace(/\n/g,' | '));
    await h.shot('ci-near');
    await h.js(id=>document.querySelector(`#lRes [data-v="${id}"]`).click(), v.id); await h.sleep(600);
  });
  await step('at the place today it says checked in, and saves as a check-in', async ()=>{
    if (!/Checked in: you’re here/.test(await text())) throw new Error('no checked-in line');
    await h.shot('ci-here');
    await h.js(()=>{ const b=document.querySelector('#lWho [data-who]:not(.on)'); if (b) b.click(); }); await h.sleep(300);
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(1500);
    const e = await h.js(async id=>{ const S=await import('/store.js'); return S.entries({venueId:id, userId:S.me().id, kind:'visit'}).map(e=>({ checkin:!!e.checkin, date:e.date })); }, v.id);
    if (e.length !== 1 || !e[0].checkin) throw new Error(JSON.stringify(e));
  });
  await step('the same flow for a past day saves a plain visit', async ()=>{
    await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500);
    await h.js(async id=>{ const {go}=await import('/go.js'); go.log({ venueId:id, date:'2026-01-05' }); }, v.id); await h.sleep(700);
    if (/Checked in: you’re here|I’m here now/.test(await h.js(()=>document.querySelector('.screen.in')?.innerText || ''))) throw new Error('a past visit offers a check-in');
    await h.js(()=>{ const b=document.querySelector('#lWho [data-who]:not(.on)'); if (b) b.click(); }); await h.sleep(300);
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(1500);
    const e = await h.js(async id=>{ const S=await import('/store.js'); return S.entries({venueId:id, userId:S.me().id, kind:'visit'}).filter(e=>e.date==='2026-01-05').map(e=>!!e.checkin); }, v.id);
    if (e.length !== 1 || e[0]) throw new Error(JSON.stringify(e));
  });
  await step('a place’s own Check in opens the same screen and finds you', async ()=>{
    await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500);
    await h.js(async id=>{ const {go}=await import('/go.js'); go.place ? go.place(id) : go.placeScreen(id); }, v.id); await h.sleep(800);
    await h.js(()=>document.querySelector('#pCheck').click()); await h.sleep(1500);
    const t = await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || document.body.innerText);
    if (!/Check in/.test(t) || !/Checked in: you’re here/.test(t)) throw new Error(t.slice(0, 160).replace(/\n/g,' | '));
    await h.shot('ci-from-place');
  });
}
