// Place sheet (frame 13) and Check in (frame 14: one flow for a visit now or one in the past).
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import { CATEGORIES, MEALS, mealById, catById, iconSvg, esc, fmtRating, fmtDate, todayISO, plural } from './data.js';
import { avatarHTML, avatarStack } from './avatar.js';
import { $, icon, toast, openScreen, openSheet, back, closeAll, topbar, stampHTML, catChip, polaroidHTML, starInput, toggleHTML, bindToggle, ratingPill, share, compressImage, whoHTML, bindWho, whoDefault, whoText, askWho, catPickerHTML, bindCatPicker } from './ui.js';
import { go, state } from './go.js';
import { sharePlace, eventRowHTML, planBite, eventSheet } from './events.js';
import { whereAmI, locationError } from './locate.js';
import { haversine } from './catch.js';
import { placesApi, zoneFor } from './share.js';
import { overallHTML, miniStars, rateSheet } from './rate.js';
import * as RT from './ratings.js';

function whenText(e){
  const d=new Date(e.createdAt), days=Math.floor((Date.now()-e.createdAt)/864e5);
  const t=d.toLocaleTimeString('en-GB',{hour:'numeric', minute:'2-digit', hour12:true}).toUpperCase();
  if (days<1) return `Today • ${t}`;
  if (days<2) return `Yesterday • ${t}`;
  if (days<7) return `${days} days ago`;
  if (days<14) return 'Last week';
  return fmtDate(e.date);
}
function mapsURL(v){
  const z=MAP.zoneById(v.zone);
  const q = typeof v.lat==='number' ? `${v.lat.toFixed(6)},${v.lng.toFixed(6)}` : `${v.name}, ${z?z.label:''}, ${APP.city}`;
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
}

/* =========================================================
   13. PLACE SHEET
   ========================================================= */
