// Pins say whose they are: a ring in the owner's colour (yours coral until you pick), a face in
// crew view close up, colour alone in the wide shot; you can pick your colour in Settings.
export default async function pins(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('pnfail-'+name.replace(/\W+/g,'-')); } };
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  await h.seed({mode:'me'});
  const zoomTo = (lat, lng, k)=>h.js(async (lat,lng,k)=>{ const MAP=await import('/map.js'); MAP.flyToWorld(MAP.placeWorld({ lat, lng }), k); }, lat, lng, k);
  const rings = ()=>h.js(()=>[...document.querySelectorAll('.stamp-anchor.is-single .stamp')].map(s=>({ ring:s.style.getPropertyValue('--ring'), head:!!s.querySelector('.st-head'), headShown: s.querySelector('.st-head') ? getComputedStyle(s.querySelector('.st-head')).display!=='none' : false })));
  await step('Me view: your pins have a coral ring and no faces', async ()=>{
    await zoomTo(25.2, 55.27, 5); await h.sleep(1500);
    const r = await rings();
    if (!r.length) throw new Error('no pins in view');
    if (r.some(x=>x.ring!=='#F26B5B')) throw new Error(JSON.stringify(r.slice(0,4)));
    if (r.some(x=>x.head)) throw new Error('faces in Me view');
    await h.shot('pn-me');
  });
  await step('Crew view close up: rings in each person’s colour, with their face', async ()=>{
    await h.js(()=>document.querySelector('#mapMode [data-v="crew"]').click()); await h.sleep(800);
    await zoomTo(25.2, 55.27, 6); await h.sleep(1500);
    const r = await rings();
    const colours = new Set(r.map(x=>x.ring));
    if (colours.size < 2) throw new Error('one colour only: '+[...colours]);
    if (!r.some(x=>x.head && x.headShown)) throw new Error('no faces close up');
    await h.shot('pn-crew-close');
    const distinct = await h.js(async ()=>{ const S=await import('/store.js'), P=await import('/pincolor.js'); const ids=S.crewMembers().map(u=>u.id); return new Set(ids.map(P.colorOf)).size === ids.length; });
    if (!distinct) throw new Error('two people share a colour');
  });
  await step('Crew view, the wide shot: colour only, no faces', async ()=>{
    await h.js(async ()=>{ const MAP=await import('/map.js'); MAP.fitCity(false); }); await h.sleep(1500);
    const r = await h.js(()=>[...document.querySelectorAll('.st-head')].filter(x=>getComputedStyle(x).display!=='none').length);
    if (r) throw new Error(r+' faces in the wide shot');
    await h.shot('pn-crew-wide');
  });
  await step('Settings: pick your colour and your pins follow', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.settings ? go.settings() : null; });
    await h.sleep(300);
    const opened = await h.js(()=>!!document.querySelector('[data-pin]'));
    if (!opened){ await h.js(async ()=>{ const {go}=await import('/go.js'); go.profile(); }); await h.sleep(700); await h.js(()=>document.querySelector('#prSettings').click()); await h.sleep(800); }
    await h.js(()=>document.querySelector('.pin-swatches').scrollIntoView({block:'center'})); await h.sleep(300);
    await h.shot('pn-settings');
    await h.js(()=>document.querySelector('[data-pin="#3F7FD9"]').click()); await h.sleep(400);
    await close();
    await h.js(()=>document.querySelector('#mapMode [data-v="me"]').click()); await h.sleep(800);
    await zoomTo(25.2, 55.27, 5); await h.sleep(1500);
    const r = await rings();
    if (!r.length || r.some(x=>x.ring!=='#3F7FD9')) throw new Error(JSON.stringify(r.slice(0,3)));
    await h.shot('pn-me-blue');
  });
}
