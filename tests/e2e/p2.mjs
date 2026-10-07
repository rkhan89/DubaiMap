export default async function p2(h){
  await h.seed({mode:'crew'});
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const back = async ()=>{ await h.js(()=>history.back()); await h.sleep(400); };
  await h.click('.app-header .profile-btn'); await h.sleep(700); await h.shot('p2-profile');
  await h.js(()=>{ const s=[...document.querySelectorAll('.screen')].pop(); s.scrollTop=700; }); await h.shot('p2-profile2');
  await go('stickers'); await h.sleep(600); await h.shot('p2-stickers'); await back();
  await go('goals'); await h.sleep(600); await h.shot('p2-goals'); await back();
  await go('recap'); await h.sleep(1500); await h.shot('p2-recap'); await back();
  await go('settings'); await h.sleep(600); await h.shot('p2-settings');
  await h.js(()=>{ const s=[...document.querySelectorAll('.screen')].pop(); s.scrollTop=700; }); await h.shot('p2-settings2');
  await back(); await back();
  // explored areas on
  await h.js(async ()=>{ const P=await import('/prefs.js'); P.setPref('zones', true); const {go}=await import('/go.js'); go.refresh(); });
  await h.sleep(900); await h.shot('p2-zones');
  // an unlock
  await h.js(async ()=>{ localStorage.setItem('bites-badges-seen-'+(await import('/store.js')).me().id, '[]'); const {go}=await import('/go.js'); go.checkBadges(); });
  await h.sleep(1200); await h.shot('p2-unlock');
}
