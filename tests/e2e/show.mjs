// The Burj Khalifa light show and the Dubai Fountain, drawn over the pixel city on the hour and half hour.
// Uses ?now= to set the app's clock (Dubai time).
export default async function show(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); } };
  await h.seed({mode:'me'});
  const at = async (time, tag)=>{
    await h.load('now=2026-10-08T' + time + '%2B04:00');
    await h.sleep(1200);
    const info = await h.js(async ()=>{ const M=await import('/map.js'); return M.showInfo(); });   // read now: a show only lasts 60 s
    await h.js(async ()=>{ const M=await import('/map.js'); const w=M.landmarkWorld('dubai_fountain'); M.viewAt({ x:w.x, y:w.y-40 }, 9); });
    for (let k=0; k<30; k++){ await h.sleep(200); if (await h.js(async ()=>{ const M=await import('/map.js'); return M.rasterPending(); }) === 0) break; }
    await h.sleep(400);
    await h.js(()=>{ for (const q of ['.stamps-layer','.labels-layer','#memStrip']) { const e=document.querySelector(q); if (e) e.style.visibility='hidden'; } });
    await h.shot('show-' + tag);
    return { ...info, drawn:(await h.js(async ()=>{ const M=await import('/map.js'); return M.showInfo(); })).drawn || info.drawn };
  };
  await step('19:00 blue show: the Burj wash is on and the fountain is playing', async ()=>{
    const s = await at('19:00:10', '1900'); if (!s.on || s.type !== 'blue' || !(s.fountain >= 1 && s.fountain <= 4) || !s.drawn) throw new Error(JSON.stringify(s));
  });
  await step('the last seconds of the show: the gold finale', async ()=>{
    const s = await at('19:00:55', '1900-finale'); if (s.fountain !== 5) throw new Error(JSON.stringify(s));
  });
  await step('19:15 multi-colour show: the Burj lights up, the fountain stays still', async ()=>{
    const s = await at('19:15:10', '1915'); if (!s.on || s.type !== 'multi' || s.fountain !== 0) throw new Error(JSON.stringify(s));
  });
  await step('between shows: nothing running', async ()=>{
    const s = await at('20:07:00', '2007'); if (s.on || s.fountain !== 0) throw new Error(JSON.stringify(s));
  });
}
