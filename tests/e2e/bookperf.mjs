// A 30-page book turning: frame times while the pager flips page after page, with the CPU slowed 4x (roughly a
// mid-range Android phone). Prints the frame rate and the slowest frames.   node shot.mjs bookperf 390 light
export default async function bookperf(h){
  await h.seed({ mode:'crew' });
  await h.js(async ()=>{
    const S = await import('/store.js');
    const vs = S.venues().slice(0, 30);
    vs.forEach((v, i)=>S.addEntry({ venueId:v.id, rating:3 + (i % 3), notes:'Page '+(i+1), date:`2026-${String(1 + (i % 9)).padStart(2,'0')}-${String(1 + (i % 27)).padStart(2,'0')}`, createdAt:Date.now() - i*864e5 }));
    S.flush();
  });
  await h.js(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.book(S.shelf().everything.id); });
  await h.sleep(3000);
  const n = await h.js(()=>document.querySelector('#screens .screen.in:last-of-type .kb-count').textContent);
  console.log('book:', n);
  const cdp = await h.page.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate:4 });
  const r = await h.js(async ()=>{
    const times = []; let last = performance.now(), on = true;
    const tick = t=>{ times.push(t - last); last = t; if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const next = document.querySelector('#screens .screen.in:last-of-type [data-kb="next"]');
    for (let i = 0; i < 8; i++){ next.click(); await new Promise(r=>setTimeout(r, 900)); }
    on = false;
    const s = times.slice(2).sort((a,b)=>a-b), avg = s.reduce((a,b)=>a+b,0)/s.length;
    return { frames:s.length, fps:Math.round(1000/avg), p95:Math.round(s[Math.floor(s.length*.95)]), worst:Math.round(s[s.length-1]), over33:s.filter(x=>x>33.4).length,
      at:document.querySelector('#screens .screen.in:last-of-type .kb-count').textContent };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate:1 });
  console.log('flip 4x CPU:', JSON.stringify(r));
  console.log(r.fps >= 50 ? 'ok   page turns stay smooth' : 'note page turns are slower than 50 fps at 4x CPU');
}
