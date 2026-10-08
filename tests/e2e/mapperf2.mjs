// Frame times while panning at a fixed zoom, close up and wide, with a 4x CPU throttle (mid-range Android).
// The view is set by moving the map's camera directly so this runs on old and new map code alike.
export default async function mapperf2(h){
  await h.seed({mode:'crew'});
  const cdp = await h.page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await h.load(); await h.sleep(5000);
  const out = {};
  for (const [name, ratio] of [['close', 16], ['wide', 1.6]]){
    // settle at the zoom first, over Downtown, and let anything that loads, load
    await h.js(async (ratio)=>{ const M=await import('/map.js'); const w=M.placeWorld({lat:25.20,lng:55.27}); if (M.viewAt) M.viewAt(w, ratio); else { M.fitCity(false); M.flyToWorld(w, ratio); } }, ratio);
    await h.sleep(3000);
    const r = await h.js(async ()=>{
      const wrap = document.querySelector('#mapWrap'), box = wrap.getBoundingClientRect();
      const times = []; let last = performance.now(), run = true;
      const tick = t=>{ times.push(t-last); last = t; if (run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      // a 2 s drag: pointer events through the map's own gesture code
      const id = 7, x0 = box.left + box.width/2, y0 = box.top + box.height/2;
      const ev = (type, x, y)=>wrap.dispatchEvent(new PointerEvent(type, { pointerId:id, clientX:x, clientY:y, bubbles:true, pointerType:'touch', isPrimary:true }));
      ev('pointerdown', x0, y0);
      for (let k=1; k<=120; k++){ await new Promise(r=>requestAnimationFrame(r)); ev('pointermove', x0 + Math.sin(k/20)*120, y0 + k*1.5); }
      ev('pointerup', x0, y0 + 180);
      await new Promise(r=>setTimeout(r, 300));
      run = false; times.shift();
      const s = times.slice().sort((a,b)=>a-b), avg = times.reduce((a,b)=>a+b,0)/times.length;
      return { fps:+(1000/avg).toFixed(0), avgMs:+avg.toFixed(1), p95Ms:+s[Math.floor(s.length*0.95)].toFixed(1), over33:times.filter(t=>t>33).length, frames:times.length };
    });
    out[name] = r;
  }
  console.log('MAPPERF2', h.THEME, JSON.stringify(out));
}
