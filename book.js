// Scrapbooks: shelf, cover customiser, the open book (a feed of pages, by date or by place),
// page editor, book filters, photo viewer. Every visit is a page (pages.js); photos are added
// while logging the visit, so "add photos" anywhere opens the log flow with them picked.
import { BADGES, badgeStatus, stickerHTML } from './badges.js';
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import * as P from './pages.js';
import { CATEGORIES, MEALS, catById, iconSvg, esc, fmtDate, fmtDay, monthKey, fmtMonth, todayISO, plural, tilt } from './data.js';
import { avatarHTML, avatarStack } from './avatar.js';
import { $, icon, toast, openScreen, openSheet, back, closeAll, topbar, polaroidHTML, share, compressImage, toggleHTML, bindToggle, seg, bindSeg, whoText } from './ui.js';
import { go, state } from './go.js';
import * as RT from './ratings.js';
import { ratersRowHTML, overallHTML, ratersSheet, rateSheet } from './rate.js';

// whose ratings a book shows: a crew's book, that crew's; your own books, everyone you can see
function rateScope(b){ const c = b.kind==='crew' && S.myCrews().find(x=>x.id===b.crewId); return c ? { kind:'crew', crew:c, label:'Crew' } : { kind:'friends', label:'Friends' }; }
// the place's overall rating in this book's terms
function placeRatingFor(b, venueId){ const w = S.pagesWorld(), sc = rateScope(b); return { ...RT.placeRating(w.entries.filter(e=>e.venueId===venueId), sc, w), label:sc.label }; }

const TINTS = ['#e5a93c','#8B5A2B','#486636','#3b2717','#f2cfb4','#fdae7e'];
const TEXTURES = [['leather','Leather','layers'],['cloth','Cloth Loom','grid_4x4'],['paperback','Paperback','menu_book']];
const ROMAN = n=>{ const m=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let s=''; for (const [v,r] of m) while(n>=v){ s+=r; n-=v; } return s; };
const zoneLabel = id=>MAP.zoneById(id)?.label || APP.city;
const BATCH = 6;          // pages added to the feed at a time

/* ---------- what a book holds ---------- */
// its pages (an album's own filter applies, plus any filter from the filter sheet)
function pagesOf(b, f){ return P.bookPages(b, S.pagesWorld(), { ...(b.filter||{}), ...(f||{}) }); }
// the photos on its pages
function bookPhotos(b, f){ return pagesOf(b, f).flatMap(p=>p.photos); }
// pages as plain records, for the filter sheet's counts and choices
function pageRecs(b, f){ return pagesOf(b, f).map(p=>({ id:p.id, date:p.date, venueId:p.entry?p.entry.venueId:p.venueId, entryId:p.entry?p.entry.id:null, userId:p.entry?p.entry.userId:S.me().id, private:p.entry?!!p.entry.private:true })); }
function filterCount(f){ return f ? ['months','cats','venues','members','tagged'].reduce((n,k)=>n+((f[k]||[]).length?1:0),0) + (f.privacy&&f.privacy!=='all'?1:0) : 0; }
const venueOfPage = pg => S.venue(pg.entry ? pg.entry.venueId : pg.venueId);
// who was there: whoever logged it and everyone tagged
const peopleOf = pg => pg.entry ? [...new Set([pg.entry.userId, ...(pg.entry.taggedIds||[])])].map(S.user).filter(Boolean) : [S.me()];

/* =========================================================
   SHELF
   ========================================================= */
