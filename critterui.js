// Critters on screen: the collection (your field guide), a critter's page, the catch moment,
// the favourite picker, and "I'm here now" (also on the Check in screen). Content: critters.js; where they live:
// config.js (CRITTER_SPOTS); the catching rule: catch.js.
//
// No hints anywhere: an uncaught critter is a grey silhouette and "? ? ?", nothing else, and a
// check-in that catches nothing says nothing about how close you were.
import { APP, CRITTER_SPOTS } from './config.js';
import * as S from './store.js';
import { CRITTERS, THEMES, critterById, critterImg, LANDMARK_CRITTERS, lockedImg } from './critters.js';
import { SHOW_LOCKED_LANDMARK_CRITTERS } from './landmark-critters.js';
import { critterCheck, accuracyNeeded } from './catch.js';
import { whereAmI, locationError } from './locate.js';
import { esc, fmtDate } from './data.js';
import { icon, toast, openScreen, openSheet, back, topbar, toggleHTML, bindToggle } from './ui.js';
import { go } from './go.js';

const CFG = APP.critters;
// pixel art is 32 px native: only ever drawn at whole multiples of that
export function critterArt(id, size, opts){
  opts = opts || {};
  return `<img class="critter-art${opts.silhouette?' silhouette':''}" src="${esc(critterImg(id))}" width="${size}" height="${size}" alt="${opts.silhouette?'':esc(critterById(id)?.name||'')}" draggable="false">`;
}
export function themeChip(theme){ const t = THEMES[theme] || THEMES.Fun; return `<span class="theme-chip" style="--c:${t.color};--ci:${t.ink}">${esc(theme)}</span>`; }
const iso = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const whereText = c => c.venueId && S.venue(c.venueId) ? S.venue(c.venueId).name : (c.spot || 'Dubai');
function factHTML(cr){
  if (cr.needsVerification && CFG.hideUnverifiedFacts) return '';
  return `<div class="fact-card"><span class="eyebrow">${icon('menu_book')}Field note</span><p>${esc(cr.fact)}</p>
    ${cr.needsVerification ? `<p class="fact-check">${icon('fact_check')}Fact being checked</p>` : ''}</div>`;
}

/* ---------- the collection ---------- */
// the landmark critters: only the ones found (no silhouettes, no count) unless the locked flag is turned on
function landmarkSection(have, fav){
  const shown = LANDMARK_CRITTERS.filter(c=>have.has(c.id) || SHOW_LOCKED_LANDMARK_CRITTERS);
  if (!shown.length) return '';
  return `<h2 class="h-md mt24">Landmark critters</h2><div class="critter-grid mt12">${shown.map(c=>have.has(c.id)
    ? `<button class="critter-card caught" data-critter="${c.id}">${fav===c.id?`<span class="fav-tag">${icon('favorite','',true)}Favourite</span>`:''}<span class="cc-art">${critterArt(c.id, 96)}</span><b>${esc(c.name)}</b>${themeChip(c.theme)}</button>`
    : `<div class="critter-card unknown" aria-label="Not found yet"><span class="cc-art"><img class="critter-art" src="${esc(lockedImg(c.id))}" width="96" height="96" alt=""></span><b>? ? ?</b><span class="theme-chip blank">&nbsp;</span></div>`).join('')}</div>`;
}
function collection(userId){
  const me = S.me(); userId = userId || me.id;
  const mine = userId === me.id, u = S.user(userId);
  let theme = 'All';
  openScreen(el=>{
    const paint = ()=>{
      const have = S.caughtIds(userId), fav = S.favouriteOf(userId);
      const list = CRITTERS.filter(c=>theme==='All' || c.theme===theme);
      el.innerHTML = topbar({ title: mine ? 'Critters' : (u?.name||u?.handle||'Their')+'’s critters', eyebrow:'' }) + `<div class="screen-body">
        <div class="row between mt8"><p class="hand grow">Critters live at real places around Dubai. Check in where they are to find them.</p>
          <span class="tag soft found-count">${CRITTERS.filter(c=>have.has(c.id)).length} of ${CRITTERS.length} found</span></div>
        <div class="chip-scroll mt12" role="tablist">${['All', ...Object.keys(THEMES)].map(t=>`<button class="person-chip${theme===t?' on':''}" data-theme="${t}" role="tab" aria-selected="${theme===t}">${esc(t)}</button>`).join('')}</div>
        <div class="critter-grid mt16">${list.map(c=>{ const got = have.has(c.id);
          return got
            ? `<button class="critter-card caught" data-critter="${c.id}">${fav===c.id?`<span class="fav-tag">${icon('favorite','',true)}Favourite</span>`:''}<span class="cc-art">${critterArt(c.id, 96)}</span><b>${esc(c.name)}</b>${themeChip(c.theme)}</button>`
            : `<div class="critter-card unknown" aria-label="Not found yet"><span class="cc-art">${critterArt(c.id, 96, { silhouette:true })}</span><b>? ? ?</b><span class="theme-chip blank">&nbsp;</span></div>`;
        }).join('')}</div>
        ${landmarkSection(have, fav)}
        ${mine ? `<button class="btn btn-gold btn-block mt24" id="crHere">${icon('my_location')}I’m here now</button>
        <p class="center muted small mt8">Uses your location once, only when you tap.</p>` : ''}
      </div>`;
      el.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{ theme = b.dataset.theme; paint(); });
      el.querySelectorAll('[data-critter]').forEach(b=>b.onclick=()=>detail(b.dataset.critter, userId));
      const here = el.querySelector('#crHere'); if (here) here.onclick = ()=>checkInHere();
    };
    paint(); el._repaint = paint;
    const off = S.onChange(w=>{ if (!el.isConnected){ off(); return; } if (['catches','me','sync'].includes(w)) paint(); });
  });
}
go.critters = collection;

