// Burj Khalifa light shows on the map, driven by the clock (no server).
// This is our own schedule (published sources disagree), kept here so it's easy to change.
export const LIGHT_SHOWS = {
  timezone: 'Asia/Dubai',          // Dubai time whatever the phone's timezone (no daylight saving there)
  start: '19:00',                  // first show (blue)
  end: '23:00',                    // last show (blue); inclusive
  marks: { 0:'blue', 15:'multi', 30:'blue', 45:'multi' },   // minute of the hour -> show type
  durationSec: 60,
  easeSec: 1.5,                    // fade in and out
  // Special nights (Ramadan, Eid, National Day, New Year's Eve). Empty and off by default.
  // Each: { name, from:'YYYY-MM-DD', to:'YYYY-MM-DD', start?, end?, marks?, durationSec? }
  useOverrides: false,
  overrides: [],
};

const toMin = hhmm => { const [h,m] = hhmm.split(':').map(Number); return h*60 + m; };
// wall-clock parts in the show's timezone
function localParts(date, tz){
  const f = new Intl.DateTimeFormat('en-GB', { timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
  const p = Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type, x.value]));
  return { ymd:`${p.year}-${p.month}-${p.day}`, h:+p.hour, m:+p.minute, s:+p.second + (date.getMilliseconds()/1000) };
}
// the schedule in force on a given local date (overrides only when switched on)
export function scheduleFor(ymd, cfg = LIGHT_SHOWS){
  if (cfg.useOverrides){
    const o = (cfg.overrides||[]).find(o=>ymd >= o.from && ymd <= (o.to||o.from));
    if (o) return { ...cfg, ...o };
  }
  return cfg;
}
// { active, type:'blue'|'multi'|null, t (seconds into the show), intensity 0..1 }
export function showState(date, cfg = LIGHT_SHOWS){
  const lp = localParts(date, cfg.timezone), sc = scheduleFor(lp.ymd, cfg);
  const type = sc.marks[lp.m];
  const off = { active:false, type:null, t:0, intensity:0 };
  if (!type) return off;
  const mins = lp.h*60 + lp.m;
  if (mins < toMin(sc.start) || mins > toMin(sc.end)) return off;
  const t = lp.s;                                   // shows start on the minute
  if (t >= sc.durationSec) return off;
  const e = sc.easeSec || 0.001;
  return { active:true, type, t, intensity:Math.max(0, Math.min(1, t/e, (sc.durationSec-t)/e)) };
}

// development: ?now=2026-09-30T19:00:30+04:00 starts the app's clock at that moment
let clockOffset = 0;
try{
  const n = typeof location!=='undefined' && new URLSearchParams(location.search).get('now');
  if (n){ const d = new Date(n); if (!isNaN(d)) clockOffset = d.getTime() - Date.now(); }
}catch(_){}
export const now = () => new Date(Date.now() + clockOffset);
