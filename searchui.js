// Search, in two places: a panel on the map, and a sheet in the scrapbooks (the Shelf and each book), the same box
// and the same results (search.js does the matching); in the scrapbooks the entries come first and there's no
// "Show on map".
// Tap a place: the map flies to its pin and its card opens. Tap an entry: its scrapbook page opens. "Show on map"
// dims every pin but the matches; clearing the search (or closing the panel) puts the map back.
// Areas and synonyms come from the areas and search_synonyms tables once signed in (so they're edited there), with
// the copies the app ships with (search-data.js) until then and offline.
import * as S from './store.js';
import * as MAP from './map.js';
import * as C from './cloud.js';
import * as P from './pages.js';
import { esc, CATEGORIES, fmtDate } from './data.js';
import { icon, openSheet, back, closeAll } from './ui.js';
import { go } from './go.js';
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

let index = null, panel = null, query = '', showOnMap = false, timer = 0, lastHits = null;
const catNames = Object.fromEntries(CATEGORIES.map(c=>[c.id, c.label]));
function indexNow(){
  if (index) return index;
  const w = S.pagesWorld(), users = {};
  [...w.entries.flatMap(e=>[e.userId, ...(e.taggedIds||[])])].forEach(id=>{ const u = S.user(id); if (u) users[id] = { name:u.name, handle:u.handle }; });
  index = buildIndex({ me:S.me()?.id, venues:S.venues(), entries:w.entries, photos:w.photos, pages:w.pages, users, areas, synonyms, categories:catNames });
  return index;
}
S.onChange(()=>{ index = null; if (panel && query) run(); });

const areaName = id=>{ const a = (index || indexNow()).areaById.get(id); return a ? a.name : ''; };
const fromPhoto = `<span class="sr-photo">${icon('photo_camera')}from photo</span>`;
function placeRow(r){
  return `<button class="search-result" data-sv="${esc(r.venue.id)}"><span class="sr-ico">${icon('location_on')}</span><span class="grow"><b class="trunc" style="display:block">${esc(r.venue.name)}</b>
    <span class="muted small">${esc(areaName(r.area) || 'Dubai')}</span>${r.fromPhoto ? fromPhoto : ''}</span>${icon('chevron_right')}</button>`;
}
function entryRow(r){
  const e = r.entry, u = S.user(e.userId), who = u && e.userId !== S.me()?.id ? (u.name || u.handle) + ' • ' : '';
  const what = (e.dishTags||[]).slice(0, 3).join(', ');
  return `<button class="search-result" data-se="${esc(e.id)}"><span class="sr-ico">${icon('auto_stories')}</span><span class="grow"><b class="trunc" style="display:block">${esc(r.venue.name)}</b>
    <span class="muted small">${esc(who)}${esc(fmtDate(e.date, { day:'numeric', month:'short', year:'numeric' }))}${what ? ' • ' + esc(what) : ''}</span>${r.fromPhoto ? fromPhoto : ''}</span>${icon('chevron_right')}</button>`;
}
function render(){ renderInto(panel.querySelector('#srOut'), query, lastHits, false); }
function renderInto(out, q, hits, entriesFirst){
  if (!q.trim()){ out.innerHTML = `<p class="sr-hint">Search places, dishes, areas and people.</p>`; return; }
  const { places, entries } = hits;
  if (!places.length && !entries.length){ out.innerHTML = `<p class="sr-hint">Nothing matches “${esc(q.trim())}”. Try a dish, a place or an area.</p>`; return; }
  const P1 = places.length ? `<div class="eyebrow">Places</div><div class="stack mt8">${places.slice(0, 20).map(placeRow).join('')}</div>` : '';
  const E1 = entries.length ? `<div class="eyebrow">Scrapbook entries</div><div class="stack mt8">${entries.slice(0, 30).map(entryRow).join('')}</div>` : '';
  out.innerHTML = (entriesFirst ? [E1, P1] : [P1, E1]).filter(Boolean).join('<div class="mt16"></div>');
}
function applyMap(){
  if (!showOnMap || !query.trim() || !lastHits){ MAP.setSearchMatches(null); return; }
  MAP.setSearchMatches(new Set([...lastHits.places.map(r=>r.venue.id), ...lastHits.entries.map(r=>r.venue.id)]));
}
function run(){ lastHits = query.trim() ? search(indexNow(), query) : null; render(); applyMap(); }

