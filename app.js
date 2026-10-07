// App shell: map (Me / Crew modes, stamps, peek card), list feed, filters, profile, nav.
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import { CATEGORIES, MEALS, catById, iconSvg, esc, fmtRating, ago, agoLong, plural } from './data.js';
import { avatarHTML, avatarStack, spriteSvg, DEFAULT_AVATAR } from './avatar.js';
import { $, $$, icon, toast, openSheet, back, closeAll, stampHTML, catChip, seg, bindSeg, toggleHTML, bindToggle, ratingPill, catPickerHTML, bindCatPicker } from './ui.js';
import { go, state } from './go.js';
import { applyTheme, onTheme, themePref, setThemePref } from './theme.js';
import { showState, now } from './shows.js';
import './onboarding.js';
import './crew.js';
import './place.js';
import './book.js';
import { primeBadges } from './badges.js';
import './profile.js';
import './social.js';
import './recap.js';
import './share.js';
import { prefs, setPref } from './prefs.js';
import { takeSharedPlace, openSharedPlace, eventSheet } from './events.js';
import { registerSW, scheduleReminders } from './notify.js';
import { maybeStartTour, paintEmptyMap } from './tour.js';
import { readIncoming, pendingShares, takeShare, takeAllShares, shareText } from './incoming.js';
import './errors.js';
import './tapein.js';
import { paintStrip, onThisDay, openMemory } from './memories.js';
import './rate.js';
import './critterui.js';
import { favouriteBadge } from './critterui.js';
import { colorOf } from './pincolor.js';

const scopeKey = 'bites-scope';
state.scope = (()=>{ const s=M.defaultScope(); try{ const p=JSON.parse(localStorage.getItem(scopeKey)); if (p && p.mode) s.mode=p.mode; }catch(_){} return s; })();
const scope = ()=> state.scope;
function saveScope(){ try{ localStorage.setItem(scopeKey, JSON.stringify({mode:scope().mode})); }catch(_){} }

/* =========================================================
   BRAND
   ========================================================= */
function applyBrand(){
  document.title = APP.name;
  $('#brandName').setAttribute('aria-label', APP.name);
  $('#brandTag').textContent = APP.tagline;
}
function paintProfileButtons(){
  const me=S.me();
  $$('.profile-btn').forEach(b=>{ b.innerHTML = me ? avatarHTML(me, 44) : icon('person'); });
}
document.addEventListener('click', e=>{
  const b=e.target.closest('[data-act="profile"]'); if (b){ e.preventDefault(); go.profile(); }
  const bk=e.target.closest('[data-act="back"]'); if (bk){ e.preventDefault(); back(); }
});

/* =========================================================
   MAP: stamps + overlays
   ========================================================= */
const PRIO = { crew:5, visited:4, private:3.5, want:3, unlit:0 };
let modelCache = [];
function stampItems(){
  modelCache = M.mapModel(scope());
  return modelCache.map(sum=>({ id:sum.v.id, w:MAP.placeWorld(sum.v), prio:PRIO[sum.state] + (sum.rating||0)/10 + sum.visitorIds.length/100,
    faint:sum.state==='unlit', zone:sum.v.zone, label:sum.v.name, rating:sum.rating, recent:sum.latest?sum.latest.createdAt:0, data:sum }));
}
function renderStamp(cl){
  if (cl.kind==='area' || cl.items.length>1){
    const cats=[...new Set(cl.items.flatMap(i=>i.data.v.categories||[]))];
    return stampHTML('cluster', {count:cl.items.length, cats});
  }
  const sum=cl.items[0].data, v=sum.v, st=sum.state;
  // whose pin: the latest visit in this view (or the latest save, for a place to try)
  const last = sum.visits.slice().sort((a,b)=>b.createdAt-a.createdAt)[0] || sum.latest;
  const owner = st!=='unlit' && last ? S.user(last.userId) : null;
  const ring = owner ? colorOf(owner.id) : null;
  return stampHTML(st, {
    cat:M.primaryCat(v),
    visits: st==='visited' ? (sum.myVisitCount||sum.visitCount) : 0,
    rating: st==='crew' ? sum.rating : (sum.myRating||sum.rating),
    ring,
    // faces only in crew view (in Me view they're all yours)
    head: owner && scope().mode==='crew' ? avatarHTML(owner, 18) + favouriteBadge(owner.id, 32) : '',
  });
}
function rebuild(){
  if (!S.me()) return;
  const sc=scope();
  const crew=S.myCrew(), members=S.crewMembers();
  // stamps
  MAP.setStamps(stampItems());
  const counts={}; modelCache.forEach(s=>{ if (s.state!=='unlit') counts[s.v.zone]=(counts[s.v.zone]||0)+1; });
  MAP.setAreaCounts(counts);
  MAP.setZoneTint(prefs().zones ? Object.fromEntries(Object.entries(counts).map(([z,n])=>[z, Math.min(1, n/5)])) : null);
  // mode toggle, with how many places each side shows
  const meN = sc.mode==='me' ? modelCache.filter(s=>s.state!=='unlit').length : M.mapModel({...sc, mode:'me', members:null}).filter(s=>s.state!=='unlit').length;
  const crewN = sc.mode==='crew' ? modelCache.filter(s=>s.state!=='unlit').length : M.mapModel({...sc, mode:'crew'}).filter(s=>s.state!=='unlit').length;
  $('#mapMode').innerHTML = `<button data-v="me" class="${sc.mode==='me'?'on':''}">Me <em>${meN}</em></button><button data-v="crew" class="${sc.mode==='crew'?'on':''}"${S.myCrews().length>1?` aria-label="${esc(S.myCrew().name)}: tap again to switch crew"`:''}>${crewLabel()} <em>${crewN}</em></button>`;
  paintBell();
  paintStrip();
  paintEmptyMap(meN + crewN);
  // filter dot
  const filtered = isFiltered();
  $('#btnFilter').classList.toggle('filtered', filtered);
  if (state.view==='list') renderList();
  paintProfileButtons();
}
function isFiltered(){ const sc=scope(); return !!(sc.cats || sc.meals || sc.members || sc.privacy!=='all' || !sc.status.been || !sc.status.want); }
let rebuildT=null;
function scheduleRebuild(){ clearTimeout(rebuildT); rebuildT=setTimeout(rebuild, 40); }
go.refresh = scheduleRebuild;

