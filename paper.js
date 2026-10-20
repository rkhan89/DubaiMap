// A scrapbook page on paper. Every visit is one page, built from the visit: the red ribbon, the date and the area in
// mono, the postage-stamp kind with its postmark, the place, the meal and check-in chips, the photos as tilted
// polaroids (or, with no photos, the stamp as the hero and a postcard of the map around the pin), the rating as an
// ink rubber stamp, the crew and their ratings, a note on a torn strip, and the page number.
//
// Pages are laid out on a fixed design canvas (PAGE_W x PAGE_H) and scaled to fit the screen, so a page looks the
// same on every phone, a sticker's position (0 to 1 on each axis) lands on the same spot, and an export renders
// exactly what's on screen. Tilts are seeded from ids, so nothing moves between renders.
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import * as RT from './ratings.js';
import { CATEGORIES, MEALS, catById, iconSvg, esc, fmtDay, fmtRating, tilt } from './data.js';
import { avatarStack } from './avatar.js';
import { icon } from './ui.js';
import { ratersRowHTML } from './rate.js';
import { develops } from './feel.js';

export const PAGE_W = 360, PAGE_H = 600;
export const PAPERS = [['plain','Plain'],['dotted','Dotted'],['grid','Grid'],['kraft','Kraft']];
const zoneLabel = id=>MAP.zoneById(id)?.label || APP.city;

// whose ratings a book shows: a crew's book, that crew's; your own books, everyone you can see
export function rateScope(b){ const c = b && b.kind==='crew' && S.myCrews().find(x=>x.id===b.crewId); return c ? { kind:'crew', crew:c, label:'Crew' } : { kind:'friends', label:'Friends' }; }
export function placeRatingFor(b, venueId){ const w = S.pagesWorld(), sc = rateScope(b); return { ...RT.placeRating(w.entries.filter(e=>e.venueId===venueId), sc, w), label:sc.label }; }
export const venueOfPage = pg => S.venue(pg.entry ? pg.entry.venueId : pg.venueId);
export const peopleOf = pg => pg.entry ? [...new Set([pg.entry.userId, ...(pg.entry.taggedIds||[])])].map(S.user).filter(Boolean) : [S.me()];

// a postage stamp with the place's kind on it and a postmark with the date
export function postageHTML(cat, date, size){
  const c = catById(cat) || CATEGORIES[0];
  const d = date ? new Date(date+'T00:00:00') : null;
  const mark = d && !isNaN(d) ? d.toLocaleDateString('en-GB',{day:'2-digit', month:'short'}).toUpperCase() : 'DXB';
  return `<span class="postage" style="--s:${size||96}px;--c:${c.color}"><span class="pg-face">${iconSvg(c.id, c.color)}<b>${esc(c.label)}</b></span><span class="pg-mark">${esc(mark)}<i>DXB</i></span></span>`;
}
// the ink rubber stamp with the rating ("★ 4"), turned a little by the visit's id
export function rateStampHTML(r, id){
  if (!r) return '';
  return `<span class="kb-ratestamp" style="--r:${(-6 + tilt('rs'+id, 6)).toFixed(1)}deg" role="img" aria-label="Rated ${fmtRating(r)} out of 5"><b>★ ${esc(fmtRating(r))}</b></span>`;
}

// the ink mark a check-in leaves: "CHECKED IN · 20 OCT", turned a little
export function inkMarkHTML(label, date, id){
  const d = date ? new Date(date+'T00:00:00') : null, day = d && !isNaN(d) ? d.toLocaleDateString('en-GB',{ day:'2-digit', month:'short' }).toUpperCase() : '';
  return `<span class="ink-mark kb-checkin" style="--r:${(8 + tilt('ck'+id, 6)).toFixed(1)}deg">${esc(label)}${day?` • ${esc(day)}`:''}</span>`;
}
/* ---------- the photos, by layout ----------
   Scrapbook: up to three tilted polaroids overlapping. Grid: up to four, square. Hero: one big, three small.
   Photos beyond what fits show as "+N" (the viewer has them all). */