function shelf(){
  openScreen(el=>{
    const paint=()=>{
      const me=S.me(), crew=S.myCrew(), books=S.books();
      const personal=books.find(b=>b.kind==='personal'), crewBook=books.find(b=>b.kind==='crew'), taggedBook=books.find(b=>b.kind==='tagged'), albums=books.filter(b=>b.kind==='album');
      const mine=pagesOf(personal), crewPgs=crewBook?pagesOf(crewBook):[], tagPgs=taggedBook?pagesOf(taggedBook):[];
      const zones = {}; mine.concat(crewPgs).forEach(p=>{ const z=venueOfPage(p)?.zone; if (z) zones[z]=(zones[z]||0)+1; });
      const topZ = Object.keys(zones).sort((a,b)=>zones[b]-zones[a]).slice(0,2).map(zoneLabel);
      const photoN = ps => ps.reduce((n,p)=>n+p.photos.length, 0);
      // the newest pages from your books (a visit in two books shows once)
      const seen = new Set(), latest = [];
      [...mine.map(p=>[p, personal]), ...crewPgs.map(p=>[p, crewBook]), ...tagPgs.map(p=>[p, taggedBook])]
        .sort((a,b)=>(b[0].date||'').localeCompare(a[0].date||'') || (b[0].createdAt||0)-(a[0].createdAt||0))
        .forEach(([p, b])=>{ const k = p.entry ? p.entry.id : p.id; if (!seen.has(k) && latest.length<4){ seen.add(k); latest.push([p, b]); } });
      const members = crew ? S.crewMembers(crew) : [];
      el.innerHTML = topbar({title:'Scrapbook Shelf', eyebrow:'Every visit, a page', back:true, actions:`<button class="icon-btn" id="shNew" aria-label="Log a visit">${icon('add_a_photo')}</button>`}) + `<div class="screen-body">
        <div class="deck mt8">
          <div class="deck-head"><span class="ms" style="color:var(--gold-deep)">book_2</span><span class="eyebrow grow" style="color:var(--ink);font-size:13px">Vol. ${new Date().getFullYear()} Archival Deck</span>${topZ.length?`<span class="tag soft">${esc(topZ.join(' • '))}</span>`:''}</div>
          ${spineHTML(personal, { kind:'Personal scrapbook', kicon:'auto_stories', corner:'Keeper copy', hand: personal.byline || (topZ.length>1?`${topZ[1]} bites to ${topZ[0]} spice trails`:'Your city, one bite at a time'), meta:[`${icon('menu_book')}${plural(mine.length,'page')}`, photoN(mine)?`${icon('photo_library')}${plural(photoN(mine),'photo')}`:''] })}
          ${crewBook?spineHTML(crewBook, { kind:'Crew scrapbook', kicon:'groups', corner:'Shared trail', cornerCls:'green', hand: crew.tagline || `Shared spots across ${plural(members.length-1,'friend')}`, meta:[`${avatarStack(members,30,6)} ${members.length} members`, `${icon('menu_book')}${plural(crewPgs.length,'page')}`], foot:'Shared visits only, never Just me ones' }):''}
          ${!crewBook?`<button class="book-spine" id="shNoCrew" style="background:var(--sc-highest);color:var(--ink);box-shadow:none;border:2px dashed var(--outline-v)"><span class="rings" style="background:rgba(0,0,0,.05)"><i style="background:var(--outline-v)"></i><i style="background:var(--outline-v)"></i><i style="background:var(--outline-v)"></i></span><span class="grow"><span class="bs-kind">${icon('group_add')}Crew scrapbook</span><h3 style="font-size:20px">Start a crew to share a book</h3><span class="hand">Every visit you share becomes a page in it</span></span></button>`:''}
          ${taggedBook?spineHTML(taggedBook, { kind:'Tagged', kicon:'sell', hand: taggedBook.byline || 'Visits friends tagged you on', meta:[`${icon('menu_book')}${plural(tagPgs.length,'page')}`] }):''}
          ${albums.map(a=>spineHTML(a, { kind:'Custom album', kicon:'collections_bookmark', hand: a.byline || describeFilter(a.filter), meta:[`${icon('menu_book')}${plural(pagesOf(a).length,'page')}`] })).join('')}
        </div>
        ${latest.length?`<div class="row between mt32"><span class="row h-md" style="gap:8px">${icon('auto_stories')}Latest pages</span></div>
        <div class="spreads mt16">${latest.map(([p,b],i)=>spreadHTML(p,b,i)).join('')}</div>`:
        `<div class="card-soft mt24 center" style="padding:28px 18px"><div style="width:120px;margin:0 auto">${polaroidHTML({caption:'your first page', rot:-3})}</div><h3 class="h-md mt16">Every visit becomes a page</h3><p class="muted mt8">Log a place you've been and it's taped in here, photos or not.</p><button class="btn btn-gold btn-block mt16" id="shFirst">${icon('add_location_alt')}Log a visit</button></div>`}
        <div class="btn-grid mt24 shelf-actions"><button class="btn btn-gold" id="shAlbum">${icon('library_add')}New Album</button><button class="btn btn-white" id="shImport">${icon('upload_file')}Import Roll</button></div>
        <p class="row mono muted mt16" style="font-size:12px;gap:8px;justify-content:center">${icon('verified_user')}Just me visits never appear in shared books</p>
      </div>`;
      el.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>openBook(b.dataset.book));
      el.querySelectorAll('[data-spread]').forEach(x=>x.onclick=()=>openBook(x.dataset.inbook, { pageId:x.dataset.spread }));
      el.querySelector('#shAlbum').onclick=()=>bookFilters(null, {}, f=>newAlbum(f));
      el.querySelector('#shImport').onclick=()=>addPhotos({});
      el.querySelector('#shNew').onclick=()=>addPhotos({});
      const first=el.querySelector('#shFirst'); if (first) first.onclick=()=>go.log();
      const nc=el.querySelector('#shNoCrew'); if (nc) nc.onclick=()=>go.crew();
    };
    paint(); el._repaint=paint;
    const off=S.onChange(()=>{ if (el.isConnected) paint(); else off(); });
  });
}
function spineHTML(b, o){
  const cover = b.coverPhotoId && S.photo(b.coverPhotoId);
  return `<button class="book-spine" data-book="${b.id}" style="background:${b.tint}${['#f2cfb4','#fdae7e','#e5a93c'].includes(b.tint)?';color:var(--ink-on-light)':''}">
    ${o.corner?`<span class="corner ${o.cornerCls||''}">${esc(o.corner)}</span>`:''}
    <span class="rings"><i></i><i></i><i></i><i></i></span>
    <span class="grow" style="min-width:0">
      <span class="bs-kind">${icon(o.kicon)}${esc(o.kind)}</span>
      <h3 class="clamp2">${esc(b.title)}</h3>
      <span class="hand">${esc(o.hand||'')}</span>
      <span class="bs-meta">${o.meta.filter(Boolean).map(m=>m.startsWith('gold:')?`<span class="bsm gold">${m.slice(5)}</span>`:`<span class="bsm">${m}</span>`).join('')}</span>
      ${o.foot?`<span class="hand" style="display:block;margin-top:8px">${esc(o.foot)}</span>`:''}
    </span>
    <span class="bs-go">${cover?`<img src="${S.photoURL(cover)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`:icon('arrow_forward')}</span>
  </button>`;
}
// a small card for a page: its first photo, or its place's stamp
function spreadHTML(pg, b, i){
  const v=venueOfPage(pg), e=pg.entry, me=S.me(), ph=pg.photos[0];
  const cat=v?M.primaryCat(v):'coffee';
  return `<button class="spread-card" data-spread="${esc(pg.id)}" data-inbook="${esc(b.id)}"><span class="tape ${i%2?'green':''}"></span>
    <span class="sp-img${ph?'':' sp-stamp'}">${ph?`<img src="${esc(S.photoURL(ph))}" alt="" loading="lazy">`:postageHTML(cat, pg.date, 64)}<span class="pol-badge light sp-badge" title="${esc(v?.name||'')}, ${esc(zoneLabel(v?.zone))}">${esc(v?.name||zoneLabel(v?.zone))}</span></span>
    <h4 class="trunc">${esc((ph&&ph.caption)||v?.name||'Memory')}</h4>
    ${e&&e.notes?`<span class="hand trunc">"${esc(e.notes)}"</span>`:`<span class="hand">${esc(e && e.userId!==me.id ? (S.user(e.userId)?.name||'') : 'you')}</span>`}
    <span class="sp-foot"><span>${fmtDate(pg.date,{day:'numeric',month:'short'})} • ${esc(b.kind==='crew'?'Crew Book':b.kind==='tagged'?'Tagged':'My Book')}</span>${e&&e.rating?`<span class="mono" style="color:var(--green);font-weight:700">★${e.rating}</span>`:''}</span>
  </button>`;
}
// a postage stamp with the place's kind on it and a postmark with the date
function postageHTML(cat, date, size){
  const c = catById(cat) || CATEGORIES[0];
  const d = date ? new Date(date+'T00:00:00') : null;
  const mark = d && !isNaN(d) ? d.toLocaleDateString('en-GB',{day:'2-digit', month:'short'}).toUpperCase() : 'DXB';
  return `<span class="postage" style="--s:${size||96}px;--c:${c.color}"><span class="pg-face">${iconSvg(c.id, c.color)}<b>${esc(c.label)}</b></span><span class="pg-mark">${esc(mark)}<i>DXB</i></span></span>`;
}
function describeFilter(f){
  f=f||{}; const bits=[];
  if (f.cats&&f.cats.length) bits.push(f.cats.map(c=>catById(c)?.label).join(', '));
  if (f.months&&f.months.length) bits.push(f.months.map(fmtMonth).join(', '));
  if (f.venues&&f.venues.length) bits.push(plural(f.venues.length,'place'));
  return bits.join(' • ') || 'Every page';
}
function newAlbum(filter){
  openSheet(body=>{
    body.innerHTML = `<h2 class="h-md">Name your album</h2><p class="muted mt4">${esc(describeFilter(filter))}</p>
      <input class="input mt16" id="alN" maxlength="40" placeholder="e.g. Karak Runs ${new Date().getFullYear()}">
      <button class="btn btn-gold btn-block mt16" id="alS">${icon('library_add')}Create album</button>`;
    const n=body.querySelector('#alN'); setTimeout(()=>n.focus(),300);
    body.querySelector('#alS').onclick=()=>{ const a=S.addAlbum({title:n.value.trim()||'New album', filter}); back(); toast('Album created'); setTimeout(()=>coverScreen(a.id), 280); };
  });
}
go.shelf = shelf;

/* =========================================================
   COVER CUSTOMISER
   ========================================================= */
function coverHTML(b, count){
  const cover=b.coverPhotoId && S.photo(b.coverPhotoId);
  const light=['#f2cfb4','#fdae7e','#e5a93c'].includes(b.tint);
  const ps=bookPhotos(b); const zc={}; ps.forEach(p=>{ const z=S.venue(p.venueId)?.zone; if (z) zc[z]=(zc[z]||0)+1; });
  const zs=Object.keys(zc).sort((a,c)=>zc[c]-zc[a]).slice(0,2);
  const z0=MAP.zoneById(zs[0]||'deira');
  const me=S.me(), crew=S.myCrew();
  const by = b.byline || (b.kind==='crew'&&crew ? `${crew.name} • shared journal` : `Picked by @${me.handle}${crew?` • ${crew.name}`:''}`);
  return `<div class="cover ${b.texture}" style="background-color:${b.tint};${light?'color:var(--ink)':''}">
    ${cover?`<span class="cv-photo" style="background-image:url('${S.photoURL(cover)}')"></span>`:''}
    <span class="cv-ed">${icon('local_cafe')}DXB ${b.kind==='crew'?'CREW':'SOUK'} ED.</span>
    <span class="cv-count">${count}</span>
    <h2 class="cv-title">${esc(b.title)}</h2><span class="cv-rule"></span>
    <span class="cv-by">${esc(by)}</span>
    <span class="cv-pin">${iconSvg(b.pin||'coffee','#7e5700')}<em>PIN</em></span>
    <span class="cv-geo">${esc(zs.map(zoneLabel).join(' • ').toUpperCase()||APP.city.toUpperCase())}<br>${z0?`${z0.lat.toFixed(4)}° N, ${z0.lng.toFixed(4)}° E`:''}</span>
  </div>`;
}
/* ---------- page editor (optional extras): layout, photo order, stickers, a note ---------- */
function pageEditor(b, pg, after){
  const cfg = { layout:'scrapbook', ...(pg.cfg||{}) };
  let order = pg.photos.map(p=>p.id);
  const earned = badgeStatus(S.me().id).filter(x=>x.done);
  // stickers already on the page stay, even ones someone else in the crew stuck on
  let chosen = (cfg.stickers||[]).filter(id=>BADGES.some(x=>x.id===id));
  const v = venueOfPage(pg);
  openSheet(body=>{
    const paint=()=>{
      body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">Dress up this page</h2><span class="hand">${esc(v?.name||'')} • ${esc(fmtDay(pg.date))}</span></div></div>
        <p class="muted small">Optional. Every page already looks finished.</p>
        <div class="row between mt16"><span class="eyebrow">Stickers</span><span class="mono muted small">${chosen.length} of 3</span></div>
        ${earned.length ? `<div class="sticker-pick mt8">${earned.map(x=>`<button class="${chosen.includes(x.id)?'on':''}" data-st="${x.id}" aria-label="${esc(x.name)}">${stickerHTML(x, 46, {progress:false})}</button>`).join('')}</div>` : `<p class="muted small mt8">Log places to earn stickers, then stick them on your pages.</p>`}
        ${pg.photos.length ? `<div class="eyebrow mt20">Layout</div>
        ${seg('playout', [['scrapbook','Scrapbook','auto_awesome_mosaic'],['grid','Grid','grid_view'],['hero','Hero','photo_size_select_large']], cfg.layout).replace('class="seg"','class="seg mt8"')}` : ''}
        ${pg.photos.length>1 ? `<div class="eyebrow mt20">Photo order</div>
        <div class="stack mt8">${order.map((id,i)=>{ const p=pg.photos.find(x=>x.id===id); return `<div class="person-row order-row"><img src="${esc(S.photoURL(p))}" alt=""><span class="pr-main"><span class="pr-name trunc">${esc(p.caption||v?.name||'Photo')}</span></span>
          <button class="icon-btn" data-mv="${i}" data-d="-1" ${i?'':'disabled'} aria-label="Move up">${icon('arrow_upward')}</button><button class="icon-btn" data-mv="${i}" data-d="1" ${i<order.length-1?'':'disabled'} aria-label="Move down">${icon('arrow_downward')}</button></div>`; }).join('')}</div>` : ''}
        <div class="eyebrow mt20">Page note</div>
        <textarea class="input mt8" id="pgNote" maxlength="160" placeholder="What made this visit…">${esc(cfg.note||'')}</textarea>
        <div class="sheet-foot btn-grid"><button class="btn btn-soft" id="pgReset">Reset</button><button class="btn btn-gold" id="pgSave">${icon('check')}Save page</button></div>`;
      const note=()=>{ cfg.note=body.querySelector('#pgNote').value; };
      bindSeg(body, 'playout', x=>{ cfg.layout=x; });
      body.querySelectorAll('[data-mv]').forEach(x=>x.onclick=()=>{ const i=+x.dataset.mv, j=i+(+x.dataset.d); [order[i],order[j]]=[order[j],order[i]]; note(); paint(); });
      body.querySelectorAll('[data-st]').forEach(x=>x.onclick=()=>{ const id=x.dataset.st; if (chosen.includes(id)) chosen=chosen.filter(c=>c!==id); else if (chosen.length<3) chosen.push(id); else return toast('Three stickers per page'); note(); paint(); });
      body.querySelector('#pgReset').onclick=()=>{ S.resetPage(b.id, pg.entry.id); back(); after(); };
      body.querySelector('#pgSave').onclick=()=>{ note(); S.savePage(b.id, pg.entry.id, { layout:cfg.layout, order, stickers:chosen, note:(cfg.note||'').trim() }); back(); toast('Page saved'); after(); };
    };
    paint();
  });
}