// ratings from the people tagged on a visit, and "Your rating" if you're one of them
function taggedRatingsHTML(e, me){
  const people = RT.visitPeople(e, { kind:'friends' }, { meId:me.id, ratingsOf:S.ratingsOf }).filter(p=>!p.logger && p.rating && p.userId!==me.id);
  const mine = S.canRate(e) ? S.myRatingOn(e.id) : null;
  const rows = people.map(p=>{ const u=S.user(p.userId); return u ? `<div class="rv-rate">${avatarHTML(u,24)}<b>${esc(u.name||u.handle)}</b>${miniStars(p.rating)}${p.note?`<q>${esc(p.note)}</q>`:''}</div>` : ''; }).join('');
  const you = S.canRate(e) ? `<button class="rv-rate rv-mine" data-rate="${e.id}">${avatarHTML(me,24)}<b>You</b>${mine ? miniStars(mine.rating)+(mine.note?`<q>${esc(mine.note)}</q>`:'')+icon('edit') : `<span class="rp-add">${icon('add')}Add your rating</span>`}</button>` : '';
  return rows || you ? `<div class="rv-rates">${rows}${you}</div>` : '';
}
// "with @maya, @omar" under a visit; the person tagged can take themselves off
function withHTML(e, me){
  const ids=e.taggedIds||[]; if (!ids.length) return '';
  const names=ids.map(id=>id===me.id?'you':(S.user(id)?'@'+S.user(id).handle:null)).filter(Boolean);
  if (!names.length) return '';
  return `<div class="rv-with">${icon('group')}<span>with ${esc(names.join(', '))}</span>${ids.includes(me.id)&&e.userId!==me.id?`<button class="link small" data-untag="${e.id}">Not me</button>`:''}</div>`;
}
function placeScreen(venueId){
  const v=S.venue(venueId); if (!v) return;
  openScreen(el=>{
    const paint=()=>{
      const me=S.me(), crew=S.myCrew();
      const sum=M.venueSummary(v, {...state.scope, mode:'crew', members:null, privacy:'all'});
      const z=MAP.zoneById(v.zone), cat=catById(M.primaryCat(v));
      const visits=sum.visits.slice().sort((a,b)=>b.createdAt-a.createdAt);
      const mine=S.entries({venueId:v.id, userId:me.id});
      const minePrivate = mine.length && mine.every(e=>e.private);
      const mineWho = [...new Set(mine.flatMap(e=>e.private?[]:(e.crewIds&&e.crewIds.length?e.crewIds:(crew?[crew.id]:[]))))];
      const photos=S.photos({venueId:v.id});
      const wanters=sum.wantIds.map(S.user).filter(Boolean);
      el.innerHTML = topbar({title:'', center:true, actions:`<button class="icon-btn" id="pMore" aria-label="More">${icon('more_vert')}</button>`}) + `
      <div class="snap"><canvas id="pSnap"></canvas><span class="snap-pin">${icon('storefront')}${esc(v.name)}</span></div>
      <div class="place-body">
        <div class="sheet-handle" style="margin:0 auto 12px"></div>
        <div class="row" style="flex-wrap:wrap;gap:8px"><span class="tag">${iconSvg(cat.id,'#5e4000').replace('<svg','<svg width="14" height="14"')}${esc(cat.label)}</span>${sum.visitCount?`<span class="tag green">${icon('check_circle')}Visited ${sum.visitCount}x</span>`:''}${sum.state==='unlit'?'<span class="tag soft">Undiscovered</span>':''}${sum.meals.map(m=>`<span class="tag soft">${icon(mealById(m).icon)}${mealById(m).label}</span>`).join('')}</div>
        <h1 class="h-xl mt8">${esc(v.name)}</h1>
        <div class="row muted mt4" style="gap:6px">${icon('storefront')}${esc([z?z.label:APP.city, v.address].filter(Boolean).join(' • '))}</div>
        ${mine.length?`<div class="share-card mt20${minePrivate?' private':''}"><span class="sc-ico">${icon(minePrivate?'lock':'lock_open')}</span>
          <div class="grow"><b class="h-sm">${minePrivate?'Only you can see your log':esc(whoText(mineWho).replace(/.$/,''))}</b>
          <div class="muted small">${minePrivate?'Your notes & rating stay in your own scrapbook.':'They can see your notes, rating and photos here.'}</div></div>
          <button class="btn btn-soft btn-sm" id="pShare">Change</button></div>`:''}
        <div class="row between mt24"><span class="row h-md" style="gap:8px">Who’s been <span class="tag soft">${plural(visits.length,'visit')}</span></span>${overallHTML({ rating:sum.rating, raters:sum.raters }, sum.ratingScope==='crew'?'Crew':'Your')}</div>
        <div class="stack mt12">${visits.map(e=>{
          const u=S.user(e.userId), isMe=u.id===me.id;
          return `<div class="review" ${isMe?`data-edit="${e.id}" style="cursor:pointer"`:''}>
            <div class="review-head">${avatarHTML(u,44)}<div class="grow"><div class="rv-name">${isMe?'You':esc(u.name||u.handle)}<span>@${esc(u.handle)}</span>${e.private?` <span class="tag dark" style="margin-left:6px">${icon('lock')}Only me</span>`:''}</div><div class="rv-when">${whenText(e)}</div></div>${e.rating?ratingPill(e.rating):''}${isMe?icon('edit','','').replace('class="ms"','class="ms" style="color:var(--outline);font-size:18px"'):''}</div>
            ${e.notes?`<q>${esc(e.notes)}</q>`:''}
            ${withHTML(e, me)}
            ${taggedRatingsHTML(e, me)}
          </div>`;
        }).join('') || `<div class="card-soft center"><b>Nobody in your crew has been yet</b><p class="muted small mt8">Be the first to log it.</p></div>`}</div>
        ${wanters.length?`<div class="card-soft row mt16">${icon('bookmark')}<div class="grow"><b>Wants to try</b><div class="muted small">${plural(wanters.length,'crew friend')}${(()=>{ const L={google_maps:'from Google Maps',tiktok:'from TikTok',instagram:'from Instagram',text:'from a name'}; const ls=[...new Set(sum.wants.map(e=>L[e.sourceType]).filter(Boolean))]; return ls.length?' ('+ls.join(', ')+')':''; })()} saved this spot</div></div>${avatarStack(wanters,34,3)}</div>`:''}
${S.events({venueId:v.id, upcoming:true}).length?`<div class="card mt16"><span class="h-sm">${icon('event')} Crew plans here</span><div class="stack mt8">${S.events({venueId:v.id, upcoming:true}).map(eventRowHTML).join('')}</div></div>`:''}
        <div class="btn-grid mt16"><button class="btn btn-soft" id="pCheck">${icon('where_to_vote')}Check in</button><button class="btn btn-soft" id="pPlan">${icon('event')}Plan a bite</button></div>
        <button class="btn btn-soft btn-block mt12" id="pLog">${icon('add_a_photo')}${mine.some(e=>e.kind==='visit')?'Log another visit':'Log your visit'}</button>
        ${photos.length?`<div class="row between mt24"><span class="row h-md" style="gap:8px">${icon('photo_camera')}Photos</span><span class="muted small">${photos.length}</span></div>
        <div class="strip">${photos.map(p=>polaroidHTML({src:S.photoURL(p), caption:p.caption, id:p.id, badge:p.private?`<span class="pol-badge tr">${icon('lock')}Only me</span>`:''})).join('')}</div>`:''}
        <button class="btn btn-gold btn-block mt16" id="pSend">${icon('send')}Send to crew</button>
        <div class="btn-grid mt12"><a class="btn btn-soft" href="${mapsURL(v)}" target="_blank" rel="noopener">${icon('directions')}Directions</a><button class="btn btn-soft" id="pMap">${icon('map')}Show on map</button></div>
        ${!mine.some(e=>e.kind==='want') && !mine.some(e=>e.kind==='visit')?`<button class="btn btn-ghost btn-block mt8" id="pWant">${icon('bookmark_add')}Save to try later</button>`:''}
      </div>`;
      MAP.whenReady(()=>requestAnimationFrame(()=>{ const c=el.querySelector('#pSnap'); if (c) MAP.drawSnapshot(c, MAP.placeWorld(v), 6); }));
      const sh=el.querySelector('#pShare');
      if (sh) sh.onclick=()=>{ const mine=S.entries({venueId:v.id, userId:S.me().id}); askWho({ title:'Your log at '+v.name, action:'Save', sel:mineWho }, sel=>{ mine.forEach(e=>S.updateEntry(e.id,{crewIds:sel})); toast(whoText(sel)); go.refresh(); setTimeout(paint, 250); }); };
      el.querySelectorAll('[data-edit]').forEach(r=>r.onclick=e=>{ if (e.target.closest('[data-untag],[data-rate]')) return; logFlow({entryId:r.dataset.edit}); });
      el.querySelectorAll('[data-rate]').forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); rateSheet(b.dataset.rate, paint); });
      el.querySelectorAll('[data-untag]').forEach(b=>b.onclick=()=>{ S.untagMe(b.dataset.untag); toast('You’re off that visit'); go.refresh(); paint(); });
      el.querySelectorAll('.strip [data-photo]').forEach(f=>f.onclick=()=>go.viewer(photos.map(p=>p.id), photos.findIndex(p=>p.id===f.dataset.photo)));
      el.querySelector('#pLog').onclick=()=>logFlow({venueId:v.id});
      el.querySelector('#pSend').onclick=()=>sharePlace(v);
      el.querySelector('#pCheck').onclick=()=>go.log({ venueId:v.id, here:true });
      el.querySelector('#pPlan').onclick=()=>planBite(v.id, ()=>paint());
      el.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>eventSheet(b.dataset.event, paint));
      el.querySelector('#pMap').onclick=()=>{ closeAll(); go.switchView('map'); const w=MAP.placeWorld(v); MAP.flyToSeparate(w, S.venues().filter(x=>x.id!==v.id).map(x=>MAP.placeWorld(x)).filter(p=>Math.hypot(p.x-w.x,p.y-w.y)<60)); MAP.highlight(v.id); };
      const pw=el.querySelector('#pWant'); if (pw) pw.onclick=()=>askWho({ title:'Save '+v.name+' to try', action:'Save to try' }, sel=>{ S.addEntry({venueId:v.id, kind:'want', crewIds:sel}); toast('Saved to try. '+whoText(sel)); go.refresh(); paint(); });
      el.querySelector('#pMore').onclick=()=>moreMenu(v, paint);
    };
    paint();
  }, {cls:'place-screen'});
}
function moreMenu(v, after){
  const me=S.me();
  const canEdit = v.createdBy===me.id;
  const wants = S.entries({venueId:v.id, userId:me.id, kind:'want'});
  openSheet(body=>{
    body.innerHTML = `<h2 class="h-md">${esc(v.name)}</h2><div class="stack mt16">
      ${wants.length?`<button class="person-row" data-x="unwant">${icon('bookmark_remove')}<span class="pr-main"><span class="pr-name">Remove from want to try</span></span></button>`:''}
      ${canEdit?`<button class="person-row" data-x="edit">${icon('edit_location_alt')}<span class="pr-main"><span class="pr-name">Edit place details</span><span class="pr-sub">Name, area, exact spot</span></span></button>`:''}
      <button class="person-row" data-x="share">${icon('ios_share')}<span class="pr-main"><span class="pr-name">Share place</span></span></button></div>`;
    const q=s=>body.querySelector(`[data-x="${s}"]`);
    if (q('unwant')) q('unwant').onclick=async()=>{ for (const w of wants) await S.deleteEntry(w.id); back(); toast('Removed'); go.refresh(); after(); };
    if (q('edit')) q('edit').onclick=()=>{ back(); setTimeout(()=>editVenue(v, after), 60); };
    q('share').onclick=()=>{ back(); sharePlace(v); };
  });
}
go.place = placeScreen;

