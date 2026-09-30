export default async function show(h){
  await h.seed({mode:'me'});
  const tag = (h.extra.match(/T(\d\d:\d\d)/)||[])[1]?.replace(':','') || 'x';
  for (const m of [3.5, 9]){
    await h.js(async (m)=>{ const MAP=await import('/map.js'); const w=MAP.placeWorld({lat:25.1972,lng:55.2744}); MAP.fitCity(false); MAP.flyToWorld({x:w.x, y:w.y-110/(m*0.25)}, m); }, m);
    await h.sleep(1500);
    await h.js(()=>{ document.querySelector('.stamps-layer').style.visibility='hidden'; document.querySelector('.labels-layer').style.visibility='hidden'; });
    const st = await h.js(()=>({ on: document.querySelector('.fx-burj').classList.contains('on'), op: document.querySelector('.fx-burj').style.opacity, cars: document.querySelector('.map-cars').classList.contains('on') }));
    console.log(tag, m, JSON.stringify(st));
    await h.shot(`show-${tag}-z${m}`);
  }
}
