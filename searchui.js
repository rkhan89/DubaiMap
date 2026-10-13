// The search bar: one always-visible bar for finding and adding, the same on the Map and the Shelf (and in a book,
// as a sheet). search.js does the matching; this file shows it.
//   Results are photo cards: one per place, its matching scrapbook visits folded in (a photo, else its stamp; name,
//   area, rating, who's been). On the Map a card flies to the pin and opens its card; on the Shelf it opens the
//   visit's scrapbook page (or the place, if nobody has logged it yet). "Show on map" dims every other pin.
//   A Google Maps (or any) link, or a name that matches nothing, gets "Add this place" first: it goes to the usual
//   add-from-link flow (share.js), which finds it, checks the crew map first and asks you to confirm.
// Only what you can already see is searched (the store's own visibility rules; nothing is fetched).
// Areas and synonyms come from the areas and search_synonyms tables once signed in, with the copies the app ships
// with (search-data.js) until then and offline.
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import * as C from './cloud.js';
import * as P from './pages.js';
import { esc, CATEGORIES, fmtDate } from './data.js';
import { icon, openSheet, back, closeAll, stampHTML } from './ui.js';
import { avatarStack } from './avatar.js';
import { go, state } from './go.js';
import { buildIndex, search } from './search.js';
import { AREAS, SYNONYMS } from './search-data.js';

const CACHE = 'koko-search-data';
let areas = AREAS, synonyms = SYNONYMS, fetched = false;
try{ const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c && c.areas && c.areas.length) ({ areas, synonyms } = c); }catch(_){}
// the tables, once a session (falls back quietly to what we have)
async function refreshData(){
  if (fetched || !C.enabled()) return; fetched = true;
  try{
    const c = await C.client(); if (!c) return;
    const [a, s] = await Promise.all([c.from('areas').select('*'), c.from('search_synonyms').select('terms')]);
    if (a.data && a.data.length){ areas = a.data; if (s.data && s.data.length) synonyms = s.data.map(r=>r.terms); index = null;
      try{ localStorage.setItem(CACHE, JSON.stringify({ areas, synonyms })); }catch(_){} }
  }catch(_){}
}

let index = null;
const catNames = Object.fromEntries(CATEGORIES.map(c=>[c.id, c.label]));
function indexNow(){
  if (index) return index;
  const w = S.pagesWorld(), users = {};
  [...w.entries.flatMap(e=>[e.userId, ...(e.taggedIds||[])])].forEach(id=>{ const u = S.user(id); if (u) users[id] = { name:u.name, handle:u.handle }; });
  index = buildIndex({ me:S.me()?.id, venues:S.venues(), entries:w.entries, photos:w.photos, pages:w.pages, users, areas, synonyms, categories:catNames });
  return index;
}
const bars = new Set();
S.onChange(()=>{ index = null; bars.forEach(b=>b.rerun()); });

const areaName = id=>{ const a = indexNow().areaById.get(id); return a ? a.name : ''; };
const isLink = q=>/https?:\/\/\S+/i.test(q);