function coverScreen(bookId){
  const b0=S.book(bookId); if (!b0) return;
  const d={title:b0.title, byline:b0.byline||'', texture:b0.texture, tint:b0.tint, pin:b0.pin};
  openScreen(el=>{
    const paint=()=>{
      const b={...b0, ...d};
      const count=pagesOf(b0).length;
      el.innerHTML = topbar({title:'Book Cover', eyebrow:'Scrapbook page', actions:`<button class="icon-btn" id="cvOpen" aria-label="Open book">${icon('menu_book')}</button>`, profile:true}) + `<div class="screen-body">
        <div class="row between mt8"><span class="tag rust">${icon('menu_book')}Closed book preview</span><button class="btn btn-dark btn-sm" id="cvSave" style="border-radius:999px">${icon('check')}Save Cover</button></div>
        <div class="card-peach mt16" style="padding:20px 18px 14px"><button id="cvTap" style="display:block;width:100%">${coverHTML(b, count)}</button><p class="center hand mt12">☝ Tap book cover to open spread 📖</p></div>
        <div class="panel mt16"><div class="panel-head">${icon('texture')}<h3>Material Texture</h3><span class="eyebrow" style="color:var(--rust)">${esc(TEXTURES.find(t=>t[0]===d.texture)[1])}</span></div>
          <div class="tex-grid">${TEXTURES.map(([v,l,ic])=>`<button class="tex${d.texture===v?' on':''}" data-tex="${v}"><span class="t-ico">${icon(ic)}</span>${l}</button>`).join('')}</div></div>
        <div class="panel mt16"><div class="panel-head">${icon('palette')}<h3>Cover Tint Palette</h3></div>
          <div class="row" style="justify-content:space-between">${TINTS.map(c=>`<button class="sw${d.tint===c?' on':''}" data-tint="${c}" style="background:${c};width:50px;height:50px" aria-label="Tint"></button>`).join('')}</div></div>
        <div class="panel mt16"><div class="panel-head"><span class="ms">title</span><h3>Title &amp; Spine Tagline</h3></div>
          <label class="row" style="background:var(--card);border-radius:12px;padding:0 14px;height:56px"><input id="cvT" maxlength="36" value="${esc(d.title)}" style="flex:1;border:0;outline:0;font-family:var(--f-head);font-weight:800;font-size:19px;min-width:0"><span class="eyebrow">Title</span></label>
          <label class="row mt8" style="background:var(--card);border-radius:12px;padding:0 14px;height:50px"><input id="cvB" maxlength="50" value="${esc(d.byline)}" placeholder="Picked by @${esc(S.me().handle)}" style="flex:1;border:0;outline:0;font-size:15px;min-width:0"><span class="eyebrow">Byline</span></label></div>
        <div class="panel mt16"><div class="panel-head">${icon('verified')}<h3>Cover Enamel Pin</h3><span class="mono muted" style="font-size:11px">Tap to pin</span></div>
          <div class="chip-scroll" style="margin:0 -16px;padding:2px 16px 8px">${CATEGORIES.map(c=>`<button class="enamel${d.pin===c.id?' on':''}" data-pin="${c.id}"><span class="e-ico">${iconSvg(c.id, d.pin===c.id?'#fff':c.color)}</span>${esc(c.label)}</button>`).join('')}</div></div>
        <button class="btn btn-gold btn-block mt24" id="cvPrev">${icon('menu_book')}Preview Open Book ${icon('arrow_forward')}</button>
        ${b0.kind==='album'?`<button class="btn btn-danger btn-block mt12" id="cvDel">${icon('delete')}Delete album</button>`:''}
      </div>`;
      const keep=fn=>{ const s=el.scrollTop; fn(); el.scrollTop=s; };
      el.querySelectorAll('[data-tex]').forEach(x=>x.onclick=()=>keep(()=>{ d.texture=x.dataset.tex; paint(); }));
      el.querySelectorAll('[data-tint]').forEach(x=>x.onclick=()=>keep(()=>{ d.tint=x.dataset.tint; paint(); }));
      el.querySelectorAll('[data-pin]').forEach(x=>x.onclick=()=>keep(()=>{ d.pin=x.dataset.pin; paint(); }));
      el.querySelector('#cvT').onchange=e=>keep(()=>{ d.title=e.target.value.trim()||b0.title; paint(); });
      el.querySelector('#cvB').onchange=e=>keep(()=>{ d.byline=e.target.value.trim(); paint(); });
      const saveIt=()=>{ S.saveBook(bookId, d); };
      el.querySelector('#cvSave').onclick=()=>{ saveIt(); toast('Cover saved'); };
      const open=()=>{ saveIt(); openBook(bookId, {fromCover:true}); };
      el.querySelector('#cvTap').onclick=open; el.querySelector('#cvPrev').onclick=open; el.querySelector('#cvOpen').onclick=open;
      const del=el.querySelector('#cvDel'); if (del) del.onclick=()=>{ S.deleteBook(bookId); back(); toast('Album deleted'); };
    };
    paint();
  });
}
go.cover = coverScreen;

