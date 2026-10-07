// Every screen of the app, in order, for the testers' pack: node shot.mjs gallery 390 light
// Files come out as shots/g01-<name>-390-light.png … (numbered in app order).
import path from 'path';
export default async function gallery(h){
  const p = h.page;
  let n = 0;
  const G = async (name)=>{ n++; await h.sleep(250); await h.js(()=>document.querySelector('#toast')?.classList.remove('show')); await h.sleep(250); await h.shot('g'+String(n).padStart(2,'0')+'-'+name); };
  const step = async (name, fn)=>{ try{ await fn(); } catch(e){ console.log('skip', name, '-', (e.message||'').split('\n')[0]); } };
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const back = async ()=>{ await h.js(()=>history.back()); await h.sleep(450); };
  const closeAll = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  const tap = async sel=>{ await p.waitForSelector(sel, {visible:true, timeout:5000}); await p.click(sel); await h.sleep(500); };
  const typeIn = async (sel, text)=>{ await p.waitForSelector(sel, {visible:true, timeout:5000}); await p.click(sel, {clickCount:3}); await p.type(sel, text); };
  const scrollTop = async (px)=>{ await h.js(px=>{ const s=[...document.querySelectorAll('.screen.in, .sheet.in .sheet-inner')].pop(); if (s) s.scrollTop=px; }, px); await h.sleep(300); };
  const store = (fn, ...a)=>h.js(async (src, a)=>{ const S=await import('/store.js'); return (new Function('S','a','return ('+src+')(S,a)'))(S,a); }, fn.toString(), a);

  /* ---------- 1. a brand-new visitor ---------- */
  await h.load();
  await step('welcome', async ()=>{ await G('welcome'); });
  await step('email', async ()=>{ await tap('#wEmail'); await G('sign-in-email'); await typeIn('#eIn', 'sara@example.test'); await tap('#eGo'); });
  await step('code', async ()=>{ await p.waitForSelector('.code-box input', {visible:true}); await p.click('.code-box input'); await p.keyboard.type('123456'); await G('sign-in-code'); await tap('#vfyGo'); });
  await step('handle', async ()=>{ await typeIn('#hIn', 'sara'); await h.sleep(300); await G('onboarding-handle'); await tap('#hGo'); });
  await step('avatar', async ()=>{ await p.waitForSelector('#aGo', {visible:true}); await G('onboarding-avatar'); await tap('#aGo'); });
  await step('who sees', async ()=>{ await G('onboarding-who-sees'); await tap('#sGo'); });
  await step('crew setup', async ()=>{ await G('onboarding-crew-create'); await h.js(()=>document.querySelector('[data-seg="ctab"] [data-v="join"]').click()); await h.sleep(400); await G('onboarding-crew-join'); await h.js(()=>document.querySelector('[data-seg="ctab"] [data-v="create"]').click()); await h.sleep(300); await tap('#cGo'); await h.sleep(1500); });
  await step('first-run guide', async ()=>{ await G('first-run-guide'); for (let i=0;i<20 && !(await h.js(()=>!!document.querySelector('.tour [data-t="skip"]')));i++) await h.sleep(200); await h.js(()=>document.querySelector('.tour [data-t="skip"]').click()); await h.sleep(600); await G('empty-map'); });

  /* ---------- 2. a crew with places (sample data) ---------- */
  await h.js(async ()=>{ localStorage.clear(); const dbs = indexedDB.databases ? await indexedDB.databases() : []; await Promise.all(dbs.map(d=>new Promise(r=>{ const q=indexedDB.deleteDatabase(d.name); q.onsuccess=q.onerror=q.onblocked=()=>r(); }))); });
  await h.seed({mode:'crew'});
  const ids = await store(S=>({ me:S.me().id, trio:S.venues().find(v=>v.name==='Trio Cafe (Dubai Mall)').id, ravi:S.venues().find(v=>v.name==='Ravi Restaurant').id, zone:S.venues().find(v=>v.name==='Ravi Restaurant').zone, maya:'demo-maya' }));
  await step('map', async ()=>{ await G('map-crew'); await h.js(()=>document.querySelector('#mapMode [data-v="me"]').click()); await h.sleep(600); await G('map-me'); await h.js(()=>document.querySelector('#mapMode [data-v="crew"]').click()); await h.sleep(600); });
  await step('peek', async ()=>{ await go('showOnMap', ids.trio); await h.sleep(1400); await G('map-place-peek'); await h.js(()=>document.querySelector('#peek')?.classList.remove('show')); await closeAll(); });
  await step('filter', async ()=>{ await h.click('#btnFilter'); await h.sleep(500); await G('map-filter'); await scrollTop(600); await h.js(()=>document.querySelector('#fCats [data-cat-more]')?.click()); await h.sleep(300); await G('map-filter-categories-meals'); await back(); });
  await step('area', async ()=>{ await go('area', ids.zone); await h.sleep(800); await G('area'); await back(); });
  await step('bell', async ()=>{ await h.click('#btnBell'); await h.sleep(500); await G('bell-crew-activity'); await back(); });
  await step('list', async ()=>{ await h.click('[data-tab="list"]'); await h.sleep(700); await G('list'); await h.click('[data-tab="map"]'); await h.sleep(500); });
  await step('place', async ()=>{ await go('place', ids.ravi); await h.sleep(900); await G('place'); await scrollTop(700); await G('place-reviews'); await scrollTop(1500); await G('place-photos-actions'); });
  await step('plan', async ()=>{ await scrollTop(1100); await h.js(()=>document.querySelector('#pPlan').click()); await h.sleep(600); await G('plan-a-bite'); await back(); });
  await step('check-in', async ()=>{ const here = await h.js(async (vid)=>{ const S=await import('/store.js'), M=await import('/map.js'); const z=M.zoneById(S.venue(vid).zone); return z.lat+','+z.lng; }, ids.ravi); await h.load('at='+here); await go('checkIn', ids.ravi); await h.sleep(1500); await G('check-in-who'); await back(); });
  await step('event', async ()=>{ await h.click('[data-tab="crew"]'); await h.sleep(700); await h.js(()=>document.querySelector('[data-event]').click()); await h.sleep(600); await G('event-rsvp'); await back(); await back(); });
  await step('plus menu', async ()=>{ await h.click('#navLog'); await h.sleep(400); await G('plus-menu'); });
  await step('log', async ()=>{ await h.js(()=>document.querySelector('[data-plus="log"]').click()); await h.sleep(600); await G('log-search'); await typeIn('#logQ', 'Salt Bae'); await h.sleep(300); await G('log-search-typed'); await h.js(()=>document.querySelector('#lNew').click()); await h.sleep(600); await G('new-place'); await h.js(()=>document.querySelector('#vfC [data-cat-more]')?.click()); await h.sleep(300); await G('new-place-all-categories'); await closeAll(); });
  await step('log details', async ()=>{ await go('log', { venueId: ids.ravi }); await h.sleep(800); await G('log-visit'); await scrollTop(700); await G('log-meal-notes-photos'); await scrollTop(1400); await G('log-who-tagging'); await closeAll(); });
  await step('add from link', async ()=>{ await go('shareAdd'); await h.sleep(600); await G('add-from-link'); await h.js(()=>{ const i=document.querySelector('#shIn'); i.value='https://www.google.com/maps/place/Sunset+Karak+Corner/@25.2329,55.2745,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f42d0b2b5b5b5:0x8f1f7b1e2c3d4e5f!8m2!3d25.2331!4d55.2759'; }); await h.js(()=>document.querySelector('#shGo').click()); await p.waitForSelector('#cfAdd', {visible:true, timeout:8000}); await G('add-from-link-confirm'); await scrollTop(500); await G('add-from-link-confirm-2'); await back(); });
  await step('which place', async ()=>{ await h.js(()=>{ const i=document.querySelector('#shIn'); i.value='Knot'; }); await h.js(()=>document.querySelector('#shGo').click()); await p.waitForSelector('#npQ', {visible:true, timeout:8000}); await G('add-from-link-which-place'); await closeAll(); });
  await step('crew', async ()=>{ await store(async S=>{ await S.createCrew({ name:'Family' }); const k=S.myCrews().find(c=>c.name==='Sample Crew'); S.setActiveCrew(k.id); }); await h.click('[data-tab="crew"]'); await h.sleep(700); await G('crew'); await scrollTop(800); await G('crew-members'); await back(); });
  await step('crew solo', async ()=>{ await store(S=>S.setActiveCrew(S.myCrews().find(c=>c.name==='Family').id)); await h.click('[data-tab="crew"]'); await h.sleep(700); await G('crew-just-you'); await back(); await store(S=>S.setActiveCrew(S.myCrews().find(c=>c.name==='Sample Crew').id)); });
  await step('new crew', async ()=>{ await go('crewSetup', {}); await h.sleep(600); await G('start-another-crew'); await back(); });
  await step('switch crew on map', async ()=>{ await h.js(()=>document.querySelector('#mapMode [data-v="crew"]').click()); await h.sleep(500); await G('map-switch-crew'); await back(); });
  await step('invite', async ()=>{ await go('inviteLanding', 'SAMPLE7'); await h.sleep(900); await G('invite-link'); await back(); });
  await step('critters', async ()=>{ await go('critters'); await h.sleep(700); await G('critters'); await back(); });
  await step('profile', async ()=>{ await go('profile', ids.me); await h.sleep(800); await G('profile'); await scrollTop(700); await G('profile-2'); await back(); });
  await step('friend', async ()=>{ await go('profile', ids.maya); await h.sleep(800); await G('friend-profile'); await back(); });
  await step('stickers', async ()=>{ await go('stickers', ids.me); await h.sleep(700); await G('stickers'); await back(); });
  await step('goals', async ()=>{ await go('goals'); await h.sleep(700); await G('goals'); await back(); });
  await step('recap', async ()=>{ await go('recap'); await h.sleep(900); await G('monthly-recap'); await back(); });
  await step('settings', async ()=>{ await go('settings'); await h.sleep(700); await G('settings'); await scrollTop(700); await G('settings-2'); await scrollTop(1400); await G('settings-3'); await back(); });
  await step('shelf', async ()=>{ await h.click('[data-tab="shelf"]'); await h.sleep(700); await G('shelf'); });
  await step('book', async ()=>{ await h.js(()=>document.querySelector('.book-spine').click()); await h.sleep(900); await G('photobook'); await h.js(()=>document.querySelector('[data-seg="bmode"] [data-v="place"]').click()); await h.sleep(600); await G('photobook-by-place'); await h.js(()=>document.querySelector('[data-seg="bmode"] [data-v="date"]').click()); await h.sleep(400); });
  await step('book filter', async ()=>{ await h.js(()=>document.querySelector('#bkFilter').click()); await h.sleep(600); await G('photobook-filter'); await back(); });
  await step('cover', async ()=>{ await h.js(()=>document.querySelector('#bkCover').click()); await h.sleep(800); await G('cover-designer'); await back(); await back(); });
  await step('crew book', async ()=>{ await h.click('[data-tab="shelf"]'); await h.sleep(600); await h.js(()=>[...document.querySelectorAll('.book-spine')].find(b=>/Collaborative/i.test(b.textContent)).click()); await h.sleep(900); await G('crew-photobook'); });
  await step('page editor', async ()=>{ await h.js(()=>document.querySelector('[data-editpage]').click()); await h.sleep(600); await G('page-editor'); await back(); });
  await step('viewer', async ()=>{ await h.js(()=>document.querySelector('.screen.in [data-photo]').click()); await h.sleep(800); await G('photo-viewer'); await back(); });
  await step('add photos', async ()=>{
    const [chooser] = await Promise.all([p.waitForFileChooser({timeout:4000}).catch(()=>null), h.js(()=>document.querySelector('#bkAddTop').click())]);
    await h.sleep(500); if (chooser) await chooser.accept([path.resolve('fixture.jpg')]);
    await h.sleep(1500); await h.js(()=>{ const i=document.querySelector('#apQ'); i.value='Ravi'; i.dispatchEvent(new Event('input')); }); await h.sleep(500);
    await h.js(()=>[...document.querySelectorAll('.search-result[data-v]')].pop().click()); await h.sleep(500); await G('add-photos'); await scrollTop(900); await G('add-photos-2'); await h.js(()=>document.querySelector('#apGo').click()); await h.sleep(1500); await closeAll(); });
  await step('photobook filled', async ()=>{ await h.click('[data-tab="shelf"]'); await h.sleep(700); await h.js(()=>document.querySelector('.book-spine').click()); await h.sleep(900); await G('photobook-with-photos'); await closeAll(); });
  /* ---------- 3. night mode ---------- */
  await step('dark', async ()=>{ await h.js(async ()=>{ const T=await import('/theme.js'); T.setThemePref('dark'); }); await h.sleep(1200); await G('night-map'); await go('place', ids.trio); await h.sleep(900); await G('night-place'); await back(); await h.click('[data-tab="shelf"]'); await h.sleep(700); await G('night-shelf'); });
  console.log('gallery: '+n+' screens');
}
