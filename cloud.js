// Supabase: sign-in, loading everything you and your crew can see, writing your changes back,
// photo files in private storage, and live updates from the crew.
//
// store.js keeps the in-memory records every screen reads (so screens stay synchronous and
// work offline). This file keeps them in step with the server:
//   pull()      replaces the server-backed records with what the database says you can see
//   queue(op)   remembers a write and sends it; writes wait in an outbox (saved on the phone)
//               while offline or on a flaky connection, and go out in order when they can
//   subscribe() any change in your crew triggers a (debounced) pull
// Privacy is enforced by the database (row level security, supabase/migrations), not here.
import { APP } from './config.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let sb = null, loading = null;
export const enabled = () => !!(APP.supabase && APP.supabase.url && APP.supabase.key) && !new URLSearchParams(location.search).has('local');
export async function client(){
  if (sb || !enabled()) return sb;
  if (!loading) loading = import(SDK).then(m=>{
    sb = m.createClient(APP.supabase.url, APP.supabase.key, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce', storageKey:'koko-auth' },
    });
    return sb;
  }).catch(e=>{ console.warn('Supabase unavailable', e); loading = null; return null; });
  return loading;
}

/* ---------- auth ---------- */
export async function session(){ const c = await client(); if (!c) return null; const { data } = await c.auth.getSession(); return data.session; }
export async function sendCode(email){
  const c = await client(); if (!c) throw new Error('offline');
  const { error } = await c.auth.signInWithOtp({ email, options:{ shouldCreateUser:true, emailRedirectTo: location.origin + '/' } });
  if (error) throw error;
}
export async function verifyCode(email, token){
  const c = await client(); if (!c) throw new Error('offline');
  const { data, error } = await c.auth.verifyOtp({ email, token, type:'email' });
  if (error) throw error;
  return data.session;
}
export async function google(){
  const c = await client(); if (!c) throw new Error('offline');
  const { error } = await c.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + '/' } });
  if (error) throw error;
}
export async function signOut(){ const c = await client(); if (c) await c.auth.signOut().catch(()=>{}); }
export async function onAuth(fn){ const c = await client(); if (c) c.auth.onAuthStateChange((ev, s)=>fn(ev, s)); }

