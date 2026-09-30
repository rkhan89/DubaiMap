export default async function baa(h){
  await h.seed({mode:'me'});
  const v = h.extra.replace('baa=','');
  for (const m of ['fit', 3.2, 18]){
    await h.js(async (m)=>{ const MAP=await import('/map.js'); const w=MAP.placeWorld({lat:25.1405,lng:55.1862});
      MAP.fitCity(false); if (m!=='fit') MAP.flyToWorld({x:w.x, y:w.y-40/(m*0.25)}, m); }, m);
    await h.sleep(900);
    await h.js(()=>{ document.querySelector('.stamps-layer').style.visibility='hidden'; document.querySelector('.labels-layer').style.visibility='hidden'; });
    await h.shot(`baa-${v}-z${m}`);
  }
}
