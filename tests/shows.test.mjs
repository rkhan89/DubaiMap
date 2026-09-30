// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showState, LIGHT_SHOWS } from '../shows.js';

// Dubai is UTC+4 all year; these times are Dubai wall-clock
const at = (hms, day='2026-09-30') => new Date(`${day}T${hms}+04:00`);

test('6:59 pm: no show', ()=>{ assert.equal(showState(at('18:59:00')).active, false); });
test('7:00 pm: first show, blue', ()=>{ const s = showState(at('19:00:00')); assert.equal(s.active, true); assert.equal(s.type, 'blue'); assert.equal(s.t, 0); });
test('7:00:59 pm: still on, last second', ()=>{ const s = showState(at('19:00:59')); assert.equal(s.active, true); assert.equal(s.type, 'blue'); assert.ok(s.t >= 59); });
test('7:01 pm: over', ()=>{ assert.equal(showState(at('19:01:00')).active, false); });
test('7:15 pm: multicolour', ()=>{ assert.equal(showState(at('19:15:10')).type, 'multi'); });
test('10:45 pm: last multicolour show', ()=>{ const s = showState(at('22:45:00')); assert.equal(s.active, true); assert.equal(s.type, 'multi'); });
test('11:00 pm: last show, blue', ()=>{ const s = showState(at('23:00:00')); assert.equal(s.active, true); assert.equal(s.type, 'blue'); });
test('11:01 pm: no show', ()=>{ assert.equal(showState(at('23:01:00')).active, false); });
test('11:15 pm: past the end, no show', ()=>{ assert.equal(showState(at('23:15:00')).active, false); });
test('17 shows a night', ()=>{
  let n = 0;
  for (let m=0; m<24*60; m++){ const hh=String(Math.floor(m/60)).padStart(2,'0'), mm=String(m%60).padStart(2,'0'); if (showState(at(`${hh}:${mm}:00`)).active) n++; }
  assert.equal(n, 17);
});
test('uses Dubai time whatever the device timezone (same instant in UTC)', ()=>{
  assert.equal(showState(new Date('2026-09-30T15:00:30Z')).type, 'blue');   // 19:00:30 in Dubai
});
test('eases in and out', ()=>{
  assert.ok(showState(at('19:00:00.500')).intensity < 1);
  assert.equal(showState(at('19:00:30')).intensity, 1);
  assert.ok(showState(at('19:00:59.500')).intensity < 1);
});
test('overrides are off by default and apply only when switched on', ()=>{
  const cfg = { ...LIGHT_SHOWS, overrides:[{ name:'National Day', from:'2026-12-02', to:'2026-12-03', start:'18:00' }] };
  assert.equal(showState(at('18:00:10','2026-12-02'), cfg).active, false);
  assert.equal(showState(at('18:00:10','2026-12-02'), { ...cfg, useOverrides:true }).active, true);
});
