// Landmark taps (TAP_BEHAVIOUR.md): tap every landmark (and the QE2 and the terrains) and check its card; a pin over a
// landmark wins; the card works offline; the fountain's chip during and outside a show; the distance chip only once
// location is allowed.   node shot.mjs taps 390 light|dark
export default async function taps(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('tapfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  await h.seed({mode:'me'});
  const hide = ()=>h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
  const show = ()=>h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility=''; } });
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(450); };
  // put a landmark's tap point (a pixel of its own: the sprite's middle, or a bit of a terrain's land) mid-screen
  const aim = async (id, ratio=12)=>{
    await h.js(async (id, ratio)=>{
      const M = await import('/map.js'), T = await import('/terrains.js'), w = M.landmarkWorld(id), t = T.TERRAINS.find(t=>t.id===id);
      let p = { x:w.x, y:(w.y + w.top)/2 };
      if (t){ // the land pixel nearest the art's middle
        let best = null; for (let sy=0; sy<t.h; sy++) for (let sx=0; sx<t.w; sx++){ if (!T.isLandPx(t, sy*t.w+sx)) continue; const d = Math.hypot(sx - t.w/2, sy - t.h/2); if (!best || d < best.d) best = { d, sx, sy }; }
        p = { x:w.x + (best.sx + 0.5 - t.w/2)*t.scale/2, y:w.y + (best.sy + 0.5 - t.h/2)*t.scale/2 }; }
      M.viewAt(p, ratio);
    }, id, ratio);
    for (let k=0; k<30; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.sleep(300);
  };
  // tap the point nearest the screen's middle that the landmark itself wins (front-most by depth)
  let target = null;
  const tapMid = async (id)=>{ const p = await h.js(async (id)=>{ const M = await import('/map.js'), r = document.querySelector('#mapWrap').getBoundingClientRect();
      let best = null; for (let dy=-160; dy<=160; dy+=8) for (let dx=-160; dx<=160; dx+=8){ const x = r.width/2 + dx, y = r.height/2 + dy; const hit = M.landmarkAt(x, y);
        if (hit && (!id || hit.id === id)){ const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { d, x:r.left + x, y:r.top + y }; } }
      return best || { x:r.left + r.width/2, y:r.top + r.height/2 }; }, id || target); await h.page.mouse.click(p.x, p.y); await h.sleep(900); };
  const card = ()=>h.js(()=>{ const c = document.querySelector('.lm-card'); if (!c) return null;
    return { text:c.innerText, more:!!c.querySelector('.lm-more'), source:!!c.querySelector('.lm-more .lm-source a'), chip:(c.querySelector('.lm-chip-t')||{}).textContent||'', dist:!(c.querySelector('.lm-dist')||{hidden:true}).hidden,
      img:(()=>{ const i = c.querySelector('.lm-art img'); return i ? { w:i.width, nw:i.naturalWidth, src:i.getAttribute('src') } : null; })() }; });

  const all = await h.js(async ()=>{ const L = await import('/landmarks.js'), F = await import('/landmark-facts.js');
    return [...L.LANDMARKS, ...L.TAPPABLE].map(l=>({ id:l.id, name:l.name, facts:!!F.factsFor(l.id), bonus:!!(F.factsFor(l.id)||{}).bonus })); });
  const failed = [];
  for (const l of all){
    await hide(); await aim(l.id); await tapMid(l.id);
    const c = await card();
    const ok = c && (!l.facts || (/Did you know/i.test(c.text) && c.more === l.bonus && (!l.bonus || c.source))) && /Add a pin here/.test(c.text) && /Directions/.test(c.text) && c.img && c.img.w % c.img.nw === 0;
    if (!ok) failed.push(l.id + ': ' + JSON.stringify(c && { more:c.more, text:c.text.slice(0,60) }));
    if (['burj_khalifa','dubai_fountain','qe2','the_world_islands','palm_jebel_ali','atlantis_the_royal'].includes(l.id)) await h.shot('tap-' + l.id);
    await close();
  }
  await step(`every landmark's card (${all.length}): name, Did you know, More only with a bonus fact, the buttons, the sprite at a whole size`, async ()=>{ if (failed.length) throw new Error(failed.length + ' failed: ' + failed.slice(0,4).join(' | ')); });

  await step('More opens the bonus fact and its source', async ()=>{
    await aim('burj_khalifa'); await tapMid('burj_khalifa');
    await h.js(()=>document.querySelector('.lm-more summary').click()); await h.sleep(200);
    const t = await h.js(()=>document.querySelector('.lm-more').innerText);
    if (!/Iranian coast/.test(t) || !/Source/.test(t)) throw new Error(t);
    await h.shot('tap-more'); await close();
  });

  await step('no distance chip without location permission; one once it is allowed', async ()=>{
    await aim('burj_al_arab'); await tapMid('burj_al_arab');
    if ((await card()).dist) throw new Error('a distance chip without permission');
    await close();
    const origin = new URL(h.page.url()).origin;
    await h.page.browser().defaultBrowserContext().overridePermissions(origin, ['geolocation']);
    await h.load('at=25.2048,55.2708,15'); await hide();
    await aim('burj_al_arab'); await tapMid('burj_al_arab'); await h.sleep(600);
    const c = await card(); if (!c.dist || !/km from you/.test(c.text)) throw new Error(c.text.slice(0,120));
    await h.shot('tap-distance'); await close();
  });

  await step('the fountain chip: "Show on now" during a show, "Next show" outside one (Friday afternoon and evening)', async ()=>{
    const chipAt = async when=>{ await h.load('now=' + encodeURIComponent(when)); await hide(); await aim('dubai_fountain'); await tapMid('dubai_fountain'); const c = await card(); await close(); return c ? c.chip : 'no card'; };
    const a = await chipAt('2026-10-09T19:00:30+04:00'), b = await chipAt('2026-10-09T19:10:00+04:00'), c = await chipAt('2026-10-09T13:10:00+04:00'), d = await chipAt('2026-10-10T23:40:00+04:00');
    if (a !== 'Show on now' || b !== 'Next show 19:30' || c !== 'Next show 14:00' || d !== 'Next show 13:00') throw new Error([a,b,c,d].join(' / '));
  });

  await step('a pin over a landmark wins the tap', async ()=>{
    await h.load(); await show();
    await h.js(async ()=>{ const S = await import('/store.js'); const v = S.addVenue({ name:'Pin On The Burj', zone:'downtown', categories:['cafe'], lat:25.1972, lng:55.2744 });
      S.addEntry({ venueId:v.id, kind:'visit', rating:4, date:new Date().toISOString().slice(0,10) }); S.flush(); });
    await h.load(); await aim('burj_khalifa', 12); await h.sleep(600);
    const p = await h.js(()=>{ const ss = [...document.querySelectorAll('.stamp-anchor .stamp, .stamp-anchor > *')].map(e=>e.getBoundingClientRect()).filter(r=>r.width > 8);
      const r = document.querySelector('#mapWrap').getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
      ss.sort((a,b)=>Math.hypot(a.left+a.width/2-cx, a.top+a.height/2-cy) - Math.hypot(b.left+b.width/2-cx, b.top+b.height/2-cy));
      return ss[0] ? { x:ss[0].left + ss[0].width/2, y:ss[0].top + ss[0].height/2 } : null; });
    if (!p) throw new Error('no pin on screen');
    const under = await h.js(p=>{ const e = document.elementFromPoint(p.x, p.y); return !!(e && e.closest('.stamp-anchor')); }, p);
    await h.page.mouse.click(p.x, p.y); await h.sleep(900);
    const lm = await h.js(()=>!!document.querySelector('.lm-card'));
    await h.shot('tap-pin-wins'); await close();
    if (!under || lm) throw new Error(JSON.stringify({ under, landmarkCard:lm }));
  });

  await step('offline: the card still has its fact (bundled, nothing fetched)', async ()=>{
    await hide(); await aim('museum_of_the_future');
    await h.page.setOfflineMode(true);
    await tapMid('museum_of_the_future'); const c = await card();
    await h.page.setOfflineMode(false);
    if (!c || !/Did you know/.test(c.text) || !/1,024/.test(c.text)) throw new Error(c ? c.text.slice(0,100) : 'no card');
    await h.shot('tap-offline'); await close();
  });
}
