// node --test tests/
// Offline: a rating changed several times before the phone is back online goes out as one
// write, the last one (the server then keeps the newest per person per visit; see sqltest).
import { test } from 'node:test';
import assert from 'node:assert/strict';
Object.defineProperty(globalThis, 'navigator', { value:{ onLine:false }, configurable:true });   // offline: nothing leaves the outbox
const C = await import('../cloud.js');

const row = (rating, at) => C.MAP.visit_ratings.to({ id:'e1|u1', entryId:'e1', userId:'u1', rating, note:'', updatedAt:at });

test('rating a visit three times offline leaves one write in the outbox: the last', ()=>{
  C.setOutboxOwner(null);
  C.queue({ k:'put', t:'visit_ratings', id:'e1|u1', row:row(3, 1) });
  C.queue({ k:'put', t:'visit_ratings', id:'e1|u1', row:row(4, 2) });
  C.queue({ k:'put', t:'visit_ratings', id:'e1|u1', row:row(4.5, 3) });
  const ops = C.pending().filter(o=>o.t==='visit_ratings');
  assert.equal(ops.length, 1);
  assert.equal(ops[0].row.rating, 4.5);
});
test('removing it offline drops the waiting write and sends the removal', ()=>{
  C.queue({ k:'del', t:'visit_ratings', id:'e1|u1' });
  const ops = C.pending().filter(o=>o.t==='visit_ratings');
  assert.deepEqual(ops.map(o=>o.k), ['del']);
});
test('one rating per person per visit: the id is the visit and the person', ()=>{
  const r = C.MAP.visit_ratings.to({ id:'e9|u2', entryId:'e9', userId:'u2', rating:5, note:'x', updatedAt:Date.UTC(2026,9,6) });
  assert.equal(r.id, r.entry_id + '|' + r.user_id);
  assert.equal(r.updated_at, '2026-10-06T00:00:00.000Z');
  assert.deepEqual(C.MAP.visit_ratings.from({ ...r, rating:'5.0' }).rating, 5);
});
