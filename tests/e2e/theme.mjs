// Theme: Light / Dark / System / Dynamic. Dynamic (the default) is light by day and dark from sunset in Dubai,
// from the first paint, and switches by itself at sunset.   node shot.mjs theme 390 light
export default async function theme(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('thfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  const th = ()=>h.js(()=>document.documentElement.dataset.theme);
  await h.seed({mode:'me'});
  await h.js(()=>localStorage.removeItem('bites-theme'));       // no choice yet: Dynamic

  await step('Dynamic by default: noon in Dubai is light, 7 pm is dark', async ()=>{
    await h.load('now=2026-10-09T12:00:00%2B04:00'); if (await th() !== 'light') throw new Error('noon ' + await th());
    await h.load('now=2026-10-09T19:00:00%2B04:00'); if (await th() !== 'dark') throw new Error('7pm ' + await th());
    await h.shot('th-dynamic-night');
  });
  await step('first paint already right: the saved answer is dark until sunrise', async ()=>{
    const c = await h.js(()=>JSON.parse(localStorage.getItem('bites-theme-dyn')||'null'));
    if (!c || c.t !== 'dark' || !(c.until > Date.parse('2026-10-10T06:00:00+04:00')) || !(c.until < Date.parse('2026-10-10T06:30:00+04:00'))) throw new Error(JSON.stringify(c));
  });
  await step('switches by itself at sunset (17:58 on 9 Oct)', async ()=>{
    await h.load('now=2026-10-09T17:58:07%2B04:00'); if (await th() !== 'light') throw new Error('before ' + await th());
    await h.sleep(11000); if (await th() !== 'dark') throw new Error('after ' + await th());
  });
  await step('Settings: Light, Dark, System, Dynamic; Dynamic on, with what it does; Light sticks', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.settings(); }); await h.sleep(700);
    const r = await h.js(()=>({ opts:[...document.querySelectorAll('[data-seg="theme"] button')].map(b=>b.dataset.v + (b.classList.contains('on') ? '*' : '')).join(','), sub:document.querySelector('#themeSub')?.innerText }));
    await h.js(()=>document.querySelector('[data-seg="theme"]').scrollIntoView({ block:'center' })); await h.shot('th-settings');
    if (r.opts !== 'light,dark,system,dynamic*' || !/sunset in Dubai/.test(r.sub)) throw new Error(JSON.stringify(r));
    await h.js(()=>document.querySelector('[data-seg="theme"] [data-v="light"]').click()); await h.sleep(600);
    if (await th() !== 'light') throw new Error('light ' + await th());
    await h.load('now=2026-10-09T19:00:00%2B04:00'); if (await th() !== 'light') throw new Error('light after reload ' + await th());
  });
}
