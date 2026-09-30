// Place sheet (frame 13) and Log a Place (frame 14).
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import { CATEGORIES, catById, iconSvg, esc, fmtRating, fmtDate, todayISO, plural } from './data.js';
import { avatarHTML, avatarStack } from './avatar.js';
import { $, icon, toast, pointsToast, openScreen, openSheet, back, closeAll, topbar, stampHTML, catChip, polaroidHTML, starInput, toggleHTML, bindToggle, ratingPill, share, compressImage } from './ui.js';
import { go, state } from './go.js';
import { sharePlace, eventRowHTML, planBite, eventSheet, checkIn } from './events.js';

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
      const photos=S.photos({venueId:v.id});
      const wanters=sum.wantIds.map(S.user).filter(Boolean);
      el.innerHTML = topbar({title:'Place Details', center:true, actions:`<button class="icon-btn" id="pMore" aria-label="More">${icon('more_vert')}</button>`}) + `
      <div class="snap"><canvas id="pSnap"></canvas><span class="snap-pin">${icon('storefront')}${esc(v.name)}</span></div>
      <div class="place-body">
        <div class="sheet-handle" style="margin:0 auto 12px"></div>
        <div class="row" style="flex-wrap:wrap;gap:8px"><span class="tag">${iconSvg(cat.id,'#5e4000').replace('<svg','<svg width="14" height="14"')}${esc(cat.label)}</span>${sum.visitCount?`<span class="tag green">${icon('check_circle')}Visited ${sum.visitCount}x</span>`:''}${sum.state==='unlit'?'<span class="tag soft">Undiscovered</span>':''}</div>
        <h1 class="h-xl mt8">${esc(v.name)}</h1>
        <div class="row muted mt4" style="gap:6px">${icon('storefront')}${esc([z?z.label:APP.city, v.address].filter(Boolean).join(' • '))}</div>
        ${mine.length?`<div class="share-card mt20${minePrivate?' private':''}"><span class="sc-ico">${icon(minePrivate?'lock':'lock_open')}</span>
          <div class="grow"><div class="row between"><b class="h-sm">${minePrivate?'Only you can see your log':(crew?`Shared with ${esc(crew.name)}`:'Shared with your crew')}</b><span class="hand">${minePrivate?'Private log':'Public log'}</span></div>
          <span class="muted small">${minePrivate?'Your notes & rating stay in your own scrapbook.':(crew?`All ${S.crewMembers().length} crew members can see your notes & rating`:'Your crew will see this once you have one')}</span></div>
          ${toggleHTML('pShare', !minePrivate, 'Share with crew')}</div>`:''}
        <div class="row between mt24"><span class="row h-md" style="gap:8px"><i style="width:9px;height:9px;border-radius:50%;background:var(--gold-deep);display:inline-block"></i>Who's Been <span class="tag soft">${plural(visits.length,'visit')}</span></span>${sum.rating?`<span class="hand">Crew avg <span style="color:var(--gold-deep)">★ ${fmtRating(sum.rating)}</span></span>`:''}</div>
        <div class="stack mt12">${visits.map(e=>{
          const u=S.user(e.userId), isMe=u.id===me.id;
          return `<div class="review" ${isMe?`data-edit="${e.id}" style="cursor:pointer"`:''}>
            <div class="review-head">${avatarHTML(u,44)}<div class="grow"><div class="rv-name">${isMe?'You':esc(u.name||u.handle)}<span>@${esc(u.handle)}</span>${e.private?` <span class="tag dark" style="margin-left:6px">${icon('lock')}Only me</span>`:''}</div><div class="rv-when">${whenText(e)}</div></div>${e.rating?ratingPill(e.rating):''}${isMe?icon('edit','','').replace('class="ms"','class="ms" style="color:var(--outline);font-size:18px"'):''}</div>
            ${e.notes?`<q>${esc(e.notes)}</q>`:''}
          </div>`;
        }).join('') || `<div class="card-soft center"><span class="hand">Nobody in your crew has stamped this yet.</span><p class="muted small mt8">Be the first: +5 points for first in the crew.</p></div>`}</div>
        ${wanters.length?`<div class="card-soft row mt16">${icon('bookmark')}<div class="grow"><b>Wants to try</b><div class="muted small">${plural(wanters.length,'crew friend')} saved this spot</div></div>${avatarStack(wanters,34,3)}</div>`:''}
${S.events({venueId:v.id, upcoming:true}).length?`<div class="card mt16"><span class="h-sm">${icon('event')} Crew plans here</span><div class="stack mt8">${S.events({venueId:v.id, upcoming:true}).map(eventRowHTML).join('')}</div></div>`:''}
        <div class="btn-grid mt16"><button class="btn btn-soft" id="pCheck">${icon('where_to_vote')}Check in</button><button class="btn btn-soft" id="pPlan">${icon('event')}Plan a bite</button></div>
        <button class="btn btn-soft btn-block mt12" id="pLog">${icon('add_a_photo')}${mine.some(e=>e.kind==='visit')?'Log another visit':'Log your visit'}</button>
        ${photos.length?`<div class="row between mt24"><span class="row h-md" style="gap:8px">${icon('photo_camera')}Crew Photo Strip</span><span class="mono muted" style="font-size:12px">${plural(photos.length,'snap')}</span></div>
        <div class="strip">${photos.map(p=>polaroidHTML({src:S.photoURL(p), caption:p.caption, id:p.id, badge:p.private?`<span class="pol-badge tr">${icon('lock')}Only me</span>`:''})).join('')}</div>`:''}
        <button class="btn btn-gold btn-block mt16" id="pSend">${icon('send')}Send to Crew</button>
        <div class="btn-grid mt12"><a class="btn btn-soft" href="${mapsURL(v)}" target="_blank" rel="noopener">${icon('directions')}Directions</a><button class="btn btn-soft" id="pMap">${icon('map')}Show on Map</button></div>
        ${!mine.some(e=>e.kind==='want') && !mine.some(e=>e.kind==='visit')?`<button class="btn btn-ghost btn-block mt8" id="pWant">${icon('bookmark_add')}Save to try later</button>`:''}
      </div>`;
      MAP.whenReady(()=>requestAnimationFrame(()=>{ const c=el.querySelector('#pSnap'); if (c) MAP.drawSnapshot(c, MAP.placeWorld(v), 6); }));
      const sh=el.querySelector('#pShare');
      if (sh) bindToggle(sh, on=>{ mine.forEach(e=>S.updateEntry(e.id,{private:!on})); toast(on?'Shared with your crew':'Now only you can see your log here'); go.refresh(); setTimeout(paint, 250); });
      el.querySelectorAll('[data-edit]').forEach(r=>r.onclick=()=>logFlow({entryId:r.dataset.edit}));
      el.querySelectorAll('.strip [data-photo]').forEach(f=>f.onclick=()=>go.viewer(photos.map(p=>p.id), photos.findIndex(p=>p.id===f.dataset.photo)));
      el.querySelector('#pLog').onclick=()=>logFlow({venueId:v.id});
      el.querySelector('#pSend').onclick=()=>sharePlace(v);
      el.querySelector('#pCheck').onclick=()=>checkIn(v.id, ()=>setTimeout(paint, 300));
      el.querySelector('#pPlan').onclick=()=>planBite(v.id, ()=>paint());
      el.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>eventSheet(b.dataset.event, paint));
      el.querySelector('#pMap').onclick=()=>{ closeAll(); go.switchView('map'); const w=MAP.placeWorld(v); MAP.flyToSeparate(w, S.venues().filter(x=>x.id!==v.id).map(x=>MAP.placeWorld(x)).filter(p=>Math.hypot(p.x-w.x,p.y-w.y)<60)); MAP.highlight(v.id); };
      const pw=el.querySelector('#pWant'); if (pw) pw.onclick=()=>{ S.addEntry({venueId:v.id, kind:'want'}); toast('Saved to try'); go.refresh(); paint(); };
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
  openSheet((body)=>{
    const paint=()=>{
      const z=MAP.zoneById(d.zone);
      body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="hand">New stamp on the map</span><h2 class="h-md">${esc(title||'Add a new place')}</h2></div></div>
        <div class="field"><label class="eyebrow" for="vfN">Name</label><input class="input" id="vfN" maxlength="60" value="${esc(d.name)}" placeholder="e.g. Sunset Karak Corner"></div>
        <div class="field mt16"><label class="eyebrow" for="vfZ">Area</label><select class="input" id="vfZ">${MAP.ZONES.slice().sort((a,b)=>a.label.localeCompare(b.label)).map(x=>`<option value="${x.id}"${x.id===d.zone?' selected':''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="row mt12" style="gap:8px"><span class="grow small ${typeof d.lat==='number'?'':'muted'}" style="${typeof d.lat==='number'?'color:var(--green);font-weight:700':''}">${typeof d.lat==='number'?'📍 Exact spot pinned':`Somewhere in ${esc(z?z.label:APP.city)}`}</span>
          <button class="btn btn-white btn-sm" id="vfPick">${icon('pin_drop')}Pick on map</button><button class="btn btn-white btn-sm" id="vfLoc" aria-label="Use my location">${icon('my_location')}</button></div>
        <div class="eyebrow mt20">Categories</div>
        <div class="chip-wrap mt8" id="vfC">${CATEGORIES.map(c=>catChip(c.id, d.categories.includes(c.id))).join('')}</div>
        <div class="sheet-foot"><button class="btn btn-gold btn-block" id="vfS">${icon('check')}Save place</button></div>`;
      const n=body.querySelector('#vfN'); n.oninput=()=>{ d.name=n.value; };
      body.querySelector('#vfZ').onchange=e=>{ d.zone=e.target.value; d.lat=null; d.lng=null; paint(); };
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
   14. LOG A PLACE
   ========================================================= */
function logFlow(opts){
  opts=opts||{};
  const me=S.me();
  const editing = opts.entryId ? S.entry(opts.entryId) : null;
  let venue = editing ? S.venue(editing.venueId) : (opts.venueId ? S.venue(opts.venueId) : null);
  const d = {
    kind: editing ? editing.kind : (opts.kind||'visit'),
    rating: editing ? editing.rating : 0,
    date: editing ? editing.date : todayISO(),
    notes: editing ? editing.notes : '',
    private: editing ? editing.private : me.shareDefault==='private',
  };
  const existingPhotos = editing ? S.photos({entryId:editing.id}) : [];
  const newPhotos = [];   // {blob, url, caption}
  let query = '';
  openScreen(el=>{
    let stars=null;
    const paint=()=>{
      const crew=S.myCrew();
      const header = topbar({title: editing?'Edit Entry':'Log Entry', center:true, actions:`<button class="icon-btn" id="lMore" aria-label="More">${icon('more_vert')}</button>`});
      const stepRow = `<div class="row between mt8"><span class="row" style="gap:6px"><i style="width:14px;height:14px;border-radius:50%;background:${venue?'var(--gold-deep)':'var(--gold)'};display:inline-block"></i><i style="width:46px;height:8px;border-radius:4px;background:var(--gold);display:inline-block"></i><i style="width:14px;height:14px;border-radius:50%;background:${venue?'var(--gold)':'var(--sc-highest)'};display:inline-block"></i></span><span class="hand">${venue?'Step 2: details and memories':'Step 1: find the place'}</span></div>`;
      if (!venue){
        const results = S.searchVenues(query, 10);
        el.innerHTML = header + `<div class="screen-body">${stepRow}
          <label class="search mt16">${icon('search')}<input id="logQ" placeholder="Search a café, bakery, karak stop…" value="${esc(query)}" autocomplete="off"></label>
          <div class="stack mt16" id="lRes">${results.map(v=>{
            const sum=M.venueSummary(v,{...state.scope, mode:'crew', members:null}), z=MAP.zoneById(v.zone);
            return `<button class="search-result" data-v="${v.id}">${stampHTML(sum.state,{cat:M.primaryCat(v)})}<span class="grow"><b class="trunc" style="display:block">${esc(v.name)}</b><span class="muted small">${esc(z?z.label:'')}${sum.visitorIds.length?` • ${plural(sum.visitorIds.length,'crew visit')}`:''}</span></span>${icon('chevron_right')}</button>`;
          }).join('')}
          ${query.trim()?`<button class="search-result" id="lNew" style="background:var(--sc)"><span class="sr-ico">${icon('add_location_alt')}</span><span class="grow"><b>Add “${esc(query.trim())}”</b><span class="muted small" style="display:block">New place on the map</span></span>${icon('chevron_right')}</button>`:''}
          </div>
          ${!query.trim()?`<div class="empty"><span class="stamp st-want big"><span class="st-paper"><span class="st-ico">${iconSvg('karak','#7e5700')}</span></span><span class="st-ribbon">TRY</span></span><span class="hand">Where did you eat?</span><p class="muted small">${S.venues().length ? 'Search places you and your crew have pinned, or type a new name to add it.' : 'Type its name to add it. Every place on the map starts with someone pinning it.'}</p></div>`:''}
        </div>`;
        const q=el.querySelector("#logQ"); q.focus();
        q.oninput=()=>{ query=q.value; const pos=q.selectionStart; paint(); const n=el.querySelector("#logQ"); n.setSelectionRange(pos,pos); };
        el.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ venue=S.venue(b.dataset.v); paint(); });
        const nb=el.querySelector('#lNew'); if (nb) nb.onclick=()=>venueForm({name:query.trim(), zone:opts.zone}, dd=>{ venue=S.addVenue(dd); paint(); });
        el.querySelector('#lMore').onclick=()=>toast('Search your crew’s places, or type a new name to add it');
        return;
      }
      const sum=M.venueSummary(venue,{...state.scope, mode:'crew', members:null});
      const others=sum.others.map(S.user).filter(Boolean);
      const lastOther = sum.visits.filter(e=>e.userId!==me.id).sort((a,b)=>b.createdAt-a.createdAt)[0];
      const allPhotos = existingPhotos.length + newPhotos.length;
      const used = S.myPhotoCount() + newPhotos.length;
      const firstHere = !S.entries({venueId:venue.id, userId:me.id}).length;
      const firstCrew = S.firstInCrew(venue.id) && !d.private && d.kind==='visit';
      el.innerHTML = header + `<div class="screen-body">${stepRow}
        <label class="search mt16">${icon('search')}<input value="${esc(venue.name)}" readonly aria-label="Place">${editing?'':`<button id="lChange" aria-label="Change place" class="icon-btn" style="width:34px;height:34px">${icon('check_circle')}</button>`}</label>
        ${others.length?`<div class="already mt12"><b>${esc(venue.name)} is already on the crew map!</b>
          <p class="muted mt4">Adding your visit will link your notes and photos to ${others.slice(0,2).map(u=>`<span class="hl">${esc(u.name||u.handle)}</span>`).join(' and ')}${others.length>2?` +${others.length-2}`:''}'s log.</p>
          <div class="row mt8">${avatarStack(others,30,3)}<span class="hand">Visited ${lastOther?whenText(lastOther).toLowerCase().replace(/ •.*/,''):''}</span></div></div>`:''}
        <div class="card mt16" style="border-radius:var(--r-xl)">
          <div class="seg"><button data-k="visit" class="${d.kind==='visit'?'on':''}">Been here ✓</button><button data-k="want" class="${d.kind==='want'?'on':''}">Want to try 🔖</button></div>
          ${d.kind==='visit'?`<div class="row between mt20" style="align-items:flex-end;flex-wrap:wrap;gap:12px"><div><span class="eyebrow">Your stamp</span><div class="star-input mt8" id="lStars"></div></div>
            <div style="text-align:right"><span class="eyebrow">Logged on</span><label class="date-pill mt8">${icon('calendar_month')}<span id="lDateTxt">${d.date===todayISO()?'Today, ':''}${fmtDate(d.date,{day:'numeric',month:'short'})}</span><input type="date" id="lDate" value="${d.date}" max="${todayISO()}"></label></div></div>`:''}
          <div class="field-label mt20"><span class="eyebrow">${d.kind==='visit'?'Gourmet notes':'Why you want to go'}</span><span class="hand">Add your own words</span></div>
          <textarea class="input mt8" id="lNotes" maxlength="400" placeholder="${d.kind==='visit'?'Tasting notes, hidden gems, dish recommendations…':'Who recommended it, what to order…'}">${esc(d.notes)}</textarea>
          <div class="row between mt20"><span class="eyebrow">Polaroid reel (${allPhotos})</span><span class="mono" style="color:var(--rust);font-weight:700;font-size:12px">${allPhotos}/${APP.photosPerLog}</span></div>
          <div class="reel mt12">
            ${existingPhotos.map(p=>polaroidHTML({src:S.photoURL(p), caption:p.caption, id:p.id, tape:false, rot:0})).join('')}
            ${newPhotos.map((p,i)=>`<div style="position:relative"><button class="rm" data-rm="${i}" aria-label="Remove photo">${icon('close')}</button>${polaroidHTML({src:p.url, id:'n'+i, tape:false, rot:0, sub:`<input data-cap="${i}" value="${esc(p.caption)}" placeholder="caption" maxlength="40">`})}</div>`).join('')}
            ${allPhotos<APP.photosPerLog && used<APP.photoLimit?`<label class="add-photo">${icon('add_a_photo')}<span>Add photos</span><input type="file" accept="image/*" multiple id="lPh"></label>`:''}
          </div>
          <div class="capacity mt16"><span class="cap-ico">${icon('photo_library')}</span><div class="grow"><div class="row between mono" style="font-size:12px;font-weight:700"><span>Scrapbook Roll Capacity</span><span style="color:var(--rust)">${used} / ${APP.photoLimit}</span></div><div class="cap-bar mt8"><i style="width:${Math.min(100,used/APP.photoLimit*100)}%"></i></div></div></div>
          ${used>=APP.photoLimit?`<div class="alert warn mt12">${icon('photo_library')}<div><b>Photo roll is full</b>Delete a photo from your book to add more.</div></div>`:''}
          <div class="share-card mt16${d.private?' private':''}" style="background:var(--sc-low)"><span class="sc-ico">${icon(d.private?'lock':'group')}</span>
            <div class="grow"><b class="h-sm">${crew?`Share with ${esc(crew.name)}`:'Share with your crew'}</b><div class="muted small">${d.private?'Only you will see this':'Visible to shared crew map members'}</div></div>${toggleHTML('lShare', !d.private, 'Share with crew')}</div>
        </div>
        ${!editing?`<div class="points-toast show mt20" style="position:static;transform:none;opacity:1">${icon('auto_awesome','',true)}<span class="pts">${firstHere?'<b>+10</b> New place':'<b>+4</b> Repeat visit'}${firstCrew?'<i>•</i><b>+5</b> First in the crew':''}${newPhotos.length?`<i>•</i><b>+${newPhotos.length*2}</b> Photos`:''}</span>${(firstHere&&firstCrew)?'<em>Combo!</em>':''}</div>`:''}
        <button class="btn btn-gold btn-block mt20" id="lSave" style="min-height:62px;font-size:21px">${icon('bookmark_add')}${editing?'Save changes':'Save to Scrapbook'}</button>
        ${editing?`<button class="btn btn-danger btn-block mt12" id="lDel">${icon('delete')}Delete this log</button>`:''}
      </div>`;
      // wiring
      const ch=el.querySelector('#lChange'); if (ch) ch.onclick=()=>{ venue=null; paint(); };
      el.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ d.kind=b.dataset.k; keepScroll(paint); });
      const st=el.querySelector('#lStars'); if (st) stars=starInput(st, d.rating, v=>{ d.rating=v; });
      const dt=el.querySelector('#lDate'); if (dt) dt.onchange=()=>{ d.date=dt.value||todayISO(); el.querySelector('#lDateTxt').textContent=(d.date===todayISO()?'Today, ':'')+fmtDate(d.date,{day:'numeric',month:'short'}); };
      const nt=el.querySelector('#lNotes'); nt.oninput=()=>{ d.notes=nt.value; };
      bindToggle(el.querySelector('#lShare'), on=>{ d.private=!on; keepScroll(paint); });
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
    const keepScroll=(fn)=>{ const s=el.scrollTop; fn(); el.scrollTop=s; };
    const save=async()=>{
      const btn=el.querySelector('#lSave'); btn.disabled=true;
      go.tourSaved && go.tourSaved();
      const firstHere = !S.entries({venueId:venue.id, userId:me.id}).length;
      const firstCrew = S.firstInCrew(venue.id) && !d.private && d.kind==='visit';
      const data={ kind:d.kind, rating:d.kind==='visit'?d.rating:0, date:d.kind==='visit'?d.date:todayISO(), notes:d.notes.trim(), private:d.private };
      let e;
      if (editing){ e=S.updateEntry(editing.id, data); existingPhotos.forEach(p=>{ if (data.private) S.updatePhoto(p.id,{private:true}); }); }
      else e=S.addEntry({venueId:venue.id, ...data});
      if (newPhotos.length) await S.addPhotos(newPhotos.map(p=>({blob:p.blob, caption:p.caption.trim(), venueId:venue.id, entryId:e.id, date:e.date, private:e.private})));
      newPhotos.forEach(p=>URL.revokeObjectURL(p.url));
      let parts=[];
      if (!editing){
        parts.push(firstHere?[10,'New place']:[4,'Repeat visit']);
        if (firstCrew) parts.push([5,'First in the crew']);
        if (newPhotos.length) parts.push([newPhotos.length*2,'Photos']);
        S.addPoints(parts.reduce((s,p)=>s+p[0],0));
      }
      closeAll();
      go.switchView('map'); go.refresh();
      setTimeout(()=>{
        const w=MAP.placeWorld(venue);
        MAP.markDropped(venue.id);
        MAP.flyToSeparate(w, S.venues().filter(x=>x.id!==venue.id).map(x=>MAP.placeWorld(x)).filter(p=>Math.hypot(p.x-w.x,p.y-w.y)<60));
        if (parts.length) pointsToast(parts); else toast('Saved');
        setTimeout(()=>go.checkBadges && go.checkBadges(), parts.length ? 3400 : 600);
      }, 120);
    };
    paint();
  });
}
go.log = logFlow;
