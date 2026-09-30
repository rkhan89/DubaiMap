// Data layer. Every read and write the UI makes goes through this file.
//
// Screens read in-memory records synchronously (so they're fast and work offline). With
// Supabase configured (config.js), those records are loaded from the server on sign-in,
// every change is written back through cloud.js (queued while offline), and crew changes
// arrive live. Without it (or with ?local in the address, used by the tests) everything
// stays on this device, as in the preview. Photo files are cached in IndexedDB either way.
//
// Records
//   users    {id, name, handle, email, tagline, avatar:{pixel|photo}, shareDefault:'crew'|'private', points, createdAt}
//   crews    {id, name, tagline, code, ownerId, memberIds[], createdAt}
//   venues   {id, name, zone, categories[], lat, lng, address, createdBy, createdAt, demo}
//   entries  {id, venueId, userId, kind:'visit'|'want', rating, notes, date, private, createdAt}
//   photos   {id, userId, venueId, entryId, caption, date, private, src, bookmarkedBy[], createdAt}
//   books    {id, ownerId, kind:'personal'|'crew'|'album', title, byline, texture, tint, pin, coverPhotoId, filter, pages}
//   events   {id, crewId, createdBy, venueId, when (ISO local datetime), note, rsvps:{userId:'going'|'maybe'|'no'}, createdAt}
//
// Privacy: a private entry or photo is visible to its owner only. Everything else is
// visible to the owner's crew. Crew totals, the crew map, feed and crew book only
// ever count visible records.
import { APP } from './config.js';
import { uid, todayISO } from './data.js';
import * as C from './cloud.js';

export const cloud = C.enabled();          // accounts on the server (false = this device only)
const isLocal = id => typeof id==='string' && id.startsWith('demo-');   // the sample crew never syncs
// send a record (or a change to it) to the server; the sample crew and test data stay here
function push(table, rec, kind){
  if (!cloud || volatile || !rec || isLocal(rec.id) || (rec.crewId && isLocal(rec.crewId))) return;
  if (kind==='del') return C.queue({ k:'del', t:table, id:rec.id });
  if (kind==='upd') return C.queue({ k:'upd', t:table, id:rec.id, patch:C.patchRow(table, rec.patch) });
  C.queue({ k: kind==='ins' ? 'ins' : 'put', t:table, id:rec.id, row:C.MAP[table].to(rec) });
}

const KEY = 'bites-db-v2';
const LEGACY_KEY = 'dubai-bites-places-v1';
const LEGACY_AVATAR = 'dubai-bites-avatar-v1';
const PREVIEW_KEY = 'koko-preview-import';     // a scrapbook made on this phone before accounts

let db = load();
const listeners = new Set();
export function onChange(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }
function emit(what){ listeners.forEach(f=>{ try{ f(what); }catch(e){ console.error(e); } }); }

function fresh(){ return { version:2, meId:null, users:{}, crews:{}, venues:{}, entries:{}, photos:{}, books:{}, events:{}, flags:{} }; }
function load(){
  try{ const d=JSON.parse(localStorage.getItem(KEY)); if (d && d.version===2) return {...fresh(), ...d}; }catch(_){}
  return fresh();
}
let saveTimer=null, dirty=false, volatile=false;   // volatile: synthetic test data loaded, never write
function save(what){
  if (volatile){ emit(what||'data'); return; }
  clearTimeout(saveTimer); dirty=true;
  saveTimer = setTimeout(()=>{
    dirty=false;
    try{ localStorage.setItem(KEY, JSON.stringify(db)); }
    catch(e){ emit('quota'); }
  }, 30);
  emit(what||'data');
}
// write any pending change before the page goes away (only if one is pending)
export function flush(){ clearTimeout(saveTimer); if (!dirty || volatile) return; dirty=false; try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(_){} }
window.addEventListener('pagehide', flush);

/* =========================================================
   PHOTO FILES (IndexedDB)
   ========================================================= */
const urlCache = new Map();
let idbP = null;
function idb(){
  if (idbP) return idbP;
  idbP = new Promise((res, rej)=>{
    const r = indexedDB.open('bites-photos', 1);
    r.onupgradeneeded = ()=> r.result.createObjectStore('blobs');
    r.onsuccess = ()=> res(r.result);
    r.onerror = ()=> rej(r.error);
  });
  return idbP;
}
async function idbDo(mode, fn){
  const d = await idb();
  return new Promise((res, rej)=>{
    const tx = d.transaction('blobs', mode), st = tx.objectStore('blobs');
    const req = fn(st);
    tx.oncomplete = ()=> res(req && req.result);
    tx.onerror = ()=> rej(tx.error);
  });
}
async function putBlob(id, blob){ await idbDo('readwrite', st=>st.put(blob, id)); urlCache.set(id, URL.createObjectURL(blob)); }
async function delBlob(id){ await idbDo('readwrite', st=>st.delete(id)); const u=urlCache.get(id); if (u) URL.revokeObjectURL(u); urlCache.delete(id); }
export function photoURL(p){
  if (!p) return '';
  if (urlCache.has(p.id)) return urlCache.get(p.id);
  if (p.src==='idb' || p.src==='cloud') return p.path ? C.signedURL(p.path) : '';
  return p.src;
}
async function getBlob(id){ try{ return await idbDo('readonly', st=>st.get(id)); }catch(_){ return null; } }

