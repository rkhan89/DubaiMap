// Reading a photo for search tags (food and scene only). Pure apart from what's passed in, so it's tested with a
// stand-in for Claude (tests/phototags.test.mjs). Only the image and the prompt go to the model: no names, no notes,
// no place, no account details.
export const MODEL = 'claude-haiku-4-5-20251001';
// estimated cost, US dollars per million tokens (Claude Haiku 4.5's list price; check before relying on it)
export const PRICE = { in:1.0, out:5.0 };
export const costOf = (tin, tout)=>+(tin*PRICE.in/1e6 + tout*PRICE.out/1e6).toFixed(6);
export const PROMPT = 'Tag this photo for a private food diary\'s search. Reply with JSON only, exactly {"tags":[...]}: '
  + '3 to 8 lowercase English tags covering the dish or food, the cuisine, any drinks and the setting '
  + '(for example "ice cream", "dessert", "cone", "outdoor"). Food and scene only: never identify or describe people. '
  + 'If there is no food or place content, reply {"tags":[]}.';

// the reply's tags, tidied: lowercase words (and spaces, & and -), at most 30 characters each, at most 8, no repeats
export function parseTags(text){
  let j = null;
  const m = String(text||'').match(/\{[\s\S]*\}/);
  try{ j = JSON.parse(m ? m[0] : text); }catch(_){ return null; }
  if (!j || !Array.isArray(j.tags)) return null;
  const out = [];
  for (const t of j.tags){
    const s = String(t||'').toLowerCase().replace(/[^a-z0-9 &'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30).trim();
    if (/^[a-z0-9]/.test(s) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 8);
}

// one call to Claude with the image; retried once if it fails. deps: { fetch, key }
export async function readPhoto(imageB64, mediaType, deps){
  const body = JSON.stringify({ model:MODEL, max_tokens:120,
    messages:[{ role:'user', content:[{ type:'image', source:{ type:'base64', media_type:mediaType, data:imageB64 } }, { type:'text', text:PROMPT }] }] });
  let last = null;
  for (let attempt=0; attempt<2; attempt++){
    try{
      const r = await deps.fetch('https://api.anthropic.com/v1/messages', { method:'POST', body,
        headers:{ 'content-type':'application/json', 'x-api-key':deps.key, 'anthropic-version':'2023-06-01' }, signal:AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('claude ' + r.status);
      const j = await r.json(), text = (j.content||[]).filter(c=>c.type === 'text').map(c=>c.text).join('');
      const tags = parseTags(text); if (!tags) throw new Error('not JSON');
      const tin = (j.usage && j.usage.input_tokens) || 0, tout = (j.usage && j.usage.output_tokens) || 0;
      return { ok:true, tags, tokensIn:tin, tokensOut:tout, cost:costOf(tin, tout), attempts:attempt+1 };
    }catch(e){ last = e; }
  }
  return { ok:false, tags:[], tokensIn:0, tokensOut:0, cost:0, error:String(last && last.message || last), attempts:2 };
}

// the whole job for one photo. deps: { enabled, cap, spent(), owns(photoId), read(img, type), save(photoId, tags), log(row) }
export async function tagPhoto(photoId, imageB64, mediaType, deps){
  if (!deps.enabled) return { state:'off' };
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(photoId||''))) return { state:'bad' };
  if (!/^image\/(jpeg|webp|png)$/.test(mediaType) || !imageB64 || imageB64.length > 600000) return { state:'bad' };
  if (!(await deps.owns(photoId))) return { state:'not_yours' };
  if ((await deps.spent()) >= deps.cap) return { state:'capped' };
  const r = await deps.read(imageB64, mediaType);
  await deps.log({ photo_id:photoId, model:MODEL, tokens_in:r.tokensIn, tokens_out:r.tokensOut, cost_usd:r.cost, ok:r.ok });
  if (!r.ok) return { state:'failed' };                       // left untagged
  await deps.save(photoId, r.tags);
  return { state:'ok', tags:r.tags, cost:r.cost, tokensIn:r.tokensIn, tokensOut:r.tokensOut };
}
