// The fix pack: close-zoom shots of each place it touches, for before/after (run day and night).
//   TAG=before node shot.mjs fixpack 390 light|dark     (TAG defaults to "after")
// Views are in the map's own km frame (a along the coast, i inland) or lat/lng.
const VIEWS = [
  ['royal',      { ll:[25.1385, 55.1300] }],          // Atlantis The Royal
  ['atlantis',   { ll:[25.1305, 55.1173] }],          // Atlantis The Palm
  ['baa-pier',   { ll:[25.1405, 55.1880] }],          // the pier by the Burj Al Arab
  ['creek',      { ll:[25.2600, 55.3020] }],          // abras and dhows on the creek
  ['marina',     { ll:[25.0840, 55.1440] }],          // yachts in the marina
  ['harbour',    { ai:[2.75, -0.75] }],               // Dubai Harbour
  ['dxb',        { ai:[29.3, 7.3] }],                 // planes at DXB
  ['maktoum',    { ai:[-13.8, 14.9] }],               // planes at Al Maktoum
  ['moe',        { ll:[25.1180, 55.2006] }],          // Mall of the Emirates and the ski slope
  ['ne-desert',  { ai:[35.2, 20.6] }],                // the road off the map's edge in the NE desert
  ['gv-img',     { ll:[25.0810, 55.3180] }],          // the blue box near Global Village and Cityland
  ['miracle',    { ll:[25.0600, 55.2440] }],          // the heart in the desert
];
export default async function fixpack(h){
  const tag = process.env.TAG || 'after', only = process.env.ONLY ? process.env.ONLY.split(',') : null, ratio = Number(process.env.RATIO || 12);
  await h.seed({mode:'me'});
  for (const [name, v] of VIEWS){
    if (only && !only.includes(name)) continue;
    await h.js(async (v, ratio)=>{
      const M = await import('/map.js');
      const w = v.ll ? M.placeWorld({ lat:v.ll[0], lng:v.ll[1] }) : M.RAW.aiToWorld(v.ai[0], v.ai[1]);
      M.viewAt(w, ratio);
    }, v, ratio);
    for (let k=0; k<40; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.sleep(400);
    await h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
    await h.shot(`fx-${tag}-${name}`);
  }
}
