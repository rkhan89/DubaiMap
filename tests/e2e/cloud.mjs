// Two real accounts against the real Supabase project, in two separate browser sessions.
// Needs SUPABASE_SECRET in the environment (never commit it). Run from tests/e2e:
//   SUPABASE_SECRET=... node cloud.mjs            (against http://localhost:5174)
//   BASE=https://… SUPABASE_SECRET=... node cloud.mjs
// It creates throwaway users, checks sharing, privacy and live updates, then deletes them.
import puppeteer from 'puppeteer-core';
import path from 'path';

const URL0 = 'https://crvadsjnqnxlkqzpywva.supabase.co', KEY = process.env.SUPABASE_SECRET;
const BASE = process.env.BASE || 'http://localhost:5174/';
if (!KEY){ console.log('Set SUPABASE_SECRET to run this.'); process.exit(1); }
const admin = (p, opts={}) => fetch(URL0+p, { ...opts, headers:{ apikey:KEY, Authorization:'Bearer '+KEY, 'Content-Type':'application/json', ...(opts.headers||{}) } }).then(async r=>({ status:r.status, json: await r.json().catch(()=>null) }));
const stamp = Date.now().toString(36);
const users = [];
async function makeUser(tag){
  const email = `koko-test-${tag}-${stamp}@example.com`;
  const r = await admin('/auth/v1/admin/users', { method:'POST', body:JSON.stringify({ email, email_confirm:true }) });
  if (r.status>=300) throw new Error('create user: '+JSON.stringify(r.json));
  users.push(r.json.id);
  return email;
}
async function otp(email){
  const r = await admin('/auth/v1/admin/generate_link', { method:'POST', body:JSON.stringify({ type:'magiclink', email }) });
  const code = r.json?.email_otp || r.json?.properties?.email_otp;
  if (!code) throw new Error('no code: '+JSON.stringify(r.json));
  return code;
}
let failed = 0;
const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); }catch(e){ failed++; console.log('FAIL', name, '-', (e.message||e).split('\n')[0]); } };
const until = async (fn, ms=12000)=>{ const t=Date.now(); for(;;){ const v = await fn(); if (v) return v; if (Date.now()-t > ms) throw new Error('timed out'); await new Promise(r=>setTimeout(r,400)); } };

const browser = await puppeteer.launch({ executablePath: process.env.EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:'new' });
const open = async ()=>{ const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width:390, height:844 });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p._errs = errs; await p.goto(BASE+'?still', { waitUntil:'networkidle0' }); return p; };
const S = (p, fn, ...a)=>p.evaluate(fn, ...a);

