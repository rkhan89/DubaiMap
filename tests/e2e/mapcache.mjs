// The finished pixel-city overviews are saved, and the next launch shows the city from them at once.
export default async function mapcache(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); } };
  await h.seed({mode:'me'});
  let firstMs = 0, savedAfter = 0;
  await step('first launch: the overviews are saved once the whole city has been rendered', async ()=>{
    firstMs = await h.js(async ()=>{ const M=await import('/map.js'); for (let k=0;k<50;k++){ if (M.buildStats() && M.buildStats().cacheMs) break; await new Promise(r=>setTimeout(r,100)); } return M.buildStats().cacheMs; });
    const t0 = Date.now();
    for (let k=0; k<120; k++){
      const n = await h.js(async ()=>{ const c = await caches.open('koko-map-art'); return (await c.keys()).length; });
      if (n >= 2){ savedAfter = Math.round((Date.now()-t0)/1000); break; }
      await h.sleep(1000);
    }
    if (!savedAfter) throw new Error('not saved within 2 minutes');
  });
  await step('second launch: the city comes from the saved overviews', async ()=>{
    await h.load(); await h.sleep(300);
    const ms = await h.js(async ()=>{ const M=await import('/map.js'); for (let k=0;k<50;k++){ if (M.buildStats() && M.buildStats().cacheMs) break; await new Promise(r=>setTimeout(r,50)); } return M.buildStats().cacheMs; });
    console.log('MAPCACHE', JSON.stringify({ firstMs, savedAfterSec:savedAfter, secondMs:ms }));
    if (!(ms < firstMs)) throw new Error(`second launch not faster: ${ms} vs ${firstMs}`);
  });
}
