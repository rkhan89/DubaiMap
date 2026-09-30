// Reminders on this phone (Phase 3). Without a server there's no true push yet: these fire
// while the app is open or installed and running. Crew bites you're going to get a nudge an
// hour before; light-show fans get a heads-up two minutes before the first show at 7 pm.
// Real push (to a closed app) needs Supabase plus a push service; see SPEC.md.
import * as S from './store.js';
import { prefs, setPref } from './prefs.js';
import { LIGHT_SHOWS, now } from './shows.js';
import { toast } from './ui.js';
import { go } from './go.js';

let reg = null, timers = [];
export async function registerSW(){
  if (!('serviceWorker' in navigator)) return;
  try{ reg = await navigator.serviceWorker.register('sw.js'); }catch(_){}
}
async function notify(title, body, url){
  if (!('Notification' in window) || Notification.permission!=='granted') return;
  const opts = { body, icon:'icon-192.png', badge:'icon-192.png', data:{ url: url||location.origin } };
  try{ const r = reg || await navigator.serviceWorker?.getRegistration(); if (r){ await r.showNotification(title, opts); return; } }catch(_){}
  try{ new Notification(title, opts); }catch(_){}
}
// next "first show minus two minutes" in Dubai time, as a timestamp
function nextShowHeadsUp(){
  const [h, m] = LIGHT_SHOWS.start.split(':').map(Number);
  const f = new Intl.DateTimeFormat('en-CA', { timeZone:LIGHT_SHOWS.timezone, year:'numeric', month:'2-digit', day:'2-digit' });
  const today = f.format(now());   // YYYY-MM-DD in Dubai
  const at = new Date(`${today}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+04:00`).getTime() - 2*60e3;
  return at > now().getTime() ? at : at + 864e5;
}
export function scheduleReminders(){
  timers.forEach(clearTimeout); timers = [];
  if (!prefs().notify || !('Notification' in window) || Notification.permission!=='granted' || !S.me()) return;
  const t0 = now().getTime(), me = S.me();
  S.events({upcoming:true}).filter(ev=>ev.rsvps[me.id]==='going').forEach(ev=>{
    const at = new Date(ev.when).getTime() - 3600e3, v = S.venue(ev.venueId);
    if (at > t0 && at - t0 < 864e5) timers.push(setTimeout(()=>notify(`${v?v.name:'Crew bite'} in an hour`, ev.note || 'The crew is meeting soon.'), at - t0));
  });
  if (prefs().shows){
    const at = nextShowHeadsUp();
    if (at - t0 < 864e5) timers.push(setTimeout(()=>notify('Burj Khalifa light show at 7', 'Open the map to watch it light up.'), at - t0));
  }
}
go.scheduleReminders = scheduleReminders;
go.setNotify = async on=>{
  if (!on){ setPref('notify', false); scheduleReminders(); return true; }
  if (!('Notification' in window)){ toast("This browser can't show notifications"); return false; }
  const p = await Notification.requestPermission();
  if (p !== 'granted'){ setPref('notify', false); toast('Notifications are blocked for this site'); return false; }
  setPref('notify', true); scheduleReminders();
  notify('Reminders are on', "We'll nudge you before crew bites.");
  return true;
};
