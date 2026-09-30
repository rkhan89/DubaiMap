export default async function brand(h){
  await h.load(); await h.sleep(600); await h.shot('br-welcome');
  await h.seed({mode:'crew'});
  await h.shot('br-header');
  await h.js(()=>document.querySelector('#mapLoading').classList.remove('done')); await h.sleep(300); await h.shot('br-loader');
  await h.js(()=>document.querySelector('#mapLoading').classList.add('done'));
  await h.js(async ()=>{ const {go}=await import('/go.js'); go.recap(); }); await h.sleep(1600); await h.shot('br-recap');
  const cdp = await h.page.createCDPSession();
  const man = await cdp.send('Page.getAppManifest').catch(e=>({err:e.message}));
  const inst = await cdp.send('Page.getInstallabilityErrors').catch(e=>({err:e.message}));
  const icons = await h.js(async ()=>{ const m = await (await fetch('/manifest.webmanifest')).json(); const out=[]; for (const i of m.icons){ const r=await fetch(i.src); const b=await r.blob(); const img=await createImageBitmap(b); out.push(`${i.purpose} ${i.src} ${r.status} ${img.width}x${img.height}`); } return out; });
  const fav = await h.js(async ()=>{ const out=[]; for (const l of document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')){ const r=await fetch(l.href); out.push(l.getAttribute('href')+' '+r.status+' '+r.headers.get('content-type')); } return out; });
  const tc = await h.js(()=>[...document.querySelectorAll('meta[name=theme-color]')].map(m=>(m.media||'')+' '+m.content));
  console.log('manifest errors:', JSON.stringify(man.errors||man.err||[]));
  console.log('installability:', JSON.stringify(inst.installabilityErrors||inst.err));
  console.log('icons:\n  '+icons.join('\n  '));
  console.log('head icons:\n  '+fav.join('\n  '));
  console.log('theme-color:', JSON.stringify(tc));
}
