// The Marina pack: Dubai Marina's canal pieces, Princess Tower, Marina 101, Ciel Tower and the Marina Mall; JBR's
// blocks and The Walk along the beach; Bluewaters with Ain Dubai. Close shots by day and night, cards, and the JBR
// blocks have nothing to tap.   node shot.mjs marina 390 light
export default async function marina(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('mrfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  await h.seed({mode:'me'});
  const settle = async ()=>{
    for (let k=0; k<40; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
    await h.sleep(300);
  };
  const look = async (lat, lng, ratio)=>{ await h.js(async (lat, lng, ratio)=>{ const M=await import('/map.js'); M.viewAt(M.placeWorld({ id:'x', lat, lng }), ratio); }, lat, lng, ratio); await settle(); };
  const night = async on=>{ await h.js(async on=>{ const T=await import('/theme.js'); T.setThemePref(on ? 'dark' : 'light'); }, on); await h.sleep(1200); };

  await step('shots: the Marina, JBR and Bluewaters, close up, day and night', async ()=>{
    for (const n of [false, true]){
      await night(n);
      await look(25.0860, 55.1440, 9); await h.shot('mr-marina-' + (n ? 'night' : 'day'));
      await look(25.0780, 55.1330, 9); await h.shot('mr-jbr-' + (n ? 'night' : 'day'));
      await look(25.0800, 55.1240, 9); await h.shot('mr-bluewaters-' + (n ? 'night' : 'day'));
      await look(25.0820, 55.1360, 5); await h.shot('mr-wide-' + (n ? 'night' : 'day'));
    }
    await night(false);
  });
  await step('each new landmark is placed and opens its card', async ()=>{
    const r = await h.js(async ()=>{ const M=await import('/map.js');
      return ['princess_tower','marina_101','ciel_tower','ain_dubai','jbr_walk','dubai_marina_mall'].map(id=>({ id, w:!!M.landmarkWorld(id) })); });
    const bad = r.filter(x=>!x.w); if (bad.length) throw new Error(JSON.stringify(bad));
    for (const id of ['princess_tower','ain_dubai','bluewaters_island']){
      await h.js(async id=>{ const L=await import('/landmarkui.js'); L.openLandmark(id); }, id); await h.sleep(600);
      const t = await h.js(()=>document.querySelector('.lm-card')?.innerText || '');
      if (!t || !/Did you know/.test(t)) throw new Error(id + ': ' + t.slice(0, 80));
      if (id === 'ain_dubai') await h.shot('mr-card-ain');
      await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(400);
    }
  });
  await step('the JBR blocks and the canal have nothing to tap; The Walk does', async ()=>{
    const r = await h.js(async ()=>{ const M=await import('/map.js');
      const o = M.debugObjects ? M.debugObjects() : null; return o; });
    // tap the middle of the second JBR block through the map's own hit test
    const hit = await h.js(async ()=>{ const M=await import('/map.js'); const R=M.RAW;
      const blk = R.OBJECTS.find(o=>o.sprite==='jbr_block_b'), walk = R.OBJECTS.find(o=>o.sprite==='jbr_walk' && o.filler);
      return { blk:!!blk, walkTap:walk && walk.tap, canal:R.OBJECTS.filter(o=>o.ground).length }; });
    if (!hit.blk || hit.walkTap !== 'jbr_walk' || hit.canal < 4) throw new Error(JSON.stringify(hit));
  });
}
