// Map build cost and frame times, day and night, with a 4x CPU throttle (mid-range Android).
export default async function mapperf(h){
  await h.seed({mode:'crew'});
  const cdp = await h.page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await h.load(); await h.sleep(4000);
  const b = await h.js(async ()=>{ const MAP = await import('/map.js'); return MAP.buildStats(); });
  const r = await h.js(async ()=>{
    const MAP = await import('/map.js');
    const pts = [[25.2,55.27],[25.08,55.14],[25.26,55.3],[25.12,55.2],[25.19,55.25],[25.27,55.33],[25.06,55.24]];
    const times=[]; let last=performance.now(), run=true;
    const tick=t=>{ times.push(t-last); last=t; if (run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    for (const [k,[lat,lng]] of pts.entries()){ MAP.flyToWorld(MAP.placeWorld({lat,lng}), k%2?2:5); await new Promise(r=>setTimeout(r,700)); }
    MAP.fitCity(true); await new Promise(r=>setTimeout(r,700));
    run=false; times.shift();
    const s=times.slice().sort((a,b)=>a-b), avg=times.reduce((a,b)=>a+b,0)/times.length;
    return { fps:+(1000/avg).toFixed(0), avgMs:+avg.toFixed(1), p95Ms:+s[Math.floor(s.length*0.95)].toFixed(1), over50:times.filter(t=>t>50).length };
  });
  console.log('MAPPERF', h.THEME, JSON.stringify({ build:b, frames:r }));
}
