// The map art, area by area at three zooms, for before/after comparisons.
// node shot.mjs mapart 390 light|dark    (TAG=before|after picks the file names)
export const AREAS = [
  ['downtown',  25.1960, 55.2750],   // Burj Khalifa and the Fountain
  ['creek',     25.2637, 55.2995],   // Old Dubai, Al Fahidi and the Creek
  ['marina',    25.0805, 55.1403],
  ['jumeirah',  25.1412, 55.1853],   // Burj Al Arab
  ['desert',    25.0200, 55.3300],
  ['nadalsheba',25.1500, 55.3300],   // camels
];
export const ZOOMS = [['wide',1.6], ['mid',5], ['close',16]];
export default async function mapart(h){
  await h.seed({mode:'me'});
  const tag = process.env.TAG || 'now';
  const only = process.env.AREA;
  const hide = ()=>h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip','.map-ctrl','.map-top']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
  for (const [name, lat, lng] of AREAS){
    if (only && only!==name) continue;
    for (const [z, ratio] of ZOOMS){
      await h.js(async (lat,lng,ratio)=>{ const MAP=await import('/map.js'); MAP.viewAt(MAP.placeWorld({ id:'x', lat, lng }), ratio); }, lat, lng, ratio);
      // wait until the view's pixel chunks are in (max ~8 s)
      for (let k=0; k<40; k++){ await h.sleep(200); if (await h.js(async ()=>{ const MAP=await import('/map.js'); return MAP.rasterPending(); }) === 0) break; }
      await h.sleep(300); await hide();
      await h.shot(`ma-${tag}-${name}-${z}`);
    }
  }
}