// one card per place: the place's own hit and its matching visits together, best first
function merge(hits){
  const by = new Map();
  const add = (r, visit)=>{
    let c = by.get(r.venue.id);
    if (!c){ c = { venue:r.venue, area:r.area, score:r.score, recent:r.recent, entries:[], fromPhoto:true }; by.set(r.venue.id, c); }
    c.score = Math.min(c.score, r.score); c.recent = Math.max(c.recent, r.recent); c.fromPhoto = c.fromPhoto && !!r.fromPhoto;
    if (visit) c.entries.push(r.entry);
  };
  hits.places.forEach(r=>add(r, false)); hits.entries.forEach(r=>add(r, true));
  return [...by.values()].sort((a, b)=>a.score - b.score || b.recent - a.recent);
}
// the photo a card shows: from a matching visit first, else any you can see of the place
function cardPhoto(c){
  for (const e of c.entries){ const p = S.photos({ entryId:e.id })[0]; if (p) return p; }
  return S.photos({ venueId:c.venue.id })[0] || null;
}
function cardHTML(c){
  const v = c.venue, sum = M.venueSummary(v, { ...state.scope, mode:'crew', members:null }), ph = cardPhoto(c);
  const who = sum.visitorIds.map(S.user).filter(Boolean), e = c.entries[0];
  const where = areaName(c.area) || MAP.zoneById(v.zone)?.label || 'Dubai';
  const when = e && e.date ? fmtDate(e.date, { day:'numeric', month:'short', year:'numeric' }) : '';
  return `<button class="sr-card" data-v="${esc(v.id)}"${e ? ` data-e="${esc(e.id)}"` : ''}>
    <span class="sr-img${ph ? '' : ' sr-stamp'}">${ph ? `<img src="${esc(S.photoURL(ph))}" alt="" loading="lazy">` : stampHTML(sum.state, { cat:M.primaryCat(v) })}</span>
    <span class="sr-body"><b class="trunc">${esc(v.name)}</b>
      <span class="muted small trunc">${esc(where)}${when ? ' • ' + esc(when) : ''}${e && (e.dishTags||[]).length ? ' • ' + esc(e.dishTags.slice(0, 2).join(', ')) : ''}</span>
      <span class="sr-meta">${sum.rating ? `<span class="sr-rate">★ ${sum.rating}</span>` : ''}${who.length ? `<span class="sr-who">${avatarStack(who, 22, 4)}</span>` : ''}${c.fromPhoto ? `<span class="sr-photo">${icon('photo_camera')}from photo</span>` : ''}</span></span>
  </button>`;
}
function addHTML(q){
  const link = isLink(q);
  return `<button class="sr-card sr-add" data-add="1"><span class="sr-img sr-stamp">${icon('add_location_alt')}</span>
    <span class="sr-body"><b>Add this place</b><span class="muted small trunc">${link ? 'From the link you pasted' : `Find “${esc(q.trim())}” and add it`}</span></span></button>`;
}
// the book a visit's page is in: yours for your visits, your Tagged book if you were tagged, else a crew book
function bookFor(e){
  const bs = S.books(), me = S.me()?.id;
  if (e.userId === me) return bs.find(b=>b.kind === 'personal');
  if ((e.taggedIds||[]).includes(me)) return bs.find(b=>b.kind === 'tagged') || bs.find(b=>b.kind === 'personal');
  return bs.find(b=>b.kind === 'crew' && (e.crewIds||[]).includes(b.crewId)) || bs.find(b=>b.kind === 'crew') || bs.find(b=>b.kind === 'personal');
}

