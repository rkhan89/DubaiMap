export default async function screens(h){
  await h.seed({mode:'crew'});
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const back = ()=>h.js(()=>history.back());
  const venueId = await h.js(async ()=>{ const S=await import('/store.js'); return S.venues().find(v=>v.name==='Trio Cafe (Dubai Mall)').id; });
  await h.click('[data-tab="list"]'); await h.shot('s-list');
  await h.click('[data-tab="map"]');
  await go('place', venueId); await h.sleep(700); await h.shot('s-place');
  await h.js(()=>{ const s=[...document.querySelectorAll('.screen')].pop(); s.scrollTop=600; }); await h.shot('s-place2');
  await back(); await h.sleep(400);
  await go('log', {venueId}); await h.sleep(600); await h.shot('s-log');
  await back(); await h.sleep(400);
  await h.click('[data-tab="crew"]'); await h.sleep(600); await h.shot('s-crew');
  await back(); await h.sleep(400);
  await h.click('[data-tab="shelf"]'); await h.sleep(600); await h.shot('s-shelf');
  await h.click('.book-spine'); await h.sleep(900); await h.shot('s-book');
  await back(); await h.sleep(400); await back(); await h.sleep(400);
  await h.click('.profile-btn'); await h.sleep(500); await h.shot('s-settings');
  await h.js(()=>{ const s=document.querySelector('.sheet .sheet-inner'); s.scrollTop=400; }); await h.shot('s-settings2');
  await back(); await h.sleep(400);
  await h.click('#btnBell'); await h.sleep(500); await h.shot('s-activity');
  await back(); await h.sleep(400);
  await h.click('#btnFilter'); await h.sleep(500); await h.shot('s-filter');
  await back(); await h.sleep(300);
  await h.click('.stamp-anchor .stamp'); await h.sleep(900); await h.shot('s-peek');
}