try{
  const emailA = await makeUser('a'), emailB = await makeUser('b');
  const A = await open(), B = await open();
  let code, venueId, pubId, privId;

  await step('A signs in with a real 6-digit code', async ()=>{
    const c = await otp(emailA);
    await S(A, async (e,c)=>{ const S=await import('/store.js'); await S.verifyCode(e,c); }, emailA, c);
    const id = await S(A, async ()=>(await import('/store.js')).me()?.id); if (!id) throw new Error('not signed in');
  });
  await step('A sets up a profile and a crew', async ()=>{
    code = await S(A, async (h)=>{ const S=await import('/store.js'); S.updateMe({ handle:h, name:'Ada', onboarded:true }); const c = await S.createCrew({ name:'Test Crew' }); return c && c.code; }, 'ada_'+stamp.slice(-5));
    if (!/^TEST/.test(code||'')) throw new Error('code '+code);
  });
  await step('A logs a shared place with a photo, and a private one', async ()=>{
    [venueId, pubId, privId] = await S(A, async ()=>{
      const S=await import('/store.js');
      const v = S.addVenue({ name:'Test Karak Spot', zone:'karama', categories:['karak'] });
      const e1 = S.addEntry({ venueId:v.id, kind:'visit', rating:4.5, notes:'Shared note', private:false });
      const blob = await (await fetch('/demo/d19.jpg')).blob();
      await S.addPhotos([{ blob, caption:'shared photo', venueId:v.id, entryId:e1.id, private:false }]);
      const v2 = S.addVenue({ name:'Secret Spot', zone:'deira', categories:['cafeteria'] });
      const e2 = S.addEntry({ venueId:v2.id, kind:'visit', rating:3, notes:'Private note', private:true });
      return [v.id, e1.id, e2.id];
    });
    await until(()=>S(A, async ()=>{ const C=await import('/cloud.js'); return C.pending().length===0; }));
  });
  await step('B signs in and joins with the code', async ()=>{
    const c = await otp(emailB);
    await S(B, async (e,c)=>{ const S=await import('/store.js'); await S.verifyCode(e,c); S.updateMe({ handle:'bo_'+Date.now().toString(36).slice(-5), name:'Bo', onboarded:true }); }, emailB, c);
    const r = await S(B, async (code)=>{ const S=await import('/store.js'); const r = await S.joinCrew(code); return r.error || r.crew?.name; }, code);
    if (r!=='Test Crew') throw new Error(r);
  });
  await step('B sees A\'s shared visit and place', async ()=>{
    const r = await S(B, async (ids)=>{ const S=await import('/store.js'); return { v:!!S.venue(ids[0]), e:!!S.entries().find(e=>e.id===ids[1]) }; }, [venueId, pubId]);
    if (!r.v || !r.e) throw new Error(JSON.stringify(r));
  });
  await step('B does not see A\'s private visit or its place', async ()=>{
    const r = await S(B, async (id)=>{ const S=await import('/store.js'); return { e:!!S.entry(id), all:S.entries({includeHidden:true}).some(e=>e.id===id), v:S.venues().some(v=>v.name==='Secret Spot') }; }, privId);
    if (r.e || r.all || r.v) throw new Error(JSON.stringify(r));
  });
  await step('B can open A\'s shared photo (private storage, signed link)', async ()=>{
    const ok = await until(()=>S(B, async ()=>{ const S=await import('/store.js'); const p=S.photos()[0]; const u=p && S.photoURL(p); if (!u) return false; const r=await fetch(u); return r.ok && (r.headers.get('content-type')||'').startsWith('image'); }));
    if (!ok) throw new Error('no image');
  });
  await step('live: A logs another place and it reaches B', async ()=>{
    await S(A, async (vid)=>{ const S=await import('/store.js'); S.addEntry({ venueId:vid, kind:'visit', rating:5, notes:'Second visit', private:false }); }, venueId);
    await until(()=>S(B, async ()=>{ const S=await import('/store.js'); return S.entries().some(e=>e.notes==='Second visit'); }), 20000);
  });
  await step('B cannot change or delete A\'s visit (database refuses)', async ()=>{
    const r = await S(B, async (id)=>{ const C=await import('/cloud.js'); const c=await C.client();
      const u = await c.from('entries').update({ notes:'hacked' }).eq('id', id).select();
      const d = await c.from('entries').delete().eq('id', id).select();
      return { u:(u.data||[]).length, d:(d.data||[]).length }; }, pubId);
    if (r.u || r.d) throw new Error(JSON.stringify(r));
  });
  await step('B plans a bite, A RSVPs', async ()=>{
    const ev = await S(B, async (vid)=>{ const S=await import('/store.js'); return S.addEvent({ venueId:vid, when:'2030-01-01T19:30', note:'Test plan' }).id; }, venueId);
    await until(()=>S(A, async (id)=>{ const S=await import('/store.js'); return !!S.event(id); }, ev), 20000);
    await S(A, async (id)=>{ const S=await import('/store.js'); S.rsvp(id, 'going'); }, ev);
    await until(()=>S(B, async (id)=>{ const S=await import('/store.js'); await S.pullNow(); const e=S.event(id); return e && Object.values(e.rsvps).filter(x=>x==='going').length===2; }, ev), 20000);
  });
  await step('a fresh phone: A signs in again and everything is there', async ()=>{
    const A2 = await open();
    const c = await otp(emailA);
    const r = await S(A2, async (e,c)=>{ const S=await import('/store.js'); await S.verifyCode(e,c); return { on:S.isOnboarded(), crew:S.myCrew()?.name, n:S.entries().length, photos:S.photos().length }; }, emailA, c);
    if (!r.on || r.crew!=='Test Crew' || r.n<3 || r.photos<1) throw new Error(JSON.stringify(r));
  });
  await step('B leaves the crew and loses access', async ()=>{
    await S(B, async ()=>{ const S=await import('/store.js'); await S.leaveCrew(); });
    const n = await S(B, async (id)=>{ const S=await import('/store.js'); return S.entries().filter(e=>e.userId!==S.me().id).length; }, pubId);
    if (n) throw new Error(n+' still visible');
  });
  for (const p of [A, B]) if (p._errs.length) console.log('page errors:', p._errs);
} finally {
  // clean up: photo files, then the users (their rows go with them)
  for (const id of users){
    const list = await admin('/storage/v1/object/list/photos', { method:'POST', body:JSON.stringify({ prefix:id, limit:100 }) });
    const names = (list.json||[]).map(o=>id+'/'+o.name);
    if (names.length) await admin('/storage/v1/object/photos', { method:'DELETE', body:JSON.stringify({ prefixes:names }) });
    await admin('/auth/v1/admin/users/'+id, { method:'DELETE' });
  }
  console.log(`cleaned up ${users.length} test users`);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall cloud checks passed');
}