/* =========================================================
   THE OPEN BOOK: a feed of pages you scroll through, newest first
   (By Date: one page per visit, under month headings; By Place: a chapter per place)
   ========================================================= */
const starsHTML = r => { r=+r||0; if (!r) return ''; let s=''; for (let i=1;i<=5;i++) s += icon(r>=i?'star':(r>=i-.5?'star_half':'star'), r>=i-.5?'on':'off', r>=i-.5); return `<span class="pg-stars" aria-label="${r} stars">${s}</span>`; };
function pageHTML(b, pg){
  const me=S.me(), e=pg.entry, v=venueOfPage(pg), z=MAP.zoneById(v?.zone);
  const cfg=pg.cfg||{}, layout=pg.photos.length ? (cfg.layout||'scrapbook') : 'plain';
  const stickers=(cfg.stickers||[]).map(id=>BADGES.find(x=>x.id===id)).filter(Boolean).map(x=>({ ...x, done:true }));
  const people=peopleOf(pg), cat=v?M.primaryCat(v):'coffee';
  const by = e && e.userId!==me.id ? S.user(e.userId) : null;
  // a page in your Tagged book says which crew it came from
  const fromCrews = b.kind==='tagged' && e ? S.crewsOf(e).map(c=>c.name) : [];
  const meals = e ? (e.meals||[]).map(id=>MEALS.find(m=>m.id===id)).filter(Boolean) : [];
  const photos = pg.photos.map((p,i)=>{
    const bm=(p.bookmarkedBy||[]).includes(me.id);
    return polaroidHTML({ src:S.photoURL(p), id:p.id, cls:(layout==='scrapbook'?(i%2?'r':'l')+' wide':(layout==='hero'&&i===0?'hero wide':'')), rot:layout==='scrapbook'?tilt(p.id,5):(layout==='grid'?tilt(p.id,2):0),
      caption:p.caption||'', sub:`<button data-heart="${p.id}" aria-label="Bookmark" style="color:var(--rust)">${icon(bm?'bookmark':'bookmark_border','',bm)}</button>` });
  }).join('');
  return `<article class="page layout-${layout}" data-page-id="${esc(pg.id)}"><span class="bookmark"></span>
    ${e?`<button class="icon-btn page-edit" data-editpage="${esc(pg.id)}" aria-label="Dress up this page">${icon('auto_fix_high')}</button>`:''}
    ${stickers.map((st,i)=>`<span class="page-sticker ps-${i}">${stickerHTML(st, 58, {progress:false})}</span>`).join('')}
    <div class="page-date"><span class="cap">${esc(fmtDay(pg.date))}</span><div class="page-geo">${esc((z?z.label:APP.city).toUpperCase())}${z?` • ${z.lat.toFixed(4)}° N, ${z.lng.toFixed(4)}° E`:''}</div></div>
    <div class="pg-head">
      ${pg.photos.length ? '' : `<span class="pg-stamp">${postageHTML(cat, pg.date, 92)}</span>`}
      <div class="grow" style="min-width:0">
        <h3 class="pg-place" ${v?`data-venue="${v.id}"`:''}>${esc(v?.name||'A day out')}</h3>
        <div class="pg-meta">${esc(catById(cat)?.label||'')}${e&&e.kind==='visit'&&by?` • logged by ${esc(by.name||by.handle)}`:''}</div>
        <div class="pg-chips">${meals.map(m=>`<span class="tag soft">${icon(m.icon)}${esc(m.label)}</span>`).join('')}${e&&e.private?`<span class="tag dark">${icon('lock','',true)}Only you</span>`:''}${e&&e.checkin?`<span class="tag green">${icon('where_to_vote')}Checked in</span>`:''}</div>
      </div>
    </div>
    ${cfg.note?`<div class="page-note"><span class="tape"></span>${esc(cfg.note)}</div>`:''}
    ${photos?`<div class="page-photos">${photos}</div>`:''}
    ${e&&e.notes?`<p class="pg-notes">“${esc(e.notes)}”</p>`:''}
    <div class="pg-foot">${e ? (()=>{ const pr = placeRatingFor(b, e.venueId); const row = ratersRowHTML(e, rateScope(b)); return `${overallHTML(pr, pr.label)}${row}`; })() : `${avatarStack(people, 30, 5)}<span class="hand">Just you</span>`}
      ${fromCrews.length?`<span class="tag soft pg-from">${icon('groups')}From ${esc(fromCrews.join(', '))}</span>`:''}</div>
  </article>`;
}
// the photos on a page, for the viewer
const photoIdsOf = (pgs, id) => (pgs.find(p=>p.photos.some(x=>x.id===id)) || { photos:[] }).photos.map(p=>p.id);