// in several crews the Crew button shows which one (tap it again to switch)
function crewLabel(){ const cs=S.myCrews(); if (cs.length<2) return 'Crew'; const n=S.myCrew().name; return esc(n.length>9 ? n.slice(0,8)+'…' : n)+' ▾'; }
function pickCrew(){
  openSheet(body=>{
    const active=S.myCrew();
    body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">Crew map</span><h2 class="h-md">Show which crew?</h2></div></div>
      <div class="stack mt12">${S.myCrews().map(c=>`<button class="search-result${c.id===active.id?' on':''}" data-crew="${c.id}"><span class="sr-ico">${icon('groups','',c.id===active.id)}</span><span class="grow"><b class="trunc" style="display:block">${esc(c.name)}</b><span class="muted small">${plural(c.memberIds.length,'member')}</span></span>${c.id===active.id?icon('check'):''}</button>`).join('')}</div>`;
    body.querySelectorAll('[data-crew]').forEach(b=>b.onclick=()=>{ S.setActiveCrew(b.dataset.crew); scope().members=null; saveScope(); back(); rebuild(); toast('Showing '+S.myCrew().name); });
  });
}
$('#mapMode').addEventListener('click', e=>{
  const b=e.target.closest('button'); if (!b) return;
  if (b.dataset.v==='crew' && scope().mode==='crew' && S.myCrews().length>1) return pickCrew();
  scope().mode=b.dataset.v; scope().members=null; saveScope(); hidePeek(); rebuild();
});

/* ---------- bell: recent crew activity (nothing about it lives on the map) ---------- */
const SEEN_KEY='bites-activity-seen';
const seenAt = ()=>{ try{ return +localStorage.getItem(SEEN_KEY)||0; }catch(_){ return 0; } };
function crewActivity(){
  const me=S.me(); if (!me) return [];
  const logs = M.activity(40).filter(a=>a.u.id!==me.id).map(a=>({...a, at:a.e.createdAt}));
  const plans = S.events({upcoming:true}).filter(ev=>ev.createdBy!==me.id).map(ev=>({ ev, u:S.user(ev.createdBy), v:S.venue(ev.venueId), at:ev.createdAt })).filter(a=>a.u && a.v);
  // someone tagged you: "Maya tagged you at Ravi" (from any of your crews)
  const tags = S.taggedMe().map(e=>({ e, tag:true, u:S.user(e.userId), v:S.venue(e.venueId), at:e.createdAt })).filter(a=>a.u && a.v);
  const tagged = new Set(tags.map(a=>a.e.id));
  // a memory from this day in an earlier month or year (yours, or a visit you were tagged on)
  const m = onThisDay(true), otd = m ? [{ otd:m, u:me, v:m.venue, at:new Date(new Date().toDateString()).getTime() }] : [];
  return [...otd, ...[...plans, ...tags, ...logs.filter(a=>!tagged.has(a.e.id))].sort((a,b)=>b.at-a.at).slice(0,20)];
}
function paintBell(){
  const acts=crewActivity(), fresh=acts.filter(a=>a.at>seenAt()).length;
  const dot=$('#btnBell .bell-dot'); dot.hidden = !fresh;
  $('#btnBell').setAttribute('aria-label', fresh ? `Crew activity, ${fresh} new` : 'Crew activity');
}
function openActivity(){
  const acts=crewActivity(), since=seenAt(), crew=S.myCrew();
  try{ localStorage.setItem(SEEN_KEY, String(Date.now())); }catch(_){}
  paintBell();
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">Crew activity</h2><span class="hand">${crew?esc(crew.name):'Your crew'}, newest first</span></div></div>
      ${acts.length ? `<div class="act-list">${acts.map(a=>{
        const z=MAP.zoneById(a.v.zone);
        if (a.otd){ return `<button class="act-row otd${a.at>since?' new':''}" data-otd="1"><span class="act-ico">${icon('history')}</span>
          <span class="grow"><span class="act-text"><b>${esc(a.otd.when)}</b> ${esc(a.otd.text)}</span><span class="act-sub">On this day • tap to open the page</span></span>${icon('auto_stories')}</button>`; }
        if (a.ev){ const d=new Date(a.ev.when); return `<button class="act-row${a.at>since?' new':''}" data-event="${a.ev.id}">${avatarHTML(a.u,40)}
          <span class="grow"><span class="act-text"><b>${esc(a.u.name||a.u.handle)}</b> planned <b>${esc(a.v.name)}</b></span>
          <span class="act-sub">${esc(d.toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'}))} • ${esc(d.toLocaleTimeString('en-GB',{hour:'numeric', minute:'2-digit', hour12:true}).toLowerCase())} • tap to RSVP</span></span>${icon('event')}</button>`; }
        const verb=a.tag?'tagged you at':a.e.kind==='want'?'saved':(a.e.checkin?'checked in at':'visited');
        return `<button class="act-row${a.at>since?' new':''}" ${a.tag && a.e.kind==='visit' && !S.myRatingOn(a.e.id) ? `data-rate-tag="${a.e.id}"` : ''} data-venue="${a.v.id}">${avatarHTML(a.u,40)}
          <span class="grow"><span class="act-text"><b>${esc(a.u.name||a.u.handle)}</b> ${verb} <b>${esc(a.v.name)}</b></span>
          <span class="act-sub">${a.tag && !S.myRatingOn(a.e.id) && a.e.kind==='visit' ? '<b class="act-cta">Add your rating</b> • ' : (a.tag?'You were there together • ':'')}${esc(z?z.label:APP.city)} • ${ago(a.e.createdAt)}${a.e.rating?` • ★ ${fmtRating(a.e.rating)}`:''}</span></span>${icon('chevron_right')}</button>`; }).join('')}</div>`
        : `<div class="empty">${icon('notifications_none')}<p class="muted">${crew?'When your crew logs or saves a place, it shows up here.':'Start a crew and their new places will show up here.'}</p></div>`}`;
    body.querySelectorAll('[data-rate-tag]').forEach(r=>r.addEventListener('click', ev=>{ ev.stopImmediatePropagation(); back(); setTimeout(()=>go.rate(r.dataset.rateTag, ()=>paintBell()), 60); }));
    body.querySelectorAll('[data-venue]').forEach(r=>r.addEventListener('click', ()=>{ back(); setTimeout(()=>go.showOnMap(r.dataset.venue), 60); }));
    body.querySelectorAll('[data-otd]').forEach(r=>r.addEventListener('click', ()=>{ const m=acts.find(a=>a.otd)?.otd; back(); if (m) setTimeout(()=>openMemory(m), 60); }));
    body.querySelectorAll('[data-event]').forEach(r=>r.addEventListener('click', ()=>{ back(); setTimeout(()=>eventSheet(r.dataset.event), 60); }));
  });
}
$('#btnBell').addEventListener('click', openActivity);
go.activity = openActivity;

