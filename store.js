// Data layer. Every read and write the UI makes goes through this file.
//
// Screens read in-memory records synchronously (so they're fast and work offline). With
// Supabase configured (config.js), those records are loaded from the server on sign-in,
// every change is written back through cloud.js (queued while offline), and crew changes
// arrive live. Without it (or with ?local in the address, used by the tests) everything
// stays on this device, as in the preview. Photo files are cached in IndexedDB either way.
//
// Records
//   users    {id, name, handle, email, tagline, avatar:{pixel|photo}, shareDefault:'crew'|'private', pinColor, favouriteCritterId, createdAt}
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
import { legacyPageRows, pageId } from './pages.js';

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

function fresh(){ return { version:2, meId:null, users:{}, crews:{}, venues:{}, entries:{}, photos:{}, books:{}, events:{}, inbox:{}, pages:{}, ratings:{}, catches:{}, flags:{} }; }
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
  db.inbox   = { ...(fresh.inbox||{}) };
  db.catches = { ...Object.fromEntries(Object.entries(db.catches||{}).filter(([,c])=>isLocal(c.userId))), ...(fresh.catches||{}) };
  db.ratings = { ...Object.fromEntries(Object.entries(db.ratings||{}).filter(([,r])=>isLocal(r.entryId))), ...(fresh.ratings||{}) }; ratingIdx = null;
  db.pages   = { ...Object.fromEntries(Object.entries(db.pages||{}).filter(([k])=>isLocal(k.split('|')[0]) || /^(crewbook-demo|loose)/.test(k))), ...(fresh.pages||{}) };
  // no profile row yet (an account made before the database was set up): make it from this phone's copy
  if (!db.users[db.meId] && meRec){ db.users[db.meId] = meRec; C.queue({ k:'put', t:'profiles', id:meRec.id, row:C.MAP.profiles.to(meRec) }); }
  if (db.users[db.meId] && meRec) db.users[db.meId].email = meRec.email;
  // replay what hasn't reached the server yet, so nothing flickers back
  const T = { profiles:'users', crews:'crews', venues:'venues', entries:'entries', photos:'photos', books:'books', events:'events', share_inbox:'inbox', book_pages:'pages', visit_ratings:'ratings', critter_catches:'catches' };
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
  if (!db.users[uidNow]) db.users[uidNow] = { id:uidNow, handle:'', name:'', avatar:{}, shareDefault:'crew', onboarded:false, createdAt:Date.now() };
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
// the session token the resolver needs ('dev' when running without accounts)
export async function accessToken(){ if (!cloud) return 'dev'; const s = await C.session(); return s ? s.access_token : null; }
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
          shareDefault:'crew', createdAt:Date.now(), onboarded:false };
    db.users[m.id] = m; db.meId = m.id;
  } else if (email) m.email = email;
  save('me'); return m;
}
export async function signOut(){
  if (cloud){
    const waiting = C.pending().length;
    await C.unsubscribe(); await C.signOut(); C.setOutboxOwner(null);
    // photos kept on this phone go too (a shared phone shouldn't keep them), unless some still need uploading
    if (!waiting) await idbDo('readwrite', st=>st.clear()).catch(()=>{});
    urlCache.forEach(u=>{ try{ URL.revokeObjectURL(u); }catch(_){} }); urlCache.clear();
    const flags={ seedsRemoved:true, cloudUser:true }; db=fresh(); db.flags=flags; save('me'); return;
  }
  db.meId = null; save('me');
}
/* ---------- the Inbox: shares to finish later ----------
   Saved by you ("Save for later"), when you share while offline, or when several shares arrive
   while you're signed out. Yours only. Adding the place, or removing it, deletes it. */
