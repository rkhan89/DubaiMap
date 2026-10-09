// Tags the photos that were added before photo tagging was switched on. Runs on your own machine, never in the app.
// A dry run first: it counts the photos still to do and prints the estimated cost, and sends nothing.
//   SUPABASE_SECRET_KEY=... ANTHROPIC_API_KEY=... node tools/ai-tags-backfill.mjs            (dry run)
//   ... node tools/ai-tags-backfill.mjs --run --max 200                                       (tag up to 200)
// Resumable: it only takes photos never tagged (ai_tagged_at is null), oldest first, so run it again to carry on.
// It stops at the monthly cap (AI_TAGS_MONTHLY_CAP_USD, default 5) and logs every call in ai_tag_log.
// Needs sharp to make the ~800 px copy (npm i --no-save sharp, or SHARP=<path to sharp>).
// The secret key stays in your shell: never put it in the repo, the app or Vercel's public settings.
import { readPhoto, costOf, MODEL } from '../api/_lib/phototags.js';
const SB_URL = process.env.SUPABASE_URL || 'https://crvadsjnqnxlkqzpywva.supabase.co', KEY = process.env.SUPABASE_SECRET_KEY, AKEY = process.env.ANTHROPIC_API_KEY;
const args = process.argv.slice(2), run = args.includes('--run'), max = Math.max(1, Number(args[args.indexOf('--max') + 1]) || 100);
const cap = Number(process.env.AI_TAGS_MONTHLY_CAP_USD) >= 0 && process.env.AI_TAGS_MONTHLY_CAP_USD !== undefined ? Number(process.env.AI_TAGS_MONTHLY_CAP_USD) : 5;
if (!KEY) throw new Error('set SUPABASE_SECRET_KEY in your shell (the service key; never commit it)');
const H = { apikey:KEY, Authorization:'Bearer ' + KEY, 'Content-Type':'application/json' };
const rest = (q, init)=>fetch(SB_URL + '/rest/v1/' + q, { ...init, headers:{ ...H, ...(init && init.headers) } });
// a typical ~800 px photo: about 1,100 tokens in (image and prompt), 40 out
const EST = costOf(1100, 40);

const todo = await (await rest('photos?select=id,user_id,path&ai_tagged_at=is.null&order=created_at.asc&limit=' + max, { headers:{ Prefer:'count=exact' } })).json();
const total = await rest('photos?select=id&ai_tagged_at=is.null', { method:'HEAD', headers:{ Prefer:'count=exact' } }).then(r=>Number((r.headers.get('content-range')||'/0').split('/')[1]) || 0);
const spent = Number(await (await rest('rpc/ai_tags_spent_this_month', { method:'POST', body:'{}' })).json()) || 0;
console.log(`${total} photos never tagged; this run takes up to ${todo.length}. Estimated cost: about $${(todo.length*EST).toFixed(3)} for this run, $${(total*EST).toFixed(3)} for all (at ~$${EST} a photo, ${MODEL}). Spent this month: $${spent.toFixed(4)} of the $${cap} cap.`);
if (!run){ console.log('Dry run: nothing sent. Add --run to tag them.'); process.exit(0); }
if (!AKEY) throw new Error('set ANTHROPIC_API_KEY in your shell');
const sharp = (await import(process.env.SHARP || 'sharp')).default;
let done = 0, cost = spent;
for (const p of todo){
  if (cost >= cap){ console.log('Monthly cap reached: stopping.'); break; }
  const f = await fetch(SB_URL + '/storage/v1/object/photos/' + encodeURI(p.path), { headers:{ apikey:KEY, Authorization:'Bearer ' + KEY } });
  if (!f.ok){ console.log(p.id, 'no file:', f.status); continue; }
  const small = await sharp(Buffer.from(await f.arrayBuffer())).rotate().resize({ width:800, height:800, fit:'inside', withoutEnlargement:true }).jpeg({ quality:80 }).toBuffer();
  const r = await readPhoto(small.toString('base64'), 'image/jpeg', { fetch, key:AKEY });
  cost += r.cost;
  await rest('ai_tag_log', { method:'POST', body:JSON.stringify({ photo_id:p.id, user_id:p.user_id, model:MODEL, tokens_in:r.tokensIn, tokens_out:r.tokensOut, cost_usd:r.cost, ok:r.ok }) });
  console.log(p.id, r.ok ? r.tags.join(', ') || '(no food or place)' : 'failed: ' + r.error, `in ${r.tokensIn} out ${r.tokensOut} $${r.cost}`);
  if (!r.ok) continue;                                     // left untagged; the next run tries it again
  await rest('photos?id=eq.' + encodeURIComponent(p.id), { method:'PATCH', body:JSON.stringify({ ai_tags:r.tags, ai_tagged_at:new Date().toISOString() }) });
  done++;
}
console.log(`Tagged ${done}. This month's estimated spend: $${cost.toFixed(4)}.`);
