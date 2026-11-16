// The Places record on the List screen (Job 4, phase 2): every place you or your crew has been to, from the visits
// you can already see (the same rule as the feed: yours, and what the active crew shared with you). A place only
// saved to try isn't here: it hasn't been visited. Filters: name, areas (any of them), tags (all of them); sorted
// by most recent visit, most visited, or A to Z. Tapping a row opens the place.
import * as S from './store.js';
import * as MAP from './map.js';
import { catById, iconSvg, esc, plural } from './data.js';
import { avatarStack } from './avatar.js';
import { icon } from './ui.js';

// what the filters are now (kept while the app is open)
export const placesState = { q:'', areas:[], tags:[], sort:'recent' };

// tag ids on a place: its kinds (as "kind:coffee") and the words people added
const kindTag = id => 'kind:' + id;
const tagLabel = t => t.startsWith('kind:') ? (catById(t.slice(5))?.label || t.slice(5)) : t;
function tagsOf(v){ return [...(v.categories||[]).filter(c=>catById(c)).map(kindTag), ...S.venueTags(v.id)]; }

// the record: one row per place with at least one visit you can see
export function placesRecord(){
  const byVenue = new Map();
  S.entries({ kind:'visit' }).forEach(e=>{ const l = byVenue.get(e.venueId); if (l) l.push(e); else byVenue.set(e.venueId, [e]); });
  const out = [];
  byVenue.forEach((visits, id)=>{
    const v = S.venue(id); if (!v) return;
    const who = [...new Set(visits.flatMap(e=>[e.userId, ...(e.taggedIds||[])]))].map(S.user).filter(Boolean);
    out.push({ v, visits:visits.length, last:Math.max(...visits.map(e=>e.createdAt||0)), who, tags:tagsOf(v) });
  });
  return out;
}

// the record with the filters applied (exported for the tests)
export function filterPlaces(rows, f){
  const q = String(f.q||'').trim().toLowerCase();
  let out = rows.filter(r=>
    (!q || r.v.name.toLowerCase().includes(q)) &&
    (!f.areas.length || f.areas.includes(r.v.zone)) &&
    f.tags.every(t=>r.tags.includes(t)));
  if (f.sort==='visits') out.sort((a,b)=>b.visits-a.visits || b.last-a.last);
  else if (f.sort==='name') out.sort((a,b)=>a.v.name.localeCompare(b.v.name, 'en', { sensitivity:'base' }));
  else out.sort((a,b)=>b.last-a.last);
  return out;
}

// chip counts: areas that have at least one place, tags in use; most common first
function counts(rows, key){
  const n = new Map(); rows.forEach(r=>[].concat(key(r)).forEach(k=>{ if (k) n.set(k, (n.get(k)||0) + 1); }));
  return [...n.entries()].sort((a,b)=>b[1]-a[1] || String(a[0]).localeCompare(String(b[0])));
}