/* ---------- records <-> rows ---------- */
const ts = ms => new Date(ms || Date.now()).toISOString();
const ms = iso => iso ? Date.parse(iso) : Date.now();
export const MAP = {
  profiles: {
    to: u => ({ id:u.id, handle:u.handle||null, name:u.name||'', tagline:u.tagline||'', avatar:u.avatar||{}, share_default:u.shareDefault||'crew', points:u.points||0, onboarded:!!u.onboarded }),
    from: r => ({ id:r.id, handle:r.handle||'', name:r.name||'', tagline:r.tagline||'', avatar:r.avatar||{}, shareDefault:r.share_default, points:r.points||0, onboarded:r.onboarded, createdAt:ms(r.created_at) }),
    fields: { handle:'handle', name:'name', tagline:'tagline', avatar:'avatar', shareDefault:'share_default', points:'points', onboarded:'onboarded' },
  },
  crews: {
    from: r => ({ id:r.id, name:r.name, tagline:r.tagline||'', code:r.code, ownerId:r.owner_id, memberIds:[], createdAt:ms(r.created_at) }),
    fields: { name:'name', tagline:'tagline' },
  },
  venues: {
    to: v => ({ id:v.id, name:v.name, zone:v.zone, categories:v.categories||[], lat:v.lat??null, lng:v.lng??null, address:v.address||'', created_by:v.createdBy, created_at:ts(v.createdAt), ...(v.googlePlaceId ? { google_place_id:v.googlePlaceId, places_fetched_at:v.placesFetchedAt?ts(v.placesFetchedAt):null } : {}) }),
    from: r => ({ id:r.id, name:r.name, zone:r.zone, categories:r.categories||[], lat:r.lat, lng:r.lng, address:r.address||'', createdBy:r.created_by, createdAt:ms(r.created_at), googlePlaceId:r.google_place_id||null, placesFetchedAt:r.places_fetched_at?ms(r.places_fetched_at):null }),
    fields: { name:'name', zone:'zone', categories:'categories', lat:'lat', lng:'lng', address:'address' },
  },
  entries: {
    to: e => ({ id:e.id, venue_id:e.venueId, user_id:e.userId, kind:e.kind, rating:e.rating||0, notes:e.notes||'', date:e.date, private:!!e.private, checkin:!!e.checkin, created_at:ts(e.createdAt), ...(e.sourceType ? { source_type:e.sourceType } : {}) }),
    from: r => ({ id:r.id, venueId:r.venue_id, userId:r.user_id, kind:r.kind, rating:+r.rating||0, notes:r.notes||'', date:r.date, private:r.private, checkin:r.checkin, createdAt:ms(r.created_at), sourceType:r.source_type||null }),
  },
  photos: {
    to: p => ({ id:p.id, user_id:p.userId, venue_id:p.venueId, entry_id:p.entryId||null, caption:p.caption||'', date:p.date, private:!!p.private, path:p.path, created_at:ts(p.createdAt) }),
    from: r => ({ id:r.id, userId:r.user_id, venueId:r.venue_id, entryId:r.entry_id, caption:r.caption||'', date:r.date, private:r.private, path:r.path, src:'cloud', bookmarkedBy:r.bookmarked_by||[], createdAt:ms(r.created_at) }),
    fields: { caption:'caption', private:'private', date:'date' },
  },
  books: {
    to: b => ({ id:b.id, owner_id:b.ownerId, crew_id:b.crewId||null, kind:b.kind, title:b.title||'', byline:b.byline||'', texture:b.texture||null, tint:b.tint||null, pin:b.pin||null, cover_photo_id:b.coverPhotoId||null, filter:b.filter||{}, pages:b.pages||{} }),
    from: r => ({ id:r.id, ownerId:r.owner_id, crewId:r.crew_id, kind:r.kind, title:r.title, byline:r.byline, texture:r.texture, tint:r.tint, pin:r.pin, coverPhotoId:r.cover_photo_id, filter:r.filter||{}, pages:r.pages||{} }),
    fields: { title:'title', byline:'byline', texture:'texture', tint:'tint', pin:'pin', coverPhotoId:'cover_photo_id', filter:'filter', pages:'pages' },
  },
  events: {
    to: ev => ({ id:ev.id, crew_id:ev.crewId||null, created_by:ev.createdBy, venue_id:ev.venueId, starts_at:ev.when, note:ev.note||'', rsvps:ev.rsvps||{}, created_at:ts(ev.createdAt) }),
    from: r => ({ id:r.id, crewId:r.crew_id, createdBy:r.created_by, venueId:r.venue_id, when:r.starts_at, note:r.note||'', rsvps:r.rsvps||{}, createdAt:ms(r.created_at) }),
    fields: { venueId:'venue_id', when:'starts_at', note:'note' },
  },
};
// a partial change in row terms (only the fields that changed)
export function patchRow(table, patch){
  const f = MAP[table].fields || {}, out = {};
  Object.keys(patch).forEach(k=>{ if (f[k]) out[f[k]] = patch[k] ?? null; });
  return out;
}

/* ---------- pull: everything you can see ---------- */
export async function pull(){
  const c = await client(); if (!c) throw new Error('offline');
  const q = t => c.from(t).select('*').then(({data, error})=>{ if (error) throw error; return data; });
  const [profiles, crews, members, venues, entries, photos, books, events] = await Promise.all(
    ['profiles','crews','crew_members','venues','entries','photos','books','events'].map(q));
  const crewMap = {};
  crews.forEach(r=>{ crewMap[r.id] = MAP.crews.from(r); });
  members.sort((a,b)=>a.joined_at.localeCompare(b.joined_at)).forEach(m=>{ if (crewMap[m.crew_id]) crewMap[m.crew_id].memberIds.push(m.user_id); });
  const by = (rows, t)=>Object.fromEntries(rows.map(r=>{ const o = MAP[t].from(r); return [o.id, o]; }));
  const ents = by(entries,'entries');
  // your own share links (owner-only table; missing until migration 0002 runs)
  const sources = await c.from('entry_sources').select('entry_id,source_url').then(r=>r.data||[], ()=>[]);
  sources.forEach(s=>{ if (ents[s.entry_id]) ents[s.entry_id].sourceUrl = s.source_url; });
  return { users:by(profiles,'profiles'), crews:crewMap, venues:by(venues,'venues'), entries:ents,
           photos:by(photos,'photos'), books:by(books,'books'), events:by(events,'events') };
}

/* ---------- live updates ---------- */
let channel = null;
export async function subscribe(onChange){
  const c = await client(); if (!c || channel) return;
  channel = c.channel('koko-crew')
    .on('postgres_changes', { event:'*', schema:'public' }, ()=>onChange())
    .subscribe();
}
export async function unsubscribe(){ if (channel && sb){ await sb.removeChannel(channel).catch(()=>{}); } channel = null; }