/* ---------- peek card ---------- */
let peekId=null;
function showPeek(venueId){
  const v=S.venue(venueId); if (!v) return;
  const sum=M.venueSummary(v, {...scope(), members:null});
  peekId=venueId;
  const z=MAP.zoneById(v.zone);
  const latest = sum.latest && S.user(sum.latest.userId);
  let tag='', by='';
  if (sum.state==='crew') tag = sum.rating>=4.5 ? '<span class="tag green">Crew favourite</span>' : `<span class="tag green">${sum.visitorIds.length} in crew</span>`;
  else if (sum.state==='visited') tag = `<span class="tag">Visited${sum.myVisitCount>1?` ${sum.myVisitCount}x`:''}</span>`;
  else if (sum.state==='private') tag = `<span class="tag dark">${icon('lock','',true)}Only me</span>`;
  else if (sum.state==='want') tag = '<span class="tag">To try</span>';
  else tag = '<span class="tag soft">Undiscovered</span>';
  if (latest) by = `<span class="hand">${sum.latest.kind==='want'?'Saved':'Added'} by ${esc(latest.id===S.me().id?'you':latest.name||latest.handle)} ${agoLong(sum.latest.createdAt)}</span>`;
  const q = sum.noteEntry;
  const qu = q && S.user(q.userId);
  const photos = S.photos({venueId});
  $('#peek').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="peek-top">${tag}${by}</div>
    ${sum.rating?`<div class="peek-score">${fmtRating(sum.rating)}<span class="ms" style="font-size:16px">star</span></div>`:''}
    <h2 style="padding-right:${sum.rating?'64px':'0'}">${esc(v.name)}</h2>
    <div class="addr">${icon('location_on')}${esc(z?z.label:APP.city)}${(v.categories||[]).length?` • ${esc(catById(v.categories[0])?.label||'')}`:''}</div>
    ${q?`<div class="peek-quote">${avatarHTML(qu,34)}<q>${esc(q.notes)}</q>${photos.length?`<button class="btn btn-soft btn-sm" data-pk="view">View (${photos.length})</button>`:''}</div>`
       : (photos.length?`<div class="peek-quote"><span class="grow muted">${plural(photos.length,'photo')} from the crew</span><button class="btn btn-soft btn-sm" data-pk="view">View</button></div>`:'')}
    <div class="peek-btns">
      <button class="btn btn-soft" data-pk="open">${icon('menu_book')}Details</button>
      <button class="btn btn-gold" data-pk="log">${icon('add_a_photo')}Add Bite</button>
    </div>`;
  const p=$('#peek'); p.hidden=false; requestAnimationFrame(()=>p.classList.add('in'));
  MAP.setSelected(venueId);
}
// fly to a place, select it and show its peek card
go.showOnMap = (venueId)=>{
  const v=S.venue(venueId); if (!v) return;
  switchView('map');
  MAP.flyToWorld(MAP.placeWorld(v), 3.6);
  setTimeout(()=>showPeek(venueId), 350);
};
function hidePeek(){ const p=$('#peek'); MAP.setSelected(null); if (p.hidden) return; p.classList.remove('in'); peekId=null; setTimeout(()=>{ if (!p.classList.contains('in')) p.hidden=true; }, 280); }
$('#peek').addEventListener('click', e=>{
  const b=e.target.closest('[data-pk]');
  const id=peekId;
  if (!b){ if (e.target.closest('h2, .addr, .peek-top')) go.place(id); return; }
  if (b.dataset.pk==='open') go.place(id);
  if (b.dataset.pk==='log') go.log({venueId:id});
  if (b.dataset.pk==='view'){ const ps=S.photos({venueId:id}); if (ps.length) go.viewer(ps.map(p=>p.id), 0); }
});
// swipe the peek up for the full place sheet, down to dismiss
(function(){
  const p=$('#peek'); let y0=null;
  p.addEventListener('pointerdown', e=>{ if (e.target.closest('button')) return; y0=e.clientY; });
  p.addEventListener('pointerup', e=>{ if (y0===null) return; const dy=e.clientY-y0; y0=null; if (dy<-40 && peekId) go.place(peekId); else if (dy>50) hidePeek(); });
})();

/* ---------- cluster list ---------- */
function openClusterList(items){
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">${items.length} spots here</h2><span class="hand">Zoom in to split them up</span></div></div>
      <div class="stack">${items.map(i=>venueRowHTML(i.data)).join('')}</div>`;
    body.querySelectorAll('[data-venue]').forEach(r=>r.addEventListener('click', ()=>{ back(); setTimeout(()=>go.place(r.dataset.venue), 60); }));
  });
}
function venueRowHTML(sum){
  const v=sum.v, z=MAP.zoneById(v.zone);
  return `<button class="person-row" data-venue="${v.id}" style="text-align:left;width:100%">
    ${stampHTML(sum.state==='cluster'?'visited':sum.state, {cat:M.primaryCat(v), rating:0})}
    <span class="pr-main"><span class="pr-name trunc">${esc(v.name)}</span><span class="pr-sub">${esc(z?z.label:'')}${sum.visitorIds.length?` • ${plural(sum.visitorIds.length,'visitor')}`:''}</span></span>
    ${sum.rating?ratingPill(sum.rating):''}
  </button>`;
}
go.venueRowHTML = venueRowHTML;

