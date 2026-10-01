// A brand-new visitor: sign up, then follow the first-run guide to pin a first place.
import path from 'path';
export default async function tour(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', e.message.split('\n')[0]); await h.shot('tfail-'+name.replace(/\W+/g,'-')); } };
  const typeIn = async (sel, text)=>{ await p.waitForSelector(sel, {visible:true, timeout:6000}); await p.click(sel, {clickCount:3}); await p.type(sel, text); };
  const tap = async sel=>{ await p.waitForSelector(sel, {visible:true, timeout:6000}); await p.click(sel); await h.sleep(500); };
  const bubble = ()=>h.js(()=>{ const b=document.querySelector('.tour-bubble'); return b && getComputedStyle(b).display!=='none' ? b.innerText : ''; });
  const waitBubble = async (re)=>{ for (let i=0;i<30;i++){ const t=await bubble(); if (re.test(t)) return t; await h.sleep(200); } throw new Error('bubble never said '+re+' (now: '+(await bubble()).slice(0,60)+')'); };
  await h.load();
  await step('sign up', async ()=>{
    await tap('#wEmail'); await typeIn('#eIn','new@example.test'); await tap('#eGo');
    await p.waitForSelector('.code-box input', {visible:true}); await p.click('.code-box input'); await p.keyboard.type('123456'); await tap('#vfyGo');
    await typeIn('#hIn','newbie_'+Math.floor(Math.random()*1e4)); await tap('#hGo'); await tap('#aGo'); await tap('#sGo');
    await typeIn('#cName','First Crew'); await tap('#cGo'); await h.sleep(1500);
  });
  await step('map starts empty, no starter places', async ()=>{ const n=await h.js(async ()=>(await import('/store.js')).venues().length); if (n!==0) throw new Error(n+' venues'); });
  await step('guide opens: "Your map looks empty"', async ()=>{ await waitBubble(/map looks empty/i); await h.shot('t-01-intro'); });
  await step('pin my first place', async ()=>{ await h.js(()=>document.querySelector('[data-t="start"]').click()); await waitBubble(/Where did you go/); await h.shot('t-02-search'); });
  await step('type the name', async ()=>{ await p.type('#logQ', 'Sunset Karak Corner'); await waitBubble(/Put it on the map/); await h.shot('t-03-add'); });
  await step('add it', async ()=>{ await h.js(()=>document.querySelector('#lNew').click()); await waitBubble(/Where is it/); await h.shot('t-04-where'); });
  await step('area', async ()=>{ await p.select('#vfZ', 'karama'); await h.sleep(300); await h.js(()=>document.querySelector('[data-t="next"]').click()); await waitBubble(/What kind/); await h.shot('t-05-kind'); });
  await step('kind + save place', async ()=>{ await h.js(()=>document.querySelector('#vfC [data-cat="karak"]').click()); await h.sleep(200); await h.js(()=>document.querySelector('#vfS').click()); await waitBubble(/How was it/); await h.shot('t-06-rate'); });
  await step('rate it', async ()=>{ await h.js(()=>{ const b=document.querySelectorAll('#lStars button')[4]; const r=b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('click',{bubbles:true, clientX:r.right-2, clientY:r.top+4})); }); await waitBubble(/Add a photo/); await h.shot('t-07-photo'); });
  await step('photo', async ()=>{ const input=await p.$('#lPh'); await input.uploadFile(path.resolve('fixture.jpg')); await h.sleep(1200); await h.js(()=>document.querySelector('[data-t="next"]').click()); await waitBubble(/Who sees it/); await h.shot('t-08-share'); });
  await step('share', async ()=>{ await h.js(()=>{ const c=document.querySelector('[data-who]:not([data-who="me"])'); if (c) c.click(); }); await h.sleep(200); await h.js(()=>document.querySelector('[data-t="next"]').click()); await waitBubble(/Save it/); await h.shot('t-09-save'); });
  await step('save', async ()=>{ await h.js(()=>document.querySelector('#lSave').click()); await waitBubble(/Your first stamp/); await h.shot('t-10-stamp'); });
  for (const [re, name] of [[/You, or your crew/,'mode'],[/Filters/,'filter'],[/Crew news/,'bell'],[/Bring your crew/,'crew'],[/Your photobook/,'shelf']]){
    await step('next → '+name, async ()=>{ await h.js(()=>{ const u=document.querySelector('.unlock [data-x="ok"]'); if (u) u.click(); }); await h.sleep(300); await h.js(()=>document.querySelector('[data-t="next"]').click()); await waitBubble(re); await h.shot('t-11-'+name); });
  }
  await step('done, guide gone, place saved', async ()=>{
    await h.js(()=>document.querySelector('[data-t="next"]').click()); await h.sleep(600);
    const r=await h.js(async ()=>{ const S=await import('/store.js'); return { tour:!!document.querySelector('.tour'), done:S.flag('tourDone'), visits:S.entries({kind:'visit'}).length, empty:!!document.querySelector('#emptyMap') }; });
    if (r.tour || !r.done || r.visits!==1 || r.empty) throw new Error(JSON.stringify(r));
    await h.shot('t-12-done');
  });
  await step('skip path: empty-map card for someone who skips', async ()=>{
    await h.js(async ()=>{ localStorage.clear(); indexedDB.deleteDatabase('bites-photos'); }); await h.load();
    await tap('#wEmail'); await typeIn('#eIn','skip@example.test'); await tap('#eGo');
    await p.waitForSelector('.code-box input', {visible:true}); await p.click('.code-box input'); await p.keyboard.type('123456'); await tap('#vfyGo');
    await typeIn('#hIn','skipper_'+Math.floor(Math.random()*1e4)); await tap('#hGo'); await tap('#aGo'); await tap('#sGo'); await tap('#cSolo'); await h.sleep(1500);
    await waitBubble(/map looks empty/i);
    await h.js(()=>document.querySelector('[data-t="skip"]').click()); await h.sleep(700);
    const r=await h.js(()=>({ tour:!!document.querySelector('.tour'), card:!!document.querySelector('#emptyMap') }));
    if (r.tour || !r.card) throw new Error(JSON.stringify(r));
    await h.shot('t-13-empty-card');
  });
}
