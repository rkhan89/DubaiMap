// Phase 3 (own design, no Stitch frames): crew events ("plan a bite"), check-ins and share links.
import { APP } from './config.js';
import * as S from './store.js';
import * as MAP from './map.js';
import { esc, plural, todayISO, fmtDate } from './data.js';
import { avatarHTML, avatarStack } from './avatar.js';
import { icon, toast, pointsToast, openSheet, back, seg, bindSeg, share, askWho } from './ui.js';
import { POINTS } from './stats.js';
import { go } from './go.js';

/* =========================================================
   SHARE LINKS: <origin>/?place=<id>, carrying the place's name, area, kind and spot so
   the link works on a phone that has never seen it.
   ========================================================= */
export function placeLink(v){
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('place', v.id);
  {
    u.searchParams.set('n', v.name); u.searchParams.set('z', v.zone||'');
    if ((v.categories||[])[0]) u.searchParams.set('c', v.categories[0]);
    if (typeof v.lat==='number'){ u.searchParams.set('lat', v.lat.toFixed(5)); u.searchParams.set('lng', v.lng.toFixed(5)); }
  }
  return u.toString();
}
export function sharePlace(v){
  const z = MAP.zoneById(v.zone);
  // the tagline doubles as the sign-off when you've actually been
  const been = S.entries({venueId:v.id, userId:S.me()?.id, kind:'visit'}).length > 0;
  return share({ title:v.name, text:`${been ? APP.tagline+': ' : ''}${v.name}, ${z?z.label:APP.city}. On ${APP.name}:`, url:placeLink(v) });
}
// read ?place=… on arrival; returns the venue id to open (creating the place if it's new here)
export function takeSharedPlace(){
  const q = new URLSearchParams(location.search), id = q.get('place');
  if (!id) return null;
  history.replaceState(null, '', location.pathname);
  return { id, n:q.get('n'), z:q.get('z'), c:q.get('c'), lat:q.get('lat'), lng:q.get('lng') };
}
export function openSharedPlace(p){
  if (!p || !S.me()) return;
  let v = S.venue(p.id);
  if (!v && p.n){
    v = S.addVenue({ name:p.n, zone:MAP.zoneById(p.z) ? p.z : 'downtown', categories:p.c?[p.c]:['coffee'],
      lat:p.lat?+p.lat:null, lng:p.lng?+p.lng:null, address:'' });
  }
  if (!v){ toast("That place isn't on this map yet"); return; }
  go.refresh();
  go.showOnMap(v.id);
  setTimeout(()=>go.place(v.id), 700);
}

/* =========================================================
   EVENTS: plan a bite with the crew, RSVP, add to calendar
   ========================================================= */
