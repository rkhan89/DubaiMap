// Data layer. Every read and write the UI makes goes through this file.
//
// Right now it's local: records live in localStorage and photo files in IndexedDB,
// so everything stays on this device. Connecting Supabase means re-implementing the
// exported functions below against the server (same names, same shapes); the
// screens don't touch storage directly and won't need to change.
//
// Records
//   users    {id, name, handle, email, tagline, avatar:{pixel|photo}, shareDefault:'crew'|'private', points, createdAt}
//   crews    {id, name, tagline, code, ownerId, memberIds[], createdAt}
//   venues   {id, name, zone, categories[], lat, lng, address, createdBy, createdAt, seed}
//   entries  {id, venueId, userId, kind:'visit'|'want', rating, notes, date, private, createdAt}
//   photos   {id, userId, venueId, entryId, caption, date, private, src, bookmarkedBy[], createdAt}
//   books    {id, ownerId, kind:'personal'|'crew'|'album', title, byline, texture, tint, pin, coverPhotoId, filter}
//
// Privacy: a private entry or photo is visible to its owner only. Everything else is
// visible to the owner's crew. Crew totals, the crew map, feed and crew book only
// ever count visible records.
import { APP } from './config.js';
import { uid, todayISO } from './data.js';

const KEY = 'bites-db-v2';
const LEGACY_KEY = 'dubai-bites-places-v1';
const LEGACY_AVATAR = 'dubai-bites-avatar-v1';

let db = load();
const listeners = new Set();
export function onChange(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }
function emit(what){ listeners.forEach(f=>{ try{ f(what); }catch(e){ console.error(e); } }); }

function fresh(){ return { version:2, meId:null, users:{}, crews:{}, venues:{}, entries:{}, photos:{}, books:{}, flags:{} }; }
function load(){
  try{ const d=JSON.parse(localStorage.getItem(KEY)); if (d && d.version===2) return {...fresh(), ...d}; }catch(_){}
  return fresh();
}
let saveTimer=null, dirty=false;
function save(what){
  clearTimeout(saveTimer); dirty=true;
  saveTimer = setTimeout(()=>{
    dirty=false;
    try{ localStorage.setItem(KEY, JSON.stringify(db)); }
    catch(e){ emit('quota'); }
  }, 30);
  emit(what||'data');
}
// write any pending change before the page goes away (only if one is pending)
export function flush(){ clearTimeout(saveTimer); if (!dirty) return; dirty=false; try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(_){} }
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
export function photoURL(p){ if (!p) return ''; return p.src==='idb' ? (urlCache.get(p.id)||'') : p.src; }

/* =========================================================
   INIT
   ========================================================= */
