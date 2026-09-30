// frame times while the camera flies around (4x CPU throttle as a mid-range Android stand-in)
export default async function perf(h){
  await h.seed({mode:'crew'});
  const cdp = await h.page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const r = await h.js(async ()=>{
    const MAP = await import('/map.js');
    const pts = [[25.2,55.27],[25.08,55.14],[25.26,55.3],[25.12,55.2],[25.19,55.25]];
    const times=[]; let last=performance.now(), run=true;
    const tick=t=>{ times.push(t-last); last=t; if (run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    for (const [k,[lat,lng]] of pts.entries()){ MAP.flyToWorld(MAP.placeWorld({lat,lng}), k%2?2:5); await new Promise(r=>setTimeout(r,700)); MAP.fitCity(true); await new Promise(r=>setTimeout(r,700)); }
    run=false; times.shift();
    const s=times.slice().sort((a,b)=>a-b), avg=times.reduce((a,b)=>a+b,0)/times.length;
    return { frames:times.length, avgMs:+avg.toFixed(1), fps:+(1000/avg).toFixed(0), p95Ms:+s[Math.floor(s.length*0.95)].toFixed(1), over50:times.filter(t=>t>50).length };
  });
  console.log(h.THEME, h.extra||'real', JSON.stringify(r));
}
