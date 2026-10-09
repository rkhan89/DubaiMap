// Photo tags on the phone's side. Whether tagging is on is the server's switch (/api/photo-tags GET); when it's
// off the app shows nothing about it and never sends a photo. When it's on, each photo you add is sent once, after
// it has uploaded (so adding photos is never slowed), as a small copy (~800 px on its longest side), and the tags
// that come back are kept with the photo for search.
import * as C from './cloud.js';
import * as S from './store.js';
import { compressImage } from './ui.js';

let on = false, asked = null;
// is tagging on? (asked once; off until we know, and off offline or without the cloud)
export function aiTagsOn(){ return on; }
export function checkAiTags(){
  if (asked) return asked;
  asked = (async ()=>{
    if (!C.enabled()) return (on = false);
    try{ const r = await fetch('/api/photo-tags', { cache:'no-store' }); const j = await r.json(); on = !!(j && j.enabled); }catch(_){ on = false; }
    return on;
  })();
  return asked;
}
const b64 = blob=>new Promise((res, rej)=>{ const fr = new FileReader(); fr.onload = ()=>res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); });
// a photo's row has reached the server: read it for tags (in the background; failures leave it untagged)
export async function tagAfterUpload(photoId){
  if (!(await checkAiTags())) return;
  try{
    const blob = await S.photoBlob(photoId); if (!blob) return;
    const small = await compressImage(blob, 800, 0.8), sess = await C.session(); if (!sess) return;
    const r = await fetch('/api/photo-tags', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + sess.access_token },
      body:JSON.stringify({ photoId, image:await b64(small), type:small.type || 'image/jpeg' }) });
    const j = await r.json().catch(()=>null);
    if (j && j.state === 'ok' && Array.isArray(j.tags)) S.setPhotoAiTags(photoId, j.tags);
  }catch(_){ /* left untagged */ }
}
