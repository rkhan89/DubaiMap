// Shares waiting on this phone: from Android's Share menu (sw.js keeps them in IndexedDB) or a
// /share?text=…&url=… link. They stay here while you're signed out, then open in "Add from link".
const str = v => typeof v === 'string' ? v.slice(0, 2000) : '';

function db(){
  return new Promise((res, rej)=>{ const r = indexedDB.open('koko-share', 1);
    r.onupgradeneeded = ()=>r.result.createObjectStore('pending');
    r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); });
}
async function withList(fn){
  const d = await db();
  try{
    return await new Promise((res, rej)=>{ const tx = d.transaction('pending', 'readwrite'), st = tx.objectStore('pending'); let out;
      const g = st.get('list'); g.onsuccess = ()=>{ const r = fn(g.result || []); out = r.out; if (r.list) st.put(r.list.slice(-10), 'list'); };
      tx.oncomplete = ()=>res(out); tx.onerror = ()=>rej(tx.error); });
  } finally { d.close(); }
}
export async function pendingShares(){ try{ return await withList(list=>({ out:list })); }catch(_){ return []; } }
export async function keepShare(item){ return withList(list=>({ list:list.concat([item]) })); }
const keep = keepShare;
// all of them, removed from the list (the older ones go to the Inbox)
export async function takeAllShares(){ try{ return await withList(list=>({ out:list.slice(), list:[] })); }catch(_){ return []; } }
// the newest share, removed from the list
export async function takeShare(){ try{ return await withList(list=>({ out:list[list.length-1] || null, list:list.slice(0,-1) })); }catch(_){ return null; } }

// what goes in the "Link, caption or name" box: the text, plus the link if the text doesn't already have it
export function shareText(item){
  const t = (item.text||'').trim(), u = (item.url||'').trim(), title = (item.title||'').trim();
  const parts = [];
  if (title && !t && !u) parts.push(title);
  if (t) parts.push(t);
  if (u && !t.includes(u)) parts.push(u);
  return parts.join('\n');
}

// at start-up on /share: a link share joins the waiting list; the address goes back to "/"
// (so a reload doesn't share twice, and the shared text doesn't sit in the address bar).
// The iPhone Shortcut puts the text after # (/share#text=…), which browsers never send to the server.
export async function readIncoming(){
  const u = new URL(location.href);
  if (u.pathname !== '/share') return;
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  const get = k => h.get(k) || u.searchParams.get(k);
  const item = { title:str(get('title')), text:str(get('text')), url:str(get('url')), at:Date.now() };
  if (item.title || item.text || item.url){ try{ await keep(item); }catch(_){} }
  history.replaceState(null, '', '/' + (u.searchParams.has('local') ? '?local' : ''));
}