// the book a visit's page is in: yours for your visits, your Tagged book if you were tagged, else a crew book
function bookFor(e){
  const bs = S.books(), me = S.me()?.id;
  if (e.userId === me) return bs.find(b=>b.kind === 'personal');
  if ((e.taggedIds||[]).includes(me)) return bs.find(b=>b.kind === 'tagged') || bs.find(b=>b.kind === 'personal');
  return bs.find(b=>b.kind === 'crew' && (e.crewIds||[]).includes(b.crewId)) || bs.find(b=>b.kind === 'crew') || bs.find(b=>b.kind === 'personal');
}
export function openSearch(){
  refreshData();
  if (panel){ panel.querySelector('#srQ').focus(); return; }
  panel = document.createElement('div'); panel.className = 'search-panel map-ui'; panel.setAttribute('role', 'search');
  panel.innerHTML = `<div class="sr-bar"><label class="search grow">${icon('search')}<input id="srQ" type="search" placeholder="Search places, dishes, areas…" autocomplete="off" enterkeyhint="search" aria-label="Search" value="${esc(query)}"></label>
      <button class="icon-btn" id="srClose" aria-label="Close search">${icon('close')}</button></div>
    <label class="sr-toggle"><input type="checkbox" id="srMap"${showOnMap ? ' checked' : ''}><span>Show on map</span></label>
    <div class="sr-out" id="srOut"></div>`;
  document.querySelector('#mapWrap').appendChild(panel);
  const q = panel.querySelector('#srQ');
  q.addEventListener('input', ()=>{ query = q.value; panel.classList.remove('min'); clearTimeout(timer); timer = setTimeout(run, 60); });
  panel.querySelector('#srMap').onchange = e=>{ showOnMap = e.target.checked; applyMap(); };
  // the close button clears the search first, then closes
  panel.querySelector('#srClose').onclick = ()=>{ if (query){ q.value = query = ''; panel.classList.remove('min'); run(); q.focus(); } else closeSearch(); };
  panel.addEventListener('click', e=>{
    const pv = e.target.closest('[data-sv]'), pe = e.target.closest('[data-se]');
    if (pv){ const v = S.venue(pv.dataset.sv); if (!v) return; panel.classList.add('min');
      MAP.flyToSeparate(MAP.placeWorld(v), S.venues().filter(x=>x.id !== v.id).map(x=>MAP.placeWorld(x)));
      setTimeout(()=>go.peek && go.peek(v.id), 380); }
    if (pe){ const en = S.entry(pe.dataset.se), b = en && bookFor(en); if (b) go.bookPage(b.id, P.pageId(b.id, en.id)); }
  });
  q.addEventListener('focus', ()=>panel.classList.remove('min'));
  run(); q.focus();
}
export function closeSearch(){
  if (!panel) return;
  panel.remove(); panel = null; query = ''; lastHits = null; MAP.setSearchMatches(null);
}
go.search = openSearch;

// in the scrapbooks: the same search as a sheet. A place goes to the map (flies to its pin, opens its card); an
// entry opens its page.
export function openScrapbookSearch(){
  refreshData();
  let q = '', hits = null, t = 0;
  openSheet(body=>{
    body.innerHTML = `<div class="search-sheet" role="search"><label class="search">${icon('search')}<input id="ssQ" type="search" placeholder="Search your scrapbooks…" autocomplete="off" enterkeyhint="search" aria-label="Search"></label>
      <div class="sr-out" id="ssOut"></div></div>`;
    const inp = body.querySelector('#ssQ'), out = body.querySelector('#ssOut');
    const go2 = ()=>{ hits = q.trim() ? search(indexNow(), q) : null; renderInto(out, q, hits, true); };
    inp.addEventListener('input', ()=>{ q = inp.value; clearTimeout(t); t = setTimeout(go2, 60); });
    out.addEventListener('click', e=>{
      const pv = e.target.closest('[data-sv]'), pe = e.target.closest('[data-se]');
      if (pv){ const v = S.venue(pv.dataset.sv); if (!v) return; closeAll(); go.switchView && go.switchView('map');
        setTimeout(()=>{ MAP.flyToSeparate(MAP.placeWorld(v), S.venues().filter(x=>x.id !== v.id).map(x=>MAP.placeWorld(x))); setTimeout(()=>go.peek && go.peek(v.id), 380); }, 120); }
      if (pe){ const en = S.entry(pe.dataset.se), b = en && bookFor(en); if (b){ back(); setTimeout(()=>go.bookPage(b.id, P.pageId(b.id, en.id)), 200); } }
    });
    go2(); setTimeout(()=>inp.focus(), 60);
  }, { cls:'search-sheet-host' });
}
go.scrapbookSearch = openScrapbookSearch;
