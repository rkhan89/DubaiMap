// The mall art pack: placement and cards. Screenshots at wide, mid and close zoom (run day and night);
// cards open by tapping the sprite itself and say what mall_cards.json says.
//   node shot.mjs mallpack 390 light|dark
export default async function mallpack(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('mpfail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'me'});
  const hide = ()=>h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
  // centre the middle of a landmark's sprite on screen at a zoom, and wait for its pixels
  const go = async (id, ratio)=>{
    await h.js(async (id, ratio)=>{ const M=await import('/map.js'); const w=M.landmarkWorld(id); M.viewAt({ x:w.x, y:(w.y + w.top)/2 }, ratio); }, id, ratio);
    for (let k=0; k<30; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.sleep(300); await hide();
  };
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  for (const id of ['dubai_mall','mall_of_the_emirates','ibn_battuta','dragon_mart','wafi','city_centre_deira','global_village','aswaaq_mall'])
    for (const [z, ratio] of [['wide', 2], ['mid', 5], ['close', 12]]){ await go(id, ratio); await h.shot(`mp-${id}-${z}`); }
  // a tap on the sprite (the middle of the screen, where its middle is) opens its card
  const tapCard = async id=>{
    await go(id, 12);
    const p = await h.js(()=>({ x:innerWidth/2, y:innerHeight/2 }));
    await h.page.mouse.click(p.x, p.y); await h.sleep(800);
    return h.js(()=>({ text:document.querySelector('.lm-card')?.innerText || '', source:!!document.querySelector('.lm-card .lm-source a'), check:!!document.querySelector('.lm-card .fact-check') }));
  };
  await step('famous mall: title, fact and a source link', async ()=>{
    const c = await tapCard('dubai_mall');
    if (!/The Dubai Mall/.test(c.text) || !/4 November 2008/.test(c.text) || !c.source || c.check) throw new Error(JSON.stringify(c));
    await h.shot('mp-card-dubai-mall'); await close();
  });
  await step('a fact still being checked shows the marker (Al Ghurair)', async ()=>{
    const c = await tapCard('al_ghurair_centre');
    if (!/Al Ghurair Centre/.test(c.text) || !c.check) throw new Error(JSON.stringify(c));
    await h.shot('mp-card-al-ghurair'); await close();
  });
  await step('neighbourhood mall: title and area only', async ()=>{
    const c = await tapCard('aswaaq_mall');
    if (!/Aswaaq Mall/.test(c.text) || c.source || c.check) throw new Error(JSON.stringify(c));
    await h.shot('mp-card-aswaaq'); await close();
  });
  await step('Wild Wadi: title and area, no fact', async ()=>{
    const c = await tapCard('wild_wadi');
    if (!/Wild Wadi Waterpark/.test(c.text) || !/Jumeirah/.test(c.text) || c.source) throw new Error(JSON.stringify(c));
    await close();
  });
}