/* =========================================================
   INIT
   ========================================================= */
let syncing = false, pullT = null;
// replace server-backed records with the server's view, keeping the sample crew and any
// changes still waiting in the outbox
export async function pullNow(){
  if (!cloud || !db.meId) return;
  let fresh;
  try{ fresh = await C.pull(); }catch(e){ console.warn('Koko: using the copy on this phone', e); return; }
  const keep = (map)=>Object.fromEntries(Object.entries(map||{}).filter(([k])=>isLocal(k)));
  const meRec = db.users[db.meId];
  db.users   = { ...keep(db.users), ...fresh.users };
  db.crews   = { ...keep(db.crews), ...fresh.crews };
  db.venues  = { ...keep(db.venues), ...fresh.venues };
  db.entries = { ...keep(db.entries), ...fresh.entries };
  db.photos  = { ...keep(db.photos), ...fresh.photos };
  db.books   = { ...Object.fromEntries(Object.entries(db.books||{}).filter(([k,b])=>isLocal(k) || isLocal(b.crewId))), ...fresh.books };
  db.events  = { ...keep(db.events), ...fresh.events };
  // no profile row yet (an account made before the database was set up): make it from this phone's copy
  if (!db.users[db.meId] && meRec){ db.users[db.meId] = meRec; C.queue({ k:'put', t:'profiles', id:meRec.id, row:C.MAP.profiles.to(meRec) }); }
  if (db.users[db.meId] && meRec) db.users[db.meId].email = meRec.email;
  // replay what hasn't reached the server yet, so nothing flickers back
  const T = { profiles:'users', crews:'crews', venues:'venues', entries:'entries', photos:'photos', books:'books', events:'events' };
  C.pending().forEach(o=>{
    const map = T[o.t] && db[T[o.t]]; if (!map) return;
    if (o.k==='put' || o.k==='ins'){ const rec = C.MAP[o.t].from ? C.MAP[o.t].from({ ...o.row, created_at:o.row.created_at || new Date().toISOString() }) : null; if (rec && !(o.k==='ins' && map[o.id])) map[o.id] = { ...(map[o.id]||{}), ...rec, src: map[o.id]?.src==='idb' ? 'idb' : rec.src }; }
    if (o.k==='del') delete map[o.id];
    if (o.k==='upd' && map[o.id]){ const f=C.MAP[o.t].fields||{}; Object.entries(f).forEach(([camel,col])=>{ if (col in o.patch) map[o.id][camel]=o.patch[col]; }); }
  });
  if (db.flags.demo) addDemoMembers();
  // my own photos taken on this phone keep their local copy; everything else gets a signed link
  Object.values(db.photos).forEach(p=>{ if (p.src==='cloud' && urlCache.has(p.id)) p.src='idb'; });
  save('sync');
  C.sign(Object.values(db.photos).filter(p=>p.path && !urlCache.has(p.id)).map(p=>p.path)).then(n=>{ if (n) emit('photos'); });
}
function schedulePull(){ clearTimeout(pullT); pullT = setTimeout(pullNow, 700); }

async function startCloud(){
  const s = await C.session();
  const uidNow = s && s.user && s.user.id;
  if (!uidNow){ if (db.meId) resetFor(null); return; }
  if (db.meId !== uidNow) resetFor(uidNow);
  db.meId = uidNow;
  if (!db.users[uidNow]) db.users[uidNow] = { id:uidNow, handle:'', name:'', avatar:{}, shareDefault:'crew', points:0, onboarded:false, createdAt:Date.now() };
  db.users[uidNow].email = s.user.email || '';
  C.setOutboxOwner(uidNow, { blob:getBlob, failed:()=>{ emit('sync-error'); schedulePull(); }, synced:()=>emit('synced') });
  await pullNow();
  C.flush();
  C.subscribe(schedulePull);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) schedulePull(); });
}
// a different account on this phone: start clean, but keep a preview-era scrapbook so it can be imported
function resetFor(newId){
  const prev = db.meId && db.users[db.meId];
  if (prev && !db.flags.cloudUser){
    const mine = Object.values(db.entries).filter(e=>e.userId===db.meId);
    if (mine.length){
      const snap = { venues:Object.values(db.venues).filter(v=>mine.some(e=>e.venueId===v.id)), entries:mine,
                     photos:Object.values(db.photos).filter(p=>p.userId===db.meId && p.src==='idb') };
      try{ localStorage.setItem(PREVIEW_KEY, JSON.stringify(snap)); }catch(_){}
    }
  }
  const flags = { seedsRemoved:true, cloudUser:true };
  db = fresh(); db.flags = flags; db.meId = newId;
  save('reset');
}

