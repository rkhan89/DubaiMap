// Ratings on screen: the row of people on a visit with their own stars, the overall line
// ("Crew avg ★ 4.3 · 3 ratings"), and the sheet where someone tagged on a visit adds or edits
// their own rating and note. The numbers come from ratings.js, the one calculation.
import * as S from './store.js';
import * as R from './ratings.js';
import { esc } from './data.js';
import { avatarHTML } from './avatar.js';
import { icon, toast, openSheet, back, starInput } from './ui.js';
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
  return `<span class="rater${isMe?' me':''}" title="${esc(name(u))}">${avatarHTML(u, 28)}<span class="rp-who">${esc(name(u))}</span>${tail}</span>`;
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
// add or change your own rating on a visit you were tagged on (the logger's own: their log)
export function rateSheet(entryId, after){
  const e = S.entry(entryId); if (!e) return;
  if (e.userId === S.me().id){ go.log({ entryId }); return; }
  if (!S.canRate(e)) return toast('Only people tagged on this visit can rate it');
  const mine = S.myRatingOn(entryId), logger = S.user(e.userId), v = S.venue(e.venueId);
  let rating = mine ? mine.rating : 0;
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">Your rating</span><h2 class="h-md">${esc(v?.name||'This visit')}</h2>
        <span class="hand">${esc((logger?.name||'A friend'))} tagged you${e.date?' • '+esc(e.date):''}</span></div></div>
      <div class="star-input big mt12" id="rsStars"></div>
      <textarea class="input mt16" id="rsNote" maxlength="400" placeholder="A line about it (optional)">${esc(mine?.note||'')}</textarea>
      <p class="muted small mt8">${icon('groups')} Seen by the people on this visit and the crews it was shared with that you’re in.</p>
      <div class="sheet-foot btn-grid">${mine?`<button class="btn btn-soft" id="rsDel">Remove</button>`:`<button class="btn btn-soft" data-act="back">Cancel</button>`}<button class="btn btn-gold" id="rsSave">${icon('check')}Save</button></div>`;
    starInput(body.querySelector('#rsStars'), rating, x=>{ rating = x; });
    body.querySelector('#rsSave').onclick = ()=>{
      if (!rating) return toast('Tap the stars to rate it');
      S.rateVisit(entryId, rating, body.querySelector('#rsNote').value); back(); toast('Rating saved'); go.refresh(); after && after();
    };
    const del = body.querySelector('#rsDel'); if (del) del.onclick = ()=>{ S.unrateVisit(entryId); back(); toast('Rating removed'); go.refresh(); after && after(); };
  });
}
go.rate = rateSheet;
