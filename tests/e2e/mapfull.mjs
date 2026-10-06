// The whole map (and a few close-ups), for before/after comparisons of the map art.
// node shot.mjs mapfull 390 light|dark  (dark = night)
export default async function mapfull(h){
  await h.seed({mode:'me'});
  await h.js(async ()=>{ const S=await import('/store.js'); /* no stamps: the art only */ });
  const tag = process.env.TAG || 'now';
  const hideStamps = ()=>h.js(()=>{ const s=document.querySelector('.stamps-layer'), l=document.querySelector('.labels-layer'), m=document.querySelector('#memStrip'); if (s) s.style.visibility='hidden'; if (m) m.hidden=true; });
  await h.js(async ()=>{ const MAP=await import('/map.js'); MAP.fitCity(false); }); await h.sleep(1200); await hideStamps();
  await h.shot(`map-${tag}-full`);
  // whole frame: the furthest zoom out
  await h.js(async ()=>{ const MAP=await import('/map.js'); MAP.flyToWorld(MAP.placeWorld({ id:'x', lat:25.15, lng:55.30 }), 0.5); }); await h.sleep(1500); await hideStamps();
  await h.shot(`map-${tag}-wide`);
  for (const [name, lat, lng] of [['karama',25.245,55.305],['qusais',25.278,55.38],['mirdif',25.218,55.42],['siliconoasis',25.12,55.38],['motorcity',25.047,55.235],['intlcity',25.165,55.41],['barsha',25.11,55.2],['alquoz',25.14,55.23],['jebelali',25.005,55.06],['expo',24.963,55.149],['springs',25.062,55.18],['rasalkhor',25.188,55.33],['deirasouk',25.268,55.302]]){
    await h.js(async (lat,lng)=>{ const MAP=await import('/map.js'); MAP.flyToWorld(MAP.placeWorld({ id:'x', lat, lng }), 3); }, lat, lng); await h.sleep(1300); await hideStamps();
    await h.shot(`map-${tag}-${name}`);
  }
}
