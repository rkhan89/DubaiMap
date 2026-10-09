// Landmark critters (BEHAVIOUR.md), every one of the 13, with a simulated location (dev ?at=lat,lng,accuracy):
// outside its radius no critter UI at all; inside with poor accuracy none either; inside with good accuracy the
// "Something is here" row after the card settles; Look closer reveals it (1x, 2x, 3x) and saves the find; a repeat
// visit shows the chip, which opens the Shelf entry; the Shelf lists only what's found. Without location permission
// nothing shows.   node shot.mjs lcritters 390 light|dark
export default async function lcritters(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('lcfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  await h.seed({mode:'me'});
  const origin = new URL(h.page.url()).origin;
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(400); };
  const list = await h.js(async ()=>{ const LC = await import('/landmark-critters.js'), L = await import('/landmarks.js');
    return LC.LANDMARK_CRITTERS.map(c=>{ const lm = L.landmarkById(c.landmarkId); return { id:c.id, name:c.name, lm:c.landmarkId, lat:lm.lat, lng:lm.lng, r:c.radiusM, acc:LC.accuracyFor(c) }; }); });
  // open a landmark's card from code (the tap itself is covered by tests/e2e/taps.mjs)
  const openCard = async (lmId)=>{ await h.js(async id=>{ const U = await import('/landmarkui.js'); U.openLandmark(id); }, lmId); };
  const state = ()=>h.js(()=>{ const s = document.querySelector('.lm-critter-slot'); return { slot:s ? s.innerHTML.trim() : null, row:!!document.querySelector('.lm-something'), chip:(document.querySelector('.lm-crit-chip')||{}).innerText || '' }; });
  // a point d metres north of a landmark
  const north = (p, d)=>({ lat:p.lat + d/111000, lng:p.lng });
  const at = async (p, acc)=>{ await h.load(`at=${p.lat.toFixed(6)},${p.lng.toFixed(6)},${acc}`); };

  await step('before any finds the Shelf has no landmark section at all (no silhouettes)', async ()=>{
    await h.js(async ()=>{ const { go } = await import('/go.js'); go.critters(); }); await h.sleep(900);
    const t = await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || '');
    await close();
    if (/Landmark critters/.test(t)) throw new Error('a landmark section before any finds');
  });
  await step('no location permission: no critter UI on any landmark card, even standing on it', async ()=>{
    await at(list[0], 10);
    for (const c of list){ await openCard(c.lm); await h.sleep(900); const s = await state(); if (s.slot || s.row) throw new Error(c.id + ': ' + s.slot.slice(0,60)); await close(); }
  });
  await h.page.browser().defaultBrowserContext().overridePermissions(origin, ['geolocation']);

  const bad = [];
  for (const c of list){
    // outside the radius (by 50 % plus 100 m), good accuracy: nothing
    await at(north(c, c.r*1.5 + 100), 10); await openCard(c.lm); await h.sleep(1100);
    let s = await state(); if (s.slot || s.row) bad.push(c.id + ' outside: UI shown');
    await close();
    // inside, accuracy just too poor: nothing
    await at(north(c, c.r*0.4), c.acc + 50); await openCard(c.lm); await h.sleep(1100);
    s = await state(); if (s.slot || s.row) bad.push(c.id + ' poor accuracy: UI shown');
    await close();
    // inside, good accuracy: the row, only after the card has settled (600 ms)
    await at(north(c, c.r*0.4), Math.min(c.acc, 30)); await openCard(c.lm);
    await h.sleep(250); const early = (await state()).row;
    await h.sleep(900); s = await state();
    if (early) bad.push(c.id + ': row before the card settled');
    if (!s.row || !/Something is here/.test(s.slot) || /<img/.test(s.slot)) { bad.push(c.id + ': no row inside (or it shows a sprite)'); await close(); continue; }
    if (c.id === 'steppe_eagle') await h.shot('lc-row-burj');
    // Look closer: 1x, 2x, 3x, then the words; the find is saved
    await h.js(()=>document.querySelector('#lmLook').click());
    const sizes = []; for (let k=0; k<5; k++){ sizes.push(await h.js(()=>(document.querySelector('.lm-reveal img')||{}).width || 0)); await h.sleep(60); }
    await h.sleep(300);
    const shown = await h.js(()=>{ const t = document.querySelector('.lm-reveal-text'); return t && !t.hidden ? t.innerText : ''; });
    const saved = await h.js(async id=>{ const S = await import('/store.js'); const c = S.catchOf(S.me().id, id); return c ? { landmarkId:c.landmarkId, lat:c.lat, acc:c.accuracy } : null; }, c.id);
    if (!sizes.includes(32) || !sizes.includes(96) || !shown.includes(c.name) || !/Meet again on your Shelf/.test(shown)) bad.push(c.id + ': reveal ' + JSON.stringify(sizes) + ' ' + shown.slice(0,40));
    if (!saved || saved.landmarkId !== c.lm || saved.lat == null || saved.acc == null) bad.push(c.id + ': not saved ' + JSON.stringify(saved));
    if (c.id === 'steppe_eagle') await h.shot('lc-reveal-burj');
    await close();
    // a repeat visit: the chip (2x sprite and name), no row
    await openCard(c.lm); await h.sleep(1100); s = await state();
    if (!s.chip.includes(c.name) || s.row) bad.push(c.id + ': repeat visit ' + JSON.stringify(s).slice(0,80));
    if (c.id === 'steppe_eagle') await h.shot('lc-chip-burj');
    await close();
  }
  await step(`each of the ${list.length} critters: nothing outside or with poor accuracy, the row inside after 600 ms, the reveal, the save, the chip on a repeat visit`, async ()=>{ if (bad.length) throw new Error(bad.length + ': ' + bad.slice(0,4).join(' | ')); });

  await step('the Burj Khalifa card shows the Steppe Eagle', async ()=>{
    await openCard('burj_khalifa'); await h.sleep(900); const s = await state(); await close();
    if (!/Steppe Eagle/.test(s.chip)) throw new Error(s.chip);
  });
  await step('the chip opens the Shelf entry', async ()=>{
    await openCard('burj_khalifa'); await h.sleep(900);
    await h.js(()=>document.querySelector('.lm-crit-chip').click()); await h.sleep(900);
    const t = await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || document.body.innerText);
    await h.shot('lc-shelf-entry'); await close();
    if (!/Steppe Eagle/.test(t)) throw new Error(t.slice(0,80));
  });
  await step('the Shelf: landmark critters found are there in colour', async ()=>{
    await h.js(async ()=>{ const { go } = await import('/go.js'); go.critters(); }); await h.sleep(900);
    const t = await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || '');
    await h.shot('lc-shelf'); await close();
    if (!/Landmark critters/.test(t) || !/Steppe Eagle/.test(t) || !/Reef Heron/.test(t) || !/0 of 12 found/.test(t)) throw new Error(t.slice(0,120));   // (the street count stays the street count)
  });
  await step('stickers for 5, 10 and 13 finds are earned', async ()=>{
    const got = await h.js(async ()=>{ const B = await import('/badges.js'), st = await import('/stats.js'), S = await import('/store.js'); const s = st.userStats(S.me().id);
      return B.BADGES.filter(b=>['lmk5','lmk10','lmk13'].includes(b.id)).map(b=>{ const [have, need] = b.progress(s); return have >= need; }); });
    if (got.length !== 3 || got.some(x=>!x)) throw new Error(JSON.stringify(got));
  });
}
