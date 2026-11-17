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
import { DISH_SEED } from './search-data.js';
import { aiTagsOn } from './aitags.js';
import { placesApi, zoneFor, seedInitial } from './share.js';
import { instagramFrom, cleanWebsite, cleanPhone, validPhone, validUrl } from './placefields.js';
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
// Directions open the phone's own maps app: Apple Maps on iPhone/iPad/Mac, the default maps app on Android (geo:),
// OpenStreetMap anywhere else. To the pin when there is one, otherwise by name and address.
export function directionsURL(v, ua){
  ua = ua || (typeof navigator!=='undefined' ? navigator.userAgent : '');
  const z=MAP.zoneById(v.zone), pinned = typeof v.lat==='number' && typeof v.lng==='number';
  const ll = pinned ? `${v.lat.toFixed(6)},${v.lng.toFixed(6)}` : '';
  const q = [v.name, v.address || (z?z.label:''), APP.city].filter(Boolean).join(', ');
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return 'https://maps.apple.com/?' + (pinned ? `daddr=${ll}&q=${encodeURIComponent(v.name)}` : `daddr=${encodeURIComponent(q)}`);
  if (/Android/.test(ua)) return pinned ? `geo:${ll}?q=${ll}(${encodeURIComponent(v.name)})` : `geo:0,0?q=${encodeURIComponent(q)}`;
  return pinned ? `https://www.openstreetmap.org/directions?to=${encodeURIComponent(ll)}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;
}
// a place's contact details: only the ones it has
const SOCIAL = [[/facebook\.com|fb\.com/i,'Facebook','public'],[/tiktok\.com/i,'TikTok','music_note'],[/(^|\.)x\.com|twitter\.com/i,'X','alternate_email'],[/snapchat\.com/i,'Snapchat','photo_camera'],[/youtube\.com|youtu\.be/i,'YouTube','smart_display'],[/linkedin\.com/i,'LinkedIn','work'],[/wa\.me|whatsapp/i,'WhatsApp','chat']];
const shortUrl = u => String(u).replace(/^https?:\/\/(www\.)?/i,'').replace(/\/$/,'');
export function contactHTML(v){
  const rows = [];
  const row = (href, ic, name, sub, ext)=>`<a class="person-row" href="${esc(href)}"${ext?' target="_blank" rel="noopener"':''}>${icon(ic)}<span class="pr-main"><span class="pr-name">${esc(name)}</span><span class="pr-sub">${esc(sub)}</span></span>${icon(ext?'open_in_new':'chevron_right')}</a>`;
  if (v.phone) rows.push(row('tel:'+String(v.phone).replace(/[^\d+]/g,''), 'call', 'Call', v.phone));
  if (v.website) rows.push(row(v.website, 'language', 'Website', shortUrl(v.website), true));
  if (v.instagram) rows.push(row('https://www.instagram.com/'+encodeURIComponent(v.instagram)+'/', 'photo_camera', 'Instagram', '@'+v.instagram, true));
  (v.otherSocials||[]).forEach(u=>{ const m = SOCIAL.find(([re])=>re.test(u)); rows.push(row(u, m?m[2]:'link', m?m[1]:'Link', shortUrl(u), true)); });
  return rows.length ? `<div class="contact-list mt16">${rows.join('')}</div>` : '';
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
      // the latest visit here someone tagged you on (when you haven't logged one of your own)
      const taggedOn = mine.some(e=>e.kind==='visit') ? null : visits.find(e=>S.canRate(e));
      const taggedBy = taggedOn && S.user(taggedOn.userId);
      el.innerHTML = topbar({title:'', center:true, actions:`<button class="icon-btn" id="pMore" aria-label="More">${icon('more_vert')}</button>`}) + `
      <div class="snap"><canvas id="pSnap"></canvas><span class="snap-pin">${icon('storefront')}${esc(v.name)}</span></div>
      <div class="place-body">
        <div class="sheet-handle" style="margin:0 auto var(--sp-3)"></div>
        <div class="row" style="flex-wrap:wrap;gap:var(--sp-2)"><span class="tag">${iconSvg(cat.id,'#5e4000').replace('<svg','<svg width="14" height="14"')}${esc(cat.label)}</span>${sum.visitCount?`<span class="tag green">${icon('check_circle')}Visited ${sum.visitCount}x</span>`:''}${sum.state==='unlit'?'<span class="tag soft">Undiscovered</span>':''}${sum.meals.map(m=>`<span class="tag soft">${icon(mealById(m).icon)}${mealById(m).label}</span>`).join('')}</div>
        <h1 class="h-xl mt8">${esc(v.name)}</h1>
        <div class="row muted mt4" style="gap:var(--sp-2);align-items:flex-start">${icon('storefront')}<span style="overflow-wrap:anywhere">${esc([z?z.label:APP.city, v.address].filter(Boolean).join(' • '))}</span></div>
        ${S.venueTags(v.id).length ? `<div class="chip-wrap mt8">${S.venueTags(v.id).map(t=>`<span class="tag soft">${esc(t)}</span>`).join('')}</div>` : ''}
        ${contactHTML(v)}
        ${mine.length?`<div class="share-card mt24${minePrivate?' private':''}"><span class="sc-ico">${icon(minePrivate?'lock':'group')}</span>
          <div class="grow"><b class="h-sm">${minePrivate?'Only you can see your log':esc(whoText(mineWho).replace(/.$/,''))}</b>
          <div class="muted small">${minePrivate?'Your notes & rating stay in your own scrapbook.':'They can see your notes, rating and photos here.'}</div></div>
          <button class="btn btn-soft btn-sm" id="pShare">Change</button></div>`:''}
        <div class="row between mt24"><span class="row h-md" style="gap:var(--sp-2)">Who’s been <span class="tag soft">${plural(visits.length,'visit')}</span></span>${overallHTML({ rating:sum.rating, raters:sum.raters }, sum.ratingScope==='crew'?'Crew':'Your')}</div>
        <div class="stack mt16">${visits.map(e=>{
          const u=S.user(e.userId), isMe=u.id===me.id;
          return `<div class="review" ${isMe?`data-edit="${e.id}" style="cursor:pointer"`:''}>
            <div class="review-head">${avatarHTML(u,44)}<div class="grow"><div class="rv-name">${isMe?'You':esc(u.name||u.handle)}<span>@${esc(u.handle)}</span>${e.private?` <span class="tag dark" style="margin-left:var(--sp-2)">${icon('lock')}Only me</span>`:''}</div><div class="rv-when">${whenText(e)}</div></div>${e.rating?ratingPill(e.rating):''}${isMe?icon('edit','','').replace('class="ms"','class="ms" style="color:var(--outline);font-size:18px"'):''}</div>
            ${e.notes?`<q>${esc(e.notes)}</q>`:''}
            ${withHTML(e, me)}
            ${taggedRatingsHTML(e, me)}
          </div>`;
        }).join('') || `<div class="card-soft center"><b>Nobody in your crew has been yet</b><p class="muted small mt8">Be the first to log it.</p></div>`}</div>
        ${wanters.length?`<div class="card-soft row mt16">${icon('bookmark')}<div class="grow"><b>Wants to try</b><div class="muted small">${plural(wanters.length,'crew friend')}${(()=>{ const L={google_maps:'from Google Maps',tiktok:'from TikTok',instagram:'from Instagram',text:'from a name'}; const ls=[...new Set(sum.wants.map(e=>L[e.sourceType]).filter(Boolean))]; return ls.length?' ('+ls.join(', ')+')':''; })()} saved this spot</div></div>${avatarStack(wanters,34,3)}</div>`:''}
${S.events({venueId:v.id, upcoming:true}).length?`<div class="card mt16"><span class="h-sm">${icon('event')} Crew plans here</span><div class="stack mt8">${S.events({venueId:v.id, upcoming:true}).map(eventRowHTML).join('')}</div></div>`:''}
        <div class="btn-grid mt16"><button class="btn btn-checkin" id="pCheck">${icon('where_to_vote')}Check in</button><button class="btn btn-soft" id="pPlan">${icon('event')}Plan</button></div>
        ${taggedOn ? `<button class="btn btn-gold btn-block mt16" id="pAdd">${icon('add_a_photo')}${S.myRatingOn(taggedOn.id) || S.photos({entryId:taggedOn.id}).some(p=>p.userId===me.id) ? 'Edit your part of the visit' : 'Add your rating & photos'}</button>
        <p class="muted small center mt4">${esc(taggedBy ? (taggedBy.name||'@'+taggedBy.handle) : 'A friend')} tagged you on this visit</p>` : ''}
        <button class="btn ${taggedOn?'btn-ghost':'btn-soft'} btn-block mt16" id="pLog">${icon(taggedOn?'add_location_alt':'add_a_photo')}${mine.some(e=>e.kind==='visit')?'Log another visit':taggedOn?'Log a new visit of your own':'Log your visit'}</button>
        ${photos.length?`<div class="row between mt24"><span class="row h-md" style="gap:var(--sp-2)">${icon('photo_camera')}Photos</span><span class="muted small">${photos.length}</span></div>
        <div class="strip">${photos.map(p=>polaroidHTML({src:S.photoURL(p), caption:p.caption, id:p.id, badge:p.private?`<span class="pol-badge tr">${icon('lock')}Only me</span>`:''})).join('')}</div>`:''}
        <button class="btn btn-soft btn-block mt16" id="pSend">${icon('send')}Send to crew</button>
        <div class="btn-grid mt16"><a class="btn btn-soft" href="${esc(directionsURL(v))}" target="_blank" rel="noopener">${icon('directions')}Directions</a><button class="btn btn-soft" id="pMap">${icon('map')}Show on map</button></div>
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
      const pa=el.querySelector('#pAdd'); if (pa) pa.onclick=()=>rateSheet(taggedOn.id, paint);
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

/* ---------- new / edit venue: the place card ----------
   Prefilled from the seed (Overture) when the place was picked from search, empty when added by hand, the place's
   own values when editing. Every field can be changed; a small label says where each value came from (Listing,
   Web, You, Old import). Kinds suggested by the listing are shown, never applied: you tap to confirm. Saving marks
   every value you typed or changed as yours ('user'), which later enrichment never overwrites. */
const SRC_LABEL = { seed:'Listing', web:'Web', user:'You', legacy_google:'Old import' };
const srcTag = s => s && SRC_LABEL[s] ? `<span class="src-tag src-${s}">${SRC_LABEL[s]}</span>` : '';
function venueForm(initial, onSave, title){
  const fs0 = { ...(initial.fieldSources||{}) };
  const d={ name:initial.name||'', zone:initial.zone||MAP.viewZone()?.id||'downtown', categories:initial.categories?[...initial.categories]:[], lat:initial.lat??null, lng:initial.lng??null,
    address:initial.address||'', phone:initial.phone||'', website:initial.website||'', instagram:initial.instagram ? '@'+initial.instagram : '', otherSocials:(initial.otherSocials||[]).slice(),
    tags: initial.id ? S.venueTags(initial.id) : (initial.tags||[]).slice(), tagDraft:'', social:'' };
  const was = JSON.parse(JSON.stringify({ name:d.name, zone:d.zone, coords:[d.lat, d.lng], address:d.address, phone:d.phone, website:d.website, instagram:d.instagram, other_socials:d.otherSocials, categories:d.categories }));
  // kinds the listing suggests that you haven't picked (shisha and karak are never suggested: you pick those)
  const suggested = ()=>(initial.suggested||[]).filter(k=>catById(k) && !d.categories.includes(k));
  // a new place: which meal was it? (goes on the visit you log next; editing a place doesn't ask)
  const askMeal = !initial.id; if (askMeal) d.meals = [];
  const manual = !initial.id && !initial.seedId;
  openSheet((body)=>{
    const paint=()=>{
      const z=MAP.zoneById(d.zone), pinned = typeof d.lat==='number';
      const src = f => srcTag(changed(f) ? 'user' : fs0[f]);
      const fieldHTML = (id, f, label, val, attrs) => `<div class="field mt16"><div class="field-label"><label class="eyebrow" for="${id}">${label}</label>${val ? src(f) : ''}</div><input class="input mt8" id="${id}" value="${esc(val)}" ${attrs||''}></div>`;
      body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">${esc(title||'Add a new place')}</h2></div></div>
        ${initial.seedId && !initial.id ? `<p class="muted small mt4">Filled in from the place listing. Check it, change anything, then save.</p>` : manual ? `<p class="muted small mt4">Not in the listing? Add it here and pin it on the map.</p>` : ''}
        <div class="field mt16"><div class="field-label"><label class="eyebrow" for="vfN">Name</label>${src('name')}</div><input class="input mt8" id="vfN" maxlength="80" value="${esc(d.name)}" placeholder="e.g. Sunset Karak Corner"></div>
        ${fieldHTML('vfA', 'address', 'Address', d.address, 'maxlength="200" placeholder="Street, building, area" autocomplete="off"')}
        <div class="row mt16" style="gap:var(--sp-2);flex-wrap:wrap"><span class="grow small row" style="gap:var(--sp-2);flex-wrap:wrap;${pinned?'color:var(--green);font-weight:700':''}"><span class="${pinned?'':'muted'}">${pinned?'Exact spot pinned':`Somewhere in ${esc(z?z.label:APP.city)}`}</span>${pinned ? src('coords') : ''}</span>
          <button class="btn btn-white btn-sm" id="vfPick">${icon('pin_drop')}${pinned?'Move pin':'Pick on map'}</button><button class="btn btn-white btn-sm" id="vfLoc" aria-label="Use my location">${icon('my_location')}</button></div>
        <div class="field mt16"><div class="field-label"><label class="eyebrow" for="vfZ">Area</label>${src('zone')}</div><select class="input mt8" id="vfZ">${MAP.ZONES.slice().sort((a,b)=>a.label.localeCompare(b.label)).map(x=>`<option value="${x.id}"${x.id===d.zone?' selected':''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="eyebrow mt24">Kind of place</div>
        ${suggested().length ? `<div class="suggest-row mt8"><span class="small muted">The listing says</span>${suggested().map(k=>`<button type="button" class="person-chip suggest-chip" data-suggest="${k}">${iconSvg(k, catById(k).color)}${esc(catById(k).label)}${icon('add')}</button>`).join('')}</div>` : ''}
        <div class="chip-wrap mt8" id="vfC">${catPickerHTML(d.categories, {open:body.dataset.catsOpen==='1'})}</div>
        <div class="row between mt24"><span class="eyebrow">Tags</span><span class="hand">Optional</span></div>
        <div class="chip-wrap mt8">${d.tags.map(t=>`<button type="button" class="person-chip on" data-tag-rm="${esc(t)}" aria-label="Remove tag ${esc(t)}">${esc(t)}${icon('close')}</button>`).join('')}
          ${S.allTags().filter(t=>!d.tags.includes(t)).slice(0, 6).map(t=>`<button type="button" class="person-chip" data-tag-add="${esc(t)}">${icon('add')}${esc(t)}</button>`).join('')}</div>
        <input class="input mt8" id="vfT" maxlength="30" value="${esc(d.tagDraft)}" placeholder="Add a tag (rooftop, late night…) and press Enter" autocomplete="off" enterkeyhint="done">
        <div class="row between mt24"><span class="eyebrow">Contact</span><span class="hand">Optional</span></div>
        ${fieldHTML('vfP', 'phone', 'Phone', d.phone, 'type="tel" inputmode="tel" maxlength="20" placeholder="+971 4 000 0000" autocomplete="off"')}
        ${fieldHTML('vfW', 'website', 'Website', d.website, 'type="url" inputmode="url" maxlength="300" placeholder="https://" autocomplete="off"')}
        ${fieldHTML('vfI', 'instagram', 'Instagram', d.instagram, 'maxlength="60" placeholder="@handle" autocapitalize="off" autocomplete="off" spellcheck="false"')}
        <div class="field mt16"><div class="field-label"><span class="eyebrow">Other links</span>${d.otherSocials.length ? src('other_socials') : ''}</div>
          ${d.otherSocials.map((u,i)=>`<div class="link-row mt8"><span class="trunc grow small">${esc(u.replace(/^https?:\/\/(www\.)?/,''))}</span><button type="button" class="icon-btn" data-social-rm="${i}" aria-label="Remove link">${icon('close')}</button></div>`).join('')}
          ${d.otherSocials.length < 8 ? `<input class="input mt8" id="vfS2" type="url" inputmode="url" maxlength="300" value="${esc(d.social)}" placeholder="Facebook, TikTok… link, then Enter" autocomplete="off" enterkeyhint="done">` : ''}</div>
        ${askMeal?`<div class="row between mt24"><span class="eyebrow">Meal</span><span class="hand">Optional</span></div>
        <div class="chip-wrap mt8" id="vfM">${MEALS.map(m=>`<button type="button" class="person-chip meal-chip${d.meals.includes(m.id)?' on':''}" data-meal="${m.id}" aria-pressed="${d.meals.includes(m.id)}">${icon(m.icon)}${m.label}</button>`).join('')}</div>`:''}
        ${initial.seedId ? `<p class="g-attr mt16">Listing data from <b>Overture Maps Foundation</b>, Places theme</p>` : ''}
        <div class="sheet-foot"><button class="btn btn-gold btn-block" id="vfS">${askMeal ? `Next step${icon('arrow_forward')}` : `${icon('check')}Save place`}</button></div>`;
      const keep = fn=>{ const st=body.scrollTop; fn(); body.scrollTop=st; };
      const bindText = (sel, key)=>{ const i=body.querySelector(sel); if (i) i.oninput=()=>{ d[key]=i.value; }; };
      bindText('#vfN','name'); bindText('#vfA','address'); bindText('#vfP','phone'); bindText('#vfW','website'); bindText('#vfI','instagram'); bindText('#vfT','tagDraft'); bindText('#vfS2','social');
      body.querySelectorAll('#vfM [data-meal]').forEach(b=>b.onclick=()=>{ const m=b.dataset.meal; d.meals=d.meals.includes(m)?d.meals.filter(x=>x!==m):[...d.meals,m]; keep(paint); });
      body.querySelector('#vfZ').onchange=e=>{ d.zone=e.target.value; keep(paint); };
      bindCatPicker(body.querySelector('#vfC'), body);
      body.querySelector('#vfC').onclick=e=>{ const b=e.target.closest('[data-cat]'); if (!b) return; const id=b.dataset.cat; d.categories.includes(id)?d.categories.splice(d.categories.indexOf(id),1):d.categories.push(id); keep(paint); };
      body.querySelectorAll('[data-suggest]').forEach(b=>b.onclick=()=>{ if (!d.categories.includes(b.dataset.suggest)) d.categories.push(b.dataset.suggest); keep(paint); });
      body.querySelectorAll('[data-tag-rm]').forEach(b=>b.onclick=()=>{ d.tags=d.tags.filter(t=>t!==b.dataset.tagRm); keep(paint); });
      body.querySelectorAll('[data-tag-add]').forEach(b=>b.onclick=()=>{ d.tags=[...d.tags, b.dataset.tagAdd]; keep(paint); });
      const ti=body.querySelector('#vfT'); ti.onkeydown=e=>{ if (e.key!=='Enter' && e.key!==',') return; e.preventDefault(); addTag(); keep(paint); const n=body.querySelector('#vfT'); if (n) n.focus(); };
      const si=body.querySelector('#vfS2'); if (si) si.onkeydown=e=>{ if (e.key!=='Enter') return; e.preventDefault(); if (addSocial()) { keep(paint); const n=body.querySelector('#vfS2'); if (n) n.focus(); } };
      body.querySelectorAll('[data-social-rm]').forEach(b=>b.onclick=()=>{ d.otherSocials.splice(+b.dataset.socialRm,1); keep(paint); });
      body.querySelector('#vfPick').onclick=()=>{
        const layer=body.closest('.sheet'); layer.style.visibility='hidden'; document.querySelectorAll('.scrim').forEach(s=>s.style.visibility='hidden');
        const start = typeof d.lat==='number' ? MAP.placeWorld({id:'x', lat:d.lat, lng:d.lng}) : MAP.placeWorld({id:'x'+d.zone, zone:d.zone});
        pickOnMap(start, res=>{
          layer.style.visibility=''; document.querySelectorAll('.scrim').forEach(s=>s.style.visibility='');
          if (res){ if (!res.inMap) return toast("That's outside the map"); d.lat=res.lat; d.lng=res.lng; d.zone=res.zone; keep(paint); }
        });
      };
      body.querySelector('#vfLoc').onclick=()=>{
        if (!navigator.geolocation) return toast("This browser can't share your location");
        navigator.geolocation.getCurrentPosition(p=>{
          const ai=MAP.toAI(p.coords.latitude,p.coords.longitude);
          if (!MAP.inMap(ai.a,ai.i)) return toast("You're outside the map area");
          d.lat=p.coords.latitude; d.lng=p.coords.longitude; d.zone=MAP.nearestZone(ai.a,ai.i).id; keep(paint); toast('Pinned to where you are');
        }, e=>toast(e.code===1?'Location permission is off for this site':"Couldn't get your location"), {enableHighAccuracy:true, timeout:10000});
      };
      body.querySelector('#vfS').onclick=save;
    };
    // has a value moved away from what the card opened with? (then it's yours)
    const now = ()=>({ name:d.name.trim(), zone:d.zone, coords:[d.lat, d.lng], address:d.address.trim(), phone:d.phone.trim(), website:d.website.trim(), instagram:d.instagram.trim(), other_socials:d.otherSocials, categories:d.categories });
    const changed = f => JSON.stringify(now()[f]) !== JSON.stringify(was[f]);
    const addTag = ()=>{ const t=S.tagKey(d.tagDraft); d.tagDraft=''; if (!t) return; if (catById(t)) { if (!d.categories.includes(t)) d.categories.push(t); return; } if (!d.tags.includes(t)) d.tags=[...d.tags, t].slice(0, 12); };
    const addSocial = ()=>{ const v=d.social.trim(); if (!v) return false; const u=/^https?:\/\//i.test(v) ? v : 'https://'+v;
      if (!validUrl(u)) { toast('That doesn’t look like a link'); return false; }
      if (instagramFrom(u)) { d.instagram='@'+instagramFrom(u); d.social=''; return true; }
      if (!d.otherSocials.includes(u)) d.otherSocials.push(u); d.social=''; return true; };
    const save = ()=>{
      if (d.tagDraft.trim()) addTag();
      if (d.social.trim() && !addSocial()) return;
      if (!d.name.trim()){ toast('Give the place a name'); body.querySelector('#vfN').focus(); return; }
      if (manual && typeof d.lat!=='number'){ toast('Drop a pin on the map so the crew can find it'); return; }
      if (!d.categories.length){ toast('Pick at least one kind of place'); return; }
      const ig = d.instagram.trim() ? instagramFrom(d.instagram) : null;
      if (d.instagram.trim() && !ig){ toast('That isn’t an Instagram handle (letters, numbers, . and _)'); return; }
      const site = d.website.trim() ? cleanWebsite(d.website) : null;
      if (d.website.trim() && !site){ toast('That website doesn’t look right'); return; }
      const phone = d.phone.trim() ? (cleanPhone(d.phone) || (validPhone(d.phone.trim()) ? d.phone.trim() : null)) : null;
      if (d.phone.trim() && !phone){ toast('That phone number doesn’t look right'); return; }
      // where each value came from now: anything you typed or changed is yours
      const fieldSources = { ...fs0 };
      Object.keys(was).forEach(f=>{ if (changed(f)) fieldSources[f]='user'; else if (!fieldSources[f] && JSON.stringify(now()[f]) !== JSON.stringify(f==='coords'?[null,null]:f==='other_socials'||f==='categories'?[]:'')) fieldSources[f] = initial.seedId && !initial.id ? 'seed' : 'user'; });
      // kinds are always confirmed by a person, and so are tags
      fieldSources.categories = 'user';
      if (!fieldSources.zone && initial.seedId) fieldSources.zone = 'seed';
      const out = { name:d.name.trim(), zone:d.zone, categories:d.categories, lat:d.lat, lng:d.lng, address:d.address.trim(), phone, website:site, instagram:ig, otherSocials:d.otherSocials,
        fieldSources, seedId:initial.seedId||null, tags:d.tags, meals:d.meals };
      back(); onSave(out);
    };
    paint();
  });
}
// editing a place: the changed values are yours; tags you added or took off go too
function editVenue(v, after){ venueForm(v, d=>{
  const before = S.venueTags(v.id);
  S.updateVenue(v.id, { name:d.name, zone:d.zone, categories:d.categories, lat:d.lat, lng:d.lng, address:d.address, phone:d.phone, website:d.website, instagram:d.instagram, otherSocials:d.otherSocials, fieldSources:d.fieldSources });
  d.tags.filter(t=>!before.includes(t)).forEach(t=>S.addVenueTag(v.id, t));
  before.filter(t=>!d.tags.includes(t)).forEach(t=>S.removeVenueTag(v.id, t));
  toast('Place updated'); go.refresh(); after&&after(); }, 'Edit place'); }

/* =========================================================
   14. CHECK IN: one flow whether you're there now or it was last week.
   Step 1 is search only (places on the map, then the Dubai place listing, or add it yourself). On step 2, "I'm here now"
   finds you once (never tracked). A visit saved today within CHECKIN_M of the place (AREA_M of its area
   when it has no exact spot) is a check-in; otherwise it's a visit you're logging after.
   ========================================================= */
const CHECKIN_M = 300, AREA_M = 1500;
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
    dish: editing ? (editing.dishTags||[]).slice() : [],
    who: editing ? (editing.private ? [] : (editing.crewIds&&editing.crewIds.length ? editing.crewIds.slice() : (S.myCrew()?[S.myCrew().id]:[]))) : whoDefault(opts.who),
  };
  const existingPhotos = editing ? S.photos({entryId:editing.id}) : [];
  const newPhotos = (opts.photos||[]).slice(0, APP.photosPerLog);   // {blob, url, caption}: some may arrive picked already
  let query = opts.prefill && opts.prefill.name ? opts.prefill.name : '';
  // where you are, once you've said "I'm here now"
  let here = null, locating = false;
  const checkedIn = ()=>{ if (!here || !venue || editing || d.kind!=='visit' || d.date!==todayISO()) return false;
    return placeDistance(venue, here) <= (typeof venue.lat==='number' ? CHECKIN_M : AREA_M); };
  // the place listing (Overture, in Koko's own database) while typing: places nobody has logged yet
  const g = { list:[], q:'', loading:false, off:false, seq:0, timer:null, picking:null };
  openScreen(el=>{
    let stars=null;
    const paint=()=>{
      const crew=S.myCrew();
      // step 2's ⋮ opens the place page; step 1 has no place yet, so no menu
      const header = topbar({title: editing?'Edit visit':'Check in', center:true, actions: venue ? `<button class="icon-btn" id="lMore" aria-label="More">${icon('more_vert')}</button>` : ''});
      const stepRow = `<div class="row between mt8"><span class="ck-steps" aria-hidden="true"><i class="${venue?'done':'on'}"></i><i class="bar"></i><i class="${venue?'on':''}"></i></span><span class="hand">${venue?'Step 2: details and memories':'Step 1: find the place'}</span></div>`;
      if (!venue){
        const results = S.searchVenues(query, 10);
        el.innerHTML = header + `<div class="screen-body">${stepRow}
          <label class="search mt16">${icon('search')}<input id="logQ" placeholder="Search a café, bakery, karak stop…" value="${esc(query)}" autocomplete="off"></label>
          <div class="stack mt16" id="lRes">${results.map(v=>{
            const sum=M.venueSummary(v,{...state.scope, mode:'crew', members:null}), z=MAP.zoneById(v.zone);
            return `<button class="search-result" data-v="${v.id}">${stampHTML(sum.state,{cat:M.primaryCat(v)})}<span class="grow"><b class="trunc" style="display:block">${esc(v.name)}</b><span class="muted small">${esc(z?z.label:'')}${sum.visitorIds.length?` • ${plural(sum.visitorIds.length,'crew visit')}`:''}</span></span>${icon('chevron_right')}</button>`;
          }).join('')}
          ${seedHTML()}
          ${query.trim()?`<button class="search-result" id="lNew" style="background:var(--sc)"><span class="sr-ico">${icon('add_location_alt')}</span><span class="grow"><b class="trunc" style="display:block">Add “${esc(query.trim())}” yourself</b><span class="muted small" style="display:block">${g.q===query.trim() && !g.loading && !g.list.length ? 'Not in the list: type the name and pin it' : 'Not listed? Type the name and pin it'}</span></span>${icon('chevron_right')}</button>`:''}
          </div>
          ${!query.trim()?`<div class="empty"><span class="stamp st-want big"><span class="st-paper"><span class="st-ico">${iconSvg('karak','#7e5700')}</span></span><span class="st-ribbon">TRY</span></span><span class="hand">Where did you eat?</span><p class="muted small">${S.venues().length ? 'Search places you and your crew have pinned, or type a new name to add it.' : 'Type its name to add it. Every place on the map starts with someone pinning it.'}</p></div>`:''}
        </div>`;
        const q=el.querySelector("#logQ"); q.focus();
        q.oninput=()=>{ query=q.value; const pos=q.selectionStart; paint(); const n=el.querySelector("#logQ"); n.setSelectionRange(pos,pos); suggestSoon(); };
        el.querySelectorAll('[data-seed]').forEach(b=>b.onclick=()=>pickSeed(b.dataset.seed, b));
        el.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ venue=S.venue(b.dataset.v); paint(); });
        // a landmark's 'Add a pin here' brings its spot along
        const nb=el.querySelector('#lNew'); if (nb) nb.onclick=()=>venueForm({name:query.trim(), ...(opts.prefill && opts.prefill.lat!=null ? { lat:opts.prefill.lat, lng:opts.prefill.lng, zone:zoneFor(opts.prefill.lat, opts.prefill.lng) || opts.zone } : { zone:opts.zone })}, dd=>{
          // the same name pinned right next to a place already on the map is that place
          const same = S.venueNear(dd.name, dd.lat, dd.lng);
          if (same) toast(same.name+' is already on the map: your visit goes there');
          venue = same || S.addVenue(dd); if (dd.meals && dd.meals.length) d.meals=dd.meals.slice(); paint(); });
        return;
      }
      const sum=M.venueSummary(venue,{...state.scope, mode:'crew', members:null});
      const others=sum.others.map(S.user).filter(Boolean);
      const lastOther = sum.visits.filter(e=>e.userId!==me.id).sort((a,b)=>b.createdAt-a.createdAt)[0];
      // a visit here you were tagged on (new logs only): adding to it is usually what you meant
      const tagged = !editing && d.kind==='visit' ? sum.visits.filter(e=>S.canRate(e)).sort((a,b)=>b.createdAt-a.createdAt)[0] : null;
      const allPhotos = existingPhotos.length + newPhotos.length;
      const used = S.myPhotoCount() + newPhotos.length;
      // tagging a crewmate shares the visit with a crew you're both in
      const tagCrews = d.kind==='visit' ? S.crewsForTags([...d.tags, ...S.mentionIds(d.notes)], d.who||[], editing ? editing.taggedIds : []) : [];
      el.innerHTML = header + `<div class="screen-body">${stepRow}
        <label class="search mt16">${icon('search')}<input value="${esc(venue.name)}" readonly aria-label="Place">${editing?'':`<button type="button" id="lChange" class="link small" aria-label="Change place">Change</button>`}</label>
        ${others.length?`<div class="already mt16"><b>${esc(venue.name)} is already on the crew map!</b>
          <p class="muted mt4">${tagged ? `<span class="hl">${esc(S.user(tagged.userId)?.name||'A friend')}</span> tagged you on their visit. Add your rating and photos to it, or log a new visit of your own below.` : `Your visit goes on the same pin as ${others.slice(0,2).map(u=>`<span class="hl">${esc(u.name||u.handle)}</span>`).join(' and ')}${others.length>2?` +${others.length-2}`:''}'s.`}</p>
          ${tagged ? `<button type="button" class="btn btn-gold btn-block mt16" id="lJoin">${icon('add_a_photo')}Add to their visit</button>` : ''}
          <div class="row mt8">${avatarStack(others,30,3)}<span class="hand">Visited ${lastOther?whenText(lastOther).toLowerCase().replace(/ •.*/,''):''}</span></div></div>`:''}
        <div class="card mt16" style="border-radius:var(--r-xl)">
          <div class="seg"><button data-k="visit" class="${d.kind==='visit'?'on':''}">Been here</button><button data-k="want" class="${d.kind==='want'?'on':''}">Want to try</button></div>
          ${d.kind==='visit'?`<div class="row between mt24" style="align-items:flex-end;flex-wrap:wrap;gap:var(--sp-3)"><div><span class="eyebrow">Rating</span><div class="star-input mt8" id="lStars"></div></div>
            <div><span class="eyebrow">Date</span><label class="date-pill mt8">${icon('calendar_month')}<span id="lDateTxt">${d.date===todayISO()?'Today, ':''}${fmtDate(d.date,{day:'numeric',month:'short'})}</span><input type="date" id="lDate" value="${d.date}" max="${todayISO()}"></label></div></div>
            ${!editing && d.date===todayISO() ? (checkedIn() ? `<p class="tag green mt16">${icon('where_to_vote')}Checked in: you’re here</p>`
              : here ? `<p class="muted small mt16">You’re ${distText(placeDistance(venue, here))} away, so this saves as a visit, not a check-in.</p>`
              : `<button type="button" class="btn btn-soft mt16" id="lVerify"${locating?' disabled':''}>${icon('my_location')}${locating?'Finding you…':'I’m here now'}</button>`) : ''}`:''}
          <div class="row between mt24"><span class="eyebrow">Meal</span><span class="hand">Optional</span></div>
          <div class="chip-wrap mt8" id="lMeals">${MEALS.map(m=>`<button type="button" class="person-chip meal-chip${d.meals.includes(m.id)?' on':''}" data-meal="${m.id}" aria-pressed="${d.meals.includes(m.id)}">${icon(m.icon)}${m.label}</button>`).join('')}</div>
          ${d.kind==='visit' ? dishHTML() : ''}
          <div class="field-label mt24"><span class="eyebrow">${d.kind==='visit'?'Notes':'Why you want to go'}</span><span class="hand">Optional</span></div>
          <textarea class="input mt8" id="lNotes" maxlength="400" placeholder="${d.kind==='visit'?'Tasting notes, hidden gems, dish recommendations…':'Who recommended it, what to order…'}">${esc(d.notes)}</textarea>
          <div class="row between mt24"><span class="eyebrow">Photos</span><span class="muted small">${allPhotos} of ${APP.photosPerLog}</span></div>
          ${aiTagsOn() ? '<p class="muted small mt4 ai-note">Photos are read by AI to make them searchable.</p>' : ''}
          <div class="reel mt16">
            ${existingPhotos.map(p=>polaroidHTML({src:S.photoURL(p), caption:p.caption, id:p.id, tape:false, rot:0})).join('')}
            ${newPhotos.map((p,i)=>`<div style="position:relative"><button class="rm" data-rm="${i}" aria-label="Remove photo">${icon('close')}</button>${polaroidHTML({src:p.url, id:'n'+i, tape:false, rot:0, sub:`<input data-cap="${i}" value="${esc(p.caption)}" placeholder="caption" maxlength="40">`})}</div>`).join('')}
            ${allPhotos<APP.photosPerLog && used<APP.photoLimit?`<label class="add-photo">${icon('photo_camera')}<span>Take photo</span><input type="file" accept="image/*" capture="environment" id="lCam" aria-label="Take a photo"></label><label class="add-photo">${icon('photo_library')}<span>Add photos</span><input type="file" accept="image/*" multiple id="lPh" aria-label="Add photos from your library"></label>`:''}
          </div>
          <div class="capacity mt16"><span class="cap-ico">${icon('photo_library')}</span><div class="grow"><div class="row between mono" style="font-size:12px;font-weight:700"><span>Scrapbook Roll Capacity</span><span style="color:var(--rust)">${used} / ${APP.photoLimit}</span></div><div class="cap-bar mt8"><i style="width:${Math.min(100,used/APP.photoLimit*100)}%"></i></div></div></div>
          ${used>=APP.photoLimit?`<div class="alert warn mt16">${icon('photo_library')}<div><b>Photo roll is full</b>Delete a photo from your book to add more.</div></div>`:''}
          <div class="eyebrow mt24">Who's this for?</div>
          <div class="mt8" id="lWho">${whoHTML(d.who)}</div>
          ${S.crewmates().length && d.kind==='visit' ? `<div class="row between mt24"><span class="eyebrow">Who were you with?</span>${d.tags.length?`<span class="tag soft">${d.tags.length} tagged</span>`:''}</div>
          <p class="muted small mt4">They'll see it in their Tagged scrapbook, and it goes in the crew book you share. Or type @name in your notes.</p>
          <div class="chip-scroll mt8" id="lTags">${S.crewmates().map(u=>`<button type="button" class="person-chip${d.tags.includes(u.id)?' on':''}" data-tag="${u.id}" aria-pressed="${d.tags.includes(u.id)}">${avatarHTML(u,30)}@${esc(u.handle)}${d.tags.includes(u.id)?icon('check_circle'):''}</button>`).join('')}</div>${tagCrews.length?`<p class="tag-note mt8">${icon('groups')}<span>Tagging shares this visit with <b>${esc(tagCrews.map(c=>c.name).join(' and '))}</b></span></p>`:''}` : ''}
        </div>
        <button class="btn btn-gold btn-block mt24" id="lSave" style="min-height:62px;font-size:21px">${icon('bookmark_add')}${editing?'Save changes':'Save to Scrapbook'}</button>
        ${editing?`<button class="btn btn-danger btn-block mt16" id="lDel">${icon('delete')}Delete this log</button>`:''}
      </div>`;
      // wiring
      const ch=el.querySelector('#lChange'); if (ch) ch.onclick=()=>{ venue=null; paint(); };
      const jn=el.querySelector('#lJoin'); if (jn) jn.onclick=()=>{ back(); setTimeout(()=>rateSheet(tagged.id), 80); };
      el.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ d.kind=b.dataset.k; keepScroll(paint); });
      const st=el.querySelector('#lStars'); if (st) stars=starInput(st, d.rating, v=>{ d.rating=v; });
      const dt=el.querySelector('#lDate'); if (dt) dt.onchange=()=>{ d.date=dt.value||todayISO(); keepScroll(paint); };
      const vf=el.querySelector('#lVerify'); if (vf) vf.onclick=()=>locate();
      const nt=el.querySelector('#lNotes'); nt.oninput=()=>{ d.notes=nt.value; };
      bindWho(el, ()=>d.who, v=>{ d.who=v; keepScroll(paint); });
      el.querySelectorAll('[data-meal]').forEach(b=>b.onclick=()=>{ const m=b.dataset.meal; d.meals=d.meals.includes(m)?d.meals.filter(x=>x!==m):[...d.meals,m]; keepScroll(paint); });
      // what you had: tap a suggestion to add it, tap a chosen one to take it off, or type one and press Enter
      el.querySelectorAll('[data-dish-add]').forEach(b=>b.onclick=()=>{ d.dish = S.dishTagsOf([...d.dish, b.dataset.dishAdd]); keepScroll(paint); });
      el.querySelectorAll('[data-dish-rm]').forEach(b=>b.onclick=()=>{ d.dish = d.dish.filter(t=>t!==b.dataset.dishRm); keepScroll(paint); });
      const di = el.querySelector('#lDish'); if (di) di.onkeydown = e=>{ if (e.key==='Enter' || e.key===','){ e.preventDefault(); const v = di.value; if (v.trim()){ d.dish = S.dishTagsOf([...d.dish, v]); keepScroll(paint); const n = el.querySelector('#lDish'); if (n) n.focus(); } } };
      el.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{ const id=b.dataset.tag; d.tags=d.tags.includes(id)?d.tags.filter(x=>x!==id):[...d.tags,id]; const sx=el.querySelector('#lTags').scrollLeft; keepScroll(paint); el.querySelector('#lTags').scrollLeft=sx; });
      el.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.rm; URL.revokeObjectURL(newPhotos[i].url); newPhotos.splice(i,1); keepScroll(paint); });
      el.querySelectorAll('[data-cap]').forEach(inp=>inp.oninput=()=>{ newPhotos[+inp.dataset.cap].caption=inp.value; });
      el.querySelectorAll('.reel [data-photo]').forEach(f=>{ if (!f.dataset.photo.startsWith('n')) f.onclick=()=>go.viewer(existingPhotos.map(p=>p.id), existingPhotos.findIndex(p=>p.id===f.dataset.photo)); });
      const addFiles=async(input)=>{
        const files=[...input.files]; const room=Math.min(APP.photosPerLog-allPhotos, APP.photoLimit-used);
        if (files.length>room) toast(`Only ${room} more photo${room===1?'':'s'} fit on this log`);
        for (const f of files.slice(0,room)){
          try{ const blob=await compressImage(f, 1400, 0.8); newPhotos.push({blob, url:URL.createObjectURL(blob), caption:''}); }
          catch(_){ toast(`Couldn't read ${f.name}`); }
        }
        keepScroll(paint);
      };
      ['#lPh', '#lCam'].forEach(s=>{ const i=el.querySelector(s); if (i) i.onchange=()=>addFiles(i); });
      el.querySelector('#lMore').onclick=()=>placeScreen(venue.id);
      el.querySelector('#lSave').onclick=save;
      const del=el.querySelector('#lDel'); if (del) del.onclick=async()=>{
        const snap=await S.deleteEntry(editing.id); back(); go.refresh();
        toast('Log deleted', snap && !snap.photos.length ? 'Undo' : null, ()=>{ S.restoreEntry(snap); go.refresh(); });
      };
    };
    // the listing's places (ones already on your map show above instead, and aren't repeated)
    const seedHTML = ()=>{
      if (!query.trim() || g.off) return '';
      const list = g.list.filter(p=>!S.venueBySeed(p.id));
      if (!list.length) return g.loading ? `<p class="muted small mt16 row" style="gap:var(--sp-2)">${icon('travel_explore')}Looking through Dubai’s places…</p>` : '';
      return `<div class="eyebrow mt16">Places in Dubai</div>${list.map(p=>{ const z=MAP.zoneById(p.zone), k=(p.kinds||[])[0];
        return `<button class="search-result" data-seed="${esc(p.id)}"><span class="sr-ico">${k && catById(k) ? iconSvg(k, catById(k).color) : icon('storefront')}</span><span class="grow" style="min-width:0"><b class="trunc" style="display:block">${esc(p.name)}</b><span class="muted small trunc" style="display:block">${esc([z?z.label:'', p.address].filter(Boolean).join(' • '))}</span></span>${g.picking===p.id ? '<span class="muted small">Opening…</span>' : icon('chevron_right')}</button>`; }).join('')}`;
    };
    // repaint without losing the cursor in the search box
    const repaintSearch = ()=>{ if (venue) return; const q=el.querySelector('#logQ'), had = q && document.activeElement===q, pos = q ? q.selectionStart : 0; paint(); const n=el.querySelector('#logQ'); if (n && had){ n.focus(); n.setSelectionRange(pos,pos); } };
    const suggestSoon = ()=>{
      clearTimeout(g.timer);
      const qq = query.trim();
      if (g.off || qq.length < 2){ g.list = []; g.q = qq; g.loading = false; return; }
      if (qq === g.q) return;
      g.timer = setTimeout(async ()=>{
        const my = ++g.seq; g.loading = true; repaintSearch();
        // nearest first among equally good names: around where the map is looking
        const at = MAP.centerLatLng ? MAP.centerLatLng() : null;
        const r = await placesApi({ action:'seed_search', input:qq, ...(at && at.lat!=null ? { lat:at.lat, lng:at.lng } : {}) });
        if (my !== g.seq) return;                       // a newer search is on its way
        g.loading = false; g.q = qq;
        if (r.state === 'unavailable' || r.state === 'signed_out'){ g.off = true; g.list = []; }
        else g.list = r.state === 'ok' ? (r.results||[]) : [];
        repaintSearch();
      }, 250);
    };
    // a listing place: the Koko place if someone has logged it (a second visit, never a second place), otherwise
    // its details on a card to check and save
    const pickSeed = async (id, btn)=>{
      const known = S.venueBySeed(id);
      if (known){ venue = known; paint(); return; }
      if (g.picking) return;
      g.picking = id; repaintSearch();
      const r = await placesApi({ action:'seed_details', id });
      g.picking = null;
      if (r.state !== 'ok' || !r.place){ toast('Couldn’t open that place. Add it yourself.'); repaintSearch(); return; }
      const p = r.place;
      // typed by hand before, right here: that's the same place
      const same = S.venueNear(p.name, p.lat, p.lng);
      if (same){ venue = same; paint(); return; }
      venueForm(seedInitial(p, opts.zone), dd=>{ venue=S.addVenue(dd); if (dd.meals && dd.meals.length) d.meals=dd.meals.slice(); paint(); });
    };
    const keepScroll=(fn)=>{ const s=el.scrollTop; fn(); el.scrollTop=s; };
    // "What did you have?": the chosen ones, then suggestions (from this visit's photos when tagging is on, your own
    // tags, then a starter list), never required
    const dishHTML = ()=>{
      const photoTags = [...new Set(existingPhotos.flatMap(p=>p.aiTags||[]))];
      const own = S.myDishTags(), seen = new Set(d.dish);
      const sug = [...photoTags.map(t=>({ t, photo:true })), ...[...own, ...DISH_SEED].map(t=>({ t }))].filter(x=>!seen.has(x.t) && (seen.add(x.t), true)).slice(0, 10);
      return `<div class="row between mt24"><span class="eyebrow">What did you have?</span><span class="hand">Optional</span></div>
        ${d.dish.length ? `<div class="chip-wrap mt8" id="lDishOn">${d.dish.map(t=>`<button type="button" class="person-chip on" data-dish-rm="${esc(t)}" aria-label="Remove ${esc(t)}">${esc(t)}${icon('close')}</button>`).join('')}</div>` : ''}
        <div class="chip-wrap mt8" id="lDishSug">${sug.map(x=>`<button type="button" class="person-chip" data-dish-add="${esc(x.t)}">${x.photo ? icon('photo_camera') : icon('add')}${esc(x.t)}</button>`).join('')}</div>
        <input class="input mt8" id="lDish" maxlength="30" placeholder="Add a dish and press Enter" autocomplete="off" enterkeyhint="done">`;
    };
    // "I'm here now" at a place: find you once; the check-in's catch comes when you save.
    const locate = async ()=>{
      if (locating) return; locating = true; keepScroll(paint);
      try{ here = await whereAmI(); }
      catch(e){ toast(locationError(e), null, null, 4500); }
      locating = false;
      if (!el.isConnected) return;
      keepScroll(paint);
    };
    const save=async()=>{
      if (d.who===null){ el.querySelector('#lWho').scrollIntoView({ block:'center', behavior:'smooth' }); return toast('Choose who it’s for'); }
      const btn=el.querySelector('#lSave'); btn.disabled=true;
      go.tourSaved && go.tourSaved();
      // one check-in per place a day; another visit the same day is just a visit
      const isCheckin = checkedIn() && !S.entries({venueId:venue.id, userId:me.id, kind:'visit'}).some(x=>x.checkin && x.date===todayISO());
      // dish tags only once there are some (or you've cleared ones a visit had)
      const dishChanged = d.kind==='visit' && (d.dish.length || (editing && (editing.dishTags||[]).length));
      const data={ kind:d.kind, ...(isCheckin ? { checkin:true } : {}), ...(dishChanged ? { dishTags:d.dish } : {}), rating:d.kind==='visit'?d.rating:0, date:d.kind==='visit'?d.date:todayISO(), notes:d.notes.trim(), crewIds:d.who, meals:d.meals, taggedIds:d.kind==='visit' ? [...new Set([...d.tags, ...S.mentionIds(d.notes)])] : [] };
      let e;
      if (editing){ e=S.updateEntry(editing.id, data); }
      else e=S.addEntry({venueId:venue.id, ...data});
      if (newPhotos.length) await S.addPhotos(newPhotos.map(p=>({blob:p.blob, caption:p.caption.trim(), venueId:venue.id, entryId:e.id, date:e.date})));
      newPhotos.forEach(p=>URL.revokeObjectURL(p.url));
      closeAll();
      if (opts.after) setTimeout(opts.after, 1800);   // (Import Roll: the next group from the roll)
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
    if (opts.here && venue && !editing) locate();
  });
}
go.log = logFlow;
