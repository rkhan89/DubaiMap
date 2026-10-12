// F pack and the open items: AHS Tower, One Za'abeel, Zabeel Palace, the new Emirates Towers and Dubai Frame, Cayan
// Tower by the Marina towers; the hero on a card; Zabeel Palace facts only. Close shots for the report: the Burj Al
// Arab pier, Port Rashid's pier slot, the World's Heart of Europe.   node shot.mjs fpack 390 light
export default async function fpack(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('fpfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  await h.seed({mode:'me'});
  const look = async (lat, lng, ratio)=>{
    await h.js(async (lat, lng, ratio)=>{ const M=await import('/map.js'); M.viewAt(M.placeWorld({ id:'x', lat, lng }), ratio); }, lat, lng, ratio);
    for (let k=0; k<40; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip','.map-cars']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
    await h.sleep(500);
  };
  const lm = async (id, ratio)=>{ await h.js(async (id, ratio)=>{ const M=await import('/map.js'); const w=M.landmarkWorld(id); M.viewAt({ x:w.x, y:(w.y + w.top)/2 }, ratio); }, id, ratio); await look.settle?.(); for (let k=0; k<40; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; } await h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } }); await h.sleep(500); };
  const night = async on=>{ await h.js(async on=>{ const T=await import('/theme.js'); T.setThemePref(on ? 'dark' : 'light'); }, on); await h.sleep(1200); };

  await step('each new landmark is on the map and opens its card', async ()=>{
    for (const id of ['ahs_tower','one_zabeel','zabeel_palace','cayan_tower','emirates_towers','dubai_frame']){
      if (!(await h.js(async id=>{ const M=await import('/map.js'); return !!M.landmarkWorld(id); }, id))) throw new Error('not placed: ' + id);
      await h.js(async id=>{ const L=await import('/landmarkui.js'); L.openLandmark(id); }, id); await h.sleep(600);
      const t = await h.js(()=>document.querySelector('.lm-card')?.innerText || '');
      if (!/Did you know/.test(t)) throw new Error(id + ': ' + t.slice(0, 60));
      await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(300);
    }
  });
  await step('Zabeel Palace: facts only (no pin, no directions, no critter)', async ()=>{
    await h.js(async ()=>{ const L=await import('/landmarkui.js'); L.openLandmark('zabeel_palace'); }); await h.sleep(600);
    const r = await h.js(()=>({ pin:!!document.querySelector('#lmPin'), dir:!!document.querySelector('#lmDir'), slot:!!document.querySelector('.lm-critter-slot'), t:document.querySelector('.lm-card')?.innerText || '' }));
    await h.shot('fp-card-zabeel-palace');
    await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(300);
    if (r.pin || r.dir || r.slot || !/private/i.test(r.t)) throw new Error(JSON.stringify(r));
  });
  await step('the hero on a card: day by day, night by night, at a whole size', async ()=>{
    for (const n of [false, true]){ await night(n);
      await h.js(async ()=>{ const L=await import('/landmarkui.js'); L.openLandmark('emirates_towers'); }); await h.sleep(700);
      const r = await h.js(()=>{ const i = document.querySelector('.lm-hero img'); return i ? { src:i.getAttribute('src'), w:i.width, ok:i.complete && i.naturalWidth === 195 } : null; });
      await h.shot('fp-card-hero-' + (n ? 'night' : 'day'));
      await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(300);
      if (!r || !r.ok || (r.w !== 390 && r.w !== 195) || !r.src.endsWith(n ? '_night.png' : '_day.png')) throw new Error(JSON.stringify(r));
    }
    await night(false);
  });
  await step('shots: the new landmarks, the Marina towers with Cayan, day and night', async ()=>{
    for (const n of [false, true]){ await night(n);
      await lm('emirates_towers', 9); await h.shot('fp-tradecentre-' + (n ? 'night' : 'day'));
      await lm('one_zabeel', 9); await h.shot('fp-one-zabeel-' + (n ? 'night' : 'day'));
      await lm('zabeel_palace', 12); await h.shot('fp-zabeel-palace-' + (n ? 'night' : 'day'));
      await lm('dubai_frame', 12); await h.shot('fp-frame-' + (n ? 'night' : 'day'));
      await lm('cayan_tower', 9); await h.shot('fp-marina-cayan-' + (n ? 'night' : 'day'));
    }
    await night(false);
  });
  await step('report shots: the Burj Al Arab pier, Port Rashid, the World', async ()=>{
    await lm('burj_al_arab', 14); await h.shot('fp-baa-pier');
    await look(25.2683, 55.2762, 12); await h.shot('fp-port-rashid');
    await look(25.2230, 55.1830, 6); await h.shot('fp-world-heart');
    await look(25.2230, 55.1830, 3); await h.shot('fp-world');
  });
}