/* ---------- one critter ---------- */
function detail(id, userId){
  const cr = critterById(id), me = S.me(); userId = userId || me.id;
  const c = S.catchOf(userId, id); if (!cr || !c) return;
  const mine = userId === me.id;
  openScreen(el=>{
    const paint = ()=>{
      const fav = S.favouriteOf(userId) === id;
      el.innerHTML = topbar({ title:'' }) + `<div class="screen-body">
        <div class="critter-hero mt8"><span class="tape"></span>${critterArt(id, 192)}</div>
        <div class="center mt16"><h1 class="h-lg critter-name">${esc(cr.name)}</h1><div class="mt8">${themeChip(cr.theme)}</div></div>
        <div class="field-log mt20">
          <div class="fl-row">${icon('location_on')}<span><span class="eyebrow">Caught at</span><b>${esc(whereText(c))}</b></span></div>
          <div class="fl-row">${icon('calendar_month')}<span><span class="eyebrow">On</span><b>${esc(fmtDate(iso(c.caughtAt)))}</b></span></div>
        </div>
        ${factHTML(cr) ? `<div class="mt16">${factHTML(cr)}</div>` : ''}
        ${mine ? `<div class="person-row mt16">${icon('favorite')}<span class="pr-main"><span class="pr-name">Favourite</span><span class="pr-sub">Shown with your face on your pins and your profile</span></span>${toggleHTML('crFav', fav, 'Favourite')}</div>` : ''}
      </div>`;
      const t = el.querySelector('#crFav'); if (t) bindToggle(t, on=>{ S.setFavourite(on ? id : null); toast(on ? `${cr.name} is your favourite` : 'No favourite'); paint(); go.refresh(); });
    };
    paint();
  });
}
go.critter = detail;

