// Share to Koko, step 4: the Inbox (save for later, offline shares, extra shares made while signed
// out) and the iPhone Shortcut's /share#text= address. (The Shortcut itself can't run here.)
const FULL = 'https://www.google.com/maps/place/Sunset+Karak+Corner/@25.2329,55.2745,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f42d0b2b5b5b5:0x8f1f7b1e2c3d4e5f!8m2!3d25.2331!4d55.2759';
export default async function share4(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('s4fail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const toastText = ()=>h.js(()=>document.querySelector('#toast').innerText);
  const inboxCount = ()=>h.js(async ()=>{ const S=await import('/store.js'); return S.inbox().length; });
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  const openAdd = async ()=>{ await h.click('#navLog'); await h.click('[data-plus="link"]'); await p.waitForSelector('#shIn', {visible:true}); };
  const submit = async v=>{ await h.js(v=>{ document.querySelector('#shIn').value=v; }, v); await h.js(()=>document.querySelector('#shGo').click()); };
  await h.seed({mode:'crew'});

  await step('offline: the share is saved to the Inbox, and you can still add it by name', async ()=>{
    await openAdd(); await p.setOfflineMode(true);
    await submit('Karak spot '+FULL);
    await p.waitForSelector('#npQ', { visible:true, timeout:8000 });
    if (!/saved in your Inbox/.test(await text())) throw new Error('no message');
    if (await inboxCount()!==1) throw new Error('not in the Inbox');
    await h.shot('s4-offline');
    await close();
  });
  await step('back online: a nudge about what’s waiting', async ()=>{
    await p.setOfflineMode(false); await h.sleep(600);
    if (!/1 share waiting in your Inbox/.test(await toastText())) throw new Error('toast: '+await toastText());
  });
  await step('+ menu shows the Inbox with its count; the Inbox lists it', async ()=>{
    await h.click('#navLog'); await h.sleep(400);
    if (!/Inbox/.test(await text()) || !/1 share waiting/.test(await text())) throw new Error('no Inbox in the + menu');
    await h.shot('s4-plus');
    await h.js(()=>document.querySelector('[data-plus="inbox"]').click()); await h.sleep(700);
    if (!/Karak spot/.test(await text())) throw new Error('not listed');
    await h.shot('s4-inbox');
  });
  await step('opening it finds the place; adding it clears it from the Inbox', async ()=>{
    await h.js(()=>document.querySelector('[data-open]').click());
    await p.waitForSelector('#cfAdd', { visible:true, timeout:8000 });
    if (await h.js(()=>!!document.querySelector('[data-later]'))) throw new Error('offers Save for later on an Inbox item');
    await h.js(()=>document.querySelector('#cfC [data-cat="karak"]').click()); await h.sleep(150);
    await h.js(()=>document.querySelector('[data-who]:not([data-who="me"])').click()); await h.sleep(150);
    await h.js(()=>document.querySelector('#cfAdd').click()); await h.sleep(800);
    if (await inboxCount()!==0) throw new Error('still in the Inbox after adding');
  });
  await step('"Save to Inbox for later" from the confirm sheet', async ()=>{
    await openAdd(); await submit('Knot Bakehouse');
    await p.waitForSelector('[data-later]', { visible:true, timeout:8000 });
    await h.js(()=>document.querySelector('[data-later]').click()); await h.sleep(500);
    if (!/Saved to your Inbox/.test(await toastText())) throw new Error('no toast');
    if (await inboxCount()!==1) throw new Error('not saved');
    // saving the same thing again doesn't add a second copy
    await openAdd(); await submit('Knot Bakehouse'); await p.waitForSelector('[data-later]', { visible:true, timeout:8000 });
    await h.js(()=>document.querySelector('[data-later]').click()); await h.sleep(400);
    if (await inboxCount()!==1) throw new Error('saved twice');
  });
  await step('remove from the Inbox, with Undo', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.inbox(); }); await h.sleep(600);
    await h.js(()=>document.querySelector('[data-remove]').click()); await h.sleep(300);
    if (await inboxCount()!==0) throw new Error('not removed');
    await h.js(()=>[...document.querySelectorAll('#toast .toast-btn')].find(b=>/Undo/.test(b.textContent)).click()); await h.sleep(300);
    if (await inboxCount()!==1) throw new Error('undo failed');
    await h.js(()=>document.querySelector('[data-remove]').click()); await h.sleep(300);
    await h.shot('s4-inbox-empty');
    await close();
  });
  await step('iPhone Shortcut address: /share#text=… opens it, the text never in the request', async ()=>{
    const seen = [];
    const onReq = req=>{ if (req.isNavigationRequest()) seen.push(req.url()); };
    p.on('request', onReq);
    await p.goto(new URL('/share?local#text='+encodeURIComponent('Arabian Tea House'), process.env.BASE||'http://localhost:5174/').href, { waitUntil:'networkidle0' });
    p.off('request', onReq);
    await p.waitForSelector('#shIn', { visible:true, timeout:8000 });
    if (!/Arabian Tea House/.test(await h.js(()=>document.querySelector('#shIn').value))) throw new Error('not filled in');
    if (seen.some(u=>/Arabian/.test(new URL(u).pathname + new URL(u).search))) throw new Error('text sent to the server');
    if (await h.js(()=>location.hash)) throw new Error('address not cleaned');
    await close();
  });
  await step('the iPhone set-up guide uses the site address from config', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.iphoneShortcut(); }); await h.sleep(600);
    const t = await text();
    if (!/Not tested on an iPhone yet/.test(t) || !/dubai-bites-pi\.vercel\.app\/share#text=/.test(t)) throw new Error('guide wrong');
    await h.shot('s4-iphone');
    await close();
  });
  await step('several shares while signed out: the newest opens, the rest go to the Inbox', async ()=>{
    await h.js(async ()=>{ localStorage.clear(); const dbs = indexedDB.databases ? await indexedDB.databases() : []; await Promise.all(dbs.filter(d=>d.name!=='koko-share').map(d=>new Promise(r=>{ const q=indexedDB.deleteDatabase(d.name); q.onsuccess=q.onerror=q.onblocked=()=>r(); }))); });
    await h.load();
    await h.js(async ()=>{ const I=await import('/incoming.js'); await I.keepShare({ text:'Old one: Knot Bakehouse', url:'', title:'', at:1 }); await I.keepShare({ text:'Newest '+'https://www.google.com/maps/place/Sunset+Karak+Corner/@25.2329,55.2745,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f42d0b2b5b5b5:0x8f1f7b1e2c3d4e5f!8m2!3d25.2331!4d55.2759', url:'', title:'', at:2 }); });
    await h.js(async ()=>{ const S=await import('/store.js'); S.signIn({email:'n@example.test'}); S.updateMe({handle:'nn', name:'N'}); const {go}=await import('/go.js'); go.finishOnboarding(); });
    await p.waitForSelector('#shIn', { visible:true, timeout:10000 });
    if (!/Newest/.test(await h.js(()=>document.querySelector('#shIn').value))) throw new Error('newest not opened');
    await h.sleep(2800);
    if (await inboxCount()!==1) throw new Error('older share not in the Inbox');
  });
}
