// /api/photo-tags: reads a photo you've just added for search tags (food and scene only), behind a switch.
//   GET   → { enabled }   (the app shows its one-line note only when this is on)
//   POST  { photoId, image (base64, ~800 px), type }  →  { state, tags? }
// Environment (set in Vercel; never in the app or the repo):
//   AI_PHOTO_TAGS=on               the switch (anything else, or unset: off, and nothing is ever sent to Claude)
//   ANTHROPIC_API_KEY              the key (already used by /api/resolve-share)
//   AI_TAGS_MONTHLY_CAP_USD=5      stop tagging once this month's estimated spend reaches it (default 5)
// Signed-in users only; it acts as you (row level security), so it can only tag your own photos. Each call is
// logged (photo id, tokens in and out, estimated cost) in ai_tag_log and in the function's log.
import { json, userFor, rpc, SB_URL, SB_KEY, DEV_NO_AUTH } from './_lib/server.js';
import { tagPhoto, readPhoto } from './_lib/phototags.js';

const enabled = ()=>process.env.AI_PHOTO_TAGS === 'on' && !!process.env.ANTHROPIC_API_KEY;
const cap = ()=>{ const n = Number(process.env.AI_TAGS_MONTHLY_CAP_USD); return Number.isFinite(n) && n >= 0 ? n : 5; };
const rest = (token, pathq, init)=>fetch(SB_URL + '/rest/v1/' + pathq, { ...init, signal:AbortSignal.timeout(5000),
  headers:{ apikey:SB_KEY, Authorization:'Bearer ' + token, 'Content-Type':'application/json', Prefer:'return=minimal', ...(init && init.headers) } });

export async function GET(){ return json(200, { enabled:enabled() }); }

export async function POST(request){
  if (!enabled()) return json(404, { state:'off' });
  if (+(request.headers.get('content-length')||0) > 700000) return json(413, { state:'bad' });
  let input; try{ input = JSON.parse(await request.text() || '{}'); }catch(_){ return json(400, { state:'bad' }); }
  const token = (request.headers.get('authorization')||'').replace(/^Bearer\s+/i, '');
  const user = await userFor(token);
  if (!user || DEV_NO_AUTH) return json(401, { state:'signed_out' });
  const out = await tagPhoto(String(input.photoId||''), String(input.image||''), String(input.type||'image/jpeg'), {
    enabled:true, cap:cap(),
    spent: async ()=>{ try{ return Number(await rpc(token, 'ai_tags_spent_this_month')) || 0; }catch(_){ return Infinity; } },   // can't check the cap: don't spend
    owns: async id=>{ const r = await rest(token, 'photos?select=id,user_id&id=eq.' + encodeURIComponent(id)).catch(()=>null); if (!r || !r.ok) return false; const rows = await r.json(); return rows.length === 1 && rows[0].user_id === user.id; },
    read: (img, type)=>readPhoto(img, type, { fetch, key:process.env.ANTHROPIC_API_KEY }),
    save: (id, tags)=>rest(token, 'photos?id=eq.' + encodeURIComponent(id), { method:'PATCH', body:JSON.stringify({ ai_tags:tags, ai_tagged_at:new Date().toISOString() }) }),
    log: async row=>{
      console.log(JSON.stringify({ at:'photo-tags', photo:row.photo_id, tokens_in:row.tokens_in, tokens_out:row.tokens_out, cost_usd:row.cost_usd, ok:row.ok }));
      await rest(token, 'ai_tag_log', { method:'POST', body:JSON.stringify(row) }).catch(()=>{});
    },
  });
  return json(out.state === 'ok' ? 200 : out.state === 'not_yours' ? 403 : out.state === 'bad' ? 400 : 200, out);
}