const SLOTS = {
  scrapbook: [
    [{ x:50, y:50, h:96 }],
    [{ x:30, y:38, h:74 }, { x:70, y:62, h:74 }],
    [{ x:28, y:30, h:60 }, { x:72, y:44, h:60 }, { x:40, y:73, h:56 }],
  ],
  grid: [[{ x:50, y:50, h:94 }], [{ x:27, y:50, h:62 }, { x:73, y:50, h:62 }],
    [{ x:27, y:26, h:49 }, { x:73, y:26, h:49 }, { x:50, y:75, h:49 }],
    [{ x:27, y:26, h:49 }, { x:73, y:26, h:49 }, { x:27, y:75, h:49 }, { x:73, y:75, h:49 }]],
  hero: [[{ x:50, y:50, h:96 }], [{ x:50, y:38, h:72 }, { x:50, y:86, h:26, small:1 }],
    [{ x:50, y:38, h:72 }, { x:36, y:86, h:26, small:1 }, { x:64, y:86, h:26, small:1 }],
    [{ x:50, y:38, h:72 }, { x:24, y:86, h:26, small:1 }, { x:50, y:86, h:26, small:1 }, { x:76, y:86, h:26, small:1 }]],
};
function photosHTML(pg, layout){
  const max = layout==='grid' ? 4 : layout==='hero' ? 4 : 3;
  const shown = pg.photos.slice(0, max), more = pg.photos.length - shown.length;
  const slots = SLOTS[layout][shown.length-1];
  const me = S.me();
  return shown.map((p, i)=>{
    const s = slots[i], rot = layout==='grid' ? tilt(p.id, 3) : tilt(p.id, 8);   // −4° to +4° (grid ±1.5°)
    const bm = (p.bookmarkedBy||[]).includes(me.id);
    // a photo added in the last week develops the first time it's on screen here
    const dev = develops(p.id) && Date.now() - (p.createdAt||0) < 7*864e5 ? ` data-develop="${esc(p.id)}"` : '';
    return `<figure class="polaroid kb-pol${s.small?' small':''}" data-photo="${esc(p.id)}" style="--x:${s.x}%;--y:${s.y}%;--h:${s.h}cqh;--r:${rot.toFixed(2)}deg">
      <span class="tape"></span><span class="pol-img"><img src="${esc(S.photoURL(p))}" alt="${esc(p.caption||'')}" loading="lazy"${dev}></span>
      ${s.small ? '' : `<figcaption><span class="cap">${esc(p.caption||'')}</span><button data-heart="${esc(p.id)}" aria-label="${bm?'Remove bookmark':'Bookmark'}">${icon(bm?'bookmark':'bookmark_border','',bm)}</button></figcaption>`}
    </figure>`;
  }).join('') + (more > 0 ? `<button class="kb-more" data-photo="${esc(pg.photos[max].id)}" aria-label="${more} more photos">+${more}</button>` : '');
}

/* ---------- a page ---------- */
// ctx: { book, n (page number), total, paper }
export function pageHTML(pg, ctx){
  const b = ctx.book, me = S.me(), e = pg.entry, v = venueOfPage(pg), z = MAP.zoneById(v?.zone);
  const cfg = pg.cfg || {}, layout = pg.photos.length ? (['scrapbook','grid','hero'].includes(cfg.layout) ? cfg.layout : 'scrapbook') : 'plain';
  const cat = v ? M.primaryCat(v) : 'coffee', by = e && e.userId!==me.id ? S.user(e.userId) : null;
  const meals = e ? (e.meals||[]).map(id=>MEALS.find(m=>m.id===id)).filter(Boolean) : [];
  const fromCrews = b.kind==='tagged' && e ? S.crewsOf(e).map(c=>c.name) : [];
  const geo = `${(z?z.label:APP.city).toUpperCase()}${z?` • ${z.lat.toFixed(4)}° N, ${z.lng.toFixed(4)}° E`:''}`;
  const rating = e && e.rating;
  const foot = e ? ratersRowHTML(e, rateScope(b), { nudge:false }) : `${avatarStack(peopleOf(pg), 26, 5)}<span class="hand">Just you</span>`;
  return `<article class="kb-page paper-${esc(ctx.paper||'plain')} layout-${layout}" data-page-id="${esc(pg.id)}" ${e?`data-entry="${esc(e.id)}"`:''} aria-label="Page ${ctx.n}: ${esc(v?.name||'A day out')}, ${esc(fmtDay(pg.date))}">
    <span class="kb-ribbon" aria-hidden="true"></span>
    <header class="kb-head"><span class="kb-date">${esc(fmtDay(pg.date))}</span><span class="kb-geo">${esc(geo)}</span></header>
    <div class="kb-place">
      ${layout==='plain' ? '' : `<span class="kb-stamp">${postageHTML(cat, pg.date, 62)}</span>`}
      <div class="kb-pl-main">
        <h3 class="kb-name" ${v?`data-venue="${esc(v.id)}"`:''}>${esc(v?.name||'A day out')}</h3>
        <div class="kb-kind">${esc(catById(cat)?.label||'')}${e&&by?` • logged by ${esc(by.name||by.handle)}`:''}${fromCrews.length?` • from ${esc(fromCrews.join(', '))}`:''}</div>
        <div class="kb-chips">${meals.map(m=>`<span class="tag soft">${icon(m.icon)}${esc(m.label)}</span>`).join('')}${e&&e.private?`<span class="tag dark">${icon('lock','',true)}Only you</span>`:''}${e&&e.checkin?`<span class="tag green">${icon('where_to_vote')}Checked in</span>`:''}</div>
      </div>
    </div>
    ${layout==='plain'
      ? `<div class="kb-postcard"><span class="kb-pc-map"><canvas class="kb-map" ${v?`data-map-venue="${esc(v.id)}"`:''} aria-label="Map around ${esc(v?.name||'the place')}"></canvas><span class="kb-pin" aria-hidden="true"></span></span>
           <span class="kb-pc-stamp">${postageHTML(cat, pg.date, 104)}</span><span class="kb-pc-line">${esc(zoneLabel(v?.zone))}</span></div>`
      : `<div class="kb-photos">${photosHTML(pg, layout)}</div>`}
    ${rateStampHTML(rating, e ? e.id : pg.id)}
    ${e && e.checkin ? inkMarkHTML('Checked in', pg.date, e.id) : ''}
    ${e && e.notes ? `<p class="kb-notes">“${esc(e.notes)}”</p>` : ''}
    ${cfg.note ? `<div class="kb-note" style="--r:${tilt('n'+pg.id, 3).toFixed(2)}deg"><span class="tape"></span>${esc(cfg.note)}</div>` : ''}
    <footer class="kb-foot">${foot}${e && S.canRate(e) ? `<button class="rp-add" data-rate="${esc(e.id)}">${icon('add')}${S.myRatingOn(e.id) || pg.photos.some(p=>p.userId===me.id) ? 'Edit yours' : 'Add yours'}</button><button class="rp-add" data-addplace="${esc(e.venueId)}">${icon('add_location_alt')}Log a new visit</button>` : ''}</footer>
    <span class="kb-num">p. ${ctx.n}</span>
    <div class="kb-deco" aria-hidden="true"></div>
  </article>`;
}

