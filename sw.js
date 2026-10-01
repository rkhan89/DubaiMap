// Service worker: makes the app installable, keeps it working offline (network first,
// falling back to the last copy), and opens the app when a reminder is tapped.
const CACHE = 'koko-v3';   // bump to drop anything cached from an older build (e.g. old branding)
self.addEventListener('install', ()=>self.skipWaiting());
self.addEventListener('activate', e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

/* Share to Koko (Android share sheet, manifest share_target): the shared title/text/link arrive as a
   POST to /share. They're kept on the phone (IndexedDB) and never reach the server, so they can't
   end up in request logs. The redirect is always the same page, whatever was shared. */
const str = v => typeof v === 'string' ? v.slice(0, 2000) : '';
function shareDB(){
  return new Promise((res, rej)=>{ const r = indexedDB.open('koko-share', 1);
    r.onupgradeneeded = ()=>r.result.createObjectStore('pending');
    r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); });
}
async function keepShare(item){
  const db = await shareDB();
  await new Promise((res, rej)=>{ const tx = db.transaction('pending', 'readwrite'), st = tx.objectStore('pending');
    const g = st.get('list'); g.onsuccess = ()=>{ const list = (g.result || []).concat([item]).slice(-10); st.put(list, 'list'); };
    tx.oncomplete = res; tx.onerror = ()=>rej(tx.error); });
  db.close();
}
async function receiveShare(request){
  try{
    const f = await request.formData();
    const item = { title:str(f.get('title')), text:str(f.get('text')), url:str(f.get('url')), at:Date.now() };
    if (item.title || item.text || item.url) await keepShare(item);
  }catch(_){}
  return Response.redirect('/share?shared=1', 303);
}

self.addEventListener('fetch', e=>{
  const r = e.request, u = new URL(r.url);
  if (r.method === 'POST' && u.origin === location.origin && u.pathname === '/share'){ e.respondWith(receiveShare(r)); return; }
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res=>{
    if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=>c.put(r, copy)); }
    return res;
  }).catch(()=>caches.match(r, {ignoreSearch: r.mode==='navigate'}).then(m=>m || caches.match('./'))));
});
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(ws=>ws.length ? ws[0].focus() : self.clients.openWindow(url)));
});
