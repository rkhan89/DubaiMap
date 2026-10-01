// Full click-through as a brand-new visitor: sign up, crew, log a place with a photo, check it everywhere.
import path from 'path';
export default async function e2e(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', e.message.split('\n')[0]); await h.shot('fail-'+name.replace(/\W+/g,'-')); } };
  const typeIn = async (sel, text)=>{ await p.waitForSelector(sel, {visible:true, timeout:5000}); await p.click(sel, {clickCount:3}); await p.type(sel, text); };
  const tap = async sel=>{ await p.waitForSelector(sel, {visible:true, timeout:5000}); await p.click(sel); await h.sleep(500); };
  const text = ()=>h.js(()=>document.body.innerText);
  await h.load();
  await step('welcome shows', async ()=>{ if (!(await text()).includes('Continue with Email')) throw new Error('no welcome'); await h.shot('e-01-welcome'); });
  await step('email', async ()=>{ await tap('#wEmail'); await typeIn('#eIn', 'tester@example.test'); await tap('#eGo'); });
  await step('code', async ()=>{ await p.waitForSelector('.code-box input', {visible:true, timeout:5000}); await p.click('.code-box input'); await p.keyboard.type('123456'); await h.sleep(300); await h.shot('e-02-code'); await tap('#vfyGo'); });
  await step('handle', async ()=>{ await typeIn('#hIn', 'tester_'+Math.floor(Math.random()*1e4)); await h.sleep(300); await h.shot('e-03-handle'); await tap('#hGo'); });
  await step('avatar', async ()=>{ await p.waitForSelector('#aGo', {visible:true}); await p.click('[data-k="skin"] button:nth-child(3)'); await h.sleep(200); await h.shot('e-04-avatar'); await tap('#aGo'); });
  await step('share default', async ()=>{ await h.shot('e-05-share'); await tap('#sGo'); });
  await step('crew create', async ()=>{ await typeIn('#cName', 'Test Crew'); await h.shot('e-06-crew'); await tap('#cGo'); await h.sleep(600); });
  await step('lands on map (+coach)', async ()=>{ await h.sleep(1200); await h.shot('e-07-after-onboarding'); const t=await text(); if (!/me/i.test(t) || !/crew/i.test(t)) throw new Error('no map controls'); });
  await step('skip the guide', async ()=>{ for (let i=0;i<20 && !(await h.js(()=>!!document.querySelector('.tour [data-t="skip"]')));i++) await h.sleep(200); await h.js(()=>document.querySelector('.tour [data-t="skip"]').click()); await h.sleep(400); if (!(await h.js(()=>!!document.querySelector('#emptyMap')))) throw new Error('no empty-map card'); });
  await step('log a place with photo', async ()=>{
    await tap('#navLog'); await tap('[data-plus="log"]'); await typeIn('#logQ', 'Ravi Restaurant'); await h.sleep(300);
    await h.js(()=>document.querySelector('#lNew').click()); await h.sleep(500); await p.select('#vfZ','satwa'); await h.js(()=>document.querySelector('#vfC [data-cat="cafeteria"]').click()); await h.sleep(200); await h.js(()=>document.querySelector('#vfS').click()); await h.sleep(600);
    await h.js(()=>{ const b=document.querySelectorAll('#lStars button')[3]; const r=b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('click',{bubbles:true, clientX:r.right-2, clientY:r.top+5})); });
    await typeIn('#lNotes', 'Butter chicken, two parottas.');
    const input = await p.$('#lPh'); await input.uploadFile(path.resolve('fixture.jpg')); await h.sleep(1500);
    await h.shot('e-08-log');
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(1800);
    await h.shot('e-09-saved');
  });
  await step('first-bite sticker unlocks', async ()=>{ await h.sleep(2500); const u=await h.js(()=>!!document.querySelector('.unlock')); if (!u) throw new Error('no unlock'); await h.shot('e-09b-unlock'); await h.js(()=>document.querySelector('.unlock [data-x="ok"]').click()); await h.sleep(400); });
  await step('Me count is 1', async ()=>{ const t=await h.js(()=>document.querySelector('#mapMode').innerText); if (!/Me\s*1/i.test(t)) throw new Error('mode text: '+t); });
  await step('list shows it', async ()=>{ await tap('[data-tab="list"]'); if (!(await text()).includes('Ravi Restaurant')) throw new Error('not in list'); await h.shot('e-10-list'); });
  await step('place sheet', async ()=>{ await h.js(()=>document.querySelector('[data-venue]').click()); await h.sleep(800); const t=await text(); if (!t.includes('Butter chicken')) throw new Error('note missing'); await h.shot('e-11-place'); await h.js(()=>history.back()); await h.sleep(400); });
  await step('shelf has the photo', async ()=>{ await tap('[data-tab="shelf"]'); await h.sleep(500); if (!(await text()).includes('1 photo')) throw new Error('no 1 photo'); await h.shot('e-12-shelf'); await h.js(()=>history.back()); await h.sleep(400); });
  await step('crew screen', async ()=>{ await tap('[data-tab="crew"]'); if (!(await text()).includes('Test Crew')) throw new Error('crew name missing'); await h.shot('e-13-crew'); await h.js(()=>history.back()); await h.sleep(400); });
  await step('bell (no crew activity yet)', async ()=>{ await tap('[data-tab="map"]'); await tap('#btnBell'); await h.shot('e-14-bell'); await h.js(()=>history.back()); await h.sleep(400); });
  await step('profile + settings, switch to dark', async ()=>{ await tap('.app-header .profile-btn'); await h.sleep(500); await h.shot('e-15a-profile'); await tap('#prSettings'); await h.js(()=>document.querySelector('[data-seg="theme"] [data-v="dark"]').click()); await h.sleep(1500); const th=await h.js(()=>document.documentElement.dataset.theme); if (th!=='dark') throw new Error('theme '+th); await h.js(()=>history.back()); await h.sleep(500); await h.js(()=>history.back()); await h.sleep(600); await h.shot('e-15-dark'); });
  await step('reload keeps data and theme', async ()=>{ await h.load(); const t=await h.js(()=>({mode:document.querySelector('#mapMode').innerText, th:document.documentElement.dataset.theme})); if (!/Me\s*1/i.test(t.mode) || t.th!=='dark') throw new Error(JSON.stringify(t)); });
  await step('sample crew on', async ()=>{ await tap('.app-header .profile-btn'); await tap('#prSettings'); await h.js(()=>document.querySelector('#sDemo').click()); await h.sleep(1200); await h.js(()=>history.back()); await h.sleep(500); await h.js(()=>history.back()); await h.sleep(700); const t=await h.js(()=>document.querySelector('#mapMode').innerText); if (!/crew\s*[1-9]\d/i.test(t)) throw new Error(t); await h.shot('e-16-demo'); });
}