const whenText = w => { const d = new Date(w); return d.toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'}) + ' • ' + d.toLocaleTimeString('en-GB',{hour:'numeric', minute:'2-digit', hour12:true}).toLowerCase(); };
const going = ev => Object.entries(ev.rsvps||{}).filter(([,s])=>s==='going').map(([id])=>S.user(id)).filter(Boolean);
function localInput(d){ const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

export function planBite(venueId, after){
  const crew = S.myCrew();
  let v = venueId ? S.venue(venueId) : null;
  const start = new Date(Date.now()+864e5); start.setHours(19, 30, 0, 0);
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><span class="round-btn" style="width:44px;height:44px;box-shadow:none;background:var(--gold-fixed)">${icon('event')}</span>
        <div class="grow"><h2 class="h-md">Plan a crew bite</h2><span class="hand">${crew?`Everyone in ${esc(crew.name)} gets the invite`:'Start a crew to invite friends'}</span></div></div>
      <div class="eyebrow">Where</div>
      <label class="search mt8">${icon('storefront')}<input id="evQ" placeholder="Search a place" value="${esc(v?v.name:'')}" autocomplete="off"></label>
      <div class="stack mt8" id="evRes"></div>
      <div class="eyebrow mt16">When</div>
      <input class="input mt8" type="datetime-local" id="evWhen" value="${localInput(start)}" min="${localInput(new Date())}">
      <div class="eyebrow mt16">Note (optional)</div>
      <input class="input mt8" id="evNote" maxlength="80" placeholder="Late karak run, who's in?">
      <div class="sheet-foot"><button class="btn btn-gold btn-block" id="evGo">${icon('send')}Send to the crew</button></div>`;
    const q = body.querySelector('#evQ'), res = body.querySelector('#evRes');
    const search = ()=>{
      const list = q.value.trim() && (!v || q.value!==v.name) ? S.searchVenues(q.value, 5) : [];
      res.innerHTML = list.map(x=>`<button class="search-result" data-v="${x.id}"><span class="grow"><b>${esc(x.name)}</b> <span class="muted small">${esc(MAP.zoneById(x.zone)?.label||'')}</span></span></button>`).join('');
      res.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ v = S.venue(b.dataset.v); q.value = v.name; res.innerHTML=''; });
    };
    q.oninput = ()=>{ v = null; search(); };
    body.querySelector('#evGo').onclick = ()=>{
      if (!v) return toast('Pick a place first');
      const when = body.querySelector('#evWhen').value;
      if (!when || new Date(when).getTime() < Date.now()-60e3) return toast('Pick a time in the future');
      const ev = S.addEvent({ venueId:v.id, when, note:body.querySelector('#evNote').value.trim() });
      back(); toast(crew ? `Invite sent to ${crew.name}` : 'Saved to your plans'); go.refresh(); go.scheduleReminders && go.scheduleReminders();
      after && after(ev);
    };
  });
}
go.planBite = planBite;

function icsFor(ev, v){
  const d = new Date(ev.when), end = new Date(d.getTime()+90*60e3);
  const f = x=>x.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const z = MAP.zoneById(v.zone);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//'+APP.name+'//EN','BEGIN:VEVENT','UID:'+ev.id+'@'+location.host,'DTSTAMP:'+f(new Date()),
    'DTSTART:'+f(d),'DTEND:'+f(end),'SUMMARY:'+v.name+' with the crew','LOCATION:'+v.name+', '+(z?z.label:APP.city)+', Dubai',
    'DESCRIPTION:'+(ev.note||'')+' '+placeLink(v),'END:VEVENT','END:VCALENDAR'].join('\r\n');
}
export function eventSheet(id, after){
  openSheet(body=>{
    const paint = ()=>{
      const ev = S.event(id); if (!ev){ back(); return; }
      const v = S.venue(ev.venueId), me = S.me(), host = S.user(ev.createdBy), mine = ev.rsvps[me.id]||'';
      const z = v && MAP.zoneById(v.zone), ppl = going(ev), maybe = Object.entries(ev.rsvps).filter(([,s])=>s==='maybe').map(([u])=>S.user(u)).filter(Boolean);
      body.innerHTML = `<div class="event-ticket paper"><span class="tape"></span>
          <span class="eyebrow">${host.id===me.id?'You planned':`${esc(host.name||host.handle)} planned`}</span>
          <h2 class="h-lg mt4">${esc(v?v.name:'A place')}</h2>
          <div class="row muted mt4" style="gap:6px">${icon('schedule')}${esc(whenText(ev.when))}</div>
          <div class="row muted mt4" style="gap:6px">${icon('location_on')}${esc(z?z.label:APP.city)}</div>
          ${ev.note?`<p class="mt12">“${esc(ev.note)}”</p>`:''}
        </div>
        <div class="row between mt16"><span class="eyebrow">Going (${ppl.length})</span>${maybe.length?`<span class="mono muted small">${maybe.length} maybe</span>`:''}</div>
        <div class="row mt8" style="flex-wrap:wrap;gap:10px">${ppl.map(u=>`<span class="row" style="gap:6px">${avatarHTML(u,30)}<span class="small">${u.id===me.id?'You':esc(u.name||u.handle)}</span></span>`).join('') || '<span class="muted small">Nobody yet</span>'}</div>
        <div class="eyebrow mt20">Are you in?</div>
        ${seg('rsvp', [['going','Going','check_circle'],['maybe','Maybe','help'],['no','Can’t','cancel']], mine).replace('class="seg"','class="seg mt8"')}
        <div class="btn-grid mt16"><button class="btn btn-soft" id="evCal">${icon('calendar_add_on')}Calendar</button><button class="btn btn-soft" id="evShare">${icon('ios_share')}Share</button></div>
        <button class="btn btn-soft btn-block mt12" id="evPlace">${icon('storefront')}See the place</button>
        ${host.id===me.id?`<button class="btn btn-danger btn-block mt12" id="evCancel">${icon('event_busy')}Cancel this plan</button>`:''}`;
      bindSeg(body, 'rsvp', s=>{ S.rsvp(id, s); toast(s==='going'?'See you there!':s==='maybe'?'Marked as maybe':'Maybe next time'); go.refresh(); go.scheduleReminders && go.scheduleReminders(); paint(); after && after(); });
      body.querySelector('#evCal').onclick = ()=>{
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([icsFor(ev, v)], {type:'text/calendar'})); a.download = 'crew-bite.ics';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
      };
      body.querySelector('#evShare').onclick = ()=>share({ title:`${v.name} with the crew`, text:`${v.name}, ${whenText(ev.when)}. ${ev.note||''}`.trim(), url:placeLink(v) });
      body.querySelector('#evPlace').onclick = ()=>{ back(); setTimeout(()=>go.place(v.id), 60); };
      const c = body.querySelector('#evCancel'); if (c) c.onclick = ()=>{ S.cancelEvent(id); back(); toast('Plan cancelled'); go.refresh(); after && after(); };
    };
    paint();
  });
}
go.eventSheet = eventSheet;

export function eventRowHTML(ev){
  const v = S.venue(ev.venueId), ppl = going(ev), me = S.me(), mine = (ev.rsvps||{})[me.id];
  const d = new Date(ev.when);
  return `<button class="event-row" data-event="${ev.id}">
    <span class="ev-date"><b>${d.getDate()}</b><small>${d.toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</small></span>
    <span class="grow" style="min-width:0"><b class="trunc" style="display:block">${esc(v?v.name:'A place')}</b>
      <span class="muted small">${esc(d.toLocaleTimeString('en-GB',{hour:'numeric', minute:'2-digit', hour12:true}).toLowerCase())} • ${plural(ppl.length,'going','going')}</span></span>
    ${avatarStack(ppl, 26, 3)}${mine==='going'?`<span class="tag green">${icon('check')}In</span>`:mine?'':'<span class="tag">RSVP</span>'}
  </button>`;
}
// crew screen: upcoming bites
go.eventsCard = ()=>{
  const evs = S.events({upcoming:true});
  return `<div class="card mt12"><div class="row between"><span class="h-sm">${icon('event')} Upcoming bites</span><button class="btn btn-ghost btn-sm" id="evNew">${icon('add')}Plan one</button></div>
    ${evs.length ? `<div class="stack mt8">${evs.slice(0,4).map(eventRowHTML).join('')}</div>` : '<p class="muted small mt8">Nothing planned. Pick a place and a time, and the crew gets the invite.</p>'}</div>`;
};
go.bindEventsCard = (el, repaint)=>{
  const n = el.querySelector('#evNew'); if (n) n.onclick = ()=>planBite(null, repaint);
  el.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>eventSheet(b.dataset.event, repaint));
};

/* =========================================================
   CHECK-INS: "I'm here" when your phone agrees you're at the place
   ========================================================= */
const CHECKIN_M = 300;             // metres from the exact spot
const AREA_M = 1500;               // places without an exact spot: within the area
// development only: ?at=lat,lng fakes your location (never on the live site, or check-ins could be faked)
function devLocation(){ if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null; const at = new URLSearchParams(location.search).get('at'); if (!at) return null; const [lat,lng] = at.split(',').map(Number); return isNaN(lat)||isNaN(lng) ? null : {lat,lng}; }
function whereAmI(){
  const fake = devLocation(); if (fake) return Promise.resolve(fake);      // development: ?at=lat,lng
  return new Promise((res, rej)=>{
    if (!navigator.geolocation) return rej(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude, lng:p.coords.longitude}), e=>rej(e), {enableHighAccuracy:true, timeout:15000, maximumAge:30000});
  });
}
function metres(a, b){
  const R = 6371e3, t = x=>x*Math.PI/180, dLat = t(b.lat-a.lat), dLng = t(b.lng-a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
export async function checkIn(venueId, after){
  const v = S.venue(venueId), me = S.me(); if (!v || !me) return;
  if (S.entries({venueId, userId:me.id, kind:'visit'}).some(e=>e.checkin && e.date===todayISO())) return toast('Already checked in here today');
  toast('Finding you…');
  let here;
  try{ here = await whereAmI(); }
  catch(e){ return toast(e && e.code===1 ? 'Location permission is off for this site' : "Couldn't get your location"); }
  const exact = typeof v.lat==='number', z = MAP.zoneById(v.zone);
  const target = exact ? {lat:v.lat, lng:v.lng} : (z ? {lat:z.lat, lng:z.lng} : null);
  const d = target ? metres(here, target) : Infinity, limit = exact ? CHECKIN_M : AREA_M;
  if (d > limit){
    const km = d>=1000 ? (d/1000).toFixed(1)+' km' : Math.round(d)+' m';
    return toast(`You're ${km} away. Check-ins work when you're there.`, 'Log it', ()=>go.log({venueId}), 5000);
  }
  const firstHere = !S.entries({venueId, userId:me.id, kind:'visit'}).length;
  askWho({ title:'Check in at '+v.name, action:'Check in' }, sel=>{
  const crew = S.myCrew(), firstCrew = S.firstInCrew(venueId) && !!crew && sel.includes(crew.id);
  const e = S.addEntry({ venueId, kind:'visit', checkin:true, date:todayISO(), crewIds:sel });
  const parts = [firstHere?[POINTS.newPlace,'New place']:[POINTS.repeat,'Repeat visit'], [POINTS.checkin,'Checked in']];
  if (firstCrew) parts.push([POINTS.firstInCrew,'First in the crew']);
  S.addPoints(parts.reduce((s,p)=>s+p[0],0));
  go.refresh(); pointsToast(parts);
  setTimeout(()=>toast('Checked in! Add a rating and photos?', 'Add', ()=>go.log({entryId:e.id}), 5000), 3300);
  setTimeout(()=>go.checkBadges && go.checkBadges(), 8600);
  after && after();
  });
}
go.checkIn = checkIn;
