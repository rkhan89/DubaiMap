// What a frame of the map costs (render()'s own time, a running average), close and wide: the camera is nudged
// 60 times at each view so the map redraws, then the average is read. Run day and night.
//   node shot.mjs frametime 390 light|dark        (BASE=http://localhost:5176/ for another build)
export default async function frametime(h){
  await h.seed({mode:'me'});
  for (const [name, ll, ratio] of [['close', [25.1950, 55.2760], 12], ['wide', [25.1500, 55.2300], 2]]){
    await h.js(async (ll, ratio)=>{ const M=await import('/map.js'); M.viewAt(M.placeWorld({ lat:ll[0], lng:ll[1] }), ratio); }, ll, ratio);
    for (let k=0; k<40; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.sleep(1500);
    const ms = await h.js(async (ll, ratio)=>{
      const M = await import('/map.js'), w = M.placeWorld({ lat:ll[0], lng:ll[1] });
      for (let k=0; k<60; k++){ M.viewAt({ x:w.x + (k%2 ? 0.5 : -0.5), y:w.y }, ratio); await new Promise(r=>requestAnimationFrame(()=>r())); }
      return M.rasterStats().frameMs;
    }, ll, ratio);
    console.log(`frame ${name} (${h.THEME}): ${ms == null ? 'n/a' : ms.toFixed(2) + ' ms'}`);
  }
}
