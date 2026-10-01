// Global Village landmark close-ups (day and night)
export default async function gv(h){
  await h.seed({mode:'crew'});
  for (const mult of [12, 5]){
    await h.js(async (m)=>{ const MAP=await import('/map.js'); const z=MAP.zoneById('globalvillage'); MAP.flyToWorld(MAP.placeWorld({id:'gvx', lat:25.0700, lng:55.3089}), m); }, mult);
    await h.sleep(1500); await h.shot('gv-'+mult);
  }
}
