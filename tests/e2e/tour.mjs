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
    await typeIn('#hIn','newbie_'+Math.floor(Math.random()*1e4)); await tap('#hGo'); await tap('#aGo');
    await typeIn('#cName','First Crew'); await tap('#cGo'); await h.sleep(1500);
  });
  await step('map starts empty, no starter places', async ()=>{ const n=await h.js(async ()=>(await import('/store.js')).venues().length); if (n!==0) throw new Error(n+' venues'); });
  await step('guide opens: "Your map looks empty"', async ()=>{ await waitBubble(/map looks empty/i); await h.shot('t-01-intro'); });
  await step('pin my first place', async ()=>{ await h.js(()=>document.querySelector('[data-t="start"]').click()); await waitBubble(/Where did you go/); await h.shot('t-02-search'); });
  await step('type the name: the hint steps aside while you add the place', async ()=>{ await p.type('#logQ', 'Sunset Karak Corner'); await h.sleep(500); await h.js(()=>document.querySelector('#lNew').click()); await h.sleep(500);
    if (/Where is it|What kind|Put it on the map/.test(await bubble())) throw new Error('old step hints still shown'); await h.shot('t-03-add'); });
  await step('add it: area, kind, rating and a photo, no hints needed', async ()=>{
    await p.browserContext().overridePermissions(new URL(p.url()).origin, ['geolocation']); await p.setGeolocation({ latitude:25.2420, longitude:55.3010 });
    await h.js(()=>document.querySelector('#vfLoc').click()); await h.sleep(900); await p.select('#vfZ', 'karama'); await h.sleep(200); await h.js(()=>document.querySelector('#vfC [data-cat="karak"]').click()); await h.sleep(200); await h.js(()=>document.querySelector('#vfS').click()); await h.sleep(600);
    await h.js(()=>{ const b=document.querySelectorAll('#lStars button')[4]; const r=b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('click',{bubbles:true, clientX:r.right-2, clientY:r.top+4})); });
    const input=await p.$('#lPh'); await input.uploadFile(path.resolve('fixture.jpg')); await h.sleep(1200);
    await waitBubble(/Save it/); await h.shot('t-09-save'); });
  await step('save', async ()=>{ await h.js(()=>document.querySelector('[data-save]:not([data-save="me"])').click()); await waitBubble(/Your first stamp/); await h.shot('t-10-stamp'); });
  await step('three hints in all', async ()=>{ const t=await bubble(); if (!/3 \/ 3/.test(t)) throw new Error(t.slice(0, 80)); await h.js(()=>{ const u=document.querySelector('.unlock [data-x="ok"]'); if (u) u.click(); }); });
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
    await typeIn('#hIn','skipper_'+Math.floor(Math.random()*1e4)); await tap('#hGo'); await tap('#aGo'); await tap('#cSolo'); await h.sleep(1500);
    await waitBubble(/map looks empty/i);
    await h.js(()=>document.querySelector('[data-t="skip"]').click()); await h.sleep(700);
    const r=await h.js(()=>({ tour:!!document.querySelector('.tour'), card:!!document.querySelector('#emptyMap') }));
    if (r.tour || !r.card) throw new Error(JSON.stringify(r));
    await h.shot('t-13-empty-card');
  });
}
