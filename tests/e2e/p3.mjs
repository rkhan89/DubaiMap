export default async function p3(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', e.message.split('\n')[0]); } };
  await h.seed({mode:'crew'});
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const back = async ()=>{ await h.js(()=>history.back()); await h.sleep(450); };
  const text = ()=>h.js(()=>document.body.innerText);
  const ravi = await h.js(async ()=>{ const S=await import('/store.js'), M=await import('/map.js'); const v=S.venues().find(v=>v.name==='Ravi Restaurant'); const z=M.zoneById(v.zone); return {id:v.id, lat:z.lat, lng:z.lng}; });
  await step('place screen has check-in + plan', async ()=>{ await go('place', ravi.id); await h.sleep(800); const t=await text(); if (!/Check in/.test(t) || !/Plan a bite/.test(t)) throw new Error('buttons missing'); await h.js(()=>{ const s=[...document.querySelectorAll('.screen')].pop(); s.scrollTop=900; }); await h.shot('p3-place'); });
  await step('plan a bite', async ()=>{ await h.js(()=>document.querySelector('#pPlan').click()); await h.sleep(600); await p.type('#evNote', 'Butter chicken night'); await h.shot('p3-plan'); await h.js(()=>document.querySelector('#evGo').click()); await h.sleep(900); if (!/Crew plans here/.test(await text())) throw new Error('no plan on place'); });
  await step('event sheet + RSVP', async ()=>{ await h.js(()=>document.querySelector('[data-event]').click()); await h.sleep(600); await h.shot('p3-event'); await h.js(()=>document.querySelector('[data-seg="rsvp"] [data-v="maybe"]').click()); await h.sleep(400); await back(); });
  await back();
  await step('crew screen upcoming bites', async ()=>{ await h.click('[data-tab="crew"]'); await h.sleep(600); const t=await text(); if (!/Upcoming bites/.test(t) || !/Koukh Al Shay/.test(t)) throw new Error('no upcoming'); await h.js(()=>{ const s=[...document.querySelectorAll('.screen')].pop(); s.scrollTop=300; }); await h.shot('p3-crew'); await back(); });
  await step('bell shows plans', async ()=>{ await h.click('#btnBell'); await h.sleep(500); if (!/planned/.test(await text())) throw new Error('no planned rows'); await h.shot('p3-bell'); await back(); });
  await step('check-in too far', async ()=>{ await h.load('at=25.30,55.45'); await go('checkIn', ravi.id); await h.sleep(1200); const t=await h.js(()=>document.querySelector('#toast').innerText); if (!/away/.test(t)) throw new Error('toast: '+t); });
  await step('check-in on the spot', async ()=>{ await h.load(`at=${ravi.lat},${ravi.lng}`); await go('checkIn', ravi.id); await h.sleep(1500); await h.shot('p3-checkin'); const n=await h.js(async ()=>{ const S=await import('/store.js'); return S.entries({kind:'visit'}).filter(e=>e.checkin).length; }); if (n!==1) throw new Error('checkins '+n); });
  await step('page editor', async ()=>{
    await h.load(); await h.click('[data-tab="shelf"]'); await h.sleep(600);
    await h.js(()=>document.querySelectorAll('.book-spine')[1].click()); await h.sleep(900);
    await h.js(()=>document.querySelector('[data-editpage]').click()); await h.sleep(600);
    await h.js(()=>document.querySelector('[data-seg="playout"] [data-v="grid"]').click());
    await h.js(()=>{ const b=document.querySelector('[data-st]'); if (b) b.click(); });
    await h.sleep(200); await p.type('#pgNote', 'Karak crawl, round two');
    await h.shot('p3-editor');
    await h.js(()=>document.querySelector('#pgSave').click()); await h.sleep(800);
    const t=await text(); if (!/round two/.test(t)) throw new Error('note not on page');
    await h.shot('p3-page');
  });
  await step('share link opens the place', async ()=>{ await h.load(`place=${ravi.id}`); await h.sleep(1500); const t=await text(); if (!/Ravi Restaurant/.test(t) || !/Place Details/.test(t)) throw new Error('not opened'); await h.shot('p3-sharelink'); });
  await step('share link for a new custom place', async ()=>{ await h.load('place=abc123&n=Secret%20Shawarma&z=deira&c=fastfood&lat=25.2705&lng=55.3075'); await h.sleep(1500); const t=await text(); if (!/Secret Shawarma/.test(t)) throw new Error('not created'); });
  await step('manifest + sw', async ()=>{ const r=await h.js(async ()=>({ m:(await fetch('manifest.webmanifest')).ok, i:(await fetch('icon-192.png')).ok, sw: !!(await navigator.serviceWorker.getRegistration()) })); if (!r.m||!r.i||!r.sw) throw new Error(JSON.stringify(r)); });
}
