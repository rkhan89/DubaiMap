// Share to Koko, step 2: the Android share target. A share arrives as a POST to /share (what
// Android sends once Koko is installed); the service worker keeps it on the phone and redirects to
// /share?shared=1; the app opens it in "Add from link". Signed out, it waits until you sign in.
const FULL = 'https://www.google.com/maps/place/Sunset+Karak+Corner/@25.2329,55.2745,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f42d0b2b5b5b5:0x8f1f7b1e2c3d4e5f!8m2!3d25.2331!4d55.2759';
export default async function share2(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('s2fail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const waiting = ()=>h.js(async ()=>{ const I=await import('/incoming.js'); return (await I.pendingShares()).length; });
  // make sure the service worker controls the page (it does on a phone once the app is installed)
  const swReady = async ()=>{ await h.js(async ()=>{ await navigator.serviceWorker.ready; }); if (!await h.js(()=>!!navigator.serviceWorker.controller)){ await p.reload({ waitUntil:'networkidle0' }); await h.sleep(600); } if (!await h.js(()=>!!navigator.serviceWorker.controller)) throw new Error('no service worker'); };
  // what Android does: a form POST to /share
  const share = async (fields)=>{
    await Promise.all([ p.waitForNavigation({ waitUntil:'networkidle0' }), h.js(f=>{ const form=document.createElement('form'); form.method='POST'; form.action='/share-target'; form.enctype='application/x-www-form-urlencoded';
      Object.entries(f).forEach(([k,v])=>{ const i=document.createElement('input'); i.type='hidden'; i.name=k; i.value=v; form.appendChild(i); }); document.body.appendChild(form); form.submit(); }, fields) ]);
    await h.sleep(900);
  };

  await h.seed({mode:'crew'});
  await step('service worker is in charge', swReady);
  await step('share a Google Maps link (as text) → Add from link opens and finds it', async ()=>{
    await share({ title:'', text:'Karak spot! '+FULL, url:'' });
    await p.waitForSelector('#cfAdd', { visible:true, timeout:10000 });
    const r = await h.js(()=>({ path: location.pathname, search: location.search, box: document.querySelector('#shIn')?.value||'' }));
    if (r.path!=='/' || /shared|Karak/.test(r.search)) throw new Error('address not cleaned: '+r.path+r.search);
    if (!r.box.includes('maps/place/Sunset')) throw new Error('box: '+r.box);
    if (await waiting()) throw new Error('share left waiting after opening');
    await h.shot('s2-shared-link');
  });
  await step('link in the url field, name in the text → the link is used', async ()=>{
    await share({ title:'Sunset Karak Corner', text:'Sunset Karak Corner', url:FULL });
    await p.waitForSelector('#cfAdd', { visible:true, timeout:10000 });
    if (await h.js(()=>document.querySelector('#cfN')?.value)!=='Sunset Karak Corner') throw new Error('not matched from the link');
  });
  await step('a reload does not share it again', async ()=>{
    await p.reload({ waitUntil:'networkidle0' }); await h.sleep(1200);
    if (await h.js(()=>!!document.querySelector('#shIn'))) throw new Error('reopened on reload');
  });
  await step('a plain name shared from another app', async ()=>{
    await share({ title:'', text:'Knot Bakehouse', url:'' });
    await p.waitForSelector('#npQ, #cfAdd', { visible:true, timeout:10000 });
    if (!/Knot Bakehouse/.test(await h.js(()=>document.querySelector('#shIn').value))) throw new Error('name not filled in');
    await h.shot('s2-shared-name');
  });
  await step('/share?text=… link (for the iPhone Shortcut later) works too, and the address is cleaned', async ()=>{
    await p.goto(new URL('/share?local&text='+encodeURIComponent('Arabian Tea House'), process.env.BASE||'http://localhost:5174/').href, { waitUntil:'networkidle0' }); await h.sleep(1200);
    await p.waitForSelector('#shIn', { visible:true, timeout:8000 });
    const r = await h.js(()=>({ search: location.search, box: document.querySelector('#shIn').value }));
    if (!/Arabian Tea House/.test(r.box) || /text=/.test(r.search)) throw new Error(JSON.stringify(r));
  });

  await step('no service worker running (first open, or mid-update): the server fallback still delivers it', async ()=>{
    await p.setBypassServiceWorker(true);   // as if the worker isn't running
    await share({ title:'', text:'Fallback '+FULL, url:'' });
    await p.waitForSelector('#cfAdd', { visible:true, timeout:10000 });
    if (!(await h.js(()=>document.querySelector('#shIn').value)).includes('maps/place/Sunset')) throw new Error('not delivered');
    await p.setBypassServiceWorker(false); await h.load(); await swReady();
  });
  // signed out: the share waits on the phone until you're in
  await step('signed out: the share waits, and opens after signing in', async ()=>{
    await h.js(async ()=>{ localStorage.clear(); const dbs = indexedDB.databases ? await indexedDB.databases() : []; await Promise.all(dbs.filter(d=>d.name!=='koko-share').map(d=>new Promise(r=>{ const q=indexedDB.deleteDatabase(d.name); q.onsuccess=q.onerror=q.onblocked=()=>r(); }))); });
    await h.load(); await swReady();
    await share({ title:'', text:'Must try: '+FULL, url:'' });
    if (!/Continue with Email/.test(await text())) throw new Error('not on the sign-in screen');
    if (!/Your shared place is saved/.test(await text())) throw new Error('no note about the waiting share');
    if (await waiting()!==1) throw new Error('not kept on the phone');
    await h.shot('s2-signed-out');
    await p.reload({ waitUntil:'networkidle0' }); await h.sleep(800);
    if (await waiting()!==1) throw new Error('lost on reload while signed out');
    // sign in and finish onboarding (on this phone)
    await h.js(async ()=>{ const S=await import('/store.js'); S.signIn({email:'new@example.test'}); S.updateMe({handle:'newbie', name:'New'}); const {go}=await import('/go.js'); go.finishOnboarding(); });
    await p.waitForSelector('#shIn', { visible:true, timeout:10000 });
    if (!/maps\/place\/Sunset/.test(await h.js(()=>document.querySelector('#shIn').value))) throw new Error('share not opened after sign-in');
    if (await waiting()) throw new Error('still waiting after opening');
    await h.shot('s2-after-sign-in');
  });
}
