// Service worker: makes the app installable, keeps it working offline (network first,
// falling back to the last copy), and opens the app when a reminder is tapped.
const CACHE = 'bites-v1';
self.addEventListener('install', ()=>self.skipWaiting());
self.addEventListener('activate', e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e=>{
  const r = e.request, u = new URL(r.url);
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