export async function init(){
  if (cloud){ try{ await startCloud(); }catch(e){ console.warn('Koko: starting offline', e); } }
  // The map starts empty: every place is one someone pinned. Earlier versions shipped 100
  // starter places; those nobody has logged are removed once (logged ones become ordinary places).
  if (!db.flags.seedsRemoved){
    const used = new Set(Object.values(db.entries).map(e=>e.venueId));
    Object.values(db.venues).forEach(v=>{ if (v.seed){ if (used.has(v.id)) delete v.seed; else delete db.venues[v.id]; } });
    db.flags.seedsRemoved = true; save('venues');
  }
  // development: ?synthetic=500 adds that many places in memory only
  const syn = +new URLSearchParams(location.search).get('synthetic');
  if (syn > 0 && me()){ volatile = true; const { synthesize } = await import('./synth.js'); synthesize(db, Math.min(syn, 2000), { meId:db.meId, circle:circleIds() }); }
  // load photo files into object URLs
  const ids = Object.values(db.photos).filter(p=>p.src==='idb').map(p=>p.id);
  if (ids.length){
    try{
      const d = await idb();
      await Promise.all(ids.map(id=>new Promise(res=>{
        const r = d.transaction('blobs').objectStore('blobs').get(id);
        r.onsuccess = ()=>{ if (r.result) urlCache.set(id, URL.createObjectURL(r.result)); res(); };
        r.onerror = ()=>res();
      })));
    }catch(_){}
  }
}

/* =========================================================
   ACCOUNT
   ========================================================= */
export function me(){ return db.meId ? db.users[db.meId]||null : null; }
export function isSignedIn(){ return !!me(); }
export function isOnboarded(){ const m=me(); return !!(m && m.onboarded); }
// With accounts: a 6-digit code by email, or Google. Returns once signed in and loaded.
export async function sendCode(email){ return C.sendCode(email); }
export async function verifyCode(email, code){ await C.verifyCode(email, code); await startCloud(); return me(); }
export async function signInGoogle(){ return C.google(); }
export async function handleAvailable(h){
  if (!cloud) return handleStatus(h)!=='taken';
  try{ return await C.rpc('handle_available', { p_handle:h }); }catch(_){ return true; }
}
// This device only (no accounts): "signing in" makes a profile here.
export function signIn({email, provider}){
  let m = me();
  if (!m){
    const legacyAv = (()=>{ try{ return JSON.parse(localStorage.getItem(LEGACY_AVATAR)); }catch(_){ return null; } })();
    m = { id:uid(), name:'', handle:'', email:email||'', provider:provider||'email', tagline:'',
          avatar:{ pixel: legacyAv || {skin:2, hair:'short', hairColor:'#1F1612', outfit:'tee', top:'#E8B84B'} },
          shareDefault:'crew', points:0, createdAt:Date.now(), onboarded:false };
    db.users[m.id] = m; db.meId = m.id;
  } else if (email) m.email = email;
  save('me'); return m;
}
export async function signOut(){
  if (cloud){ await C.unsubscribe(); await C.signOut(); C.setOutboxOwner(null); const flags={ seedsRemoved:true, cloudUser:true }; db=fresh(); db.flags=flags; save('me'); return; }
  db.meId = null; save('me');
}
export function updateMe(patch){ const m=me(); if (!m) return; Object.assign(m, patch); save('me'); push('profiles', { id:m.id, patch }, 'upd'); return m; }
export function addPoints(n){ const m=me(); if (m){ m.points=(m.points||0)+n; save('me'); push('profiles', { id:m.id, patch:{points:m.points} }, 'upd'); } }
const RESERVED = ['admin','support','dubaibites','bites','crew','you','me','help'];
export function handleStatus(h){
  h = (h||'').trim().replace(/^@/,'').toLowerCase();
  if (h.length < 3) return 'short';
  if (h.length > 20) return 'long';
  if (!/^[a-z0-9_]+$/.test(h)) return 'chars';
  const mine = me();
  if (RESERVED.includes(h) || Object.values(db.users).some(u=>u.handle===h && (!mine || u.id!==mine.id))) return 'taken';
  return 'ok';
}
export function user(id){ return db.users[id]||null; }

/* =========================================================
   CREWS
   ========================================================= */