/* ---------- server functions ---------- */
export async function rpc(name, args){
  const c = await client(); if (!c) throw new Error('offline');
  const { data, error } = await c.rpc(name, args||{});
  if (error) throw error;
  return data;
}
export async function removeMember(userId){
  const c = await client(); if (!c) throw new Error('offline');
  const { error } = await c.from('crew_members').delete().eq('user_id', userId);
  if (error) throw error;
}

/* ---------- photos: private bucket, signed links ---------- */
const signed = new Map();   // path -> { url, until }
export function signedURL(path){ const s = signed.get(path); return s && s.until > Date.now() ? s.url : ''; }
export async function sign(paths){
  const c = await client(); if (!c) return 0;
  const need = [...new Set(paths)].filter(p=>p && !signedURL(p));
  let n = 0;
  for (let i=0; i<need.length; i+=100){
    const { data, error } = await c.storage.from('photos').createSignedUrls(need.slice(i, i+100), 7*24*3600);
    if (error) continue;
    data.forEach(d=>{ if (d.signedUrl){ signed.set(d.path, { url:d.signedUrl, until:Date.now()+6.5*24*3600e3 }); n++; } });
  }
  return n;
}

/* ---------- the outbox: writes wait here until the server has them ---------- */
// op: { k:'put'|'ins'|'upd'|'del'|'rpc'|'upload'|'rmfile', t:table, id, row, patch, fn, args, path }
let outbox = [], outKey = null, flushing = false, retryT = null, onSynced = null, onFailed = null, getBlob = null;
export function setOutboxOwner(userId, hooks){
  outKey = userId ? 'koko-outbox-'+userId : null;
  try{ outbox = outKey ? JSON.parse(localStorage.getItem(outKey)) || [] : []; }catch(_){ outbox = []; }
  onSynced = hooks && hooks.synced; onFailed = hooks && hooks.failed; getBlob = hooks && hooks.blob;
}
const persist = ()=>{ if (outKey) try{ localStorage.setItem(outKey, JSON.stringify(outbox)); }catch(_){} };
export function pending(){ return outbox.slice(); }
export function queue(op){
  // a newer full write of the same record replaces an older one still waiting
  if (op.k==='put') outbox = outbox.filter(o=>!(o.k==='put' && o.t===op.t && o.id===op.id));
  if (op.k==='del') outbox = outbox.filter(o=>!((o.k==='put'||o.k==='upd') && o.t===op.t && o.id===op.id));
  outbox.push(op); persist(); flush();
}
const transient = e => !e || e.message==='offline' || /fetch|network|timeout|Failed to fetch|NetworkError|503|502|504/i.test(String(e.message||e)) || e.status>=500 || e.status===0;
async function send(c, o){
  const T = o.t && c.from(o.t);
  const res =
    o.k==='put'    ? await T.upsert(o.row) :
    o.k==='ins'    ? await T.upsert(o.row, { onConflict:'id', ignoreDuplicates:true }) :
    o.k==='upd'    ? await T.update(o.patch).eq('id', o.id) :
    o.k==='del'    ? await T.delete().eq('id', o.id) :
    o.k==='rpc'    ? await c.rpc(o.fn, o.args||{}) :
    o.k==='rmfile' ? await c.storage.from('photos').remove([o.path]) :
    o.k==='upload' ? await (async()=>{ const blob = getBlob && await getBlob(o.id); if (!blob) return { error:null }; return c.storage.from('photos').upload(o.path, blob, { contentType:'image/jpeg', upsert:true }); })() :
    { error:null };
  if (res && res.error) throw res.error;
}
export async function flush(){
  if (flushing || !outbox.length) return;
  if (typeof navigator!=='undefined' && navigator.onLine===false) return;
  const c = await client(); if (!c) return;
  flushing = true;
  try{
    while (outbox.length){
      const o = outbox[0];
      try{ await send(c, o); }
      catch(e){
        if (transient(e)){ clearTimeout(retryT); retryT = setTimeout(flush, 15000); break; }
        console.warn('Koko sync: dropped a write the server refused', o, e);
        onFailed && onFailed(o, e);
      }
      outbox.shift(); persist();
    }
  } finally { flushing = false; }
  if (!outbox.length) onSynced && onSynced();
}
if (typeof window!=='undefined'){
  window.addEventListener('online', ()=>flush());
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) flush(); });
}
