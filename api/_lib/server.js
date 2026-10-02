// What every Koko server function needs: who's asking (Supabase checks the session token),
// per-person rate limits (database counters, with an in-memory fallback), and JSON replies.
export const SB_URL = process.env.SUPABASE_URL || 'https://crvadsjnqnxlkqzpywva.supabase.co';
export const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_9I39ztDfQcQ9dRkTIK392g_zP6HJsVg';
// local tests only (dev/server.mjs --dev-no-auth); never in production
export const DEV_NO_AUTH = process.env.SHARE_DEV_NO_AUTH==='1' && process.env.VERCEL_ENV!=='production';
export const CITY = { lat: 25.2048, lng: 55.2708, radius: 30000 };       // Dubai

export const json = (status, body)=> new Response(JSON.stringify(body), { status, headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' } });
export const tokenOf = request => (request.headers.get('authorization')||'').replace(/^Bearer\s+/i, '');

export async function userFor(token){
  if (!token) return null;
  if (DEV_NO_AUTH) return { id:'dev' };
  const r = await fetch(SB_URL+'/auth/v1/user', { headers:{ apikey:SB_KEY, Authorization:'Bearer '+token }, signal:AbortSignal.timeout(5000) }).catch(()=>null);
  return r && r.ok ? r.json() : null;
}
// database functions run as the user (row level security applies)
export async function rpc(token, fn, args){
  if (DEV_NO_AUTH) throw new Error('dev');
  const r = await fetch(SB_URL+'/rest/v1/rpc/'+fn, { method:'POST', signal:AbortSignal.timeout(4000),
    headers:{ apikey:SB_KEY, Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body:JSON.stringify(args||{}) });
  if (!r.ok) throw new Error(fn+' '+r.status);
  return r.json();
}
// over the hourly limit? (counter in the database; this instance's memory if that's unavailable)
const hits = new Map();
export async function overLimit(token, userId, fn, limit){
  try{ return (await rpc(token, fn)) > limit; }
  catch(_){
    const key = fn+':'+userId, now = Date.now(), list = (hits.get(key)||[]).filter(t=>now-t < 3600e3);
    list.push(now); hits.set(key, list); return list.length > limit;
  }
}
// read a small JSON body (or refuse it)
export async function readJSON(request, max){
  if (+(request.headers.get('content-length')||0) > max) return { tooBig:true };
  const raw = await request.text();
  if (raw.length > max) return { tooBig:true };
  try{ return { body: JSON.parse(raw||'{}') }; }catch(_){ return { bad:true }; }
}