export function inbox(){ db.inbox = db.inbox || {}; return Object.values(db.inbox).sort((a,b)=>b.createdAt-a.createdAt); }
export function addToInbox({ sourceUrl, sourceType, text, title }){
  const m = me(); if (!m) return null;
  db.inbox = db.inbox || {};
  const clip = v => v ? String(v).slice(0, 2000) : '';
  const item = { id:uid(), userId:m.id, sourceUrl:clip(sourceUrl)||null, sourceType:sourceType||null, text:clip(text), title:clip(title).slice(0,300), createdAt:Date.now() };
  if (!item.sourceUrl && !item.text && !item.title) return null;
  // already waiting? (the same link, or the same text)
  const same = inbox().find(i=> (item.sourceUrl && i.sourceUrl===item.sourceUrl) || (!item.sourceUrl && item.text && i.text===item.text));
  if (same) return same;
  db.inbox[item.id] = item; save('inbox'); push('share_inbox', item);
  return item;
}
export function removeFromInbox(id){
  const item = db.inbox && db.inbox[id]; if (!item) return;
  delete db.inbox[id]; save('inbox'); push('share_inbox', item, 'del');
}

/* ---------- feedback and error reports (sent, never read back) ---------- */
// what goes with them: the app version and the kind of phone, nothing you've saved
export function appInfo(){
  const ua = navigator.userAgent || '';
  return { version: APP.version || '', ua: ua.slice(0, 200), screen: (screen.width||0)+'x'+(screen.height||0),
    lang: navigator.language || '', installed: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches),
    online: navigator.onLine !== false, accounts: !!cloud };
}
export function sendFeedback(kind, message){
  const m = me(); if (!m) return null;
  const f = { id:uid(), userId:m.id, kind, message:String(message).trim().slice(0, 2000), appInfo:appInfo(), createdAt:Date.now() };
  if (cloud && !volatile) C.queue({ k:'ins', t:'feedback', id:f.id, row:C.MAP.feedback.to(f) });
  else { try{ const k='koko-feedback-local', l=JSON.parse(localStorage.getItem(k)||'[]'); l.push(f); localStorage.setItem(k, JSON.stringify(l.slice(-20))); }catch(_){} }
  return f;
}
const reported = new Set(); let reports = 0;
export function reportError(err){
  const m = me(); if (!m || !cloud || volatile) return false;            // signed in only
  const key = err.message + '|' + (err.where||''); if (reported.has(key) || reports >= 5) return false;   // once each, 5 a session at most
  reported.add(key); reports++;
  const e = { id:uid(), userId:m.id, message:String(err.message||'').slice(0, 500), stack:String(err.stack||'').slice(0, 2000), where:String(err.where||'').slice(0, 200), appInfo:appInfo() };
  C.queue({ k:'ins', t:'client_errors', id:e.id, row:C.MAP.client_errors.to(e) });
  return true;
}