/* ---------- area sheet (tap "Business Bay 3") ---------- */
function openArea(zoneId){
  const z=MAP.zoneById(zoneId); if (!z) return;
  const inZone = S.venues().filter(v=>v.zone===zoneId).map(v=>M.venueSummary(v, scope()));
  const lit = inZone.filter(s=>s.state!=='unlit' && M.passes(s, scope())).sort((a,b)=>PRIO[b.state]-PRIO[a.state] || b.rating-a.rating);
  const unlit = inZone.filter(s=>s.state==='unlit');
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">${scope().mode==='me'?'Your':'Crew'} places in</span><h2 class="h-lg">${esc(z.label)}</h2><span class="hand">${plural(lit.length,'spot')} stamped${unlit.length?`, ${unlit.length} undiscovered`:''}</span></div></div>
      <div class="stack">${lit.map(venueRowHTML).join('') || '<div class="empty"><span class="hand">Nobody’s been here yet</span></div>'}</div>
      ${unlit.length?`<div class="eyebrow mt24">Undiscovered nearby</div><div class="stack mt12">${unlit.slice(0,30).map(venueRowHTML).join('')}</div>`:''}
      <div class="sheet-foot btn-grid"><button class="btn btn-soft" id="aShow">${icon('map')}Show on map</button><button class="btn btn-gold" id="aAdd">${icon('add')}Log here</button></div>`;
    body.querySelectorAll('[data-venue]').forEach(r=>r.addEventListener('click', ()=>{ back(); setTimeout(()=>go.place(r.dataset.venue), 60); }));
    body.querySelector('#aShow').onclick=()=>{ back(); switchView('map'); const pts=lit.map(s=>MAP.placeWorld(s.v)); pts.length?MAP.fitPoints(pts,true):MAP.flyToWorld(MAP.placeWorld({id:'z',zone:zoneId})); };
    body.querySelector('#aAdd').onclick=()=>{ back(); go.log({zone:zoneId}); };
  });
}
go.area = openArea;

/* =========================================================
   FILTER SHEET (Me/Crew, members, categories, status, privacy)
   ========================================================= */
function openFilters(){
  const sc=scope();
  const draft = { mode:sc.mode, members:sc.members?new Set(sc.members):null, cats:sc.cats?new Set(sc.cats):null, meals:sc.meals?new Set(sc.meals):null, privacy:sc.privacy, status:{...sc.status} };
  const members=S.crewMembers();
  openSheet((body)=>{
    const paint=()=>{
      const n = M.mapModel({...draft}).filter(s=>s.state!=='unlit').length;
      body.innerHTML = `
      <div class="sheet-head"><span class="round-btn" style="width:44px;height:44px;box-shadow:none;background:var(--gold-fixed)">${icon('filter_list')}</span>
        <div class="grow"><h2 class="h-md">Filter the map</h2></div>
        <button class="btn btn-ghost btn-sm" data-f="clear">Clear all</button></div>
      <div class="eyebrow">1. View mode</div>
      <div class="seg seg-white mt8" data-f="mode"><button data-v="me" class="${draft.mode==='me'?'on':''}">${icon('person')}Me Mode</button><button data-v="crew" class="${draft.mode==='crew'?'on':''}">${icon('groups')}Crew View</button></div>
      ${members.length>1?`<div class="row between mt24"><span class="eyebrow">2. Members</span><span class="hand">${draft.mode==='crew'?`${members.length-1} friends in ${esc(APP.city)}`:'Applies in Crew view'}</span></div>
      <div class="chip-scroll mt8" data-f="members"><button class="person-chip${!draft.members?' on':''}" data-m="all">${icon('done_all')}All <em>${M.mapModel({...draft, mode:'crew', members:null}).filter(s=>s.state!=='unlit').length}</em></button>${members.map(u=>`<button class="person-chip${draft.members&&draft.members.has(u.id)?' on':''}" data-m="${u.id}">${avatarHTML(u,30)}${esc(u.id===S.me().id?'You':u.name||u.handle)}</button>`).join('')}</div>`:''}
      <div class="eyebrow mt24">${members.length>1?3:2}. Categories</div>
      <div class="chip-wrap mt12" data-f="cats" id="fCats">${(()=>{ const on=CATEGORIES.map(c=>c.id).filter(id=>!draft.cats||draft.cats.has(id)); return catPickerHTML(on, {open:body.dataset.catsOpen==='1', keep:CATEGORIES.map(c=>c.id).filter(id=>!on.includes(id))}); })()}</div>
      <div class="row between mt24"><span class="eyebrow">${members.length>1?4:3}. Meal</span><span class="hand">${draft.meals?'Tagged visits only':'Any time of day'}</span></div>
      <div class="chip-wrap mt12" data-f="meals">${MEALS.map(m=>`<button class="person-chip meal-chip${draft.meals&&draft.meals.has(m.id)?' on':''}" data-meal="${m.id}">${icon(m.icon)}${m.label}</button>`).join('')}</div>
      <div class="eyebrow mt24">${members.length>1?5:4}. Visit status</div>
      <div class="btn-grid mt12" data-f="status">
        <button class="radio-card${draft.status.been?' on':''}" data-s="been"><span class="rc-head">${icon('verified')}Been here<span class="grow"></span>${draft.status.been?icon('check_box','',true):icon('check_box_outline_blank')}</span><p style="margin-left:0">★★★★☆ <span class="hand">Rated</span></p></button>
        <button class="radio-card${draft.status.want?' on':''}" data-s="want"><span class="rc-head">${icon('bookmark')}Want to try<span class="grow"></span>${draft.status.want?icon('check_box','',true):icon('check_box_outline_blank')}</span><p style="margin-left:0"><span class="tag">To try ribbon</span></p></button>
      </div>
      <div class="eyebrow mt24">${members.length>1?6:5}. Privacy scope</div>
      <div class="opt-grid mt12" style="grid-template-columns:1fr 1fr 1fr" data-f="privacy">
        ${[['shared','Shared only','public'],['private','Private only','lock'],['all','All places','layers']].map(([v,l,ic])=>`<button class="opt-card${draft.privacy===v?' on':''}" data-p="${v}" style="flex-direction:column;justify-content:center;gap:6px;padding:12px 6px;font-family:var(--f-mono);font-size:12px;text-align:center">${icon(ic)}${l}</button>`).join('')}
      </div>
      <div class="person-row mt24" style="box-shadow:none;background:var(--sc-low)">${icon('format_color_fill')}<span class="pr-main"><span class="pr-name">Colour explored areas</span><span class="pr-sub">Areas with ${draft.mode==='me'?'your':'crew'} places glow gold</span></span>${toggleHTML('fZones', prefs().zones, 'Colour explored areas')}</div>
      <div class="sheet-foot"><button class="btn btn-gold btn-block" data-f="apply">${icon('check_circle')}Apply filters (${plural(n,'place')})</button></div>`;
      bindCatPicker(body.querySelector('#fCats'), body);
    };
    paint();
    body.addEventListener('click', e=>{
      if (e.target.closest('#fZones')){ const on=!prefs().zones; setPref('zones', on); e.target.closest('#fZones').classList.toggle('on', on); rebuild(); return; }
      const t=e.target.closest('button'); if (!t) return;
      const f=t.closest('[data-f]')?.dataset.f || t.dataset.f;
      if (f==='clear'){ draft.members=null; draft.cats=null; draft.meals=null; draft.privacy='all'; draft.status={been:true,want:true}; }
      else if (f==='mode' && t.dataset.v){ draft.mode=t.dataset.v; }
      else if (f==='members'){ const id=t.dataset.m; if (id==='all') draft.members=null; else { draft.members=draft.members?new Set(draft.members):new Set(); draft.members.has(id)?draft.members.delete(id):draft.members.add(id); if (!draft.members.size) draft.members=null; } }
      else if (f==='cats' && t.dataset.cat){ const id=t.dataset.cat; const s=draft.cats?new Set(draft.cats):new Set(CATEGORIES.map(c=>c.id)); s.has(id)?s.delete(id):s.add(id); draft.cats = s.size===CATEGORIES.length?null:s; }
      else if (f==='meals' && t.dataset.meal){ const s=draft.meals?new Set(draft.meals):new Set(); s.has(t.dataset.meal)?s.delete(t.dataset.meal):s.add(t.dataset.meal); draft.meals=s.size?s:null; }
      else if (f==='status' && t.dataset.s){ draft.status[t.dataset.s]=!draft.status[t.dataset.s]; if (!draft.status.been && !draft.status.want) draft.status[t.dataset.s==='been'?'want':'been']=true; }
      else if (f==='privacy' && t.dataset.p){ draft.privacy=t.dataset.p; }
      else if (f==='apply'){ Object.assign(scope(), draft); saveScope(); back(); rebuild(); return; }
      else return;
      const st=body.scrollTop; paint(); body.scrollTop=st;
    });
  });
}
$('#btnFilter').addEventListener('click', openFilters);
go.filters = openFilters;

/* =========================================================
   LIST VIEW (feed)
   ========================================================= */
let listQuery='', listSort='recent', listCat=null;
function renderList(){
  const el=$('#listView'); const sc=scope(); const crew=S.myCrew();
  const meCount = M.mapModel({...sc, mode:'me', members:null}).filter(s=>s.state!=='unlit').length;
  const crewCount = M.mapModel({...sc, mode:'crew'}).filter(s=>s.state!=='unlit').length;
  let items = modelCache.filter(s=>s.state!=='unlit');
  const byCat={}; items.forEach(s=>(s.v.categories||[]).forEach(c=>byCat[c]=(byCat[c]||0)+1));
  if (listCat) items = items.filter(s=>(s.v.categories||[]).includes(listCat));
  const q=listQuery.trim().toLowerCase();
  if (q) items = items.filter(s=>{ const z=MAP.zoneById(s.v.zone); return [s.v.name, z?z.label:'', ...s.entries.map(e=>e.notes||'')].join(' ').toLowerCase().includes(q); });
  const lastTs = s=>Math.max(0,...s.entries.map(e=>e.createdAt));
  if (listSort==='rating') items.sort((a,b)=>b.rating-a.rating);
  else if (listSort==='name') items.sort((a,b)=>a.v.name.localeCompare(b.v.name));
  else if (listSort==='visits') items.sort((a,b)=>b.visitCount-a.visitCount);
  else items.sort((a,b)=>lastTs(b)-lastTs(a));
  const cats = Object.keys(byCat).sort((a,b)=>byCat[b]-byCat[a]);
  const hidden = sc.mode==='crew' ? 0 : M.mapModel({...sc, privacy:'all', cats:null, status:{been:true,want:true}}).filter(s=>s.state!=='unlit').length - meCount;
  const unlitCount = modelCache.filter(s=>s.state==='unlit').length;
  el.innerHTML = `<div class="list-inner">
    <div class="search-row"><label class="search">${icon('search')}<input id="lq" type="search" placeholder="Search ${items.length} spots…" value="${esc(listQuery)}" aria-label="Search"></label>
      <button class="sq-btn${isFiltered()?' filtered':''}" id="lFilter" aria-label="Filters">${icon('tune')}</button></div>
    <div class="seg mt12" id="lMode"><button data-v="me" class="${sc.mode==='me'?'on':''}">Me <em>${meCount}</em></button><button data-v="crew" class="${sc.mode==='crew'?'on':''}">Crew <em>${crewCount}</em></button></div>
    <div class="chip-scroll mt12" id="lCats">
      <button class="person-chip${!listCat?' on':''}" data-c="" style="padding-left:16px">All <em>${modelCache.filter(s=>s.state!=='unlit').length}</em></button>
      ${cats.map(c=>`<button class="person-chip${listCat===c?' on':''}" data-c="${c}" style="padding-left:8px"><span style="width:26px;height:26px;display:flex">${iconSvg(c, catById(c).color)}</span>${esc(catById(c).label)} <em>${byCat[c]}</em></button>`).join('')}
    </div>
    <div class="feed-head"><span class="hand">${sc.mode==='crew' && crew ? `${esc(crew.name)} shared feed` : 'Your scrapbook'}</span>
      <select class="sort-sel" id="lSort" aria-label="Sort">${[['recent','Recent visits'],['rating','Top rated'],['visits','Most visited'],['name','A–Z']].map(([v,l])=>`<option value="${v}"${listSort===v?' selected':''}>${l}</option>`).join('')}</select></div>
    ${items.map(feedCardHTML).join('') || `<div class="empty">${stampHTML('unlit',{cat:'coffee', big:true})}<h3 class="h-md">${q?'Nothing matches that':'No stamps yet'}</h3><p class="muted">${q?'Try another name, area or dish.':'Pin your first place with the + button. It lands on your map as a stamp.'}</p></div>`}
    ${items.length?`<div class="feed-end"><span class="tag soft">${icon('local_activity')}End of scrapbook page</span><span class="hand">${hidden>0?`${plural(hidden,'more entry','more entries')} hidden by your filters`:`${unlitCount} undiscovered spots still on the map`}</span></div>`:''}
  </div>`;
  const lq=el.querySelector('#lq');
  lq.addEventListener('input', ()=>{ listQuery=lq.value; const pos=lq.selectionStart; renderList(); const n=$('#lq'); n.focus(); n.setSelectionRange(pos,pos); });
  el.querySelector('#lFilter').onclick=openFilters;
  el.querySelector('#lMode').addEventListener('click', e=>{ const b=e.target.closest('button'); if (!b) return; scope().mode=b.dataset.v; scope().members=null; saveScope(); rebuild(); });
  el.querySelector('#lCats').addEventListener('click', e=>{ const b=e.target.closest('[data-c]'); if (!b) return; listCat=b.dataset.c||null; renderList(); });
  el.querySelector('#lSort').onchange=e=>{ listSort=e.target.value; renderList(); };
  el.querySelectorAll('[data-venue]').forEach(c=>c.addEventListener('click', ()=>go.place(c.dataset.venue)));
}
function feedCardHTML(sum){
  const v=sum.v, cat=catById(M.primaryCat(v)), z=MAP.zoneById(v.zone);
  const ph = S.photos({venueId:v.id}).filter(p=>scope().mode==='crew' || p.userId===S.me().id)[0];
  const want = sum.state==='want';
  const priv = sum.state==='private' || (sum.hasPrivate && !sum.others.length);
  let quote='';
  if (sum.noteEntry){
    const u=S.user(sum.noteEntry.userId);
    quote = `<div class="fc-quote"><span class="hand">${u.id===S.me().id?'':esc(u.name||u.handle)+': '}“${esc(sum.noteEntry.notes)}”</span>${sum.visitorIds.length?avatarStack(sum.visitorIds.map(S.user).filter(Boolean),24,3):''}</div>`;
  } else if (want){
    const ws=sum.wantIds.map(S.user).filter(Boolean);
    const names = ws.map(u=>u.id===S.me().id?'you':u.name||u.handle);
    quote = `<div class="fc-quote">${icon('favorite')}<span class="grow">Saved by ${esc(names.slice(0,2).join(' & '))}${names.length>2?` +${names.length-2}`:''}</span>${avatarStack(ws,24,3)}</div>`;
  }
  return `<button class="feed-card${priv?' private':''}" data-venue="${v.id}">
    <span class="fc-thumb">${ph?`<img src="${esc(S.photoURL(ph))}" alt="" loading="lazy">`:iconSvg(cat.id, cat.color)}${priv?`<span class="fc-lock">${icon('lock','',true)}</span>`:(sum.rating?ratingPill(sum.rating):'')}</span>
    <span class="fc-main">
      <span class="fc-cat">${iconSvg(cat.id, cat.color)}${esc(cat.label)}${priv?` <span class="tag soft" style="margin-left:4px">${icon('lock')}Private</span>`:''}</span>
      <span class="fc-name trunc" style="display:block;padding-right:18px">${esc(v.name)}</span>
      <span class="fc-loc">${icon('location_on')}${esc(z?z.label:APP.city)}</span>
      ${quote}
    </span>
    ${want?'<span class="fc-ribbon">TO TRY</span>':`<span class="fc-chev">${icon('chevron_right')}</span>`}
  </button>`;
}

/* =========================================================
   NAV
   ========================================================= */
function switchView(v){
  state.view=v;
  $$('#nav [data-tab]').forEach(b=>b.classList.toggle('on', b.dataset.tab===v));
  $('#mapView').classList.toggle('active', v==='map');
  $('#listView').classList.toggle('active', v==='list');
  $('#listView').classList.toggle('list-view', true);
  if (v==='map'){ MAP.resize(); } else renderList();
  hidePeek();
}
go.switchView = switchView;
$('#nav').addEventListener('click', e=>{
  const b=e.target.closest('button'); if (!b) return;
  if (b.id==='navLog') return openPlus();
  const t=b.dataset.tab;
  if (t==='map'||t==='list') switchView(t);
  if (t==='crew') go.crew();
  if (t==='shelf') go.shelf();
});

/* the + menu: log a visit, or add a place you saw somewhere */
function openPlus(){
  openSheet(body=>{
    body.innerHTML = `<div class="stack">
      <button class="person-row" data-plus="log">${icon('add_a_photo')}<span class="pr-main"><span class="pr-name">Log a place I've been</span><span class="pr-sub">Rate it, add photos, stamp it on your map</span></span>${icon('chevron_right')}</button>
      <button class="person-row" data-plus="here">${icon('where_to_vote')}<span class="pr-main"><span class="pr-name">Check in where I am</span><span class="pr-sub">Anywhere in Dubai, even out in the desert. Uses your location once.</span></span>${icon('chevron_right')}</button>
      <button class="person-row" data-plus="link">${icon('add_link')}<span class="pr-main"><span class="pr-name">Add from link or text</span><span class="pr-sub">A Google Maps or TikTok link, a caption, or a name</span></span>${icon('chevron_right')}</button>
      ${S.inbox().length ? `<button class="person-row" data-plus="inbox">${icon('inbox')}<span class="pr-main"><span class="pr-name">Inbox</span><span class="pr-sub">${plural(S.inbox().length,'share')} waiting to be added</span></span><span class="tag">${S.inbox().length}</span></button>` : ''}
    </div>`;
    body.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{ const k=b.dataset.plus; back(); setTimeout(()=> k==='log' ? go.log({}) : k==='inbox' ? go.inbox() : k==='here' ? go.checkInHere() : go.shareAdd(), 80); });
  });
}
go.plus = openPlus;
// back online with shares waiting: a nudge
window.addEventListener('online', ()=>{ const n = S.me() ? S.inbox().length : 0; if (n) toast(`Back online. ${plural(n,'share')} waiting in your Inbox`, 'Open', ()=>go.inbox(), 6000); });

/* map controls */
$('#btnFit').onclick=()=>{ const pts=modelCache.filter(s=>s.state!=='unlit').map(s=>MAP.placeWorld(s.v)); pts.length?MAP.fitPoints(pts,true):MAP.fitCity(true); };
$('#btnLocate').onclick=()=>MAP.startTracking(true);



/* =========================================================
   BOOT
   ========================================================= */
async function boot(){
  if (new URLSearchParams(location.search).has('still')) document.documentElement.classList.add('still');
  onTheme(t=>{ MAP.setTheme(t); tickShow(); });
  MAP.setCars(prefs().cars);
  MAP.setTheme(applyTheme());
  setInterval(tickShow, 1000);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) tickShow(); });
  applyBrand();
  await S.init();
  S.onChange(what=>{ if (what==='quota') toast('Storage is full on this phone. Export a backup and remove some photos.'); if (what==='sync-error') toast('One change couldn’t be saved to your account, so it was undone.'); scheduleRebuild(); paintProfileButtons(); });
  MAP.initMap({
    wrap:$('#mapWrap'), canvas:$('#mapCanvas'), overlay:$('#mapOverlay'),
    renderStamp,
    initialPoints:()=>modelCache.filter(s=>s.state!=='unlit').map(s=>MAP.placeWorld(s.v)),
    onStampTap:(item)=>showPeek(item.id),
    onClusterList:(items)=>openClusterList(items),
    onAreaTap:(z)=>openArea(z),
    onMeTap:()=>go.editAvatar(),
    onEmptyTap:()=>hidePeek(),
    onDragStart:()=>hidePeek(),
    onLocation:(st)=>{
      const b=$('#btnLocate');
      b.classList.toggle('busy', st==='busy'); b.classList.toggle('on', st==='on');
      if (st==='outside') toast("You're outside the map. Come back to Dubai!");
      if (st==='denied') toast('Location permission is off for this site.');
      if (st==='error') toast("Couldn't get your location.");
    },
  });
  MAP.whenReady(()=>{ $('#mapLoading').classList.add('done'); });
  paintMe();
  const join = new URLSearchParams(location.search).get('join');
  if (join){ state.pendingJoin = join.toUpperCase(); history.replaceState(null,'',location.pathname); }
  state.pendingPlace = takeSharedPlace();
  state.sharesRead = readIncoming();          // something shared to Koko from the phone's Share menu
  registerSW();
  if (!S.isOnboarded()){ go.onboarding(); noteWaitingShare(); }
  else {
    rebuild(); primeBadges(); scheduleReminders();
    if (state.pendingJoin) go.inviteLanding(state.pendingJoin);
    else if (state.pendingPlace){ const p=state.pendingPlace; state.pendingPlace=null; MAP.whenReady(()=>openSharedPlace(p)); }
    else openWaitingShare(()=>MAP.whenReady(maybeStartTour));
  }
}
/* Burj Khalifa light shows (schedule in shows.js), recomputed from the clock every second */
function tickShow(){ MAP.setShow(prefs().shows ? showState(now()) : null); }
go.tickShow = tickShow;
go.closeAll = closeAll;
function paintMe(){ const me=S.me(); if (me) MAP.setMeSprite(spriteSvg({...DEFAULT_AVATAR, ...(me.avatar&&me.avatar.pixel||{})}, 3)); }
go.paintMe = paintMe;
go.afterOnboarding = ()=>{
  paintMe(); rebuild();
  MAP.whenReady(()=>{ MAP.fitCity(false); const pts=modelCache.filter(s=>s.state!=='unlit').map(s=>MAP.placeWorld(s.v)); if (pts.length) MAP.fitPoints(pts,false); });
  primeBadges(); scheduleReminders();
  if (state.pendingJoin){ const code=state.pendingJoin; state.pendingJoin=null; go.inviteLanding(code); }
  else if (state.pendingPlace){ const p=state.pendingPlace; state.pendingPlace=null; MAP.whenReady(()=>openSharedPlace(p)); }
  else openWaitingShare(()=>MAP.whenReady(maybeStartTour));
};
// a share waiting on this phone opens in "Add from link" (once you're signed in); otherwise carry on
async function openWaitingShare(otherwise){
  await state.sharesRead;
  // the newest opens now; any others shared meanwhile go to the Inbox
  const all = await takeAllShares();
  const item = all.pop() || null;
  all.forEach(s=>S.addToInbox({ sourceUrl:s.url||null, text:s.text, title:s.title }));
  if (all.length) setTimeout(()=>toast(`${plural(all.length,'more share')} saved to your Inbox`, 'Open', ()=>go.inbox()), item ? 2500 : 0);
  if (!item) return otherwise && otherwise();
  const prefill = shareText(item);
  if (prefill) go.shareAdd(prefill, item); else otherwise && otherwise();
}
// signed out: say the share is safe and will open after signing in
async function noteWaitingShare(){
  await state.sharesRead;
  if (!(await pendingShares()).length) return;
  const welcome = document.querySelector('#screens > .screen');
  if (!welcome || welcome.querySelector('.share-waiting')) return;
  const n = document.createElement('div'); n.className = 'note share-waiting';
  n.innerHTML = `${icon('bookmark_added')}<span><b>Your shared place is saved.</b> Sign in and it'll open, ready to add.</span>`;
  (welcome.querySelector('.screen-body') || welcome).prepend(n);
}
boot();
