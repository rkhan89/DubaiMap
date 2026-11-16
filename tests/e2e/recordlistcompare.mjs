// The same List and place screens on any build, for before/after pictures (phase 2):
//   PFX=before BASE=<old build> node shot.mjs recordListCompare 390
export default async function recordListCompare(h){
  const pfx = process.env.PFX || 'after';
  await h.seed({mode:'crew'});
  const id = await h.js(async ()=>{ const S = await import('/store.js'); const v = S.venues().find(v=>v.name==='Ravi Restaurant');
    S.updateVenue(v.id, { phone:'+97143334444', website:'https://ravi-restaurant.example.com', instagram:'ravi.restaurant', otherSocials:['https://www.facebook.com/ravirestaurant'] });
    if (S.addVenueTag) S.addVenueTag(v.id, 'late night'); S.flush(); return v.id; });
  await h.js(()=>{ const p=JSON.parse(localStorage.getItem('bites-prefs')||'{}'); p.listTab='places'; localStorage.setItem('bites-prefs', JSON.stringify(p)); });
  await h.click('[data-tab="list"]'); await h.sleep(600); await h.shot(pfx+'-list');
  await h.js(async id=>{ const {go}=await import('/go.js'); go.place(id); }, id); await h.sleep(1200);
  await h.js(()=>{ const s=document.querySelector('.screen.in .place-body') || document.querySelector('.screen.in'); const t=document.querySelector('.screen.in h1'); if (t) t.scrollIntoView({ block:'start' }); }); await h.sleep(300);
  await h.shot(pfx+'-place');
}
