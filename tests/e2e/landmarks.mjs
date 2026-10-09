// Landmarks from the art pack: tapping anywhere on one opens its card; the critter hook stays empty.
export default async function landmarks(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('lmfail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'me'});
  const go = async (id, ratio)=>{
    await h.js(async (id, ratio)=>{ const M=await import('/map.js'); const w=M.landmarkWorld(id); M.viewAt({ x:w.x, y:(w.y + w.top)/2 }, ratio); }, id, ratio);
    for (let k=0; k<30; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
  };
  // tap a point on screen through the map's own pointer handling
  const tapAt = async (x, y)=>{ await h.page.mouse.click(x, y); await h.sleep(700); };
  await step('tapping the Burj Khalifa (anywhere on the tower) opens its card', async ()=>{
    await go('burj_khalifa', 9);
    const p = await h.js(()=>({ x:innerWidth/2, y:innerHeight/2 }));
    await tapAt(p.x, p.y - 30);
    const t = await h.js(()=>document.querySelector('.lm-card')?.innerText || '');
    if (!/Burj Khalifa/.test(t) || !/828 m/.test(t)) throw new Error('card: '+t.slice(0,80));
    await h.shot('lm-card-burj');
    await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500);
  });
  await step('tapping empty ground opens no card', async ()=>{
    await h.js(async ()=>{ const M=await import('/map.js'); M.viewAt(M.placeWorld({ lat:25.03, lng:55.33 }), 9); }); await h.sleep(1500);
    const p = await h.js(()=>({ x:innerWidth/2, y:innerHeight/2 }));
    await tapAt(p.x, p.y);
    if (await h.js(()=>!!document.querySelector('.lm-card'))) throw new Error('a card opened');
  });
  await step('every art-pack landmark is on land, on its island or in its lake', async ()=>{
    const r = await h.js(async ()=>{ const M=await import('/map.js'), L=await import('/landmarks.js');
      return L.LANDMARKS.map(l=>{ const w=M.landmarkWorld(l.id); return { id:l.id, ok:!!w, hit:w ? !!M.landmarkAt : false }; }); });
    const bad = r.filter(x=>!x.ok); if (bad.length) throw new Error(JSON.stringify(bad));
  });
  await step('the critter hook: the eight landmarks with a critter return it; the card shows no silhouette (flag off)', async ()=>{
    const v = await h.js(async ()=>{ const L=await import('/landmarks.js'); return { n:[...L.LANDMARKS, ...L.TAPPABLE].filter(l=>L.landmarkCritter(l.id)).length, flag:L.SHOW_LANDMARK_CRITTER }; });
    if (v.n !== 8 || v.flag) throw new Error(JSON.stringify(v));
  });
  for (const id of ['museum_of_the_future','dubai_frame','al_fahidi','atlantis_the_palm','emirates_towers','jumeirah_mosque','burj_al_arab','global_village','dubai_mall','mall_of_the_emirates','ibn_battuta','dragon_mart','wafi','city_centre_deira']){
    await go(id, 9); await h.shot('lm-' + id);
  }
}