// delete my account: on the server (photos, then everything else) and on this phone
export async function deleteAccount(){
  const m=me(); if (!m) return;
  if (cloud){ await C.deleteMyFiles(m.id); await C.rpc('delete_me'); }
  await idbDo('readwrite', st=>st.clear()).catch(()=>{});
  urlCache.forEach(u=>{ try{ URL.revokeObjectURL(u); }catch(_){} }); urlCache.clear();
  try{ Object.keys(localStorage).filter(k=>/^(koko|bites)/.test(k)).forEach(k=>localStorage.removeItem(k)); }catch(_){}
  if (cloud){ await C.unsubscribe(); await C.signOut(); C.setOutboxOwner(null); }
  db = fresh(); db.flags = { seedsRemoved:true, cloudUser:!!cloud }; save('me');
}
export function updateMe(patch){ const m=me(); if (!m) return; Object.assign(m, patch); save('me'); push('profiles', { id:m.id, patch }, 'upd'); return m; }
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
// You can be in up to APP.crewsPerPerson crews. Crew screens show one at a time: the active crew.
const ACTIVE_KEY = 'koko-active-crew';
export function myCrews(){ const m=me(); if (!m) return []; return Object.values(db.crews).filter(c=>c.memberIds.includes(m.id)).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0) || a.name.localeCompare(b.name)); }
export function myCrew(){
  const cs=myCrews(); if (!cs.length) return null;
  let id=null; try{ id=localStorage.getItem(ACTIVE_KEY); }catch(_){}
  return cs.find(c=>c.id===id) || cs[0];
}
export function setActiveCrew(id){ try{ localStorage.setItem(ACTIVE_KEY, id); }catch(_){} emit('crew'); }
export function crewMembers(crew){ crew = crew||myCrew(); if (!crew) return me()?[me()]:[]; return crew.memberIds.map(user).filter(Boolean); }
// who "my crew" is for the crew screens: me plus everyone in the active crew
export function circleIds(){ const c=myCrew(), m=me(); if (!m) return []; return c ? c.memberIds.slice() : [m.id]; }
// who a post is for: { crewIds, private }. Only crews you're in; none means only you.
export function audience(d){
  const mine = myCrews().map(c=>c.id);
  if (Array.isArray(d.crewIds)){ const ids = d.crewIds.filter(id=>mine.includes(id)); return { crewIds:ids, private:!ids.length }; }
  if (d.private) return { crewIds:[], private:true };
  const c = myCrew(); return c ? { crewIds:[c.id], private:false } : { crewIds:[], private:true };
}
// breakfast / lunch / dinner
const mealsOf = a => [...new Set(a||[])].filter(m=>['breakfast','lunch','dinner'].includes(m));
// everyone in any of your crews (not you), for tagging
export function crewmates(){ const m=me(); if (!m) return []; const ids=new Set(myCrews().flatMap(c=>c.memberIds)); ids.delete(m.id); return [...ids].map(user).filter(Boolean).sort((a,b)=>(a.name||a.handle||'').localeCompare(b.name||b.handle||'')); }
// tags: only people who share a crew with you
export function tagsOf(ids){ const ok=new Set(crewmates().map(u=>u.id)); return [...new Set(ids||[])].filter(id=>ok.has(id)); }
// "matcha with @rahman" → the crewmates mentioned
export function mentionIds(text){ const hs=[...String(text||'').matchAll(/@([a-z0-9_]{3,20})/gi)].map(x=>x[1].toLowerCase()); return crewmates().filter(u=>u.handle && hs.includes(String(u.handle).toLowerCase())).map(u=>u.id); }
// visits someone tagged you on
export function taggedMe(){ const m=me(); if (!m) return []; return Object.values(db.entries).filter(e=>e.userId!==m.id && (e.taggedIds||[]).includes(m.id)); }
export function untagMe(entryId){
  const e=db.entries[entryId], m=me(); if (!e || !m) return;
  e.taggedIds=(e.taggedIds||[]).filter(x=>x!==m.id); save('entries');
  if (db.ratings && db.ratings[entryId+'|'+m.id]){ delete db.ratings[entryId+'|'+m.id]; ratingIdx = null; }   // the server removes it too
  if (cloud && !isLocal(entryId)) C.queue({ k:'rpc', fn:'untag_me', args:{ p_entry:entryId } });
}
// the crews a post is shared with, by name (yours only)
export function crewsOf(rec){ return (rec && rec.crewIds || []).map(id=>db.crews[id]).filter(Boolean); }
// 10 random characters, like the server's (crew codes must not be guessable)
function makeCode(){
  let code;
  do { code = Array.from(crypto.getRandomValues(new Uint8Array(5)), b=>b.toString(16).padStart(2,'0')).join('').toUpperCase(); } while (Object.values(db.crews).some(c=>c.code===code));
  return code;
}
export async function createCrew({name, tagline}){
  const m=me(); if (!m) return null;
  if (myCrews().length >= APP.crewsPerPerson) throw new Error('max');
  if (cloud){ const r = await C.rpc('create_crew', { p_name:name, p_tagline:tagline||'' }); await pullNow(); if (db.crews[r.id]) setActiveCrew(r.id); return db.crews[r.id] || null; }
  const c = { id:uid(), name:name.trim()||'My Crew', tagline:(tagline||'').trim(), code:makeCode(name), ownerId:m.id, memberIds:[m.id], createdAt:Date.now() };
  db.crews[c.id]=c; save('crew'); setActiveCrew(c.id); return c;
}
export function updateCrew(patch){ const c=myCrew(); if (!c) return; Object.assign(c, patch); save('crew'); push('crews', { id:c.id, patch }, 'upd'); }
// join by code: { crew } or { error:'invalid'|'full'|'max'|'offline', code }
export async function joinCrew(code){
  code=(code||'').trim().toUpperCase().replace(/^.*JOIN=/,'');
  if (cloud){
    let r; try{ r = await C.rpc('join_crew', { p_code:code }); }catch(e){ return { error:'offline', code }; }
    if (r!=='ok') return { error:r, code };
    await pullNow();
    const c = Object.values(db.crews).find(x=>x.code===code); if (c) setActiveCrew(c.id);
    return { crew:c||myCrew() };
  }
  const c = Object.values(db.crews).find(c=>c.code===code);
  if (!c) return { error:'invalid', code };
  const m=me();
  if (c.memberIds.includes(m.id)){ setActiveCrew(c.id); return { crew:c }; }
  if (myCrews().length >= APP.crewsPerPerson) return { error:'max', crew:c };
  if (c.memberIds.length >= APP.crewMax) return { error:'full', crew:c };
  c.memberIds.push(m.id); save('crew'); setActiveCrew(c.id); return { crew:c };
}
// your posts stop showing in a crew you leave (the server does the same)
function unshareFrom(crewId, userId){
  [['entries', db.entries], ['photos', db.photos]].forEach(([t, recs])=>Object.values(recs).forEach(r=>{
    if (r.userId!==userId || !(r.crewIds||[]).includes(crewId)) return;
    r.crewIds = r.crewIds.filter(x=>x!==crewId); r.private = !r.crewIds.length; save(t);
  }));
}
export async function leaveCrew(crewId){
  const c = crewId ? db.crews[crewId] : myCrew(), m=me(); if (!c||!m) return;
  if (cloud && !isLocal(c.id)){ await C.rpc('leave_crew', { p_crew:c.id }); await pullNow(); emit('crew'); return; }
  c.memberIds = c.memberIds.filter(id=>id!==m.id);
  unshareFrom(c.id, m.id);
  if (!c.memberIds.length) delete db.crews[c.id];
  else if (c.ownerId===m.id) c.ownerId = c.memberIds[0];
  save('crew'); emit('crew');
}
export async function removeMember(id){
  const c=myCrew(), m=me(); if (!c || c.ownerId!==m.id || id===m.id) return;
  if (cloud && !isLocal(id) && !isLocal(c.id)){ await C.removeMember(c.id, id); await pullNow(); return; }
  c.memberIds=c.memberIds.filter(x=>x!==id); unshareFrom(c.id, id); save('crew');
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
export function addVenue({name, zone, categories, lat, lng, address, googlePlaceId}){
  const v = { id:uid(), name:name.trim(), zone, categories:categories||[], lat:lat??null, lng:lng??null, address:address||'', createdBy:me()?.id||null, createdAt:Date.now(), seed:false,
              googlePlaceId:googlePlaceId||null, placesFetchedAt:googlePlaceId?Date.now():null };
  db.venues[v.id]=v; save('venues'); push('venues', v); return v;
}
// remove a place you added that nobody has logged (used by Undo after a share)
export function deleteVenue(id){
  const v=db.venues[id]; if (!v || v.createdBy!==me()?.id || Object.values(db.entries).some(e=>e.venueId===id)) return false;
  delete db.venues[id]; save('venues'); push('venues', v, 'del'); return true;
}
export function venueByPlaceId(pid){ return pid ? venues().find(v=>v.googlePlaceId===pid) || null : null; }
export function updateVenue(id, patch){ const v=db.venues[id]; if (!v) return; Object.assign(v, patch); save('venues'); push('venues', { id, patch }, 'upd'); return v; }
export function searchVenues(q, limit){
  q=(q||'').trim().toLowerCase(); if (!q) return [];
  const words=q.split(/\s+/);
  return venues().map(v=>{
    const n=v.name.toLowerCase();
    let fit = n.startsWith(q) ? 3 : n.includes(q) ? 2 : words.every(w=>n.includes(w)) ? 1 : 0;
    return {v, fit};
  }).filter(x=>x.fit).sort((a,b)=>b.fit-a.fit || a.v.name.localeCompare(b.v.name)).slice(0,limit||8).map(x=>x.v);
}

/* =========================================================
   ENTRIES (visits + want-to-try) and visibility
   ========================================================= */
// what the crew screens show: yours, plus what was shared with the active crew by someone in it
export function canSee(rec){
  const m=me(); if (!m || !rec) return false;
  if (rec.userId===m.id) return true;
  // you were tagged on it (a visit, or a photo from that visit)
  const tagged = rec.taggedIds || (rec.entryId && db.entries[rec.entryId] && db.entries[rec.entryId].taggedIds);
  if (tagged && tagged.includes(m.id)) return true;
  if (rec.private) return false;
  const c=myCrew(); if (!c || !c.memberIds.includes(rec.userId)) return false;
  // records from before several crews (and the sample crew) have no crewIds: shared with the crew
  return !(rec.crewIds && rec.crewIds.length) || rec.crewIds.includes(c.id);
}
// is this one of yours shared with the crew you're looking at?
export function sharedHere(rec){ const c=myCrew(); return !!(rec && !rec.private && c && (!(rec.crewIds&&rec.crewIds.length) || rec.crewIds.includes(c.id))); }
export function entries(filter){
  filter = filter||{};
  return Object.values(db.entries).filter(e=>
    (!filter.venueId || e.venueId===filter.venueId) &&
    (!filter.userId || e.userId===filter.userId) &&
    (!filter.kind || e.kind===filter.kind) &&
    (filter.includeHidden || canSee(e)));
}
export function entry(id){ return db.entries[id]||null; }
// tagging someone shares the visit with a crew you're both in (only people newly tagged; a visit
// already saved keeps who it was for unless you tag someone new). The server does the same.
function shareWithTagged(rec, before){
  if (rec.kind!=='visit' || !(rec.taggedIds||[]).length) return;
  const had = new Set(before||[]), active = myCrew();
  rec.taggedIds.forEach(t=>{
    if (had.has(t) || (rec.crewIds||[]).some(id=>db.crews[id] && db.crews[id].memberIds.includes(t))) return;
    const c = active && active.memberIds.includes(t) ? active : myCrews().find(x=>x.memberIds.includes(t));
    if (c) rec.crewIds = [...(rec.crewIds||[]), c.id];
  });
  rec.private = !(rec.crewIds||[]).length;
}
// the crews tagging these people would add (for the note in the log form)
export function crewsForTags(tagIds, crewIds, before){
  const r = { kind:'visit', taggedIds:tagsOf(tagIds), crewIds:(crewIds||[]).slice() }; shareWithTagged(r, before);
  return r.crewIds.filter(id=>!(crewIds||[]).includes(id)).map(id=>db.crews[id]).filter(Boolean);
}
export function addEntry(data){
  const m=me();
  const e = { id:uid(), userId:m.id, kind:'visit', rating:0, notes:'', date:todayISO(), createdAt:Date.now(), ...data, ...audience(data), taggedIds:tagsOf(data.taggedIds), meals:mealsOf(data.meals) };
  shareWithTagged(e, []);
  db.entries[e.id]=e; save('entries'); push('entries', e);
  // where it came from: the link is private to you, so it goes to its own owner-only table
  if (e.sourceUrl && cloud && !volatile) C.queue({ k:'put', t:'entry_sources', id:e.id, row:{ entry_id:e.id, user_id:m.id, source_url:String(e.sourceUrl).slice(0,2000) } });
  return e;
}
export function updateEntry(id, patch){
  const e=db.entries[id]; if (!e || e.userId!==me()?.id) return;
  if ('crewIds' in patch || 'private' in patch) patch = { ...patch, ...audience('crewIds' in patch ? patch : { private:patch.private }) };
  if ('taggedIds' in patch) patch = { ...patch, taggedIds:tagsOf(patch.taggedIds) };
  if ('meals' in patch) patch = { ...patch, meals:mealsOf(patch.meals) };
  const tagsBefore = (e.taggedIds||[]).slice();
  Object.assign(e, patch);
  if ('taggedIds' in patch) shareWithTagged(e, tagsBefore);
  // a visit's photos go to the same people
  Object.values(db.photos).filter(p=>p.entryId===id && p.userId===e.userId).forEach(p=>{
    if (p.private===e.private && String(p.crewIds||[])===String(e.crewIds||[])) return;
    p.private=e.private; p.crewIds=(e.crewIds||[]).slice(); save('photos'); push('photos', { id:p.id, patch:{ private:p.private, crewIds:p.crewIds } }, 'upd');
  });
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
// a photo goes to the same people as its visit
function photoAudience(it){ const e = it.entryId && db.entries[it.entryId]; return e ? { private:!!e.private, crewIds:(e.crewIds||[]).slice() } : audience(it); }
export async function addPhotos(list){
  const m=me(); const out=[];
  for (const it of list){
    const id = uid();
    const p = { id, userId:m.id, venueId:it.venueId, entryId:it.entryId||null, caption:it.caption||'', date:it.date||todayISO(),
                ...photoAudience(it), src:'idb', path:m.id+'/'+id+'.jpg', bookmarkedBy:[], createdAt:Date.now()+out.length };
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
  // every crew you're in has its book (the shelf shows the one you're looking at)
  myCrews().forEach(c=>{ if (Object.values(db.books).some(b=>b.kind==='crew' && b.crewId===c.id)) return;
    const b = { id:'crewbook-'+c.id, ownerId:m.id, crewId:c.id, kind:'crew', title:`${c.name} Scrapbook`, byline:'', texture:'cloth', tint:'#486636', pin:'karak', coverPhotoId:null, filter:{}, pages:{} };
    db.books[b.id] = b; push('books', b, 'ins'); });
  // visits someone tagged you on get a book of their own
  if (taggedMe().some(e=>e.kind==='visit') && !Object.values(db.books).some(b=>b.ownerId===m.id && b.kind==='tagged')){
    const b = { id:'tagged-'+m.id, ownerId:m.id, kind:'tagged', title:'Tagged', byline:'Visits friends tagged you on', texture:'paperback', tint:'#f2cfb4', pin:'dessert', coverPhotoId:null, filter:{}, pages:{} };
    db.books[b.id] = b; push('books', b, 'ins');
  }
  Object.entries(db.books).forEach(([k,b])=>{ if (!b.id) b.id=k; });
  // books kept on this phone: their old per-day page settings move onto each day's visit, once
  // (on the server, migration 0008 does this)
  Object.values(db.books).forEach(b=>{ if ((!cloud || isLocal(b.crewId)) && !b.pagesMoved && b.pages && Object.keys(b.pages).length){ legacyPageRows(b, pagesWorld()).forEach(r=>{ db.pages[r.id] = r; }); b.pagesMoved = true; } });
  // the app was renamed: personal books still carrying the old default title follow the new name
  Object.values(db.books).forEach(b=>{ if (b.kind==='personal' && b.title==='Dubai Bites • Vol. 1') b.title=APP.name+' • Vol. 1'; });
  return Object.values(db.books).filter(b=> b.ownerId===m.id && b.kind!=='crew' || (b.kind==='crew' && crew && b.crewId===crew.id));
}
export function book(id){ books(); return db.books[id]||null; }

/* ---------- pages: every visit is a page; only how it's dressed up is stored ---------- */
// can I see this at all (through any of my crews, not just the one I'm looking at)?
function visibleAnywhere(rec){
  const m=me(); if (!m || !rec) return false;
  if (rec.userId===m.id) return true;
  const tagged = rec.taggedIds || (rec.entryId && db.entries[rec.entryId] && db.entries[rec.entryId].taggedIds);
  if (tagged && tagged.includes(m.id)) return true;
  if (rec.private) return false;
  return myCrews().some(c=>c.memberIds.includes(rec.userId) && (!(rec.crewIds&&rec.crewIds.length) || rec.crewIds.includes(c.id)));
}
// everything pages.js needs to lay out books
export function pagesWorld(){
  return { meId:db.meId, entries:Object.values(db.entries).filter(visibleAnywhere), photos:Object.values(db.photos).filter(visibleAnywhere),
           pages:db.pages||{}, crews:db.crews, venue, ratingsOf };
}
/* ---------- critters: who caught what, and your favourite ----------
   One catch per person per critter (id: person | critter), never edited; the server refuses a
   second one too. Catches are read by you and your crewmates. */
export function catchesOf(userId){ return Object.values(db.catches||{}).filter(c=>c.userId===userId); }
export function caughtIds(userId){ return new Set(catchesOf(userId || db.meId).map(c=>c.critterId)); }
export function catchOf(userId, critterId){ return (db.catches||{})[userId+'|'+critterId] || null; }
export function recordCatch(critterId, { lat, lng, accuracy, spot, venueId, landmarkId }){
  const m=me(); if (!m) return null;
  const id = m.id+'|'+critterId;
  if (db.catches[id]) return null;                                  // already caught: never twice
  // roughly where (to about 100 m), not your exact spot: your crewmates can read it
  const r3 = x => typeof x==='number' ? Math.round(x*1000)/1000 : null;
  const c = { id, userId:m.id, critterId, caughtAt:Date.now(), lat:r3(lat), lng:r3(lng), accuracy:accuracy==null?null:Math.round(accuracy),
              spot:String(spot||'').slice(0,80), venueId: venueId && !isLocal(venueId) ? venueId : null, ...(landmarkId ? { landmarkId } : {}) };
  db.catches[id] = c; save('catches');
  if (!isLocal(m.id)) push('critter_catches', c, 'ins');
  return c;
}
// your favourite: one you've caught, or none
export function favouriteOf(userId){ const u = db.users[userId]; const f = u && u.favouriteCritterId; return f && catchOf(userId, f) ? f : null; }
export function setFavourite(critterId){
  const m=me(); if (!m) return;
  if (critterId && !catchOf(m.id, critterId)) return;
  updateMe({ favouriteCritterId: critterId || null });
}

/* ---------- ratings from people tagged on a visit (the logger's is on the visit itself) ----------
   One per person per visit (id: visit | person), so saving again, even offline, replaces it;
   the server keeps whichever change is newest. */
let ratingIdx = null;
export function ratingsOf(entryId){
  if (!ratingIdx){ ratingIdx = new Map(); Object.values(db.ratings||{}).forEach(r=>{ if (!ratingIdx.has(r.entryId)) ratingIdx.set(r.entryId, []); ratingIdx.get(r.entryId).push(r); }); }
  return ratingIdx.get(entryId) || [];
}
// can I add my own rating to this visit? (I'm tagged on it and didn't log it)
export function canRate(e){ const m=me(); return !!(m && e && e.kind==='visit' && e.userId!==m.id && (e.taggedIds||[]).includes(m.id)); }
export function myRatingOn(entryId){ const m=me(); return m ? (db.ratings||{})[entryId+'|'+m.id] || null : null; }
export function rateVisit(entryId, rating, note){
  const e=db.entries[entryId], m=me(); if (!canRate(e)) return null;
  rating = Math.round((+rating||0)*2)/2;
  if (!rating) return unrateVisit(entryId);
  const r = { id:entryId+'|'+m.id, entryId, userId:m.id, rating:Math.min(5, Math.max(0.5, rating)), note:String(note||'').trim().slice(0,400), updatedAt:Date.now() };
  db.ratings[r.id] = r; ratingIdx = null; save('ratings');
  if (!isLocal(entryId)) push('visit_ratings', r);
  return r;
}
export function unrateVisit(entryId){
  const m=me(), id=entryId+'|'+(m&&m.id), r=(db.ratings||{})[id]; if (!r) return null;
  delete db.ratings[id]; ratingIdx = null; save('ratings');
  if (!isLocal(entryId)) push('visit_ratings', r, 'del');
  return null;
}
export function pageCfg(id){ return (db.pages||{})[id] || null; }
export function savePage(bookId, entryId, cfg){
  const b=db.books[bookId], m=me(); if (!b || !m) return;
  const id = pageId(bookId, entryId);
  const rec = { id, bookId, entryId, layout:cfg.layout||'scrapbook', order:(cfg.order||[]).slice(0,12), stickers:(cfg.stickers||[]).slice(0,3), note:String(cfg.note||'').slice(0,160), updatedBy:m.id, updatedAt:Date.now() };
  db.pages[id] = rec; save('pages');
  if (!isLocal(b.crewId) && !String(entryId).startsWith('loose-') && !isLocal(entryId)) push('book_pages', rec);
  return rec;
}
export function resetPage(bookId, entryId){
  const id = pageId(bookId, entryId), rec = db.pages[id], b = db.books[bookId]; if (!rec) return;
  delete db.pages[id]; save('pages');
  if (b && !isLocal(b.crewId) && !isLocal(entryId)) push('book_pages', rec, 'del');
}
// the book a new visit's page is taped into: the crew you're looking at if it's shared there,
// else the first crew it's shared with, else your personal book. Plus how many other books.
export function homeBookFor(e){
  const bs = books(), active = myCrew();
  const crewIds = e && !e.private ? (e.crewIds||[]) : [];
  const personal = bs.find(b=>b.kind==='personal');
  let crewId = crewIds.length ? (active && crewIds.includes(active.id) ? active.id : crewIds[0]) : null;
  const target = crewId ? Object.values(db.books).find(b=>b.kind==='crew' && b.crewId===crewId) : null;
  return { book: target || personal, crew: crewId ? db.crews[crewId] : null, others: Math.max(0, crewIds.length - 1) };
}
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
                         date:p.dateVisited||todayISO(), private:true, createdAt:p.createdAt||Date.now() });
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
    (crew ? ev.crewId===crew.id || (ev.createdBy===m.id && !ev.crewId) : ev.createdBy===m.id) &&
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
  if (!crew){ crew = { id:'demo-crew', name:'Sample Crew', tagline:'Chai, saffron buns, and old Deira hideouts', code:'SAMPLE7', ownerId:m.id, memberIds:[m.id], createdAt:Date.now() }; db.crews[crew.id]=crew; }
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
  db.catches = db.catches||{};
  Object.keys(db.catches).forEach(k=>{ if (k.startsWith('demo-')) delete db.catches[k]; });
  db.events = db.events||{};
  Object.keys(db.events).forEach(k=>{ if (k.startsWith('demo-')) delete db.events[k]; });
  Object.values(db.crews).forEach(c=>{ c.memberIds = c.memberIds.filter(id=>!id.startsWith('demo-')); });
  Object.keys(db.crews).forEach(k=>{ if (!db.crews[k].memberIds.length) delete db.crews[k]; });
  db.flags.demo = !!on;
  if (on){
    DEMO.users.forEach(u=>{ db.users[u.id]={...u, createdAt:Date.now()}; });
    // a few critters already found by the sample friends, and their favourites
    const SAMPLE_CATCHES = { 'demo-maya':['flamingo','falcon'], 'demo-omar':['falcon'], 'demo-kabir':['street_cat','gecko'] };
    Object.entries(SAMPLE_CATCHES).forEach(([uid, ids], k)=>{ if (!db.users[uid]) return; ids.forEach((cid, j)=>{ const id=uid+'|'+cid; db.catches[id]={ id, userId:uid, critterId:cid, caughtAt:Date.now()-(k*5+j+2)*864e5, lat:null, lng:null, accuracy:null, spot:'', venueId:null }; }); db.users[uid].favouriteCritterId = ids[0]; });
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
