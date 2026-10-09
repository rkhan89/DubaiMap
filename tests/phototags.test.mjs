// node --test tests/
// The photo tagger, with a stand-in for Claude: the switch, only the image and the prompt sent, tags tidied, retried
// once, the monthly cap, every call logged with its tokens and cost, and nothing saved for someone else's photo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
const T = await import('../api/_lib/phototags.js');

const reply = (text, usage={ input_tokens:1100, output_tokens:30 })=>({ ok:true, json:async ()=>({ content:[{ type:'text', text }], usage }) });
function deps(over={}){
  const st = { logs:[], saved:[], sent:[] };
  const fake = over.fetch || (async (url, init)=>{ st.sent.push(JSON.parse(init.body)); return reply('{"tags":["Ice Cream","dessert","cone","outdoor"]}'); });
  return { st, d:{ enabled:true, cap:5, spent:async ()=>over.spent ?? 0.01, owns:async ()=>over.owns ?? true,
    read:(img, type)=>T.readPhoto(img, type, { fetch:fake, key:'test' }), save:async (id, tags)=>st.saved.push({ id, tags }), log:async row=>st.logs.push(row), ...over.d } };
}

test('off: nothing sent, nothing saved', async ()=>{
  const { st, d } = deps(); const r = await T.tagPhoto('p1', 'aGVsbG8=', 'image/jpeg', { ...d, enabled:false });
  assert.equal(r.state, 'off'); assert.equal(st.sent.length + st.saved.length + st.logs.length, 0);
});

test('on: only the image and the prompt go to Claude Haiku 4.5; tags tidied, saved, the call logged with its cost', async ()=>{
  const { st, d } = deps(); const r = await T.tagPhoto('p1', 'aGVsbG8=', 'image/jpeg', d);
  assert.equal(r.state, 'ok'); assert.deepEqual(r.tags, ['ice cream', 'dessert', 'cone', 'outdoor']);
  const body = st.sent[0];
  assert.equal(body.model, 'claude-haiku-4-5-20251001');
  assert.equal(body.messages.length, 1); assert.deepEqual(body.messages[0].content.map(c=>c.type), ['image', 'text']);
  assert.ok(!('system' in body) && !('metadata' in body));
  assert.match(body.messages[0].content[1].text, /never identify or describe people/i);
  assert.deepEqual(st.saved, [{ id:'p1', tags:['ice cream', 'dessert', 'cone', 'outdoor'] }]);
  assert.equal(st.logs.length, 1); assert.equal(st.logs[0].tokens_in, 1100); assert.equal(st.logs[0].cost_usd, T.costOf(1100, 30)); assert.ok(st.logs[0].cost_usd > 0);
});

test('a failure is retried once, then the photo is left untagged (the attempt is still logged)', async ()=>{
  let n = 0; const { st, d } = deps({ fetch:async ()=>{ n++; return { ok:false, status:529, json:async ()=>({}) }; } });
  const r = await T.tagPhoto('p1', 'aGVsbG8=', 'image/jpeg', d);
  assert.equal(r.state, 'failed'); assert.equal(n, 2); assert.equal(st.saved.length, 0); assert.equal(st.logs[0].ok, false);
});

test('the monthly cap stops tagging; someone else\'s photo is refused', async ()=>{
  let r = await T.tagPhoto('p1', 'aGVsbG8=', 'image/jpeg', deps({ spent:5 }).d); assert.equal(r.state, 'capped');
  r = await T.tagPhoto('p1', 'aGVsbG8=', 'image/jpeg', deps({ owns:false }).d); assert.equal(r.state, 'not_yours');
});

test('no food or place: an empty list is fine; junk is refused', ()=>{
  assert.deepEqual(T.parseTags('{"tags":[]}'), []);
  assert.deepEqual(T.parseTags('```json\n{"tags":["Coffee","coffee","Latte Art!"]}\n```'), ['coffee', 'latte art']);
  assert.equal(T.parseTags('sorry, no'), null);
});

test('the key and the switch live only on the server', ()=>{
  for (const f of ['aitags.js', 'searchui.js', 'place.js', 'app.js']){
    const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/ANTHROPIC|x-api-key|sk-ant/i.test(s), f);
  }
});