/* =========================================================
   PICK A SPOT ON THE MAP (used by new places)
   ========================================================= */
function pickOnMap(start, done){
  const screens=$('#screens');
  screens.style.visibility='hidden';
  go.switchView('map');
  MAP.setPicking(true);
  if (start) MAP.flyToWorld(start, 5);
  const finish=(ok)=>{
    MAP.setPicking(false); screens.style.visibility='';
    $('#pickConfirm').onclick=null; $('#pickCancel').onclick=null;
    done(ok ? MAP.centerLatLng() : null);
  };
  $('#pickConfirm').onclick=()=>finish(true);
  $('#pickCancel').onclick=()=>finish(false);
}
go.pickOnMap = pickOnMap;

/* ---------- new / edit venue ---------- */
function venueForm(initial, onSave, title){
  const d={ name:initial.name||'', zone:initial.zone||MAP.viewZone()?.id||'downtown', categories:initial.categories?[...initial.categories]:[], lat:initial.lat??null, lng:initial.lng??null };
  // a new place: which meal was it? (goes on the visit you log next; editing a place doesn't ask)
  const askMeal = !initial.id; if (askMeal) d.meals = [];
  if (initial.googlePlaceId) d.googlePlaceId = initial.googlePlaceId;
  openSheet((body)=>{
    const paint=()=>{
      const z=MAP.zoneById(d.zone);
      body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">${esc(title||'Add a new place')}</h2></div></div>
        ${initial.fromGoogle?`<p class="g-attr" style="text-align:left">Place details from <b>Google Maps</b>: check them and pick what kind of place it is.</p>`:''}
        <div class="field mt8"><label class="eyebrow" for="vfN">Name</label><input class="input" id="vfN" maxlength="60" value="${esc(d.name)}" placeholder="e.g. Sunset Karak Corner"></div>
        <div class="field mt16"><label class="eyebrow" for="vfZ">Area</label><select class="input" id="vfZ">${MAP.ZONES.slice().sort((a,b)=>a.label.localeCompare(b.label)).map(x=>`<option value="${x.id}"${x.id===d.zone?' selected':''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="row mt12" style="gap:8px"><span class="grow small ${typeof d.lat==='number'?'':'muted'}" style="${typeof d.lat==='number'?'color:var(--green);font-weight:700':''}">${typeof d.lat==='number'?'📍 Exact spot pinned':`Somewhere in ${esc(z?z.label:APP.city)}`}</span>
          <button class="btn btn-white btn-sm" id="vfPick">${icon('pin_drop')}Pick on map</button><button class="btn btn-white btn-sm" id="vfLoc" aria-label="Use my location">${icon('my_location')}</button></div>
        <div class="eyebrow mt20">Categories</div>
        <div class="chip-wrap mt8" id="vfC">${catPickerHTML(d.categories, {open:body.dataset.catsOpen==='1'})}</div>
        ${askMeal?`<div class="row between mt20"><span class="eyebrow">Meal</span><span class="hand">Optional</span></div>
        <div class="chip-wrap mt8" id="vfM">${MEALS.map(m=>`<button type="button" class="person-chip meal-chip${d.meals.includes(m.id)?' on':''}" data-meal="${m.id}" aria-pressed="${d.meals.includes(m.id)}">${icon(m.icon)}${m.label}</button>`).join('')}</div>`:''}
        <div class="sheet-foot"><button class="btn btn-gold btn-block" id="vfS">${icon('check')}Save place</button></div>`;
      const n=body.querySelector('#vfN'); n.oninput=()=>{ d.name=n.value; };
      body.querySelectorAll('#vfM [data-meal]').forEach(b=>b.onclick=()=>{ const m=b.dataset.meal; d.meals=d.meals.includes(m)?d.meals.filter(x=>x!==m):[...d.meals,m]; const st=body.scrollTop; paint(); body.scrollTop=st; });
      body.querySelector('#vfZ').onchange=e=>{ d.zone=e.target.value; d.lat=null; d.lng=null; paint(); };
      bindCatPicker(body.querySelector('#vfC'), body);
      body.querySelector('#vfC').onclick=e=>{ const b=e.target.closest('[data-cat]'); if (!b) return; const id=b.dataset.cat; d.categories.includes(id)?d.categories.splice(d.categories.indexOf(id),1):d.categories.push(id); paint(); };
      body.querySelector('#vfPick').onclick=()=>{
        const layer=body.closest('.sheet'); layer.style.visibility='hidden'; document.querySelectorAll('.scrim').forEach(s=>s.style.visibility='hidden');
        const start = typeof d.lat==='number' ? MAP.placeWorld({id:'x', lat:d.lat, lng:d.lng}) : MAP.placeWorld({id:'x'+d.zone, zone:d.zone});
        pickOnMap(start, res=>{
          layer.style.visibility=''; document.querySelectorAll('.scrim').forEach(s=>s.style.visibility='');
          if (res){ if (!res.inMap) return toast("That's outside the map"); d.lat=res.lat; d.lng=res.lng; d.zone=res.zone; paint(); }
        });
      };
      body.querySelector('#vfLoc').onclick=()=>{
        if (!navigator.geolocation) return toast("This browser can't share your location");
        navigator.geolocation.getCurrentPosition(p=>{
          const ai=MAP.toAI(p.coords.latitude,p.coords.longitude);
          if (!MAP.inMap(ai.a,ai.i)) return toast("You're outside the map area");
          d.lat=p.coords.latitude; d.lng=p.coords.longitude; d.zone=MAP.nearestZone(ai.a,ai.i).id; paint(); toast('Pinned to where you are');
        }, e=>toast(e.code===1?'Location permission is off for this site':"Couldn't get your location"), {enableHighAccuracy:true, timeout:10000});
      };
      body.querySelector('#vfS').onclick=()=>{
        if (!d.name.trim()){ toast('Give the place a name'); n.focus(); return; }
        if (!d.categories.length){ toast('Pick at least one category'); return; }
        back(); onSave(d);
      };
    };
    paint();
  });
}
function editVenue(v, after){ venueForm(v, d=>{ S.updateVenue(v.id, d); toast('Place updated'); go.refresh(); after&&after(); }, 'Edit place'); }

/* =========================================================
   14. CHECK IN: one flow whether you're there now or it was last week.
   "I'm here now" finds you once (never tracked): it lists the places near you and catches any critter
   living right where you stand. A visit saved today within CHECKIN_M of the place (AREA_M of its area
   when it has no exact spot) is a check-in; otherwise it's a visit you're logging after.
   ========================================================= */
const CHECKIN_M = 300, AREA_M = 1500, NEAR_M = 1000;
function placeDistance(v, here){
  if (!here || !v) return Infinity;
  if (typeof v.lat === 'number') return haversine(here, { lat:v.lat, lng:v.lng });
  const z = MAP.zoneById(v.zone); return z ? haversine(here, { lat:z.lat, lng:z.lng }) : Infinity;
}
const distText = m=>m >= 1000 ? (m/1000).toFixed(1)+' km' : Math.round(m)+' m';
function logFlow(opts){
  opts=opts||{};
  const me=S.me();
  const editing = opts.entryId ? S.entry(opts.entryId) : null;
  let venue = editing ? S.venue(editing.venueId) : (opts.venueId ? S.venue(opts.venueId) : null);
  const d = {
    kind: editing ? editing.kind : (opts.kind||'visit'),
    rating: editing ? editing.rating : 0,
    date: editing ? editing.date : (opts.date && opts.date <= todayISO() ? opts.date : todayISO()),
    notes: editing ? editing.notes : '',
    // who it's for: chosen every time (an edit starts from what it was)
    tags: editing ? (editing.taggedIds||[]).slice() : [],
    meals: editing ? (editing.meals||[]).slice() : (opts.meals||[]).slice(),
    who: editing ? (editing.private ? [] : (editing.crewIds&&editing.crewIds.length ? editing.crewIds.slice() : (S.myCrew()?[S.myCrew().id]:[]))) : whoDefault(opts.who),
  };
  const existingPhotos = editing ? S.photos({entryId:editing.id}) : [];
  const newPhotos = (opts.photos||[]).slice(0, APP.photosPerLog);   // {blob, url, caption}: some may arrive picked already
  let query = opts.prefill && opts.prefill.name ? opts.prefill.name : '';
  // where you are, once you've said "I'm here now"
  let here = null, locating = false;
  const checkedIn = ()=>{ if (!here || !venue || editing || d.kind!=='visit' || d.date!==todayISO()) return false;
    return placeDistance(venue, here) <= (typeof venue.lat==='number' ? CHECKIN_M : AREA_M); };
  // Google suggestions while typing a new place (one session per search: the typing is free, a pick costs one lookup)
  const newToken = ()=> (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join(''));
  const g = { token:newToken(), list:[], q:'', loading:false, off:false, seq:0, timer:null };
  openScreen(el=>{
    let stars=null;
    const paint=()=>{
      const crew=S.myCrew();
      const header = topbar({title: editing?'Edit visit':'Check in', center:true, actions:`<button class="icon-btn" id="lMore" aria-label="More">${icon('more_vert')}</button>`});
      const stepRow = `<div class="row between mt8"><span class="row" style="gap:6px"><i style="width:14px;height:14px;border-radius:50%;background:${venue?'var(--gold-deep)':'var(--gold)'};display:inline-block"></i><i style="width:46px;height:8px;border-radius:4px;background:var(--gold);display:inline-block"></i><i style="width:14px;height:14px;border-radius:50%;background:${venue?'var(--gold)':'var(--sc-highest)'};display:inline-block"></i></span><span class="hand">${venue?'Step 2: details and memories':'Step 1: find the place'}</span></div>`;
      if (!venue){
        // after "I'm here now" (and with nothing typed) the list is the places pinned near you, nearest first
        // (places with an exact spot by distance; then ones only known by their area, if you're in it)
        const near = here && !query.trim() ? S.venues().map(v=>({ v, m:placeDistance(v, here), exact:typeof v.lat==='number' }))
          .filter(x=>x.m <= (x.exact ? NEAR_M : AREA_M)).sort((a,b)=>(b.exact-a.exact) || (a.m-b.m)).slice(0, 12) : null;
        const results = near ? near.map(x=>x.v) : S.searchVenues(query, 10);
        const hereRow = `<button class="search-result mt16" id="lHere"${locating?' disabled':''}><span class="sr-ico">${icon(here?'my_location':'location_searching')}</span><span class="grow"><b style="display:block">${locating?'Finding you…':here?'You’re here':'I’m here now'}</b><span class="muted small" style="display:block">${here ? (near && near.length ? 'Places pinned near you' : 'Nothing pinned near you. Search for it, or type its name to add it.') : 'Show places near you. Uses your location once.'}</span></span>${here?'':icon('chevron_right')}</button>`;
        el.innerHTML = header + `<div class="screen-body">${stepRow}
          ${hereRow}
          <label class="search mt16">${icon('search')}<input id="logQ" placeholder="Search a café, bakery, karak stop…" value="${esc(query)}" autocomplete="off"></label>
          <div class="stack mt16" id="lRes">${results.map((v,k)=>{
            const sum=M.venueSummary(v,{...state.scope, mode:'crew', members:null}), z=MAP.zoneById(v.zone);
            return `<button class="search-result" data-v="${v.id}">${stampHTML(sum.state,{cat:M.primaryCat(v)})}<span class="grow"><b class="trunc" style="display:block">${esc(v.name)}</b><span class="muted small">${near?(near[k].exact?distText(near[k].m)+' away • ':'In this area • '):''}${esc(z?z.label:'')}${sum.visitorIds.length?` • ${plural(sum.visitorIds.length,'crew visit')}`:''}</span></span>${icon('chevron_right')}</button>`;
          }).join('')}
          ${googleHTML()}
          ${query.trim()?`<button class="search-result" id="lNew" style="background:var(--sc)"><span class="sr-ico">${icon('add_location_alt')}</span><span class="grow"><b>Add “${esc(query.trim())}”</b><span class="muted small" style="display:block">New place on the map</span></span>${icon('chevron_right')}</button>`:''}
          </div>
          ${!query.trim() && !here?`<div class="empty"><span class="stamp st-want big"><span class="st-paper"><span class="st-ico">${iconSvg('karak','#7e5700')}</span></span><span class="st-ribbon">TRY</span></span><span class="hand">Where did you eat?</span><p class="muted small">${S.venues().length ? 'Search places you and your crew have pinned, or type a new name to add it.' : 'Type its name to add it. Every place on the map starts with someone pinning it.'}</p></div>`:''}
        </div>`;
        const q=el.querySelector("#logQ"); if (!here && !locating) q.focus();
        el.querySelector('#lHere').onclick=()=>locate(true);
        q.oninput=()=>{ query=q.value; const pos=q.selectionStart; paint(); const n=el.querySelector("#logQ"); n.setSelectionRange(pos,pos); suggestSoon(); };
        el.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>pickGoogle(b.dataset.g, b));
        el.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ venue=S.venue(b.dataset.v); paint(); });
        // a landmark's 'Add a pin here' brings its spot along
        const nb=el.querySelector('#lNew'); if (nb) nb.onclick=()=>venueForm({name:query.trim(), ...(opts.prefill && opts.prefill.lat!=null ? { lat:opts.prefill.lat, lng:opts.prefill.lng, zone:zoneFor(opts.prefill.lat, opts.prefill.lng) || opts.zone } : { zone:opts.zone })}, dd=>{ venue=S.addVenue(dd); if (dd.meals && dd.meals.length) d.meals=dd.meals.slice(); paint(); });
        el.querySelector('#lMore').onclick=()=>toast('Search your crew’s places, or type a new name to add it');
        return;
      }
      const sum=M.venueSummary(venue,{...state.scope, mode:'crew', members:null});
      const others=sum.others.map(S.user).filter(Boolean);
      const lastOther = sum.visits.filter(e=>e.userId!==me.id).sort((a,b)=>b.createdAt-a.createdAt)[0];
      const allPhotos = existingPhotos.length + newPhotos.length;
      const used = S.myPhotoCount() + newPhotos.length;
      // tagging a crewmate shares the visit with a crew you're both in
      const tagCrews = d.kind==='visit' ? S.crewsForTags([...d.tags, ...S.mentionIds(d.notes)], d.who||[], editing ? editing.taggedIds : []) : [];
      el.innerHTML = header + `<div class="screen-body">${stepRow}
        <label class="search mt16">${icon('search')}<input value="${esc(venue.name)}" readonly aria-label="Place">${editing?'':`<button id="lChange" aria-label="Change place" class="icon-btn" style="width:34px;height:34px">${icon('check_circle')}</button>`}</label>
        ${others.length?`<div class="already mt12"><b>${esc(venue.name)} is already on the crew map!</b>
          <p class="muted mt4">Adding your visit will link your notes and photos to ${others.slice(0,2).map(u=>`<span class="hl">${esc(u.name||u.handle)}</span>`).join(' and ')}${others.length>2?` +${others.length-2}`:''}'s log.</p>
          <div class="row mt8">${avatarStack(others,30,3)}<span class="hand">Visited ${lastOther?whenText(lastOther).toLowerCase().replace(/ •.*/,''):''}</span></div></div>`:''}
        <div class="card mt16" style="border-radius:var(--r-xl)">
          <div class="seg"><button data-k="visit" class="${d.kind==='visit'?'on':''}">Been here</button><button data-k="want" class="${d.kind==='want'?'on':''}">Want to try</button></div>
          ${d.kind==='visit'?`<div class="row between mt20" style="align-items:flex-end;flex-wrap:wrap;gap:12px"><div><span class="eyebrow">Rating</span><div class="star-input mt8" id="lStars"></div></div>
            <div><span class="eyebrow">Date</span><label class="date-pill mt8">${icon('calendar_month')}<span id="lDateTxt">${d.date===todayISO()?'Today, ':''}${fmtDate(d.date,{day:'numeric',month:'short'})}</span><input type="date" id="lDate" value="${d.date}" max="${todayISO()}"></label></div></div>
            ${!editing && d.date===todayISO() ? (checkedIn() ? `<p class="tag green mt12">${icon('where_to_vote')}Checked in: you’re here</p>`
              : here ? `<p class="muted small mt12">You’re ${distText(placeDistance(venue, here))} away, so this saves as a visit, not a check-in.</p>`
              : `<button type="button" class="btn btn-soft mt12" id="lVerify"${locating?' disabled':''}>${icon('my_location')}${locating?'Finding you…':'I’m here now'}</button>`) : ''}`:''}
          <div class="row between mt20"><span class="eyebrow">Meal</span><span class="hand">Optional</span></div>
          <div class="chip-wrap mt8" id="lMeals">${MEALS.map(m=>`<button type="button" class="person-chip meal-chip${d.meals.includes(m.id)?' on':''}" data-meal="${m.id}" aria-pressed="${d.meals.includes(m.id)}">${icon(m.icon)}${m.label}</button>`).join('')}</div>
          <div class="field-label mt20"><span class="eyebrow">${d.kind==='visit'?'Notes':'Why you want to go'}</span><span class="hand">Optional</span></div>
          <textarea class="input mt8" id="lNotes" maxlength="400" placeholder="${d.kind==='visit'?'Tasting notes, hidden gems, dish recommendations…':'Who recommended it, what to order…'}">${esc(d.notes)}</textarea>
          <div class="row between mt20"><span class="eyebrow">Photos</span><span class="muted small">${allPhotos} of ${APP.photosPerLog}</span></div>
          <div class="reel mt12">
            ${existingPhotos.map(p=>polaroidHTML({src:S.photoURL(p), caption:p.caption, id:p.id, tape:false, rot:0})).join('')}
            ${newPhotos.map((p,i)=>`<div style="position:relative"><button class="rm" data-rm="${i}" aria-label="Remove photo">${icon('close')}</button>${polaroidHTML({src:p.url, id:'n'+i, tape:false, rot:0, sub:`<input data-cap="${i}" value="${esc(p.caption)}" placeholder="caption" maxlength="40">`})}</div>`).join('')}
            ${allPhotos<APP.photosPerLog && used<APP.photoLimit?`<label class="add-photo">${icon('add_a_photo')}<span>Add photos</span><input type="file" accept="image/*" multiple id="lPh"></label>`:''}
          </div>
          <div class="capacity mt16"><span class="cap-ico">${icon('photo_library')}</span><div class="grow"><div class="row between mono" style="font-size:12px;font-weight:700"><span>Scrapbook Roll Capacity</span><span style="color:var(--rust)">${used} / ${APP.photoLimit}</span></div><div class="cap-bar mt8"><i style="width:${Math.min(100,used/APP.photoLimit*100)}%"></i></div></div></div>
          ${used>=APP.photoLimit?`<div class="alert warn mt12">${icon('photo_library')}<div><b>Photo roll is full</b>Delete a photo from your book to add more.</div></div>`:''}
          <div class="eyebrow mt20">Who's this for?</div>
          <div class="mt8" id="lWho">${whoHTML(d.who)}</div>
          ${S.crewmates().length && d.kind==='visit' ? `<div class="row between mt20"><span class="eyebrow">Who were you with?</span>${d.tags.length?`<span class="tag soft">${d.tags.length} tagged</span>`:''}</div>
          <p class="muted small mt4">They'll see it in their Tagged scrapbook, and it goes in the crew book you share. Or type @name in your notes.</p>
          <div class="chip-scroll mt8" id="lTags">${S.crewmates().map(u=>`<button type="button" class="person-chip${d.tags.includes(u.id)?' on':''}" data-tag="${u.id}" aria-pressed="${d.tags.includes(u.id)}">${avatarHTML(u,30)}@${esc(u.handle)}${d.tags.includes(u.id)?icon('check_circle'):''}</button>`).join('')}</div>${tagCrews.length?`<p class="tag-note mt8">${icon('groups')}<span>Tagging shares this visit with <b>${esc(tagCrews.map(c=>c.name).join(' and '))}</b></span></p>`:''}` : ''}
        </div>
        <button class="btn btn-gold btn-block mt20" id="lSave" style="min-height:62px;font-size:21px">${icon('bookmark_add')}${editing?'Save changes':'Save to Scrapbook'}</button>
        ${editing?`<button class="btn btn-danger btn-block mt12" id="lDel">${icon('delete')}Delete this log</button>`:''}
      </div>`;
      // wiring
      const ch=el.querySelector('#lChange'); if (ch) ch.onclick=()=>{ venue=null; paint(); };
      el.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ d.kind=b.dataset.k; keepScroll(paint); });
      const st=el.querySelector('#lStars'); if (st) stars=starInput(st, d.rating, v=>{ d.rating=v; });
      const dt=el.querySelector('#lDate'); if (dt) dt.onchange=()=>{ d.date=dt.value||todayISO(); keepScroll(paint); };
      const vf=el.querySelector('#lVerify'); if (vf) vf.onclick=()=>locate(false);
      const nt=el.querySelector('#lNotes'); nt.oninput=()=>{ d.notes=nt.value; };
      bindWho(el, ()=>d.who, v=>{ d.who=v; keepScroll(paint); });
      el.querySelectorAll('[data-meal]').forEach(b=>b.onclick=()=>{ const m=b.dataset.meal; d.meals=d.meals.includes(m)?d.meals.filter(x=>x!==m):[...d.meals,m]; keepScroll(paint); });
      el.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{ const id=b.dataset.tag; d.tags=d.tags.includes(id)?d.tags.filter(x=>x!==id):[...d.tags,id]; const sx=el.querySelector('#lTags').scrollLeft; keepScroll(paint); el.querySelector('#lTags').scrollLeft=sx; });
      el.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.rm; URL.revokeObjectURL(newPhotos[i].url); newPhotos.splice(i,1); keepScroll(paint); });
      el.querySelectorAll('[data-cap]').forEach(inp=>inp.oninput=()=>{ newPhotos[+inp.dataset.cap].caption=inp.value; });
      el.querySelectorAll('.reel [data-photo]').forEach(f=>{ if (!f.dataset.photo.startsWith('n')) f.onclick=()=>go.viewer(existingPhotos.map(p=>p.id), existingPhotos.findIndex(p=>p.id===f.dataset.photo)); });
      const ph=el.querySelector('#lPh'); if (ph) ph.onchange=async()=>{
        const files=[...ph.files]; const room=Math.min(APP.photosPerLog-allPhotos, APP.photoLimit-used);
        if (files.length>room) toast(`Only ${room} more photo${room===1?'':'s'} fit on this log`);
        for (const f of files.slice(0,room)){
          try{ const blob=await compressImage(f, 1400, 0.8); newPhotos.push({blob, url:URL.createObjectURL(blob), caption:''}); }
          catch(_){ toast(`Couldn't read ${f.name}`); }
        }
        keepScroll(paint);
      };
      el.querySelector('#lMore').onclick=()=>placeScreen(venue.id);
      el.querySelector('#lSave').onclick=save;
      const del=el.querySelector('#lDel'); if (del) del.onclick=async()=>{
        const snap=await S.deleteEntry(editing.id); back(); go.refresh();
        toast('Log deleted', snap && !snap.photos.length ? 'Undo' : null, ()=>{ S.restoreEntry(snap); go.refresh(); });
      };
    };
    // the "On Google Maps" list (places already on the map show above instead)
    const googleHTML = ()=>{
      if (!query.trim() || g.off) return '';
      const list = g.list.filter(p=>!S.venueByPlaceId(p.placeId));
      if (!list.length) return g.loading ? `<p class="muted small mt12 row" style="gap:6px">${icon('travel_explore')}Searching Google Maps…</p>` : '';
      return `<div class="eyebrow mt16">On Google Maps</div>${list.map(p=>`<button class="search-result" data-g="${esc(p.placeId)}"><span class="sr-ico">${icon('location_on')}</span><span class="grow"><b class="trunc" style="display:block">${esc(p.name)}</b><span class="muted small trunc" style="display:block">${esc(p.detail)}</span></span>${icon('chevron_right')}</button>`).join('')}<p class="g-attr mt4">Results from <b>Google Maps</b></p>`;
    };
    // repaint without losing the cursor in the search box
    const repaintSearch = ()=>{ if (venue) return; const q=el.querySelector('#logQ'), had = q && document.activeElement===q, pos = q ? q.selectionStart : 0; paint(); const n=el.querySelector('#logQ'); if (n && had){ n.focus(); n.setSelectionRange(pos,pos); } };
    const suggestSoon = ()=>{
      clearTimeout(g.timer);
      const qq = query.trim();
      if (g.off || qq.length < 3){ g.list = []; g.q = qq; g.loading = false; return; }
      if (qq === g.q) return;
      g.timer = setTimeout(async ()=>{
        const my = ++g.seq; g.loading = true; repaintSearch();
        const r = await placesApi({ action:'suggest', input:qq, sessionToken:g.token });
        if (my !== g.seq) return;                       // a newer search is on its way
        g.loading = false; g.q = qq;
        if (r.state === 'unavailable' || r.state === 'signed_out'){ g.off = true; g.list = []; }
        else g.list = r.state === 'ok' ? (r.suggestions||[]) : [];
        repaintSearch();
      }, 300);
    };
    const pickGoogle = async (placeId, btn)=>{
      const pred = g.list.find(p=>p.placeId===placeId) || { name:query.trim() };
      if (btn){ btn.disabled = true; btn.querySelector('.muted').textContent = 'Getting the details…'; }
      const r = await placesApi({ action:'details', placeId, sessionToken:g.token });
      g.token = newToken(); g.list = []; g.q = '';          // that search is done; the next one is a new session
      if (r.state !== 'ok' || !r.place){ toast('Couldn’t get that place from Google. Add it yourself.'); repaintSearch(); return; }
      const p = r.place;
      // already on the map? (by Google's id, or the same name very close by)
      const same = S.venueByPlaceId(p.placeId) || (p.lat!=null && S.venues().find(v=>v.name.toLowerCase()===p.name.toLowerCase() && v.lat!=null && Math.abs(v.lat-p.lat)<0.0006 && Math.abs(v.lng-p.lng)<0.0006));
      if (same){ venue = same; paint(); return; }
      venueForm({ name:p.name||pred.name, lat:p.lat, lng:p.lng, zone: zoneFor(p.lat, p.lng) || opts.zone, categories: p.category ? [p.category] : [], googlePlaceId:p.placeId, fromGoogle:true },
        dd=>{ venue=S.addVenue(dd); if (dd.meals && dd.meals.length) d.meals=dd.meals.slice(); paint(); });
    };
    const keepScroll=(fn)=>{ const s=el.scrollTop; fn(); el.scrollTop=s; };
    // "I'm here now": find you once. From the place list it also catches a critter living right where you
    // stand (anywhere, even out in the desert); at a place, the check-in's own catch comes when you save.
    const locate = async (anywhere)=>{
      if (locating) return; locating = true; keepScroll(paint);
      try{ here = await whereAmI(); }
      catch(e){ toast(locationError(e), null, null, 4500); }
      locating = false;
      if (!el.isConnected) return;
      keepScroll(paint);
      if (here && anywhere && go.critterCatch) go.critterCatch({ ...here, venue:false }, {}, ()=>{});
    };
    const save=async()=>{
      if (d.who===null){ el.querySelector('#lWho').scrollIntoView({ block:'center', behavior:'smooth' }); return toast('Choose who it’s for'); }
      const btn=el.querySelector('#lSave'); btn.disabled=true;
      go.tourSaved && go.tourSaved();
      // one check-in per place a day; another visit the same day is just a visit
      const isCheckin = checkedIn() && !S.entries({venueId:venue.id, userId:me.id, kind:'visit'}).some(x=>x.checkin && x.date===todayISO());
      const data={ kind:d.kind, ...(isCheckin ? { checkin:true } : {}), rating:d.kind==='visit'?d.rating:0, date:d.kind==='visit'?d.date:todayISO(), notes:d.notes.trim(), crewIds:d.who, meals:d.meals, taggedIds:d.kind==='visit' ? [...new Set([...d.tags, ...S.mentionIds(d.notes)])] : [] };
      let e;
      if (editing){ e=S.updateEntry(editing.id, data); }
      else e=S.addEntry({venueId:venue.id, ...data});
      if (newPhotos.length) await S.addPhotos(newPhotos.map(p=>({blob:p.blob, caption:p.caption.trim(), venueId:venue.id, entryId:e.id, date:e.date})));
      newPhotos.forEach(p=>URL.revokeObjectURL(p.url));
      closeAll();
      go.quietStrip && go.quietStrip();
      go.switchView('map'); go.refresh();
      setTimeout(()=>{
        const w=MAP.placeWorld(venue);
        MAP.markDropped(venue.id);
        MAP.flyToSeparate(w, S.venues().filter(x=>x.id!==venue.id).map(x=>MAP.placeWorld(x)).filter(p=>Math.hypot(p.x-w.x,p.y-w.y)<60));
        // a new visit is taped into its book; then any sticker it earned
        // a check-in also catches any critter living at this place (spots for places count too), then stickers
        const badges = ()=>go.checkBadges && go.checkBadges();
        if (!editing && e.kind==='visit') go.tapeIn(e, ()=>isCheckin && go.critterCatch ? go.critterCatch({ ...here, venue:true }, { venueId:venue.id }, caught=>setTimeout(badges, caught ? 300 : 0)) : badges());
        else { toast(editing ? 'Saved' : 'Saved to try'); setTimeout(()=>go.checkBadges && go.checkBadges(), 600); }
      }, 120);
    };
    paint();
    // a place's own Check in button: find you straight away
    if (opts.here && venue && !editing) locate(false);
  });
}
go.log = logFlow;