export function placesHTML(){
  const f = placesState, all = placesRecord(), rows = filterPlaces(all, f);
  const areas = counts(all, r=>r.v.zone).filter(([z])=>MAP.zoneById(z));
  const tags = counts(all, r=>r.tags);
  const filtered = !!(f.q.trim() || f.areas.length || f.tags.length);
  const chip = (attr, val, on, label, n, lead='')=>`<button type="button" class="person-chip${on?' on':''}" ${attr}="${esc(val)}" aria-pressed="${on}" style="padding-left:var(--sp-${lead?2:3})">${lead}${esc(label)} <em>${n}</em></button>`;
  return `
    <div class="search-row"><label class="search">${icon('search')}<input id="pq" type="search" placeholder="Search ${plural(all.length,'place')} by name…" value="${esc(f.q)}" aria-label="Search places by name" autocomplete="off"></label></div>
    ${areas.length ? `<div class="eyebrow mt16">Area</div>
    <div class="chip-scroll mt8" id="pAreas" role="group" aria-label="Areas">${areas.map(([z,n])=>chip('data-area', z, f.areas.includes(z), MAP.zoneById(z).label, n)).join('')}</div>` : ''}
    ${tags.length ? `<div class="eyebrow mt8">Tags</div>
    <div class="chip-scroll mt8" id="pTags" role="group" aria-label="Tags">${tags.map(([t,n])=>chip('data-ptag', t, f.tags.includes(t), tagLabel(t), n, t.startsWith('kind:') ? `<span class="pt-ico">${iconSvg(t.slice(5), catById(t.slice(5))?.color)}</span>` : '')).join('')}</div>` : ''}
    <div class="feed-head"><span class="hand">${filtered ? `${rows.length} of ${all.length}` : plural(all.length, 'place') + ' been to'}</span>
      ${filtered ? `<button type="button" class="btn btn-ghost btn-sm" id="pClear">${icon('filter_alt_off')}Clear</button>` : ''}
      <select class="sort-sel" id="pSort" aria-label="Sort places">${[['recent','Most recent'],['visits','Most visited'],['name','A–Z']].map(([v,l])=>`<option value="${v}"${f.sort===v?' selected':''}>${l}</option>`).join('')}</select></div>
    <div class="stack" id="pRows">${rows.map(rowHTML).join('') || emptyHTML(filtered, all.length)}</div>`;
}
function rowHTML(r){
  const v = r.v, z = MAP.zoneById(v.zone), shown = r.tags.slice(0, 3), more = r.tags.length - shown.length;
  const cat = catById((v.categories||[])[0]);
  return `<button class="place-row" data-venue="${v.id}">
    <span class="pr-ico">${cat ? iconSvg(cat.id, cat.color) : icon('storefront')}</span>
    <span class="pr-body">
      <b class="pr-title">${esc(v.name)}</b>
      <span class="pr-meta">${icon('location_on')}<span class="trunc">${esc(z ? z.label : 'Dubai')}</span><span class="pr-dot">•</span><span>${plural(r.visits,'visit')}</span></span>
      ${shown.length ? `<span class="pr-tags">${shown.map(t=>`<span class="tag soft">${esc(tagLabel(t))}</span>`).join('')}${more>0?`<span class="tag soft">+${more}</span>`:''}</span>` : ''}
    </span>
    <span class="pr-who">${avatarStack(r.who, 26, 3)}</span>
  </button>`;
}
function emptyHTML(filtered, total){
  if (filtered) return `<div class="empty">${icon('travel_explore')}<h3 class="h-md">No places match</h3><p class="muted">Try another name, or fewer areas and tags.</p><button type="button" class="btn btn-soft mt16" id="pClear2">${icon('filter_alt_off')}Clear filters</button></div>`;
  return `<div class="empty">${icon('storefront')}<h3 class="h-md">${total ? 'Nothing here' : 'No places yet'}</h3><p class="muted">Every place you or your crew logs a visit to lands here, with its details.</p></div>`;
}

// wire it up after painting; repaint() redraws the List screen
export function bindPlaces(el, repaint){
  const f = placesState;
  const q = el.querySelector('#pq');
  if (q) q.addEventListener('input', ()=>{ f.q = q.value; const pos = q.selectionStart; repaint(); const n = el.querySelector('#pq'); if (n){ n.focus(); n.setSelectionRange(pos, pos); } });
  const toggle = (list, v)=>list.includes(v) ? list.filter(x=>x!==v) : [...list, v];
  const keepX = (sel, fn)=>{ const s = el.querySelector(sel)?.scrollLeft || 0; fn(); const n = el.querySelector(sel); if (n) n.scrollLeft = s; };
  el.querySelector('#pAreas')?.addEventListener('click', e=>{ const b = e.target.closest('[data-area]'); if (!b) return; keepX('#pAreas', ()=>{ f.areas = toggle(f.areas, b.dataset.area); repaint(); }); });
  el.querySelector('#pTags')?.addEventListener('click', e=>{ const b = e.target.closest('[data-ptag]'); if (!b) return; keepX('#pTags', ()=>{ f.tags = toggle(f.tags, b.dataset.ptag); repaint(); }); });
  el.querySelector('#pSort').onchange = e=>{ f.sort = e.target.value; repaint(); };
  const clear = ()=>{ f.q = ''; f.areas = []; f.tags = []; repaint(); };
  el.querySelector('#pClear')?.addEventListener('click', clear);
  el.querySelector('#pClear2')?.addEventListener('click', clear);
}
