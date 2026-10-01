// The page /api/share-target returns when the service worker wasn't ready: keep the share on the
// phone, then open the app exactly as the service worker would have.
import { keepShare } from './incoming.js';
const el = document.getElementById('share-data');
let item = null;
try{ item = JSON.parse(el && el.dataset.share || 'null'); }catch(_){}
(async ()=>{
  if (item && (item.title || item.text || item.url)){ try{ await keepShare({ ...item, at:Date.now() }); }catch(_){} }
  location.replace('/share?shared=1');
})();
