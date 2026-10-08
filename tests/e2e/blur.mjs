// Is anything on screen still a soft overview patch? Pans round the Palm and Downtown at several zooms
// and reports how many on-screen chunks are missing after a short wait.
export default async function blur(h){
  await h.seed({mode:'me'});
  if (process.env.THROTTLE){ const cdp = await h.page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate:Number(process.env.THROTTLE) }); await h.load(); await h.sleep(3000); }
  const out = [];
  for (const [name, lat, lng] of [['palm',25.12,55.135],['downtown',25.196,55.275],['creek',25.26,55.30]]) for (const ratio of [1.6, 3, 5, 9, 16]){
    await h.js(async (lat,lng,ratio)=>{ const M=await import('/map.js'); M.viewAt(M.placeWorld({lat,lng}), ratio); }, lat, lng, ratio);
    let n = -1, t = 0;
    for (; t<40; t++){ await h.sleep(250); n = await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }); if (n === 0) break; }
    out.push(`${name}@${ratio}: ${n === 0 ? 'sharp after '+((t+1)*0.25).toFixed(2)+'s' : n+' chunks missing'}`);
    if (ratio === 5) await h.shot(`blur-${name}`);
  }
  console.log('BLUR', JSON.stringify(out), JSON.stringify(await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterStats(); })));
}