export function myCrew(){ const m=me(); if (!m) return null; return Object.values(db.crews).find(c=>c.memberIds.includes(m.id))||null; }
export function crewMembers(crew){ crew = crew||myCrew(); if (!crew) return me()?[me()]:[]; return crew.memberIds.map(user).filter(Boolean); }
// who "my crew" is for visibility: me plus everyone in my crew
export function circleIds(){ const c=myCrew(), m=me(); if (!m) return []; return c ? c.memberIds.slice() : [m.id]; }
function makeCode(name){
  const letters = (name||'CREW').toUpperCase().replace(/[^A-Z]/g,'').slice(0,5).padEnd(3,'X');
  let code;
  do { code = letters + Math.floor(Math.random()*90+10); } while (Object.values(db.crews).some(c=>c.code===code));
  return code;
}
export async function createCrew({name, tagline}){
  const m=me(); if (!m) return null;
  if (cloud){ const r = await C.rpc('create_crew', { p_name:name, p_tagline:tagline||'' }); await pullNow(); return db.crews[r.id] || null; }
  leaveCrew(true);
  const c = { id:uid(), name:name.trim()||'My Crew', tagline:(tagline||'').trim(), code:makeCode(name), ownerId:m.id, memberIds:[m.id], createdAt:Date.now() };
  db.crews[c.id]=c; save('crew'); return c;
}
export function updateCrew(patch){ const c=myCrew(); if (!c) return; Object.assign(c, patch); save('crew'); push('crews', { id:c.id, patch }, 'upd'); }
// join by code: { crew } or { error:'invalid'|'full'|'offline', code }
export async function joinCrew(code){
  code=(code||'').trim().toUpperCase().replace(/^.*JOIN=/,'');
  if (cloud){
    let r; try{ r = await C.rpc('join_crew', { p_code:code }); }catch(e){ return { error:'offline', code }; }
    if (r!=='ok') return { error:r, code };
    await pullNow(); return { crew:myCrew() };
  }
  const c = Object.values(db.crews).find(c=>c.code===code);
  if (!c) return { error:'invalid', code };
  const m=me();
  if (c.memberIds.includes(m.id)) return { crew:c };
  if (c.memberIds.length >= APP.crewMax) return { error:'full', crew:c };
  leaveCrew(true);
  c.memberIds.push(m.id); save('crew'); return { crew:c };
}
export async function leaveCrew(silent){
  const c=myCrew(), m=me(); if (!c||!m) return;
  if (cloud && !isLocal(c.id)){ await C.rpc('leave_crew'); await pullNow(); return; }
  c.memberIds = c.memberIds.filter(id=>id!==m.id);
  if (!c.memberIds.length) delete db.crews[c.id];
  else if (c.ownerId===m.id) c.ownerId = c.memberIds[0];
  if (!silent) save('crew');
}
export async function removeMember(id){
  const c=myCrew(), m=me(); if (!c || c.ownerId!==m.id || id===m.id) return;
  if (cloud && !isLocal(id)){ await C.removeMember(id); await pullNow(); return; }
  c.memberIds=c.memberIds.filter(x=>x!==id); save('crew');
}
// what an invite code leads to: { id, name, tagline, code, count, members:[user] } or null
export async function findCrewByCode(code){
  code=(code||'').trim().toUpperCase();
  if (cloud){
    try{ const p = await C.rpc('crew_preview', { p_code:code }); if (!p) return null;
      return { ...p, memberIds:(p.members||[]).map(u=>u.id), members:(p.members||[]).map(u=>({ ...u, avatar:u.avatar||{} })) }; }catch(_){ return null; }
  }
  const c = Object.values(db.crews).find(c=>c.code===code); return c ? { ...c, count:c.memberIds.length, members:c.memberIds.map(user).filter(Boolean) } : null;
}

/* =========================================================
   VENUES
   ========================================================= */
export function venues(){ return Object.values(db.venues); }
export function venue(id){ return db.venues[id]||null; }
export function addVenue({name, zone, categories, lat, lng, address}){
  const v = { id:uid(), name:name.trim(), zone, categories:categories||[], lat:lat??null, lng:lng??null, address:address||'', createdBy:me()?.id||null, createdAt:Date.now(), seed:false };
  db.venues[v.id]=v; save('venues'); push('venues', v); return v;
}
export function updateVenue(id, patch){ const v=db.venues[id]; if (!v) return; Object.assign(v, patch); save('venues'); push('venues', { id, patch }, 'upd'); return v; }
export function searchVenues(q, limit){
  q=(q||'').trim().toLowerCase(); if (!q) return [];
  const words=q.split(/\s+/);
  return venues().map(v=>{
    const n=v.name.toLowerCase();
    let score = n.startsWith(q) ? 3 : n.includes(q) ? 2 : words.every(w=>n.includes(w)) ? 1 : 0;
    return {v, score};
  }).filter(x=>x.score).sort((a,b)=>b.score-a.score || a.v.name.localeCompare(b.v.name)).slice(0,limit||8).map(x=>x.v);
}