/* ---------- the map postcard on a page with no photos ----------
   A crop of the pixel map around the pin. Drawn when the page is about to show (it's a live canvas that sharpens as
   the map's pieces arrive), then kept as a picture so turning pages doesn't redraw it. */
const mapPics = new Map();
export function hydrateMaps(root){
  root.querySelectorAll('canvas.kb-map[data-map-venue]:not([data-drawn])').forEach(cv=>{
    const v = S.venue(cv.dataset.mapVenue); if (!v) return;
    cv.dataset.drawn = '1';
    const key = v.id + '|' + document.documentElement.dataset.theme;
    if (mapPics.has(key)){ swap(cv, mapPics.get(key)); return; }
    MAP.whenReady(()=>requestAnimationFrame(()=>{
      if (!cv.isConnected) return;
      let tries = 0;
      const draw = ()=>{ if (!cv.isConnected) return; if (!MAP.drawSnapshot(cv, MAP.placeWorld(v), 7) && ++tries < 40) return setTimeout(draw, 150);
        // keep the sharpened picture once the pieces have had a moment to arrive
        setTimeout(()=>{ try{ const url = cv.toDataURL('image/webp', 0.85); mapPics.set(key, url); }catch(_){} }, 1800); };
      draw();
    }));
  });
}
function swap(cv, url){ const img = new Image(); img.className = 'kb-map'; img.alt = cv.getAttribute('aria-label') || ''; img.src = url; cv.replaceWith(img); }

/* ---------- the hard cover ---------- */
const LIGHT_TINTS = ['#f2cfb4','#fdae7e','#e5a93c'];
// a kind book's automatic cover: its stamp colour and icon
export function coverLook(b){
  if (b.kind==='kind'){ const c = catById(b.cat) || CATEGORIES[0]; return { tint:b.tint || c.color, title:b.title || c.label, pin:b.pin || c.id }; }
  return { tint:b.tint || '#8B5A2B', title:b.title, pin:b.pin || 'coffee' };
}
export function coverHTML(b, count, photos){
  const look = coverLook(b);
  const cover = b.coverPhotoId && S.photo(b.coverPhotoId);
  const light = LIGHT_TINTS.includes(look.tint);
  const zc = {}; (photos||[]).forEach(p=>{ const zz = S.venue(p.venueId)?.zone; if (zz) zc[zz] = (zc[zz]||0) + 1; });
  const zs = Object.keys(zc).sort((a,c)=>zc[c]-zc[a]).slice(0,2);
  const z0 = MAP.zoneById(zs[0]||'deira');
  const me = S.me(), crew = b.kind==='crew' ? S.myCrews().find(c=>c.id===b.crewId) : S.myCrew();
  const by = b.byline || (b.kind==='crew'&&crew ? `${crew.name} • shared journal` : b.kind==='kind' ? `Every ${look.title.toLowerCase()} stop, by @${me.handle}` : `Picked by @${me.handle}${crew?` • ${crew.name}`:''}`);
  return `<div class="cover ${esc(b.texture||'leather')}" style="background-color:${esc(look.tint)};${light?'color:var(--ink)':''}">
    ${cover?`<span class="cv-photo" style="background-image:url('${S.photoURL(cover)}')"></span>`:''}
    <span class="cv-ed">${icon('local_cafe')}DXB ${b.kind==='crew'?'CREW':b.kind==='kind'?esc(look.title.toUpperCase().slice(0,10)):'SOUK'} ED.</span>
    <span class="cv-count">${count}</span>
    <h2 class="cv-title">${esc(look.title)}</h2><span class="cv-rule"></span>
    <span class="cv-by">${esc(by)}</span>
    <span class="cv-pin">${iconSvg(look.pin,'#7e5700')}<em>PIN</em></span>
    <span class="cv-geo">${esc(zs.map(zoneLabel).join(' • ').toUpperCase()||APP.city.toUpperCase())}<br>${z0?`${z0.lat.toFixed(4)}° N, ${z0.lng.toFixed(4)}° E`:''}</span>
  </div>`;
}
