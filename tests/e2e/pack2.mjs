// Fix pack 2: the night shimmer, the World Islands, Port Rashid and the QE2. Close and wide shots for
// before/after (run light and dark), and at night the live layer's cost and how much of the screen changes
// from one frame of the shimmer to the next (two shots 1.5 s apart: diff them with tools or by eye).
//   TAG=before node shot.mjs pack2 390 light|dark       (TAG defaults to "after")
const VIEWS = [
  ['world-wide',  { ai:[14.6, -6.3] }, 4],
  ['world-close', { ai:[14.6, -6.3] }, 12],
  ['world-heart', { ai:[15.9, -7.2] }, 16],
  ['rashid',      { ai:[25.2, -0.6] }, 12],
  ['rashid-wide', { ai:[25.2, -0.6] }, 5],
  ['creek-night', { ll:[25.2600, 55.3020] }, 12],
  ['city-wide',   { ll:[25.2050, 55.2700] }, 3],
  ['downtown',    { ll:[25.1950, 55.2760] }, 12],     // depth: shadows, face contrast, tower heights
  ['marina',      { ll:[25.0800, 55.1420] }, 8],
  ['pja',         { ll:[25.0000, 55.0000] }, 4],      // Palm Jebel Ali
  ['ghantoot',    { ll:[24.8950, 54.8700] }, 8],      // the coast at the Abu Dhabi border
  ['gv',          { ll:[25.0660, 55.3080] }, 10],     // a landmark on open sand: its shadow
  ['pja-wide',    { ll:[25.0100, 54.9850] }, 3],      // Palm Jebel Ali whole
  ['fog',         { ll:[24.9300, 54.9200] }, 4],      // the fogged border coast
  ['edge',        { ll:[25.3300, 55.4600] }, 3],      // the map's NE edge: fog, no hard cut
];
export default async function pack2(h){
  const tag = process.env.TAG || 'after', only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  await h.seed({mode:'me'});
  const hide = ()=>h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
  for (const [name, v, ratio] of VIEWS){
    if (only && !only.includes(name)) continue;
    await h.js(async (v, ratio)=>{
      const M = await import('/map.js');
      const w = v.ll ? M.placeWorld({ lat:v.ll[0], lng:v.ll[1] }) : M.RAW.aiToWorld(v.ai[0], v.ai[1]);
      M.viewAt(w, ratio);
    }, v, ratio);
    for (let k=0; k<40; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.sleep(400); await hide();
    await h.shot(`p2-${tag}-${name}`);
    if (name === 'creek-night' || name === 'world-close'){
      // let the live layer run, then read its cost and take a second frame
      await h.sleep(3000);
      const st = await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterStats(); });
      console.log(`live layer ${name} (${h.THEME}): ${st.liveMs == null ? 'not running' : st.liveMs.toFixed(3) + ' ms a frame'}`);
      await h.sleep(1500); await h.shot(`p2-${tag}-${name}-b`);
    }
  }
}