function openBook(bookId, opts){
  opts=opts||{};
  const b=S.book(bookId); if (!b) return;
  let mode='date', filter={}, shown=BATCH, pgs=[], chapters=[], io=null;
  openScreen(el=>{
    const emptyHTML = nf => b.kind==='crew'
      ? `<div class="card-soft mt16 center" style="padding:30px 18px"><div style="width:110px;margin:0 auto">${postageHTML('karak', todayISO(), 110)}</div>
         <h3 class="h-lg mt24">${nf?'No pages match these filters':'No pages yet'}</h3><p class="muted mt8">${nf?'Try widening the months or kinds of place.':`Every visit you or someone in <b style="color:var(--rust)">${esc(S.myCrews().find(c=>c.id===b.crewId)?.name||'your crew')}</b> shares with the crew becomes a page here, photos or not.`}</p>
         <button class="btn btn-gold btn-block mt20" id="bkAdd">${icon('add_location_alt')}Log a visit</button></div>`
      : `<div class="card-soft mt16 center" style="padding:30px 18px"><div style="width:110px;margin:0 auto">${postageHTML('coffee', todayISO(), 110)}</div>
         <h3 class="h-lg mt24">${nf?'No pages match these filters':b.kind==='tagged'?'Nobody has tagged you yet':'Every visit becomes a page'}</h3>
         <p class="muted mt8">${nf?'Try widening the months or kinds of place.':b.kind==='tagged'?'When a crewmate tags you on a visit, its page lands here too.':'Log a place you’ve been and it’s taped in here, with or without photos.'}</p>
         ${b.kind==='tagged'?'':`<button class="btn btn-gold btn-block mt20" id="bkAdd">${icon('add_location_alt')}Log a visit</button>`}</div>`;
    const monthHead = d => `<div class="feed-month"><span>${esc(fmtMonth(monthKey(d)))}</span></div>`;
    // the next slice of the feed
    const slice = (from, to)=>{
      if (mode==='date') return pgs.slice(from, to).map((p,i)=>{ const prev=pgs[from+i-1]; return (!prev || monthKey(prev.date)!==monthKey(p.date) ? monthHead(p.date) : '') + pageHTML(b, p); }).join('');
      return chapters.slice(from, to).map((c,i)=>chapterHTML(c, from+i)).join('');
    };
    const total = ()=> mode==='date' ? pgs.length : chapters.length;
    const chapterHTML = (c, n)=>{
      const v=S.venue(c.venueId), cat=catById(v?M.primaryCat(v):'coffee');
      const people=[...new Map(c.pages.flatMap(peopleOf).map(u=>[u.id,u])).values()];
      const dates=c.pages.map(p=>p.date).sort();
      return `<section class="page chapter mt16" data-chapter="${esc(c.venueId)}">
        <div class="chapter-head"><div class="grow"><span class="hand">Chapter ${ROMAN(n+1)}</span><h2 ${v?`data-venue="${v.id}"`:''} style="cursor:pointer">${esc(v?.name||'Somewhere')}</h2></div>
          <span class="cat-tile"><span class="ct-ico">${iconSvg(cat.id,'#7e5700')}</span><b>${esc(cat.label)}</b></span></div>
        <div class="chapter-meta"><div>${icon('near_me')}<b>${esc(zoneLabel(v?.zone))}</b></div>${(()=>{ const pr = placeRatingFor(b, c.venueId); return pr.raters ? `<div>${overallHTML(pr, pr.label)}</div>` : ''; })()}
          <div>${icon('calendar_month')}${plural(c.pages.length,'visit')}${dates.length?` • ${esc(fmtDate(dates[0],{month:'short',year:'numeric'}))}${monthKey(dates[0])!==monthKey(dates[dates.length-1])?` – ${esc(fmtDate(dates[dates.length-1],{month:'short',year:'numeric'}))}`:''}`:''}</div></div>
        ${people.length?`<div class="visited-by">${avatarStack(people,32,4)}<span>${esc(people.map(u=>u.id===S.me().id?'you':(u.name||u.handle)).join(', '))}</span></div>`:''}
        ${c.pages.map(p=>`<div class="visit-rule">${esc(fmtDate(p.date,{day:'numeric',month:'short',year:'numeric'}).toUpperCase())}${p.entry&&p.entry.rating?` • ★ ${p.entry.rating}`:''}</div>
          ${p.photos.length?`<div class="photo-grid">${p.photos.map(ph=>polaroidHTML({src:S.photoURL(ph), id:ph.id, caption:ph.caption||'', rot:tilt(ph.id,4)})).join('')}</div>`:`<p class="pg-notes" style="margin-top:8px">${p.entry&&p.entry.notes?`“${esc(p.entry.notes)}”`:'<span class="muted">No photos, just the memory.</span>'}</p>`}`).join('')}
        ${b.kind!=='tagged'?`<button class="btn btn-dark btn-block mt24" data-addplace="${esc(c.venueId)}">${icon('add_a_photo')}Log another visit here</button>`:''}
      </section>`;
    };
    const more = ()=>{
      if (shown >= total()) return;
      const from = shown; shown = Math.min(total(), shown + BATCH);
      const s = el.querySelector('#bkMore'); if (!s) return;
      s.insertAdjacentHTML('beforebegin', slice(from, shown));
      if (shown >= total()){ s.remove(); io && io.disconnect(); }
    };
    const paint=()=>{
      pgs = pagesOf(b, filter);
      const byV = new Map(); pgs.forEach(p=>{ const k=p.entry?p.entry.venueId:p.venueId; if (!byV.has(k)) byV.set(k, []); byV.get(k).push(p); });
      chapters = [...byV].map(([venueId, pages])=>({ venueId, pages })).sort((a,c)=>(c.pages[0].date||'').localeCompare(a.pages[0].date||''));
      // opening at a page: load the feed down to it
      if (opts.pageId){ const i = pgs.findIndex(p=>p.id===opts.pageId); if (i>=0){ mode='date'; shown = Math.max(shown, i+2); } }
      shown = Math.min(Math.max(shown, BATCH), total() || BATCH);
      const nf=filterCount(filter);
      const head = topbar({title:b.title, eyebrow: b.kind==='crew' ? 'Crew scrapbook' : b.kind==='tagged' ? 'Tagged scrapbook' : 'Scrapbook', actions:`<button class="icon-btn" id="bkAddTop" aria-label="Log a visit">${icon('add_a_photo')}</button><button class="icon-btn" id="bkCover" aria-label="Customise cover">${icon('palette')}</button><button class="icon-btn" id="bkShare" aria-label="Share">${icon('share')}</button>`}) +
        `<div class="screen-body"><div class="row mt8" style="gap:10px"><div class="grow">${seg('bmode',[['date','By Date','calendar_month'],['place','By Place','location_on']],mode)}</div><button class="sq-btn${nf?' filtered':''}" id="bkFilter" aria-label="Filter pages" style="width:48px;height:48px">${icon('tune')}</button></div>`;
      let body='';
      if (b.kind!=='crew' && pgs.some(p=>p.entry && p.entry.private)) body += `<div class="privacy-banner mt16">${icon('shield_lock')}<span><b>Just me pages are only visible to you.</b> They never appear in a crew’s book.</span></div>`;
      body += pgs.length ? `<div class="feed">${slice(0, shown)}${shown<total()?`<div class="feed-more" id="bkMore"><span class="skeleton"></span>Taping in more pages…</div>`:`<p class="book-end hand">${mode==='date'?`The first page • ${plural(pgs.length,'page')}`:`${plural(chapters.length,'place')}`}</p>`}</div>` : emptyHTML(nf);
      el.innerHTML = head + body + `</div>`;
      bindSeg(el,'bmode',v=>{ mode=v; shown=BATCH; opts.pageId=null; paint(); el.scrollTop=0; });
      el.querySelector('#bkFilter').onclick=()=>bookFilters(b, filter, f=>{ filter=f; shown=BATCH; paint(); });
      el.querySelector('#bkCover').onclick=()=>coverScreen(b.id);
      el.querySelector('#bkShare').onclick=()=>share({title:b.title, text:`${b.title} — ${plural(pgs.length,'page')} on ${APP.name}`, url:location.origin});
      const addHere=()=>addPhotos({ bookId:b.id });
      const add=el.querySelector('#bkAdd'); if (add) add.onclick=()=>go.log(b.kind==='crew'?{ who:[b.crewId] }:{});
      el.querySelector('#bkAddTop').onclick=addHere;
      io && io.disconnect();
      const s=el.querySelector('#bkMore');
      if (s && 'IntersectionObserver' in window){ io = new IntersectionObserver(es=>{ if (es.some(x=>x.isIntersecting)) more(); }, { root:el, rootMargin:'600px 0px' }); io.observe(s); }
      else if (s) s.onclick = more;
      if (opts.pageId){ const t=el.querySelector(`[data-page-id="${CSS.escape(opts.pageId)}"]`); if (t) requestAnimationFrame(()=>{ el.scrollTop = t.offsetTop - 70; t.classList.add('flash'); }); opts.pageId=null; }
    };
    // one set of handlers for everything in the feed (pages keep arriving as you scroll)
    el.addEventListener('click', e=>{
      const t=e.target;
      const heart=t.closest('[data-heart]'); if (heart){ e.stopPropagation(); const on=S.toggleBookmark(heart.dataset.heart); heart.innerHTML=icon(on?'bookmark':'bookmark_border','',on); toast(on?'Bookmarked':'Bookmark removed'); return; }
      const ed=t.closest('[data-editpage]'); if (ed){ const pg=pgs.find(p=>p.id===ed.dataset.editpage); if (pg) pageEditor(b, pg, ()=>{ const s=el.scrollTop; paint(); el.scrollTop=s; }); return; }
      const ph=t.closest('[data-photo]'); if (ph){ const ids = mode==='date' ? photoIdsOf(pgs, ph.dataset.photo) : pgs.flatMap(p=>p.photos).filter(p=>p.venueId===S.photo(ph.dataset.photo)?.venueId).map(p=>p.id); go.viewer(ids, ids.indexOf(ph.dataset.photo)); return; }
      const ap=t.closest('[data-addplace]'); if (ap){ go.log({ venueId:ap.dataset.addplace, ...(b.kind==='crew'?{ who:[b.crewId] }:{}) }); return; }
      const rt=t.closest('[data-rate]'); if (rt){ rateSheet(rt.dataset.rate, ()=>{ const s=el.scrollTop; paint(); el.scrollTop=s; }); return; }
      const rs=t.closest('[data-raters]'); if (rs){ const en=S.entry(rs.dataset.raters); if (en) ratersSheet(en, rateScope(b)); return; }
      const vn=t.closest('[data-venue]'); if (vn){ go.place(vn.dataset.venue); return; }
    });
    // repaint when something changes (a new page, a crewmate's edit), keeping your place
    const off=S.onChange(w=>{ if (!el.isConnected){ off(); io && io.disconnect(); return; } if (['entries','photos','pages','sync','books','ratings'].includes(w)){ const s=el.scrollTop; paint(); el.scrollTop=s; } });
    // a quick tactile placeholder while the first photos decode
    el.innerHTML = topbar({title:b.title, eyebrow:'Scrapbook'}) + `<div class="screen-body"><div class="page mt16"><div class="skeleton" style="height:22px;width:60%"></div><div class="skeleton mt20" style="height:220px;border-radius:14px"></div><p class="row mono mt16" style="font-size:11px;gap:8px;justify-content:center;color:var(--green)">● Taping in your pages…</p></div></div>`;
    const first=bookPhotos(b).slice(0,3).map(p=>new Promise(r=>{ const i=new Image(); i.onload=i.onerror=r; i.src=S.photoURL(p); }));
    Promise.race([Promise.all(first), new Promise(r=>setTimeout(r,700))]).then(()=>{ if (el.isConnected) paint(); });
  });
}
go.book = openBook;
// open the book a page is in, at that page
go.bookPage = (bookId, pageId)=>openBook(bookId, { pageId });