/* =========================================================
   ENTRIES (visits + want-to-try) and visibility
   ========================================================= */
export function canSee(rec){
  const m=me(); if (!m || !rec) return false;
  if (rec.userId===m.id) return true;
  if (rec.private) return false;
  return circleIds().includes(rec.userId);
}
export function entries(filter){
  filter = filter||{};
  return Object.values(db.entries).filter(e=>
    (!filter.venueId || e.venueId===filter.venueId) &&
    (!filter.userId || e.userId===filter.userId) &&
    (!filter.kind || e.kind===filter.kind) &&
    (filter.includeHidden || canSee(e)));
}
export function entry(id){ return db.entries[id]||null; }
export function addEntry(data){
  const m=me();
  const e = { id:uid(), userId:m.id, kind:'visit', rating:0, notes:'', date:todayISO(), private:m.shareDefault==='private', createdAt:Date.now(), ...data };
  db.entries[e.id]=e; save('entries'); push('entries', e); return e;
}
export function updateEntry(id, patch){
  const e=db.entries[id]; if (!e || e.userId!==me()?.id) return;
  Object.assign(e, patch);
  // a private entry's photos are private too
  if (patch.private) Object.values(db.photos).filter(p=>p.entryId===id).forEach(p=>{ if (!p.private){ p.private=true; push('photos', { id:p.id, patch:{private:true} }, 'upd'); } });
  save('entries'); push('entries', e); return e;
}
export async function deleteEntry(id){
  const e=db.entries[id]; if (!e || e.userId!==me()?.id) return;
  const ps = Object.values(db.photos).filter(p=>p.entryId===id);
  for (const p of ps) await deletePhoto(p.id, true);
  delete db.entries[id]; save('entries'); push('entries', e, 'del');
  return { entry:e, photos:ps };
}
export function restoreEntry(snapshot){ db.entries[snapshot.entry.id]=snapshot.entry; save('entries'); push('entries', snapshot.entry); }
// is this visit the first by anyone in my crew at this venue?
export function firstInCrew(venueId){
  const ids=circleIds();
  return !Object.values(db.entries).some(e=>e.venueId===venueId && e.kind==='visit' && ids.includes(e.userId) && !e.private);
}

/* =========================================================
   PHOTOS
   ========================================================= */
export function photos(filter){
  filter=filter||{};
  return Object.values(db.photos).filter(p=>
    (!filter.venueId || p.venueId===filter.venueId) &&
    (!filter.userId || p.userId===filter.userId) &&
    (!filter.entryId || p.entryId===filter.entryId) &&
    canSee(p)).sort((a,b)=>(b.date||'').localeCompare(a.date||'') || b.createdAt-a.createdAt);
}
export function photo(id){ return db.photos[id]||null; }
export function myPhotoCount(){ const m=me(); return m ? Object.values(db.photos).filter(p=>p.userId===m.id).length : 0; }
export async function addPhotos(list){
  const m=me(); const out=[];
  for (const it of list){
    const id = uid();
    const p = { id, userId:m.id, venueId:it.venueId, entryId:it.entryId||null, caption:it.caption||'', date:it.date||todayISO(),
                private:!!it.private, src:'idb', path:m.id+'/'+id+'.jpg', bookmarkedBy:[], createdAt:Date.now()+out.length };
    await putBlob(p.id, it.blob);
    db.photos[p.id]=p; out.push(p);
    if (cloud && !volatile){ C.queue({ k:'upload', id:p.id, path:p.path }); push('photos', p); }
  }
  save('photos'); return out;
}
export function updatePhoto(id, patch){ const p=db.photos[id]; if (!p) return; if (p.userId!==me()?.id && !('bookmarkedBy' in patch)) return; Object.assign(p, patch); save('photos'); if (p.userId===me()?.id) push('photos', { id, patch }, 'upd'); return p; }
export function toggleBookmark(id){
  const p=db.photos[id], m=me(); if (!p||!m) return false;
  p.bookmarkedBy = p.bookmarkedBy||[];
  const on = !p.bookmarkedBy.includes(m.id);
  p.bookmarkedBy = on ? [...p.bookmarkedBy, m.id] : p.bookmarkedBy.filter(x=>x!==m.id);
  save('photos'); if (cloud && !isLocal(id)) C.queue({ k:'rpc', fn:'toggle_bookmark', args:{ p_photo:id } }); return on;
}
export async function deletePhoto(id, quiet){
  const p=db.photos[id]; if (!p || p.userId!==me()?.id) return;
  if (urlCache.has(id)) await delBlob(id);
  delete db.photos[id];
  if (cloud && !isLocal(id)){ push('photos', p, 'del'); if (p.path) C.queue({ k:'rmfile', path:p.path }); }
  Object.values(db.books).forEach(b=>{ if (b.coverPhotoId===id) b.coverPhotoId=null; });
  if (!quiet) save('photos');
}