/* ---------- the catch moment (once per critter: a catch is only ever recorded once) ---------- */
function catchMoment(c, done){
  const cr = critterById(c.critterId);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wrap = document.createElement('div'); wrap.className = 'catch-moment' + (reduce ? ' calm' : '');
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'New critter: '+cr.name);
  wrap.innerHTML = `<div class="cm-sheet">
      <div class="cm-top"><span class="eyebrow">${icon('auto_awesome')}New critter caught</span><h2 class="cm-name">${esc(cr.name)}</h2>${themeChip(cr.theme)}
        <div class="cm-art">${critterArt(cr.id, 192)}<i class="sp s1"></i><i class="sp s2"></i><i class="sp s3"></i></div></div>
      <div class="cm-body">
        <div class="field-log"><div class="fl-row">${icon('location_on')}<span><span class="eyebrow">Found at</span><b>${esc(whereText(c))}</b></span></div></div>
        ${factHTML(cr)}
        <div class="btn-grid mt16"><button class="btn btn-soft" data-cm="fav">${icon('favorite')}Make favourite</button><button class="btn btn-gold" data-cm="ok">Done</button></div>
      </div></div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(()=>wrap.classList.add('in'));
  const close = ()=>{ wrap.classList.remove('in'); setTimeout(()=>{ wrap.remove(); done && done(); }, 220); };
  wrap.querySelector('[data-cm="ok"]').onclick = close;
  wrap.querySelector('[data-cm="fav"]').onclick = ()=>{ S.setFavourite(cr.id); go.refresh(); toast(`${cr.name} is your favourite`); close(); };
}

// after a check-in: catch whatever lives here, one moment at a time; done(caughtAny)
function critterCatch(pos, opts, done){
  opts = opts || {};
  const r = critterCheck(pos, CRITTER_SPOTS, S.caughtIds(), CFG);
  const fresh = r.caught.map(k=>S.recordCatch(k.id, { lat:pos.lat, lng:pos.lng, accuracy:pos.accuracy, spot:k.spot.name, venueId:opts.venueId })).filter(Boolean);
  if (!fresh.length){ done && done(false); return false; }
  const next = ()=>{ const c = fresh.shift(); if (c) catchMoment(c, next); else done && done(true); };
  next(); return true;
}
go.critterCatch = critterCatch;

// the location has to be good enough for the strictest spot; saying so is the same everywhere,
// so it never hints that a critter is nearby
const FUZZY_M = Math.min(...Object.values(CRITTER_SPOTS).flat().map(s=>accuracyNeeded(s, CFG)));
async function checkInHere(){
  toast('Finding you…');
  let pos;
  try{ pos = await whereAmI(); }
  catch(e){ toast(locationError(e), null, null, 4500); return; }
  const caught = critterCatch({ ...pos, venue:false }, {}, ()=>{});
  if (caught) return;
  if (!(pos.accuracy <= FUZZY_M)) toast(`Your location is fuzzy right now (about ${Math.round(pos.accuracy)} m). Try again outside or in a moment.`, null, null, 4500);
  else toast('Checked in. Nothing new here this time.');
}
go.checkInHere = checkInHere;

/* ---------- pick your favourite ---------- */
function favouritePicker(){
  const me = S.me(), have = [...CRITTERS, ...LANDMARK_CRITTERS].filter(c=>S.caughtIds().has(c.id));   // landmark critters can be favourites too
  openSheet(body=>{
    const paint = ()=>{
      const fav = S.favouriteOf(me.id);
      body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">Your favourite critter</h2><p class="muted small">It sits by your face on your pins and your profile. Your crew sees it.</p></div></div>
        ${have.length ? `<div class="critter-grid picker mt8">${have.map(c=>`<button class="critter-card caught${fav===c.id?' picked':''}" data-pick="${c.id}" aria-pressed="${fav===c.id}"><span class="cc-art">${critterArt(c.id, 64)}</span><b>${esc(c.name)}</b></button>`).join('')}</div>`
          : `<p class="muted mt12">Catch a critter first: check in where they live.</p>`}
        <button class="btn btn-soft btn-block mt16" data-pick="">${icon('block')}No favourite</button>`;
      body.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{ S.setFavourite(b.dataset.pick || null); go.refresh(); back(); toast(b.dataset.pick ? `${critterById(b.dataset.pick).name} is your favourite` : 'No favourite'); });
    };
    paint();
  });
}
go.favouritePicker = favouritePicker;

// the favourite beside someone's face (pins: 32 px; profile: 64 px)
export function favouriteBadge(userId, size){ const f = S.favouriteOf(userId); return f ? `<span class="fav-critter">${critterArt(f, size)}</span>` : ''; }