/* =========================================================
   19. BOOK FILTERS
   ========================================================= */
function bookFilters(b, current, apply){
  const d={ months:[...(current.months||[])], cats:[...(current.cats||[])], venues:[...(current.venues||[])], members:[...(current.members||[])], tagged:[...(current.tagged||[])], privacy:current.privacy||'all' };
  const base = b ? pageRecs({...b, filter:{}}) : pageRecs({ kind:'album', id:'_all' });
  const months=[...new Set(base.map(p=>monthKey(p.date)))].sort().reverse();
  const people=b && b.kind==='crew' ? S.crewMembers() : [];
  // people you've been tagged with (either way) in this book's photos
  const withIds=[...new Set(base.flatMap(p=>{ const e=p.entryId&&S.entry(p.entryId); if (!e) return []; const t=(e.taggedIds||[]).filter(id=>id!==S.me().id); return e.userId!==S.me().id && (e.taggedIds||[]).includes(S.me().id) ? [...t, e.userId] : t; }))];
  const withPeople=withIds.map(S.user).filter(Boolean);
  let q='';
  openSheet(body=>{
    const paint=()=>{
      const n=pageRecs(b||{kind:'album', id:'_all'}, d).length;
      const vHits = q ? S.searchVenues(q, 6).filter(v=>base.some(p=>p.venueId===v.id)) : [];
      const topVenues = [...new Set(base.map(p=>p.venueId))].slice(0,6).filter(id=>!d.venues.includes(id));
      const nV = new Set(pageRecs(b||{kind:'album', id:'_all'}, d).map(p=>p.venueId)).size;
      body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-lg">Filter Scrapbook <span class="hand">Al-Daftar</span></h2><p class="muted">Refine memories across ${esc(APP.city)} pages</p></div><button class="btn btn-ghost btn-sm mono" data-x="clear" style="font-size:13px;letter-spacing:.08em">CLEAR<br>ALL</button></div>
        <div class="row between mt8"><span class="eyebrow" style="color:var(--ink)">${icon('calendar_month')} Time range / month</span></div>
        <div class="month-row mt12"><button class="month-chip${!d.months.length?' on':''}" data-month="">All Time</button>${months.map(m=>`<button class="month-chip${d.months.includes(m)?' on':''}" data-month="${m}">${d.months.includes(m)?icon('check'):''}${esc(fmtMonth(m))}</button>`).join('')}</div>
        <div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('local_cafe')} Category (taste &amp; mood)</span>${d.cats.length?`<span class="tag" style="background:var(--rust);color:var(--on-deep);text-transform:none">${d.cats.length} Selected</span>`:''}</div>
        <div class="cat-grid5 mt12">${CATEGORIES.map(c=>`<button class="cat-cell${d.cats.includes(c.id)?' on':''}" data-cat="${c.id}"><span class="cc">${iconSvg(c.id, d.cats.includes(c.id)?'#fff':c.color)}</span><span>${esc(c.label)}</span></button>`).join('')}</div>
        <div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('location_on')} Places &amp; spots</span></div>
        <label class="search mt12">${icon('search')}<input id="bfQ" placeholder="Search a place" value="${esc(q)}"></label>
        <div class="chip-scroll mt12">${d.venues.map(id=>`<button class="person-chip on" data-venue-x="${id}" style="padding-left:14px;background:var(--rust-soft);box-shadow:0 3px 0 var(--rust)">${icon('location_on')}${esc(S.venue(id)?.name||'')}${icon('close')}</button>`).join('')}${(q?vHits.map(v=>v.id):topVenues).filter(id=>!d.venues.includes(id)).map(id=>`<button class="person-chip" data-venue-add="${id}" style="padding-left:14px">${esc(S.venue(id)?.name||'')}</button>`).join('')}</div>
        ${people.length>1?`<div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('group')} Crew members (shared book)</span></div><p class="muted small mt4">Pages by who logged the visit</p>
        <div class="chip-scroll mt12"><button class="person-chip${!d.members.length?' on':''}" data-mem="">${icon('groups')}Everyone</button>${people.map(u=>`<button class="person-chip${d.members.includes(u.id)?' on':''}" data-mem="${u.id}">${avatarHTML(u,30)}@${esc(u.id===S.me().id?'you':u.handle)}${d.members.includes(u.id)?icon('check_circle'):''}</button>`).join('')}</div>`:''}
        ${withPeople.length?`<div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('group')} Tagged with</span></div><p class="muted small mt4">Visits you went on together</p>
        <div class="chip-scroll mt12" data-f="tagged">${withPeople.map(u=>`<button class="person-chip${d.tagged.includes(u.id)?' on':''}" data-with="${u.id}">${avatarHTML(u,30)}@${esc(u.handle)}${d.tagged.includes(u.id)?icon('check_circle'):''}</button>`).join('')}</div>`:''}
        ${!b||b.kind!=='crew'?`<div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('visibility')} Privacy scope</span><span class="hand">Scrapbook access</span></div>
        <div class="mt12">${seg('priv',[['all','All Pages','menu_book'],['shared','Shared','groups'],['private','Just me','lock']],d.privacy)}</div>`:''}
        <div class="sheet-foot"><button class="btn btn-gold btn-block" data-x="apply">${icon('menu_book')}${b?`Show ${plural(n,'Page')} (Apply)`:`Use ${plural(n,'page')}`}</button><p class="center hand mt8">Matching ${plural(nV,'place')} in your scrapbook</p></div>`;
      const qi=body.querySelector('#bfQ'); qi.oninput=()=>{ q=qi.value; const pos=qi.selectionStart; keep(); const n2=body.querySelector('#bfQ'); n2.focus(); n2.setSelectionRange(pos,pos); };
      bindSeg(body,'priv',v=>{ d.privacy=v; keep(); });
    };
    const keep=()=>{ const s=body.scrollTop; paint(); body.scrollTop=s; };
    body.addEventListener('click', e=>{
      const t=e.target.closest('button'); if (!t) return;
      const tog=(arr,v)=>{ const i=arr.indexOf(v); i>-1?arr.splice(i,1):arr.push(v); };
      if (t.dataset.x==='clear'){ d.months=[]; d.cats=[]; d.venues=[]; d.members=[]; d.tagged=[]; d.privacy='all'; }
      else if (t.dataset.x==='apply'){ back(); apply({...d}); return; }
      else if ('month' in t.dataset){ t.dataset.month ? tog(d.months,t.dataset.month) : d.months=[]; }
      else if (t.dataset.cat){ tog(d.cats,t.dataset.cat); }
      else if (t.dataset.with){ tog(d.tagged,t.dataset.with); }
      else if (t.dataset.venueX){ tog(d.venues,t.dataset.venueX); }
      else if (t.dataset.venueAdd){ d.venues.push(t.dataset.venueAdd); q=''; }
      else if ('mem' in t.dataset){ t.dataset.mem ? tog(d.members,t.dataset.mem) : d.members=[]; }
      else return;
      keep();
    });
    paint();
  });
}

/* =========================================================
   20. PHOTO VIEWER
   ========================================================= */
function viewer(ids, index){
  ids=ids.filter(id=>S.photo(id)); if (!ids.length) return;
  let i=Math.max(0, Math.min(index||0, ids.length-1));
  openScreen(el=>{
    const paint=()=>{
      const p=S.photo(ids[i]); if (!p){ back(); return; }
      const me=S.me(), mine=p.userId===me.id, v=S.venue(p.venueId), u=S.user(p.userId);
      const bm=(p.bookmarkedBy||[]).includes(me.id);
      el.innerHTML = topbar({title:'Photo Detail Viewer', eyebrow:'Scrapbook page', actions:''}) + `<div class="screen-body">
        <div class="viewer-bar"><button class="icon-btn" data-act="back" aria-label="Close">${icon('close')}</button><span class="count"><span>${icon('photo_library')}${i+1} OF ${ids.length}</span></span>
          <button class="icon-btn" id="vShare" aria-label="Share">${icon('ios_share')}</button><button class="icon-btn" id="vBm" aria-label="Bookmark">${icon(bm?'bookmark':'bookmark_border','',bm)}</button></div>
        <div class="viewer-card mt16"><span class="tape-label">${esc(APP.city.toUpperCase())} MEMORY</span>
          <div class="viewer-img" id="vImg"><img src="${esc(S.photoURL(p))}" alt="${esc(p.caption||'')}"><span class="pol-badge">${icon('camera')}${esc(zoneLabel(v?.zone).toUpperCase())}</span>${p.private?`<span class="pol-badge tr">${icon('lock')}Only me</span>`:''}</div>
          <div class="caption-box">${mine?`<input id="vCap" value="${esc(p.caption||'')}" placeholder="Write a caption…" maxlength="60"><button class="icon-btn" style="background:var(--rust-fixed);width:40px;height:40px" id="vCapBtn" aria-label="Edit caption">${icon('edit')}</button>`:`<span class="cap">${esc(p.caption||'')}</span>`}</div>
          ${v?`<button class="meta-chip" id="vPlace">${icon('location_on')}<b>${esc(v.name)}</b> • ${esc(zoneLabel(v.zone))}${icon('chevron_right')}</button><br>`:''}
          <span class="meta-chip dim">${icon('schedule')}${esc(fmtDate(p.date))} • @${esc(u?(u.id===me.id?'you':u.handle):'')}</span>
        </div>
        ${mine?`<div class="btn-grid mt20"><button class="btn btn-soft" id="vPriv">${icon(p.private?'lock':'lock_open')}${p.private?'Private':'Shared'}</button><button class="btn btn-gold" id="vCover">${icon('menu_book')}Set as Cover</button></div>
        <button class="btn btn-danger btn-block mt12" id="vDel">${icon('delete')}Delete Photo</button>`:`<button class="btn btn-gold btn-block mt20" id="vCover">${icon('menu_book')}Set as Crew Book Cover</button>`}
      </div>`;
      el.querySelector('#vBm').onclick=()=>{ const on=S.toggleBookmark(p.id); toast(on?'Bookmarked to your shelf':'Bookmark removed'); paint(); };
      el.querySelector('#vShare').onclick=async()=>{
        try{
          const blob=await (await fetch(S.photoURL(p))).blob();
          const file=new File([blob], (p.caption||'memory').replace(/\W+/g,'-')+'.jpg', {type:'image/jpeg'});
          if (navigator.canShare && navigator.canShare({files:[file]})) return await navigator.share({files:[file], title:p.caption||v?.name||APP.name});
        }catch(_){}
        share({title:v?.name||APP.name, text:`${p.caption||''} at ${v?.name||''}`, url:location.origin});
      };
      const vp=el.querySelector('#vPlace'); if (vp) vp.onclick=()=>go.place(v.id);
      const cap=el.querySelector('#vCap'); if (cap){ cap.onchange=()=>{ S.updatePhoto(p.id,{caption:cap.value.trim()}); toast('Caption saved'); }; el.querySelector('#vCapBtn').onclick=()=>cap.focus(); }
      const pr=el.querySelector('#vPriv'); if (pr) pr.onclick=()=>{
        const e=p.entryId&&S.entry(p.entryId);
        if (p.private && e && e.private) return toast('This photo’s log is private. Share the log from its place page first.');
        if (p.private){ const to=(e&&e.crewIds&&e.crewIds.length)?e.crewIds.slice():(S.myCrew()?[S.myCrew().id]:[]); S.updatePhoto(p.id,{private:false, crewIds:to}); toast(whoText(to)); }
        else { S.updatePhoto(p.id,{private:true, crewIds:[]}); toast('Only you can see this photo'); }
        paint();
      };
      el.querySelector('#vCover').onclick=()=>{
        const books=S.books(); const target = mine ? books.find(b=>b.kind==='personal') : books.find(b=>b.kind==='crew');
        if (!target) return toast('Start a crew to have a crew book');
        if (target.kind==='crew' && p.private) return toast('Private photos can’t go on the crew book');
        S.saveBook(target.id,{coverPhotoId:p.id}); toast(`Set as the cover of ${target.title}`);
      };
      const del=el.querySelector('#vDel'); if (del) del.onclick=()=>{
        openSheet(body=>{
          body.innerHTML=`<h2 class="h-md">Delete this photo?</h2><p class="muted mt8">It's removed from your books and the crew strip. This can't be undone.</p><div class="btn-grid mt20"><button class="btn btn-soft" data-x="n">Keep</button><button class="btn btn-danger" data-x="y">Delete</button></div>`;
          body.querySelector('[data-x="n"]').onclick=()=>back();
          body.querySelector('[data-x="y"]').onclick=async()=>{ await S.deletePhoto(p.id); back(); ids.splice(i,1); toast('Photo deleted'); if (!ids.length) setTimeout(()=>back(),300); else { i=Math.min(i,ids.length-1); setTimeout(paint,300); } };
        });
      };
      // swipe between photos
      const img=el.querySelector('#vImg'); let x0=null;
      img.addEventListener('pointerdown', e=>{ x0=e.clientX; });
      img.addEventListener('pointerup', e=>{ if (x0===null) return; const dx=e.clientX-x0; x0=null; if (Math.abs(dx)>50){ i = (i + (dx<0?1:-1) + ids.length) % ids.length; paint(); } });
    };
    const key=e=>{ if (!el.isConnected){ document.removeEventListener('keydown', key); return; } if (e.key==='ArrowRight'){ i=(i+1)%ids.length; paint(); } if (e.key==='ArrowLeft'){ i=(i-1+ids.length)%ids.length; paint(); } };
    document.addEventListener('keydown', key);
    paint();
  }, {cls:'viewer'});
}
go.viewer = viewer;

/* =========================================================
   ADD PHOTOS: pick from the camera roll, then log the visit they're from
   (there's one flow: the photos arrive already in the log form)
   ========================================================= */
function addPhotos(opts){
  opts=opts||{};
  const fromBook = opts.bookId ? S.book(opts.bookId) : null;
  const who = fromBook && fromBook.kind==='crew' && S.myCrews().some(c=>c.id===fromBook.crewId) ? [fromBook.crewId] : undefined;
  const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.multiple=true;
  input.style.display='none'; document.body.appendChild(input);
  input.onchange=async()=>{
    const files=[...input.files]; input.remove();
    if (files.length > APP.photosPerLog) toast(`One visit holds ${APP.photosPerLog} photos; the first ${APP.photosPerLog} are in`);
    const photos=[];
    for (const f of files.slice(0, APP.photosPerLog)){
      try{
        const blob=await compressImage(f, 1400, 0.8);
        const t=new Date(f.lastModified||Date.now()), iso=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
        photos.push({ blob, url:URL.createObjectURL(blob), caption:'', date: iso <= todayISO() ? iso : todayISO() });
      }catch(_){ toast(`Couldn't read ${f.name}`); }
    }
    if (!photos.length) return;
    // the visit's date: when the earliest photo was taken
    const date = photos.map(p=>p.date).sort()[0];
    go.log({ venueId:opts.venueId, who, photos, date });
  };
  input.click();
}
go.addPhotos = addPhotos;
