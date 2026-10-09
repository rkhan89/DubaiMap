// Ratings on screen: the row of people on a visit with their own stars, the overall line
// ("Crew avg ★ 4.3 · 3 ratings"), and the sheet where someone tagged on a visit adds or edits
// their own rating and note. The numbers come from ratings.js, the one calculation.
import * as S from './store.js';
import * as R from './ratings.js';
import { esc, fmtDate } from './data.js';
import { APP } from './config.js';
import { avatarHTML } from './avatar.js';
import { icon, toast, openSheet, back, starInput, polaroidHTML, compressImage } from './ui.js';
import { go } from './go.js';

const MAX = 4;   // people shown before "+N"
const name = u => u.id===S.me()?.id ? 'You' : (u.name || '@'+u.handle);

// small stars for a rating (half stars too)
export function miniStars(r){
  let s=''; for (let i=1;i<=5;i++) s += `<i class="${r>=i?'on':(r>=i-.5?'half':'')}"></i>`;
  return `<span class="mini-stars" aria-label="${R.fmt(r)} stars">${s}</span>`;
}
// one person on a visit: avatar plus their stars, or "Add yours" for you if you haven't rated
function personHTML(p, e, opts){
  const u = S.user(p.userId); if (!u) return '';
  const me = S.me(), isMe = u.id===me.id;
  let tail = '';
  if (p.rating) tail = miniStars(p.rating) + `<b class="rp-n">${R.fmt(p.rating)}</b>`;
  else if (isMe && opts.nudge) tail = `<button class="rp-add" data-rate="${esc(e.id)}">${icon('add')}Add yours</button>`;
  return `<span class="rater${isMe?' rater-me':''}" title="${esc(name(u))}">${avatarHTML(u, 28)}<span class="rp-who">${esc(name(u))}</span>${tail}</span>`;
}
// the people on a visit with their ratings for it; 5+ people: the first four and "+N"
export function ratersRowHTML(e, scope, opts){
  opts = opts || {};
  const people = R.visitPeople(e, scope, { meId:S.me().id, ratingsOf:S.ratingsOf });
  if (!people.length) return '';
  // you first (so "Add yours" is easy to find), then whoever rated, then the rest
  const me = S.me().id;
  people.sort((a,b)=>(b.userId===me)-(a.userId===me) || (!!b.rating)-(!!a.rating));
  const shown = people.slice(0, people.length > MAX+1 ? MAX : MAX+1), more = people.length - shown.length;
  return `<div class="raters">${shown.map(p=>personHTML(p, e, { nudge:opts.nudge!==false })).join('')}${more>0?`<button class="rater rp-more" data-raters="${esc(e.id)}">+${more}</button>`:''}</div>`;
}
// the overall line for a place: "Crew avg ★ 4.3 · 3 ratings" (nothing if nobody has rated)
export function overallHTML(r, label){
  const t = R.ratingText(r, label); if (!t) return '';
  return `<span class="overall">${esc(t)}</span>`;
}
// everyone on a visit, for "+N"
export function ratersSheet(e, scope){
  const people = R.visitPeople(e, scope, { meId:S.me().id, ratingsOf:S.ratingsOf });
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">Who was there</h2><span class="hand">${esc(S.venue(e.venueId)?.name||'')}</span></div></div>
      <div class="stack mt8">${people.map(p=>{ const u=S.user(p.userId); if (!u) return ''; return `<div class="person-row">${avatarHTML(u, 40)}<span class="pr-main"><span class="pr-name">${esc(name(u))}${p.logger?' <span class="tag soft">Logged it</span>':''}</span>${p.note?`<span class="pr-sub">“${esc(p.note)}”</span>`:''}</span>${p.rating?`${miniStars(p.rating)}<b class="mono">${R.fmt(p.rating)}</b>`:'<span class="muted small">No rating</span>'}</div>`; }).join('')}</div>`;
  });
}
// someone tagged you on their visit: add your side to it (your stars, a line, your photos), not a new visit.
// Your own visit there is a separate thing ("Log a new visit instead"). The logger's own visit opens their log.
export function rateSheet(entryId, after){
  const e = S.entry(entryId); if (!e) return;
  if (e.userId === S.me().id){ go.log({ entryId }); return; }
  if (!S.canRate(e)) return toast('Only people tagged on this visit can add to it');
  const me = S.me(), mine = S.myRatingOn(entryId), logger = S.user(e.userId), v = S.venue(e.venueId);
  const who = logger ? (logger.name || '@'+logger.handle) : 'A friend';
  const myPhotos = ()=>S.photos({ entryId }).filter(p=>p.userId===me.id);
  const theirs = S.photos({ entryId }).filter(p=>p.userId!==me.id).length;
  const added = [];                                   // {blob, url} picked in this sheet
  let rating = mine ? mine.rating : 0, note = mine?.note || '';
  const had = !!mine || myPhotos().length > 0;
  openSheet(body=>{
    const paint = ()=>{
      const have = myPhotos(), n = have.length + added.length, room = Math.min(APP.photosPerLog - n, APP.photoLimit - S.myPhotoCount() - added.length);
      body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">${esc(who)} tagged you</span><h2 class="h-md">${esc(v?.name||'This visit')}</h2>
          <span class="hand">${e.date ? esc(fmtDate(e.date, { day:'numeric', month:'short', year:'numeric' })) + ' • ' : ''}${had ? 'your part of the visit' : 'add your rating and photos to it'}</span></div></div>
        ${e.notes || e.rating || theirs ? `<div class="tagged-by mt8">${logger ? avatarHTML(logger, 28) : ''}<span class="grow small"><b>${esc(who)}</b>${e.rating ? ` • ★ ${R.fmt(e.rating)}` : ''}${theirs ? ` • ${theirs} photo${theirs===1?'':'s'}` : ''}${e.notes ? `<q>${esc(e.notes)}</q>` : ''}</span></div>` : ''}
        <span class="eyebrow mt20" style="display:block">Your rating</span>
        <div class="star-input big mt8" id="rsStars"></div>
        <textarea class="input mt16" id="rsNote" maxlength="400" placeholder="What did you think? (optional)">${esc(note)}</textarea>
        <div class="row between mt20"><span class="eyebrow">Your photos</span><span class="muted small">${n} of ${APP.photosPerLog}</span></div>
        <div class="reel mt8">
          ${have.map(p=>`<div style="position:relative"><button class="rm" data-rmold="${esc(p.id)}" aria-label="Remove photo">${icon('close')}</button>${polaroidHTML({ src:S.photoURL(p), id:p.id, tape:false, rot:0 })}</div>`).join('')}
          ${added.map((p,i)=>`<div style="position:relative"><button class="rm" data-rmnew="${i}" aria-label="Remove photo">${icon('close')}</button>${polaroidHTML({ src:p.url, id:'n'+i, tape:false, rot:0 })}</div>`).join('')}
          ${room > 0 ? `<label class="add-photo">${icon('photo_camera')}<span>Take photo</span><input type="file" accept="image/*" capture="environment" id="rsCam" aria-label="Take a photo"></label><label class="add-photo">${icon('photo_library')}<span>Add photos</span><input type="file" accept="image/*" multiple id="rsPh" aria-label="Add photos from your library"></label>` : ''}
        </div>
        <p class="muted small mt12">${icon('groups')} They go on ${esc(who)}’s visit, seen by the people on it and the crews you share.</p>
        <div class="sheet-foot"><button class="btn btn-gold btn-block" id="rsSave">${icon('check')}${had ? 'Save' : 'Add to ' + esc(who) + '’s visit'}</button>
          ${mine ? `<button class="btn btn-ghost btn-block mt8" id="rsDel">Remove my rating</button>` : ''}
          <button class="btn btn-ghost btn-block mt8" id="rsNew">${icon('add_location_alt')}Log a new visit of your own instead</button></div>`;
      starInput(body.querySelector('#rsStars'), rating, x=>{ rating = x; });
      const nt = body.querySelector('#rsNote'); nt.oninput = ()=>{ note = nt.value; };
      const addFiles = async input=>{
        const files = [...input.files];
        if (files.length > room) toast(`Only ${room} more photo${room===1?'':'s'} fit`);
        for (const f of files.slice(0, Math.max(0, room))){
          try{ const blob = await compressImage(f, 1400, 0.8); added.push({ blob, url:URL.createObjectURL(blob) }); }
          catch(_){ toast(`Couldn't read ${f.name}`); }
        }
        keep(paint);
      };
      ['#rsCam', '#rsPh'].forEach(s=>{ const i = body.querySelector(s); if (i) i.onchange = ()=>addFiles(i); });
      body.querySelectorAll('[data-rmnew]').forEach(b=>b.onclick=()=>{ const i = +b.dataset.rmnew; URL.revokeObjectURL(added[i].url); added.splice(i, 1); keep(paint); });
      body.querySelectorAll('[data-rmold]').forEach(b=>b.onclick=async ()=>{ await S.deletePhoto(b.dataset.rmold); go.refresh(); keep(paint); });
      body.querySelector('#rsSave').onclick = async ()=>{
        note = body.querySelector('#rsNote').value;
        if (!rating && !added.length && !myPhotos().length) return toast('Tap the stars, or add a photo');
        const btn = body.querySelector('#rsSave'); btn.disabled = true;
        if (rating) S.rateVisit(entryId, rating, note);
        if (added.length) await S.addPhotos(added.map(p=>({ blob:p.blob, caption:'', venueId:e.venueId, entryId, date:e.date })));
        added.forEach(p=>URL.revokeObjectURL(p.url));
        back(); toast(had ? 'Saved' : 'Added to ' + who + '’s visit'); go.refresh(); after && after();
      };
      const del = body.querySelector('#rsDel'); if (del) del.onclick = ()=>{ S.unrateVisit(entryId); rating = 0; toast('Rating removed'); go.refresh(); after && after(); keep(paint); };
      body.querySelector('#rsNew').onclick = ()=>{ back(); setTimeout(()=>go.log({ venueId:e.venueId }), 80); };
    };
    const keep = fn=>{ const s = body.scrollTop; fn(); body.scrollTop = s; };
    paint();
  });
}
go.rate = rateSheet;