/* =========================================================
   BOOKS (photobooks + custom albums)
   ========================================================= */
export function books(){
  const m=me(); if (!m) return [];
  if (!Object.values(db.books).some(b=>b.ownerId===m.id && b.kind==='personal')){
    const b = { id:'personal-'+m.id, ownerId:m.id, kind:'personal', title:`${APP.name} • Vol. 1`, byline:'', texture:'leather', tint:'#8B5A2B', pin:'coffee', coverPhotoId:null, filter:{}, pages:{} };
    db.books[b.id] = b; push('books', b, 'ins');
  }
  const crew=myCrew();
  if (crew && !Object.values(db.books).some(b=>b.kind==='crew' && b.crewId===crew.id)){
    const b = { id:'crewbook-'+crew.id, ownerId:m.id, crewId:crew.id, kind:'crew', title:`${crew.name} Scrapbook`, byline:'', texture:'cloth', tint:'#486636', pin:'karak', coverPhotoId:null, filter:{}, pages:{} };
    db.books[b.id] = b; push('books', b, 'ins');
  }
  Object.entries(db.books).forEach(([k,b])=>{ if (!b.id) b.id=k; });
  // the app was renamed: personal books still carrying the old default title follow the new name
  Object.values(db.books).forEach(b=>{ if (b.kind==='personal' && b.title==='Dubai Bites • Vol. 1') b.title=APP.name+' • Vol. 1'; });
  return Object.values(db.books).filter(b=> b.ownerId===m.id && b.kind!=='crew' || (b.kind==='crew' && crew && b.crewId===crew.id));
}
export function book(id){ books(); return db.books[id]||null; }
export function saveBook(id, patch){ const b=db.books[id]; if (!b) return; Object.assign(b, patch); save('books'); push('books', { id, patch, crewId:b.crewId }, 'upd'); return b; }
export function addAlbum(data){ const m=me(); const id=uid(); db.books[id]={ id, ownerId:m.id, kind:'album', texture:'paperback', tint:'#e5a93c', pin:'dessert', coverPhotoId:null, filter:{}, pages:{}, ...data }; save('books'); push('books', db.books[id]); return db.books[id]; }
export function deleteBook(id){ const b=db.books[id]; if (b && b.kind==='album' && b.ownerId===me()?.id){ delete db.books[id]; save('books'); push('books', b, 'del'); } }

/* =========================================================
   FLAGS (tour seen, etc.)
   ========================================================= */
export function flag(k){ return !!db.flags[k]; }
export function setFlag(k, v){ db.flags[k]=v===undefined?true:v; save('flags'); }

/* =========================================================
   IMPORT FROM THIS PHONE (the old single-device version)
   ========================================================= */
export function legacyPlaces(){
  if (db.flags.legacyImported) return [];
  let list = [];
  try{ list = (JSON.parse(localStorage.getItem(LEGACY_KEY))||[]).filter(p=>!p.seed); }catch(_){}
  // entries from the preview version (before accounts) on this phone
  try{
    const snap = JSON.parse(localStorage.getItem(PREVIEW_KEY));
    if (snap) snap.entries.forEach(e=>{
      const v = snap.venues.find(x=>x.id===e.venueId); if (!v) return;
      const ph = snap.photos.find(p=>p.entryId===e.id);
      list.push({ id:'pv-'+e.id, name:v.name, zone:v.zone, categories:v.categories, lat:v.lat, lng:v.lng, status:e.kind==='want'?'want':'visit',
                  rating:e.rating, notes:e.notes, dateVisited:e.date, createdAt:e.createdAt, blobId:ph?ph.id:null, caption:ph?ph.caption:'' });
    });
  }catch(_){}
  return list;
}
async function dataURLtoBlob(u){ return (await fetch(u)).blob(); }
export async function importLegacy(ids){
  const list = legacyPlaces().filter(p=>ids.includes(p.id));
  const m=me(); let added=0;
  for (const p of list){
    let v = db.venues[p.id] || venues().find(x=>x.name.toLowerCase()===(p.name||'').toLowerCase());
    if (!v) v = addVenue({ name:p.name||'Untitled', zone:p.zone, categories:p.categories||[], lat:p.lat, lng:p.lng });
    else if (typeof p.lat==='number' && v.lat==null){ v.lat=p.lat; v.lng=p.lng; }
    const e = addEntry({ venueId:v.id, kind:p.status==='want'?'want':'visit', rating:p.rating||0, notes:p.notes||'',
                         date:p.dateVisited||todayISO(), private:m.shareDefault==='private', createdAt:p.createdAt||Date.now() });
    if (p.photo){ try{ await addPhotos([{ blob:await dataURLtoBlob(p.photo), venueId:v.id, entryId:e.id, date:e.date, private:e.private }]); }catch(_){} }
    if (p.blobId){ try{ const b = await getBlob(p.blobId); if (b) await addPhotos([{ blob:b, caption:p.caption||'', venueId:v.id, entryId:e.id, date:e.date, private:e.private }]); }catch(_){} }
    added++;
  }
  db.flags.legacyImported = true; save('import');
  try{ localStorage.removeItem(PREVIEW_KEY); }catch(_){}
  return added;
}
export function skipLegacy(){ db.flags.legacyImported = true; save('import'); }

