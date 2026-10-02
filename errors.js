// Error reports: when something breaks on someone's phone, send what broke (the message and where
// in the code) and the kind of phone, so it can be fixed. Never anything they typed or saved:
// addresses are cut back to the path (a /share?text=… address would otherwise carry their text).
// Signed in only, each error once, 5 a session at most (store.reportError), 50 a day (database).
import { reportError } from './store.js';

const NOISE = /ResizeObserver loop|^Script error\.?$|AbortError|TimeoutError|Failed to fetch|NetworkError|Load failed|The operation was aborted/i;
// keep file:line:column, drop the site address and anything after ? or #
export const tidy = s => String(s||'').replace(/https?:\/\/[^\s)]+/g, u=>{ try{ const x = new URL(u); return x.pathname + (u.match(/:\d+:\d+$/)||[''])[0]; }catch(_){ return '[url]'; } }).slice(0, 2000);

function send(message, stack, source){
  const text = String(message || '');
  if (!text || NOISE.test(text) || /extension:\/\//.test(String(source||'') + String(stack||''))) return;
  try{ reportError({ message: tidy(text).slice(0, 500), stack: tidy(stack), where: location.pathname }); }catch(_){}
}

window.addEventListener('error', e=>{
  if (!e.error && e.target && e.target !== window) return;     // a missing image or script: not a code error
  send(e.message, e.error && e.error.stack, e.filename);
});
window.addEventListener('unhandledrejection', e=>{
  const r = e.reason;
  send(r && r.message ? r.message : String(r), r && r.stack, '');
});
