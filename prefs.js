// Per-device preferences (not synced): map extras and reminders.
const KEY = 'bites-prefs';
const DEFAULTS = { zones:false, cars:true, shows:true, notify:false };
export function prefs(){
  let p = {};
  try{ p = JSON.parse(localStorage.getItem(KEY)) || {}; }catch(_){}
  // light-show toggle used to live under its own key
  try{ if (localStorage.getItem('bites-shows')==='0' && p.shows===undefined) p.shows = false; }catch(_){}
  return { ...DEFAULTS, ...p };
}
export function setPref(k, v){ const p = prefs(); p[k] = v; try{ localStorage.setItem(KEY, JSON.stringify(p)); }catch(_){} return p; }
