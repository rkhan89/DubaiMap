// Light / Dark / System (follows the phone) / Dynamic (day and night in the city: light from sunrise, dark from
// sunset, sun.js). The resolved theme is a data-theme attribute on <html>; every colour in styles.css hangs off it.
// index.html sets it before first paint (for Dynamic from the last answer saved here, until it runs out), so
// there's no flash.
import { isDay, nextChange } from './sun.js';
import { now } from './shows.js';
const KEY = 'bites-theme', LAST = 'bites-theme-dyn';
const PREFS = ['light', 'dark', 'system', 'dynamic'];
const COLORS = { light:'#F7F3EC', dark:'#141210' };   // browser / PWA chrome (the app's paper / night surface)
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches:false, addEventListener(){} };
const listeners = new Set();
let timer = 0, shown = null;

// no choice yet: Dynamic. ("auto" was the old name for System.)
export function themePref(){ try{ const p = localStorage.getItem(KEY); return p==='auto' ? 'system' : PREFS.includes(p) ? p : 'dynamic'; }catch(_){ return 'dynamic'; } }
export function resolvedTheme(){
  const p = themePref();
  if (p === 'system') return mq.matches ? 'dark' : 'light';
  if (p === 'dynamic') return isDay(now()) ? 'light' : 'dark';
  return p;
}
export function applyTheme(){
  const t = resolvedTheme(), p = themePref();
  document.documentElement.dataset.theme = t;
  // two metas (light / dark media). System: each keeps its own colour; any other choice sets both, so the bar matches the app
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{
    const media = m.getAttribute('media')||'', own = media.includes('dark') ? COLORS.dark : COLORS.light;
    m.setAttribute('content', p==='system' ? own : COLORS[t]);
  });
  // Dynamic: switch at the next sunrise or sunset (and remember the answer for the next first paint)
  clearTimeout(timer);
  if (p === 'dynamic'){
    const until = nextChange(now());
    try{ localStorage.setItem(LAST, JSON.stringify({ t, until })); }catch(_){}
    timer = setTimeout(applyTheme, Math.min(Math.max(1000, until - +now() + 1000), 6 * 3600e3));
  }
  if (t !== shown){ shown = t; listeners.forEach(f=>{ try{ f(t); }catch(e){ console.error(e); } }); }
  return t;
}
export function setThemePref(p){ try{ localStorage.setItem(KEY, PREFS.includes(p) ? p : 'dynamic'); }catch(_){} return applyTheme(); }
export function onTheme(fn){ listeners.add(fn); }
mq.addEventListener && mq.addEventListener('change', ()=>{ if (themePref()==='system') applyTheme(); });
// a phone asleep through sunset: check again when the app comes back
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', ()=>{ if (!document.hidden && themePref()==='dynamic') applyTheme(); });