export async function init(){
  // venue catalogue: the 100 starter spots (once), then whatever people add
  if (!db.flags.venuesSeeded){
    try{
      const seed = await (await fetch('seed-places.json', {cache:'no-cache'})).json();
      seed.forEach(p=>{
        if (!db.venues[p.id]) db.venues[p.id] = { id:p.id, name:p.name, zone:p.zone, categories:p.categories,
          lat:p.lat??null, lng:p.lng??null, address:'', createdBy:null, createdAt:p.createdAt||Date.now(), seed:true };
      });
      db.flags.venuesSeeded = true; save('venues');
    }catch(_){ /* offline on first run: try again next time */ }
  }
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
// Preview mode: there's no auth server yet, so "signing in" makes a profile on this device.
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
export function signOut(){ db.meId = null; save('me'); }
export function updateMe(patch){ const m=me(); if (!m) return; Object.assign(m, patch); save('me'); return m; }
export function addPoints(n){ const m=me(); if (m){ m.points=(m.points||0)+n; save('me'); } }
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
export function createCrew({name, tagline}){
  const m=me(); if (!m) return null;
  leaveCrew(true);
  const c = { id:uid(), name:name.trim()||'My Crew', tagline:(tagline||'').trim(), code:makeCode(name), ownerId:m.id, memberIds:[m.id], createdAt:Date.now() };
  db.crews[c.id]=c; save('crew'); return c;
}
export function updateCrew(patch){ const c=myCrew(); if (!c) return; Object.assign(c, patch); save('crew'); }
// Joining someone else's crew needs the server; on this device only crews that exist here can be joined.
export function joinCrew(code){
  code=(code||'').trim().toUpperCase().replace(/^.*JOIN=/,'');
  const c = Object.values(db.crews).find(c=>c.code===code);
  if (!c) return { error:'invalid', code };
  const m=me();
  if (c.memberIds.includes(m.id)) return { crew:c };
  if (c.memberIds.length >= APP.crewMax) return { error:'full', crew:c };
  leaveCrew(true);
  c.memberIds.push(m.id); save('crew'); return { crew:c };
}
export function leaveCrew(silent){
  const c=myCrew(), m=me(); if (!c||!m) return;
  c.memberIds = c.memberIds.filter(id=>id!==m.id);
  if (!c.memberIds.length) delete db.crews[c.id];
  else if (c.ownerId===m.id) c.ownerId = c.memberIds[0];
  if (!silent) save('crew');
}
export function removeMember(id){ const c=myCrew(), m=me(); if (!c || c.ownerId!==m.id || id===m.id) return; c.memberIds=c.memberIds.filter(x=>x!==id); save('crew'); }
export function findCrewByCode(code){ return Object.values(db.crews).find(c=>c.code===(code||'').toUpperCase())||null; }

/* =========================================================
   VENUES
   ========================================================= */
export function venues(){ return Object.values(db.venues); }
export function venue(id){ return db.venues[id]||null; }
export function addVenue({name, zone, categories, lat, lng, address}){
  const v = { id:uid(), name:name.trim(), zone, categories:categories||[], lat:lat??null, lng:lng??null, address:address||'', createdBy:me()?.id||null, createdAt:Date.now(), seed:false };
  db.venues[v.id]=v; save('venues'); return v;
}
export function updateVenue(id, patch){ const v=db.venues[id]; if (!v) return; Object.assign(v, patch); save('venues'); return v; }
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
  db.entries[e.id]=e; save('entries'); return e;
}
export function updateEntry(id, patch){
  const e=db.entries[id]; if (!e || e.userId!==me()?.id) return;
  Object.assign(e, patch);
  // a private entry's photos are private too
  if (patch.private) Object.values(db.photos).filter(p=>p.entryId===id).forEach(p=>{ p.private=true; });
  save('entries'); return e;
}
export async function deleteEntry(id){
  const e=db.entries[id]; if (!e || e.userId!==me()?.id) return;
  const ps = Object.values(db.photos).filter(p=>p.entryId===id);
  for (const p of ps) await deletePhoto(p.id, true);
  delete db.entries[id]; save('entries');
  return { entry:e, photos:ps };
}
export function restoreEntry(snapshot){ db.entries[snapshot.entry.id]=snapshot.entry; save('entries'); }
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
    const p = { id:uid(), userId:m.id, venueId:it.venueId, entryId:it.entryId||null, caption:it.caption||'', date:it.date||todayISO(),
                private:!!it.private, src:'idb', bookmarkedBy:[], createdAt:Date.now()+out.length };
    await putBlob(p.id, it.blob);
    db.photos[p.id]=p; out.push(p);
  }
  save('photos'); return out;
}
export function updatePhoto(id, patch){ const p=db.photos[id]; if (!p) return; if (p.userId!==me()?.id && !('bookmarkedBy' in patch)) return; Object.assign(p, patch); save('photos'); return p; }
export function toggleBookmark(id){
  const p=db.photos[id], m=me(); if (!p||!m) return false;
  p.bookmarkedBy = p.bookmarkedBy||[];
  const on = !p.bookmarkedBy.includes(m.id);
  p.bookmarkedBy = on ? [...p.bookmarkedBy, m.id] : p.bookmarkedBy.filter(x=>x!==m.id);
  save('photos'); return on;
}
export async function deletePhoto(id, quiet){
  const p=db.photos[id]; if (!p || p.userId!==me()?.id) return;
  if (p.src==='idb') await delBlob(id);
  delete db.photos[id];
  Object.values(db.books).forEach(b=>{ if (b.coverPhotoId===id) b.coverPhotoId=null; });
  if (!quiet) save('photos');
}

/* =========================================================
   BOOKS (photobooks + custom albums)
   ========================================================= */
