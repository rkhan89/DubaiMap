// node --test tests/
// Dynamic theme: sunrise and sunset in Dubai (against published times, within 3 minutes), day vs night either side,
// and the next switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunTimes, isDay, nextChange } from '../sun.js';

const at = s => new Date(s).getTime();
const near = (got, want, mins=3) => assert.ok(Math.abs(got - at(want)) <= mins * 60e3, `${new Date(got).toISOString()} vs ${want}`);

test('Dubai sunrise and sunset through the year', ()=>{
  let s = sunTimes(at('2026-06-21T12:00:00+04:00')); near(s.sunrise, '2026-06-21T05:29:00+04:00'); near(s.sunset, '2026-06-21T19:12:00+04:00');
  s = sunTimes(at('2026-12-21T12:00:00+04:00')); near(s.sunrise, '2026-12-21T07:00:00+04:00'); near(s.sunset, '2026-12-21T17:34:00+04:00');
  s = sunTimes(at('2026-10-09T12:00:00+04:00')); near(s.sunrise, '2026-10-09T06:14:00+04:00'); near(s.sunset, '2026-10-09T17:58:00+04:00');
});

test('the same day from just after midnight to just before (Dubai time)', ()=>{
  const a = sunTimes(at('2026-10-09T00:10:00+04:00')), b = sunTimes(at('2026-10-09T23:50:00+04:00'));
  assert.equal(a.sunrise, b.sunrise); assert.equal(a.sunset, b.sunset);
});

test('day and night either side of sunrise and sunset; the next switch', ()=>{
  assert.equal(isDay(at('2026-10-09T05:50:00+04:00')), false);
  assert.equal(isDay(at('2026-10-09T06:30:00+04:00')), true);
  assert.equal(isDay(at('2026-10-09T17:45:00+04:00')), true);
  assert.equal(isDay(at('2026-10-09T18:15:00+04:00')), false);
  near(nextChange(at('2026-10-09T12:00:00+04:00')), '2026-10-09T17:58:00+04:00');
  near(nextChange(at('2026-10-09T20:00:00+04:00')), '2026-10-10T06:14:00+04:00');
  near(nextChange(at('2026-10-09T03:00:00+04:00')), '2026-10-09T06:14:00+04:00');
});
