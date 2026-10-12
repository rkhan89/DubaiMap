// Cars: sprite cars from the cars pack on the map's roads. Close shots on a main road, an arterial road and a
// junction, day and night; what drawing the cars costs (a running average of drawCars, ms) with the car count;
// headings match the way each car is going; no two cars in a lane overlap; nothing on side roads.
//   node shot.mjs cars 390 light
export default async function cars(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('carfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  await h.seed({mode:'me'});
  const look = async (lat, lng, ratio)=>{
    await h.js(async (lat, lng, ratio)=>{ const M=await import('/map.js'); M.viewAt(M.placeWorld({ id:'x', lat, lng }), ratio); }, lat, lng, ratio);
    for (let k=0; k<40; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
    await h.sleep(2500);
  };
  const night = async on=>{ await h.js(async on=>{ const T=await import('/theme.js'); T.setThemePref(on ? 'dark' : 'light'); }, on); await h.sleep(1200); };
  const VIEWS = [['main', 25.2050, 55.2715, 24], ['arterial', 25.2380, 55.3050, 24], ['junction', 25.2330, 55.2930, 24]];
  await step('what drawing the cars costs, with the car count (Sheikh Zayed Road, close)', async ()=>{
    await look(25.2050, 55.2715, 12); await h.sleep(3000);
    const s = await h.js(async ()=>{ const M=await import('/map.js'); return M.carStats(); });
    console.log(`cars: ${s.cars}, drawCars ${s.ms == null ? 'n/a' : s.ms.toFixed(3) + ' ms'}`);
  });
  await step('every car: its heading matches its way of going, the mix fits its road, no side roads, no overlaps', async ()=>{
    const r = await h.js(async ()=>{ const M=await import('/map.js'); return M.carStats(); });
    if (!r.cars || r.sprites < 60) throw new Error('cars ' + r.cars + ', sprites loaded ' + r.sprites);
    for (const c of r.list){
      const want = c.dy < 0 ? (c.dx >= 0 ? 'ne' : 'nw') : (c.dx >= 0 ? 'se' : 'sw');
      if (c.dy !== 0 && c.head !== want) throw new Error('heading ' + JSON.stringify(c));
      if (c.k === 2) throw new Error('a car on a side road');
      if (c.kind === 'bus' && c.k !== 0) throw new Error('a bus off a main road');
    }
    // in each lane, one car length of clear road between neighbours
    const lanes = {}; r.list.forEach(c=>{ (lanes[c.road + ':' + c.dir] ||= []).push(c); });
    for (const lane of Object.values(lanes)){ lane.sort((a,b)=>a.s - b.s);
      for (let k=1; k<lane.length; k++){ const a = lane[k-1], b = lane[k], gap = Math.abs(b.s - a.s) - a.len/2 - b.len/2;
        if (gap < Math.min(a.len, b.len) - 0.01) throw new Error('overlap ' + JSON.stringify([a.kind, b.kind, gap.toFixed(2)])); } }
    const mix = {}; r.list.forEach(c=>{ mix[c.kind] = (mix[c.kind]||0) + 1; }); console.log('mix', JSON.stringify(mix));
  });
  await step('shots: a main road, an arterial road and a junction, day and night', async ()=>{
    for (const n of [false, true]){ await night(n);
      for (const [name, lat, lng, r] of VIEWS){ await look(lat, lng, r); await h.shot('car-' + name + '-' + (n ? 'night' : 'day')); } }
    await night(false);
  });
}