export function books(){
  const m=me(); if (!m) return [];
  if (!Object.values(db.books).some(b=>b.ownerId===m.id && b.kind==='personal'))
    db.books[uid()] = { id:null, ownerId:m.id, kind:'personal', title:`${APP.name} • Vol. 1`, byline:'', texture:'leather', tint:'#8B5A2B', pin:'coffee', coverPhotoId:null };
  const crew=myCrew();
  if (crew && !Object.values(db.books).some(b=>b.kind==='crew' && b.crewId===crew.id))
    db.books[uid()] = { id:null, ownerId:crew.ownerId, crewId:crew.id, kind:'crew', title:`${crew.name} Scrapbook`, byline:'', texture:'cloth', tint:'#486636', pin:'karak', coverPhotoId:null };
  Object.entries(db.books).forEach(([k,b])=>{ if (!b.id) b.id=k; });
  return Object.values(db.books).filter(b=> b.ownerId===m.id && b.kind!=='crew' || (b.kind==='crew' && crew && b.crewId===crew.id));
}
export function book(id){ books(); return db.books[id]||null; }
export function saveBook(id, patch){ const b=db.books[id]; if (!b) return; Object.assign(b, patch); save('books'); return b; }
export function addAlbum(data){ const m=me(); const id=uid(); db.books[id]={ id, ownerId:m.id, kind:'album', texture:'paperback', tint:'#e5a93c', pin:'dessert', coverPhotoId:null, filter:{}, ...data }; save('books'); return db.books[id]; }
export function deleteBook(id){ const b=db.books[id]; if (b && b.kind==='album' && b.ownerId===me()?.id){ delete db.books[id]; save('books'); } }

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
  try{
    const list = JSON.parse(localStorage.getItem(LEGACY_KEY))||[];
    // the auto-added starter spots are catalogue venues now, not your places
    return list.filter(p=>!p.seed);
  }catch(_){ return []; }
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
    added++;
  }
  db.flags.legacyImported = true; save('import');
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
  return { app:APP.name, version:2, exportedAt:new Date().toISOString(), profile:m, ...mine };
}
export async function importBackup(data){
  if (!data || data.version!==2) throw new Error('bad');
  const m=me(); let n=0;
  (data.venues||[]).forEach(v=>{ if (!db.venues[v.id]) db.venues[v.id]=v; });
  (data.entries||[]).forEach(e=>{ if (!db.entries[e.id]){ db.entries[e.id]={...e, userId:m.id}; n++; } });
  for (const p of (data.photos||[])){
    if (db.photos[p.id] || !p.data) continue;
    const blob = await dataURLtoBlob(p.data); const {data:_, ...rec}=p;
    await putBlob(p.id, blob); db.photos[p.id]={...rec, userId:m.id, src:'idb'};
  }
  save('import'); return n;
}

/* =========================================================
   DEMO CREW (preview only: sample friends so the social screens have life in them)
   ========================================================= */
export function demoOn(){ return !!db.flags.demo; }
export async function setDemo(on){
  const { DEMO } = await import('./demo.js');
  const m=me(); if (!m) return;
  // clear any previous demo records
  Object.keys(db.users).forEach(k=>{ if (k.startsWith('demo-')) delete db.users[k]; });
  Object.keys(db.entries).forEach(k=>{ if (k.startsWith('demo-')) delete db.entries[k]; });
  Object.keys(db.photos).forEach(k=>{ if (k.startsWith('demo-')) delete db.photos[k]; });
  Object.values(db.crews).forEach(c=>{ c.memberIds = c.memberIds.filter(id=>!id.startsWith('demo-')); });
  Object.keys(db.crews).forEach(k=>{ if (!db.crews[k].memberIds.length) delete db.crews[k]; });
  db.flags.demo = !!on;
  if (on){
    DEMO.users.forEach(u=>{ db.users[u.id]={...u, createdAt:Date.now()}; });
    let crew = myCrew();
    if (!crew){
      crew = { id:'demo-crew', ...DEMO.crew, ownerId:m.id, memberIds:[m.id], createdAt:Date.now() };
      db.crews[crew.id]=crew;
    }
    DEMO.users.forEach(u=>{ if (crew.memberIds.length < APP.crewMax && !crew.memberIds.includes(u.id)) crew.memberIds.push(u.id); });
    const byName = n=>venues().find(v=>v.name===n);
    const day = 864e5;
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