/* ---------- the bar ---------- */
// host: where it goes. ctx: 'map' (results open under the bar, over the map; a card flies to the pin) or 'shelf'
// (results go in opts.out, in place of what's there; a card opens the page). opts.onActive(on) says when results show.
export function mountSearchBar(host, ctx, opts){
  opts = opts || {};
  refreshData();
  let query = '', timer = 0, showOnMap = false, last = null;
  host.innerHTML = `<div class="ksearch ksearch-${ctx}" role="search">
      <label class="ksearch-bar">${icon('search')}<input type="search" class="ksearch-q" placeholder="${ctx === 'map' ? 'Search, or paste a Maps link' : 'Search your scrapbooks'}" autocomplete="off" enterkeyhint="search" aria-label="Search">
        <button type="button" class="ksearch-x" aria-label="Clear search" hidden>${icon('close')}</button></label>
      ${ctx === 'map' ? `<div class="ksearch-drop" hidden><label class="sr-toggle"><input type="checkbox" class="ksearch-show"><span>Show on map</span></label><div class="ksearch-out"></div></div>` : ''}
    </div>`;
  const root = host.firstElementChild, q = root.querySelector('.ksearch-q'), x = root.querySelector('.ksearch-x');
  const drop = root.querySelector('.ksearch-drop'), out = ctx === 'map' ? root.querySelector('.ksearch-out') : opts.out;
  const setOpen = on=>{ if (drop) drop.hidden = !on; root.classList.toggle('open', on); opts.onActive && opts.onActive(on); };
  const applyMap = ()=>{
    if (ctx !== 'map') return;
    if (!showOnMap || !query.trim() || !last){ MAP.setSearchMatches(null); return; }
    MAP.setSearchMatches(new Set(last.map(c=>c.venue.id)));
  };
  const run = ()=>{
    const t = query.trim(); x.hidden = !query;
    if (!t){ last = null; if (out) out.innerHTML = ''; setOpen(false); applyMap(); return; }
    const cards = isLink(t) ? [] : merge(search(indexNow(), t));
    last = cards;
    const add = isLink(t) || (!cards.length && t.length >= 2);
    out.innerHTML = (add ? addHTML(t) : '')
      + (cards.length ? `<div class="sr-grid">${cards.slice(0, 40).map(cardHTML).join('')}</div>`
        : add ? `<p class="sr-hint">Nothing on your map matches “${esc(t)}” yet.</p>` : '');
    setOpen(true); applyMap();
  };
  const bar = { rerun:()=>{ if (query.trim() && root.isConnected) run(); }, focus:()=>q.focus(), set:v=>{ q.value = query = v; run(); } };
  bars.add(bar);
  q.addEventListener('input', ()=>{ query = q.value; clearTimeout(timer); timer = setTimeout(run, 70); });
  q.addEventListener('focus', ()=>{ if (query.trim()) setOpen(true); });
  q.addEventListener('keydown', e=>{ if (e.key === 'Escape'){ q.value = query = ''; run(); q.blur(); } });
  x.onclick = ()=>{ q.value = query = ''; run(); q.focus(); };
  const mapToggle = root.querySelector(".ksearch-show"); if (mapToggle) mapToggle.onchange = ()=>{ showOnMap = mapToggle.checked; applyMap(); };
  out.addEventListener('click', e=>{
    if (e.target.closest('[data-add]')){ const t = query.trim(); closeAll(); setTimeout(()=>go.shareAdd(t), 80); return; }
    const card = e.target.closest('[data-v]'); if (!card) return;
    const v = S.venue(card.dataset.v); if (!v) return;
    const en = card.dataset.e && S.entry(card.dataset.e), b = en && bookFor(en);
    if (ctx === 'map'){
      setOpen(false); q.blur();
      MAP.flyToSeparate(MAP.placeWorld(v), S.venues().filter(o=>o.id !== v.id).map(o=>MAP.placeWorld(o)));
      setTimeout(()=>go.peek && go.peek(v.id), 380);
    } else if (b){ opts.inSheet && back(); setTimeout(()=>go.bookPage(b.id, P.pageId(b.id, en.id)), opts.inSheet ? 200 : 0); }
    else { opts.inSheet && back(); setTimeout(()=>go.place(v.id), opts.inSheet ? 200 : 0); }
  });
  // on the map, tapping elsewhere tucks the results away (the query stays; tap the bar to see them again)
  if (ctx === 'map') document.addEventListener('pointerdown', e=>{ if (root.isConnected && !root.contains(e.target) && root.classList.contains('open')){ setOpen(false); q.blur(); } }, true);
  return bar;
}

// the map's bar (app.js mounts it); go.search puts the cursor in it
let mapBar = null;
export function mountMapSearch(host){ mapBar = mountSearchBar(host, 'map'); return mapBar; }
go.search = q=>{ if (!mapBar) return; go.switchView && go.switchView('map'); if (typeof q === 'string') mapBar.set(q); mapBar.focus(); };

// in a book: the same bar, as a sheet
export function openScrapbookSearch(){
  openSheet(body=>{
    body.innerHTML = `<div class="search-sheet"><div class="ss-host"></div><div class="sr-out ss-out"></div></div>`;
    const bar = mountSearchBar(body.querySelector('.ss-host'), 'shelf', { out:body.querySelector('.ss-out'), inSheet:true });
    setTimeout(()=>bar.focus(), 60);
  }, { cls:'search-sheet-host' });
}
go.scrapbookSearch = openScrapbookSearch;