/* =========================================================
   BACKUP
   ========================================================= */
async function blobToDataURL(b){ return new Promise(r=>{ const f=new FileReader(); f.onload=()=>r(f.result); f.readAsDataURL(b); }); }
export async function exportBackup(){
  const m=me();
  const mine = { entries:Object.values(db.entries).filter(e=>e.userId===m.id), venues:Object.values(db.venues).filter(v=>!v.seed), photos:[] };
  for (const p of Object.values(db.photos).filter(p=>p.userId===m.id)){
    const rec={...p};
    if (p.src==='idb'){ try{ const b = await (await fetch(photoURL(p))).blob(); rec.data = await blobToDataURL(b); }catch(_){} }
    mine.photos.push(rec);
  }
  mine.events = Object.values(db.events||{}).filter(ev=>ev.createdBy===m.id);
  return { app:APP.name, version:2, exportedAt:new Date().toISOString(), profile:m, ...mine };
}
export async function importBackup(data){
  if (!data || data.version!==2) throw new Error('bad');
  const m=me(); let n=0;
  (data.venues||[]).forEach(v=>{ if (!db.venues[v.id]) db.venues[v.id]=v; });
  (data.venues||[]).forEach(v=>{ if (db.venues[v.id] && !db.venues[v.id].createdBy){ db.venues[v.id].createdBy=m.id; } if (db.venues[v.id]) push('venues', {...db.venues[v.id], createdBy:db.venues[v.id].createdBy||m.id}); });
  (data.entries||[]).forEach(e=>{ if (!db.entries[e.id]){ db.entries[e.id]={...e, userId:m.id}; push('entries', db.entries[e.id]); n++; } });
  db.events = db.events||{};
  (data.events||[]).forEach(ev=>{ if (!db.events[ev.id]) db.events[ev.id]={...ev, createdBy:m.id, crewId:myCrew()?.id||null}; });
  for (const p of (data.photos||[])){
    if (db.photos[p.id] || !p.data) continue;
    const blob = await dataURLtoBlob(p.data); const {data:_, ...rec}=p;
    await putBlob(p.id, blob); db.photos[p.id]={...rec, userId:m.id, src:'idb', path:m.id+'/'+p.id+'.jpg'};
    if (cloud){ C.queue({ k:'upload', id:p.id, path:db.photos[p.id].path }); push('photos', db.photos[p.id]); }
  }
  save('import'); return n;
}

/* =========================================================
   CREW EVENTS ("plan a bite"): visible to the crew they belong to
   ========================================================= */
export function events(filter){
  filter = filter||{};
  const m=me(), crew=myCrew(); if (!m) return [];
  return Object.values(db.events||{}).filter(ev=>
    (ev.createdBy===m.id || (crew && ev.crewId===crew.id)) &&
    (!filter.venueId || ev.venueId===filter.venueId) &&
    (!filter.upcoming || new Date(ev.when).getTime() > Date.now()-3*3600e3)
  ).sort((a,b)=>a.when.localeCompare(b.when));
}
export function event(id){ return (db.events||{})[id]||null; }
export function addEvent({venueId, when, note}){
  const m=me(), crew=myCrew();
  db.events = db.events||{};
  const id=uid();
  db.events[id] = { id, crewId:crew?crew.id:null, createdBy:m.id, venueId, when, note:note||'', rsvps:{[m.id]:'going'}, createdAt:Date.now() };
  save('events'); push('events', db.events[id]); return db.events[id];
}
export function updateEvent(id, patch){ const ev=event(id); if (!ev || ev.createdBy!==me()?.id) return; Object.assign(ev, patch); save('events'); push('events', { id, patch }, 'upd'); return ev; }
export function rsvp(id, status){ const ev=event(id), m=me(); if (!ev || !m) return; ev.rsvps[m.id]=status; save('events'); if (cloud && !isLocal(id)) C.queue({ k:'rpc', fn:'rsvp', args:{ p_event:id, p_status:status } }); return ev; }
export function cancelEvent(id){ const ev=event(id); if (!ev || ev.createdBy!==me()?.id) return; delete db.events[id]; save('events'); push('events', ev, 'del'); }

