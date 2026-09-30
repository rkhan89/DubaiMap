// Light / Dark / Auto (follows the phone). The resolved theme is a data-theme attribute
// on <html>; every colour in styles.css hangs off it. index.html sets it before first
// paint with the same rule, so there's no flash.
const KEY = 'bites-theme';
const COLORS = { light:'#fff8f5', dark:'#1b1612' };   // browser / PWA chrome
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches:false, addEventListener(){} };
const listeners = new Set();

export function themePref(){ try{ const p = localStorage.getItem(KEY); return p==='light'||p==='dark' ? p : 'auto'; }catch(_){ return 'auto'; } }
export function resolvedTheme(){ const p = themePref(); return p==='auto' ? (mq.matches ? 'dark' : 'light') : p; }
export function applyTheme(){
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute('content', COLORS[t]));
  listeners.forEach(f=>{ try{ f(t); }catch(e){ console.error(e); } });
  return t;
}
export function setThemePref(p){ try{ p==='auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, p); }catch(_){} return applyTheme(); }
export function onTheme(fn){ listeners.add(fn); }
mq.addEventListener && mq.addEventListener('change', ()=>{ if (themePref()==='auto') applyTheme(); });