/* =========================================================
   SAMPLE CREW (on this phone only: sample friends so the social screens have life in them)
   ========================================================= */
const DEMO_IDS = ['demo-maya','demo-omar','demo-layla','demo-kabir','demo-noor'];
function addDemoMembers(){
  const m=me(); if (!m) return;
  let crew = myCrew();
  if (!crew){ crew = { id:'demo-crew', name:'Karak Crew', tagline:'Chai, saffron buns, and old Deira hideouts', code:'KARAK7', ownerId:m.id, memberIds:[m.id], createdAt:Date.now() }; db.crews[crew.id]=crew; }
  DEMO_IDS.forEach(id=>{ if (db.users[id] && crew.memberIds.length < APP.crewMax && !crew.memberIds.includes(id)) crew.memberIds.push(id); });
}
export function demoOn(){ return !!db.flags.demo; }
export async function setDemo(on){
  const { DEMO } = await import('./demo.js');
  const m=me(); if (!m) return;
  // clear any previous demo records
  Object.keys(db.users).forEach(k=>{ if (k.startsWith('demo-')) delete db.users[k]; });
  // demo places go too, unless you logged or planned something there yourself
  const keep = new Set([...Object.values(db.entries).filter(e=>!e.id.startsWith('demo-')).map(e=>e.venueId), ...Object.values(db.events||{}).filter(e=>!e.id.startsWith('demo-')).map(e=>e.venueId)]);
  Object.keys(db.venues).forEach(k=>{ if (k.startsWith('demo-v') && !keep.has(k)) delete db.venues[k]; });
  Object.keys(db.entries).forEach(k=>{ if (k.startsWith('demo-')) delete db.entries[k]; });
  Object.keys(db.photos).forEach(k=>{ if (k.startsWith('demo-')) delete db.photos[k]; });
  db.events = db.events||{};
  Object.keys(db.events).forEach(k=>{ if (k.startsWith('demo-')) delete db.events[k]; });
  Object.values(db.crews).forEach(c=>{ c.memberIds = c.memberIds.filter(id=>!id.startsWith('demo-')); });
  Object.keys(db.crews).forEach(k=>{ if (!db.crews[k].memberIds.length) delete db.crews[k]; });
  db.flags.demo = !!on;
  if (on){
    DEMO.users.forEach(u=>{ db.users[u.id]={...u, createdAt:Date.now()}; });
    DEMO.venues.forEach(([name, zone, cat], i)=>{
      const id = 'demo-v'+i;
      if (!db.venues[id] && !venues().some(v=>v.name===name)) db.venues[id] = { id, name, zone, categories:[cat], lat:null, lng:null, address:'', createdBy:null, createdAt:Date.now(), demo:true };
    });
    addDemoMembers();
    const crew = myCrew();
    const byName = n=>venues().find(v=>v.name===n);
    const day = 864e5;
    // two crew plans coming up, so the events screens have life in them
    const at = (days, hh, mm)=>{ const d=new Date(Date.now()+days*864e5); d.setHours(hh, mm, 0, 0); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(hh)}:${p(mm)}`; };
    const ev = (id, by, name, when, note, rsvps)=>{ const v=venues().find(x=>x.name===name); if (v) db.events[id]={ id, crewId:crew.id, createdBy:by, venueId:v.id, when, note, rsvps, createdAt:Date.now()-2*3600e3 }; };
    ev('demo-ev1', 'demo-maya', 'Koukh Al Shay', at(2,21,30), 'Late karak run, who’s in?', {'demo-maya':'going','demo-omar':'going','demo-noor':'maybe'});
    ev('demo-ev2', 'demo-layla', 'Knot Bakehouse', at(5,9,0), 'Before they sell out of cardamom knots', {'demo-layla':'going','demo-kabir':'going'});
    DEMO.entries.forEach((e,i)=>{
      const v = byName(e.venue); if (!v) return;
      const ts = Date.now() - e.daysAgo*day - (i%5)*3.6e6;
      const d = new Date(ts), iso = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const id = 'demo-e'+i;
      db.entries[id] = { id, venueId:v.id, userId:e.user, kind:e.kind||'visit', rating:e.rating||0, notes:e.notes||'', date:iso, private:!!e.private, createdAt:ts };
      (e.photos||[]).forEach((ph,j)=>{
        const pid = `demo-p${i}-${j}`;
        db.photos[pid] = { id:pid, userId:e.user, venueId:v.id, entryId:id, caption:ph[1]||'', date:iso, private:!!e.private,
                           src:'demo/'+ph[0], bookmarkedBy:[], createdAt:ts+j };
      });
    });
  }
  save('demo');
}
