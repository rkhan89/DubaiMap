// Photobook (frames 15-22): shelf, cover customiser, open book (by date / by place),
// book filters, photo viewer, add photos, privacy + empty + loading states.
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import { CATEGORIES, catById, iconSvg, esc, fmtDate, fmtDay, monthKey, fmtMonth, todayISO, plural, tilt } from './data.js';
import { avatarHTML, avatarStack } from './avatar.js';
import { $, icon, toast, openScreen, openSheet, back, closeAll, topbar, polaroidHTML, share, compressImage, toggleHTML, bindToggle, seg, bindSeg } from './ui.js';
import { go, state } from './go.js';

const TINTS = ['#e5a93c','#8B5A2B','#486636','#3b2717','#f2cfb4','#fdae7e'];
const TEXTURES = [['leather','Leather','layers'],['cloth','Cloth Loom','grid_4x4'],['paperback','Paperback','menu_book']];
const ROMAN = n=>{ const m=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let s=''; for (const [v,r] of m) while(n>=v){ s+=r; n-=v; } return s; };
const zoneLabel = id=>MAP.zoneById(id)?.label || APP.city;

/* ---------- which photos a book shows ---------- */
function bookPhotos(b, f){
  const me=S.me();
  let ps;
  if (b.kind==='crew'){
    const ids=S.circleIds();
    ps = S.photos().filter(p=>ids.includes(p.userId) && !p.private);        // shared entries only
  } else if (b.kind==='album'){
    ps = S.photos();
  } else ps = S.photos({userId:me.id});
  f = {...(b.filter||{}), ...(f||{})};
  if (f.months && f.months.length) ps = ps.filter(p=>f.months.includes(monthKey(p.date)));
  if (f.cats && f.cats.length) ps = ps.filter(p=>(S.venue(p.venueId)?.categories||[]).some(c=>f.cats.includes(c)));
  if (f.venues && f.venues.length) ps = ps.filter(p=>f.venues.includes(p.venueId));
  if (f.members && f.members.length) ps = ps.filter(p=>f.members.includes(p.userId));
  if (f.privacy==='shared') ps = ps.filter(p=>!p.private);
  if (f.privacy==='private') ps = ps.filter(p=>p.private);
  return ps;
}
function filterCount(f){ return f ? ['months','cats','venues','members'].reduce((n,k)=>n+((f[k]||[]).length?1:0),0) + (f.privacy&&f.privacy!=='all'?1:0) : 0; }

/* =========================================================
   15. SHELF
   ========================================================= */
function shelf(){
  openScreen(el=>{
    const paint=()=>{
      const me=S.me(), crew=S.myCrew(), books=S.books();
      const personal=books.find(b=>b.kind==='personal'), crewBook=books.find(b=>b.kind==='crew'), albums=books.filter(b=>b.kind==='album');
      const mine=bookPhotos(personal), crewPs=crewBook?bookPhotos(crewBook):[];
      const zones = {}; mine.concat(crewPs).forEach(p=>{ const z=S.venue(p.venueId)?.zone; if (z) zones[z]=(zones[z]||0)+1; });
      const topZ = Object.keys(zones).sort((a,b)=>zones[b]-zones[a]).slice(0,2).map(zoneLabel);
      const privateNotes = S.entries({userId:me.id}).filter(e=>e.private && e.notes).length;
      let spreads = S.photos().filter(p=>(p.bookmarkedBy||[]).includes(me.id));
      const spreadTitle = spreads.length ? 'Recent Bookmarked Spreads' : 'Fresh Spreads';
      if (!spreads.length) spreads = mine.concat(crewPs).slice(0,4);
      const members = crew ? S.crewMembers(crew) : [];
      el.innerHTML = topbar({title:'Scrapbook Shelf', eyebrow:'Scrapbook & Notes', back:true, actions:`<button class="icon-btn" id="shNew" aria-label="Add photos">${icon('add_photo_alternate')}</button>`}) + `<div class="screen-body">
        <div class="deck mt8">
          <div class="deck-head"><span class="ms" style="color:var(--gold-deep)">book_2</span><span class="eyebrow grow" style="color:var(--ink);font-size:13px">Vol. ${new Date().getFullYear()} Archival Deck</span>${topZ.length?`<span class="tag soft">${esc(topZ.join(' • '))}</span>`:''}</div>
          ${spineHTML(personal, { kind:'Personal photobook', kicon:'auto_stories', corner:'Keeper Copy', hand: personal.byline || (topZ.length>1?`${topZ[1]} bites to ${topZ[0]} spice trails`:'Your city, one bite at a time'), meta:[`${icon('photo_library')}${plural(mine.length,'photo')}`, privateNotes?`gold:${icon('lock')}${plural(privateNotes,'private note')}`:''] })}
          ${crewBook?spineHTML(crewBook, { kind:'Collaborative journal', kicon:'groups', corner:'Shared Trail', cornerCls:'green', hand: crew.tagline || `Shared spots across ${plural(members.length-1,'friend')}`, meta:[`${avatarStack(members,30,6)} ${members.length} members`, `${icon('share')}${crewPs.length} shared photos`], foot:'Shared entries only • no private logs' }):''}
          ${!crewBook?`<button class="book-spine" id="shNoCrew" style="background:var(--sc-highest);color:var(--ink);box-shadow:none;border:2px dashed var(--outline-v)"><span class="rings" style="background:rgba(0,0,0,.05)"><i style="background:var(--outline-v)"></i><i style="background:var(--outline-v)"></i><i style="background:var(--outline-v)"></i></span><span class="grow"><span class="bs-kind">${icon('group_add')}Crew journal</span><h3 style="font-size:20px">Start a crew to share a book</h3><span class="hand" style="color:var(--rust)">Everyone's shared photos, one living logbook</span></span></button>`:''}
          ${albums.map(a=>spineHTML(a, { kind:'Custom album', kicon:'collections_bookmark', hand: a.byline || describeFilter(a.filter), meta:[`${icon('photo_library')}${plural(bookPhotos(a).length,'photo')}`] })).join('')}
        </div>
        ${spreads.length?`<div class="row between mt32"><span class="row h-md" style="gap:8px">${icon('bookmarks')}${spreadTitle}</span></div>
        <div class="spreads mt16">${spreads.slice(0,4).map((p,i)=>spreadHTML(p,i)).join('')}</div>`:
        `<div class="card-soft mt24 center" style="padding:28px 18px"><div style="width:120px;margin:0 auto">${polaroidHTML({caption:'your first memory', rot:-3})}</div><h3 class="h-md mt16">No photos yet</h3><p class="muted mt8">Log a bite with photos, or import some from your camera roll.</p></div>`}
        <div class="btn-grid mt24" style="grid-template-columns:1.4fr 1fr"><button class="btn btn-gold" id="shAlbum">${icon('library_add')}New Custom Album</button><button class="btn btn-white" id="shImport">${icon('upload_file')}Import Roll</button></div>
        <p class="row mono muted mt16" style="font-size:12px;gap:8px;justify-content:center">${icon('verified_user')}Private entries never appear in shared books</p>
      </div>`;
      el.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>openBook(b.dataset.book));
      el.querySelectorAll('[data-spread]').forEach(b=>b.onclick=()=>{ const ids=spreads.map(p=>p.id); viewer(ids, ids.indexOf(b.dataset.spread)); });
      el.querySelector('#shAlbum').onclick=()=>bookFilters(null, {}, f=>newAlbum(f));
      el.querySelector('#shImport').onclick=()=>addPhotos({});
      el.querySelector('#shNew').onclick=()=>addPhotos({});
      const nc=el.querySelector('#shNoCrew'); if (nc) nc.onclick=()=>go.crew();
    };
    paint(); el._repaint=paint;
    const off=S.onChange(()=>{ if (el.isConnected) paint(); else off(); });
  });
}
function spineHTML(b, o){
  const cover = b.coverPhotoId && S.photo(b.coverPhotoId);
  return `<button class="book-spine" data-book="${b.id}" style="background:${b.tint}${['#f2cfb4','#fdae7e','#e5a93c'].includes(b.tint)?';color:var(--ink)':''}">
    ${o.corner?`<span class="corner ${o.cornerCls||''}">${esc(o.corner)}</span>`:''}
    <span class="rings"><i></i><i></i><i></i><i></i></span>
    <span class="grow" style="min-width:0">
      <span class="bs-kind">${icon(o.kicon)}${esc(o.kind)}</span>
      <h3 class="clamp2">${esc(b.title)}</h3>
      <span class="hand" style="${['#f2cfb4','#fdae7e','#e5a93c'].includes(b.tint)?'color:var(--rust)':''}">${esc(o.hand||'')}</span>
      <span class="bs-meta">${o.meta.filter(Boolean).map(m=>m.startsWith('gold:')?`<span class="bsm gold">${m.slice(5)}</span>`:`<span class="bsm">${m}</span>`).join('')}</span>
      ${o.foot?`<span class="hand" style="display:block;font-size:16px;margin-top:8px">${esc(o.foot)}</span>`:''}
    </span>
    <span class="bs-go">${cover?`<img src="${S.photoURL(cover)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`:icon('arrow_forward')}</span>
  </button>`;
}
function spreadHTML(p, i){
  const v=S.venue(p.venueId), e=p.entryId && S.entry(p.entryId), u=S.user(p.userId), me=S.me();
  const mineBook = p.userId===me.id;
  return `<button class="spread-card" data-spread="${p.id}"><span class="tape ${i%2?'green':''}"></span>
    <span class="sp-img"><img src="${esc(S.photoURL(p))}" alt="" loading="lazy"><span class="pol-badge light">${esc(zoneLabel(v?.zone))} • ${esc((v?.name||'').split(' ').slice(0,2).join(' '))}</span></span>
    <h4 class="trunc">${esc(p.caption||v?.name||'Memory')}</h4>
    ${e&&e.notes?`<span class="hand trunc">"${esc(e.notes)}"</span>`:`<span class="hand">${esc(u?(u.id===me.id?'you':u.name):'')}</span>`}
    <span class="sp-foot"><span>${fmtDate(p.date,{day:'numeric',month:'short'})} • ${mineBook?'My Book':'Crew Book'}</span>${icon((p.bookmarkedBy||[]).includes(me.id)?'bookmark':'favorite','', (p.bookmarkedBy||[]).includes(me.id))}</span>
  </button>`;
}
function describeFilter(f){
  f=f||{}; const bits=[];
  if (f.cats&&f.cats.length) bits.push(f.cats.map(c=>catById(c)?.label).join(', '));
  if (f.months&&f.months.length) bits.push(f.months.map(fmtMonth).join(', '));
  if (f.venues&&f.venues.length) bits.push(plural(f.venues.length,'place'));
  return bits.join(' • ') || 'Every photo';
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
   16. COVER CUSTOMISER
   ========================================================= */
function coverHTML(b, count){
  const cover=b.coverPhotoId && S.photo(b.coverPhotoId);
  const light=['#f2cfb4','#fdae7e','#e5a93c'].includes(b.tint);
  const ps=bookPhotos(b); const zc={}; ps.forEach(p=>{ const z=S.venue(p.venueId)?.zone; if (z) zc[z]=(zc[z]||0)+1; });
  const zs=Object.keys(zc).sort((a,c)=>zc[c]-zc[a]).slice(0,2);
  const z0=MAP.zoneById(zs[0]||'deira');
  const me=S.me(), crew=S.myCrew();
  const by = b.byline || (b.kind==='crew'&&crew ? `${crew.name} • shared journal` : `Hand-picked by @${me.handle}${crew?` • ${crew.name}`:''}`);
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
function coverScreen(bookId){
  const b0=S.book(bookId); if (!b0) return;
  const d={title:b0.title, byline:b0.byline||'', texture:b0.texture, tint:b0.tint, pin:b0.pin};
  openScreen(el=>{
    const paint=()=>{
      const b={...b0, ...d};
      const count=bookPhotos(b0).length;
      el.innerHTML = topbar({title:'Book Cover', eyebrow:'Scrapbook Page', actions:`<button class="icon-btn" id="cvOpen" aria-label="Open book">${icon('menu_book')}</button>`, profile:true}) + `<div class="screen-body">
        <div class="row between mt8"><span class="tag rust">${icon('menu_book')}Closed book preview</span><button class="btn btn-dark btn-sm" id="cvSave" style="border-radius:999px">${icon('check')}Save Cover</button></div>
        <div class="card-peach mt16" style="padding:20px 18px 14px"><button id="cvTap" style="display:block;width:100%">${coverHTML(b, count)}</button><p class="center hand mt12" style="color:var(--ink)">☝ Tap book cover to open spread 📖</p></div>
        <div class="panel mt16"><div class="panel-head">${icon('texture')}<h3>Material Texture</h3><span class="eyebrow" style="color:var(--rust)">${esc(TEXTURES.find(t=>t[0]===d.texture)[1])}</span></div>
          <div class="tex-grid">${TEXTURES.map(([v,l,ic])=>`<button class="tex${d.texture===v?' on':''}" data-tex="${v}"><span class="t-ico">${icon(ic)}</span>${l}</button>`).join('')}</div></div>
        <div class="panel mt16"><div class="panel-head">${icon('palette')}<h3>Cover Tint Palette</h3></div>
          <div class="row" style="justify-content:space-between">${TINTS.map(c=>`<button class="sw${d.tint===c?' on':''}" data-tint="${c}" style="background:${c};width:50px;height:50px" aria-label="Tint"></button>`).join('')}</div></div>
        <div class="panel mt16"><div class="panel-head"><span class="ms">title</span><h3>Title &amp; Spine Tagline</h3></div>
          <label class="row" style="background:#fff;border-radius:12px;padding:0 14px;height:56px"><input id="cvT" maxlength="36" value="${esc(d.title)}" style="flex:1;border:0;outline:0;font-family:var(--f-head);font-weight:800;font-size:19px;min-width:0"><span class="eyebrow">Title</span></label>
          <label class="row mt8" style="background:#fff;border-radius:12px;padding:0 14px;height:50px"><input id="cvB" maxlength="50" value="${esc(d.byline)}" placeholder="Hand-picked by @${esc(S.me().handle)}" style="flex:1;border:0;outline:0;font-size:15px;min-width:0"><span class="eyebrow">Byline</span></label></div>
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
   17 / 18. OPEN BOOK (by date / by place) + 22 states
   ========================================================= */
function openBook(bookId, opts){
  opts=opts||{};
  const b=S.book(bookId); if (!b) return;
  let mode='date', page=0, filter={};
  openScreen(el=>{
    const skeleton=()=>`<div class="page mt16"><div class="row"><span class="skeleton" style="width:40px;height:40px;border-radius:50%"></span><span class="grow"><span class="skeleton" style="display:block;width:60%;height:14px"></span><span class="skeleton mt8" style="display:block;width:40%;height:10px"></span></span></div>
      <div class="skeleton mt20" style="height:240px;border-radius:14px"></div><div class="row mt16" style="gap:10px"><span class="skeleton" style="flex:1;height:90px"></span><span class="skeleton" style="flex:1;height:90px"></span><span class="skeleton" style="flex:1;height:90px"></span></div>
      <p class="row mono mt16" style="font-size:11px;gap:8px;justify-content:center;color:var(--green)">● Pasting freshly stamped memories…</p></div>`;
    const paint=()=>{
      const me=S.me();
      const ps=bookPhotos(b, filter);
      const nf=filterCount(filter);
      const head = topbar({title:b.title, eyebrow:'Scrapbook Page', actions:`<button class="icon-btn" id="bkCover" aria-label="Customise cover">${icon('palette')}</button><button class="icon-btn" id="bkShare" aria-label="Share">${icon('share')}</button>`}) +
        `<div class="screen-body"><div class="row mt8" style="gap:10px"><div class="grow">${seg('bmode',[['date','By Date','calendar_month'],['place','By Place','location_on']],mode)}</div><button class="sq-btn${nf?' filtered':''}" id="bkFilter" aria-label="Filter photos" style="width:48px;height:48px">${icon('tune')}</button></div>`;
      let body='';
      const hasPrivate = b.kind!=='crew' && ps.some(p=>p.private);
      if (hasPrivate && page===0) body += `<div class="privacy-banner mt16">${icon('shield_lock')}<span><b>Private photos are only visible to you.</b> They never appear on the crew map, feed, or shared memory book.</span></div>`;
      if (!ps.length){
        body += b.kind==='crew'
          ? `<div class="card-soft mt16 center" style="padding:30px 18px"><div style="position:relative;width:170px;margin:0 auto"><div style="background:var(--sc-highest);border-radius:12px;padding:14px;transform:rotate(-4deg)"><div style="background:#fff;border-radius:6px;padding:10px;transform:rotate(6deg);box-shadow:var(--shadow-sm)"><div style="background:var(--sc-high);height:70px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--rust)">${icon('camera')}</div></div></div><span style="position:absolute;left:-10px;bottom:-12px;width:44px;height:44px;border-radius:50%;background:#fff;box-shadow:var(--shadow-sm);display:flex;align-items:center;justify-content:center;color:var(--gold)">${icon('restaurant','',true)}</span></div>
             <h3 class="h-lg mt24">No shared photos yet</h3><p class="muted mt8">When you or someone in <b style="color:var(--rust)">${esc(S.myCrew()?.name||'your crew')}</b> logs a food trail and chooses <span class="hand" style="color:var(--ink)">"Share with crew"</span>, they'll paste onto these pages automatically!</p>
             <button class="btn btn-gold btn-block mt20" id="bkAdd">${icon('add_a_photo')}Add the first crew photo</button><p class="hand mt12">${icon('map')} Pin your favourite Deira street stall</p></div>`
          : `<div class="card-soft mt16 center" style="padding:30px 18px"><h3 class="h-lg">${nf?'No photos match these filters':'This book is waiting for its first photo'}</h3><p class="muted mt8">${nf?'Try widening the time range or categories.':'Add photos when you log a place, or import from your camera roll.'}</p><button class="btn btn-gold btn-block mt20" id="bkAdd">${icon('add_a_photo')}${nf?'Add photos':'Add photos'}</button></div>`;
      } else if (mode==='date') body += datePage(ps);
      else body += placePage(ps, b);
      el.innerHTML = head + body + `</div>`;
      bindSeg(el,'bmode',v=>{ mode=v; page=0; paint(); el.scrollTop=0; });
      el.querySelector('#bkFilter').onclick=()=>bookFilters(b, filter, f=>{ filter=f; page=0; paint(); });
      el.querySelector('#bkCover').onclick=()=>coverScreen(b.id);
      el.querySelector('#bkShare').onclick=()=>share({title:b.title, text:`${b.title} — ${plural(ps.length,'memory','memories')} on ${APP.name}`, url:location.origin});
      const add=el.querySelector('#bkAdd'); if (add) add.onclick=()=>addPhotos({});
      el.querySelectorAll('[data-photo]').forEach(f=>f.onclick=e=>{
        if (e.target.closest('[data-heart]')) return;
        const list=[...el.querySelectorAll('[data-photo]')].map(x=>x.dataset.photo);
        viewer(list, list.indexOf(f.dataset.photo));
      });
      el.querySelectorAll('[data-heart]').forEach(h=>h.onclick=e=>{ e.stopPropagation(); const on=S.toggleBookmark(h.dataset.heart); h.innerHTML=icon(on?'bookmark':'bookmark_border','',on); toast(on?'Bookmarked to your shelf':'Bookmark removed'); });
      el.querySelectorAll('[data-page]').forEach(p=>p.onclick=()=>{ page=+p.dataset.page; paint(); el.scrollTop=0; });
      el.querySelectorAll('[data-addplace]').forEach(p=>p.onclick=()=>addPhotos({venueId:p.dataset.addplace}));
      el.querySelectorAll('[data-venue]').forEach(p=>p.onclick=()=>go.place(p.dataset.venue));
    };
    // pages: one per day (by date) or one per venue (by place)
    const datePage=(ps)=>{
      const days=[...new Set(ps.map(p=>p.date))].sort().reverse();
      page=Math.min(page, days.length-1);
      const day=days[page], dps=ps.filter(p=>p.date===day);
      const vs=[...new Set(dps.map(p=>p.venueId))].map(S.venue).filter(Boolean);
      const z=MAP.zoneById(vs[0]?.zone);
      const notes=[...new Set(dps.map(p=>p.entryId).filter(Boolean))].map(S.entry).filter(e=>e&&e.notes);
      const me=S.me();
      const prev=days[page+1], next=days[page-1];
      const nextPs = next ? ps.filter(p=>p.date===next) : [];
      const areaOf = d=>{ const v=S.venue(ps.find(p=>p.date===d)?.venueId); return v?zoneLabel(v.zone):''; };
      return `<div class="page mt16"><span class="bookmark"></span>
        <div class="row between page-date" style="align-items:flex-start"><div><span class="hand">${esc(fmtDay(day))}</span><div class="page-geo">${esc((z?z.label:APP.city).toUpperCase())}${z?` • ${z.lat.toFixed(4)}° N, ${z.lng.toFixed(4)}° E`:''}</div></div>
          ${vs.length?`<span class="page-weather">${icon('wb_sunny')}${esc(vs.length>1?`${vs.length} stops`:`Out in ${z?z.label:APP.city}`)}</span>`:''}</div>
        ${dps.map((p,i)=>{
          const v=S.venue(p.venueId), e=p.entryId&&S.entry(p.entryId), u=S.user(p.userId);
          const bm=(p.bookmarkedBy||[]).includes(me.id);
          return polaroidHTML({src:S.photoURL(p), id:p.id, cls:(i%2?'r':'l')+' wide', rot:tilt(p.id,5),
            caption:p.caption || v?.name,
            badge: p.private?`<span class="pol-badge tr" style="top:8px">${icon('lock')}Only you</span>`:(u&&u.id!==me.id?`<span class="pol-badge light">${esc(u.name||u.handle)}</span>`:''),
            sub:`<span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">${e&&e.rating?`<span class="mono" style="color:var(--green);font-size:12px;font-weight:700">★ ${e.rating}</span>`:''}<button data-heart="${p.id}" aria-label="Bookmark" style="color:var(--rust)">${icon(bm?'bookmark':'bookmark_border','',bm)}</button></span>`});
        }).join('')}
        ${notes.length?`<div class="notes-block"><span class="eyebrow">${icon('edit_note')}Tasting notes</span>${notes.map(e=>{ const u=S.user(e.userId); return `<p style="font-size:16px;margin-top:6px">${u.id!==me.id?`<b>${esc(u.name)}:</b> `:''}${esc(e.notes)}</p>`; }).join('')}</div>`:''}
        <div class="page-nav"><button data-page="${page+1}" ${prev?'':'disabled'}>${icon('arrow_back')}<span>${prev?esc(fmtDate(prev,{day:'numeric',month:'short'})):''}<br><span class="muted">${prev?'('+esc(areaOf(prev))+')':''}</span></span></button>
          <span class="pn-mid">Page ${page+1} of ${days.length} • Vol. 1</span>
          <button data-page="${page-1}" ${next?'':'disabled'} style="text-align:right"><span>${next?esc(fmtDate(next,{day:'numeric',month:'short'})):''}<br><span class="muted">${next?'('+esc(areaOf(next))+')':''}</span></span>${icon('arrow_forward')}</button></div>
        ${next?`<button class="peeking" data-page="${page-1}"><img src="${esc(S.photoURL(nextPs[0]))}" alt=""><span class="grow"><span class="eyebrow" style="color:var(--gold-deep)">Next entry peeking</span><span class="hand" style="display:block;color:var(--ink)">${esc(fmtDay(next).split(',')[0])} at ${esc(S.venue(nextPs[0].venueId)?.name||'')}</span></span>${icon('north_east')}</button>`:''}
      </div>`;
    };
    const placePage=(ps, b)=>{
      const byV={}; ps.forEach(p=>{ (byV[p.venueId]=byV[p.venueId]||[]).push(p); });
      const vids=Object.keys(byV).sort((a,c)=>Math.max(...byV[c].map(p=>p.createdAt))-Math.max(...byV[a].map(p=>p.createdAt)));
      page=Math.min(page, vids.length-1);
      const v=S.venue(vids[page]); if (!v) return '';
      const vps=byV[v.id], cat=catById(M.primaryCat(v));
      const visits=S.entries({venueId:v.id, kind:'visit'}).filter(e=>b.kind!=='crew'||!e.private).sort((a,c)=>c.date.localeCompare(a.date));
      const visitors=[...new Set(visits.map(e=>e.userId))].map(S.user).filter(Boolean);
      const dates=visits.map(e=>e.date).sort();
      const me=S.me();
      const groups={}; vps.forEach(p=>{ const k=p.entryId||('d'+p.date); (groups[k]=groups[k]||[]).push(p); });
      const gkeys=Object.keys(groups).sort((a,c)=>groups[c][0].date.localeCompare(groups[a][0].date));
      const visitNo = k=>{ const e=S.entry(k); if (!e) return ''; const mineSorted=visits.slice().sort((a,c)=>a.date.localeCompare(c.date)||a.createdAt-c.createdAt); return mineSorted.findIndex(x=>x.id===e.id)+1; };
      const names = visitors.map(u=>'@'+(u.id===me.id?'you':u.handle));
      return `<div class="page mt16">
        <div class="chapter-head"><div class="grow"><span class="hand">Chapter ${ROMAN(page+1)}</span><h2 data-venue="${v.id}" style="cursor:pointer">${esc(v.name)}</h2></div>
          <span class="cat-tile"><span class="ct-ico">${iconSvg(cat.id,'#7e5700')}</span><b>${esc(cat.label)}</b></span></div>
        <div class="chapter-meta"><div>${icon('near_me')}<b>${esc([zoneLabel(v.zone), v.address].filter(Boolean).join(' • '))}</b></div>
          <div>${icon('calendar_month')}${plural(visits.length,'visit')} recorded${dates.length?` • ${esc(fmtDate(dates[0],{month:'short',year:'numeric'}))}${dates.length>1&&monthKey(dates[0])!==monthKey(dates[dates.length-1])?` – ${esc(fmtDate(dates[dates.length-1],{month:'short',year:'numeric'}))}`:''}`:''}</div></div>
        ${visitors.length?`<div class="visited-by">${avatarStack(visitors,32,3)}<span>Visited by ${esc(names.length>2?names.slice(0,-1).join(', ')+', & '+names[names.length-1]:names.join(' & '))}</span></div>`:''}
        ${gkeys.map(k=>{ const g=groups[k], n=visitNo(k); return `<div class="visit-rule">${n?`VISIT #${n} — `:''}${esc(fmtDate(g[0].date,{day:'numeric',month:'short',year:'numeric'}).toUpperCase())}</div>
          <div class="photo-grid">${g.map(p=>polaroidHTML({src:S.photoURL(p), id:p.id, caption:p.caption||'', rot:tilt(p.id,4), badge:p.private?`<span class="pol-badge tr" style="top:8px">${icon('lock')}Only me</span>`:''})).join('')}</div>`; }).join('')}
        <button class="btn btn-dark btn-block mt24" data-addplace="${v.id}">${icon('add_photo_alternate')}+ Add photos to this place</button>
        <div class="page-nav"><button data-page="${page-1}" ${page>0?'':'disabled'}>${icon('arrow_back')}Prev</button><span class="pn-mid">${esc(APP.name)} Scrapbook <b>Page ${page+1}</b> • ${esc(v.name)} Chapter</span><button data-page="${page+1}" ${page<vids.length-1?'':'disabled'}>Next${icon('arrow_forward')}</button></div>
      </div>`;
    };
    // tactile loading state while the first photos decode
    el.innerHTML = topbar({title:b.title, eyebrow:'Scrapbook Page'}) + `<div class="screen-body">${skeleton()}</div>`;
    const first=bookPhotos(b).slice(0,3).map(p=>new Promise(r=>{ const i=new Image(); i.onload=i.onerror=r; i.src=S.photoURL(p); }));
    Promise.race([Promise.all(first), new Promise(r=>setTimeout(r,900))]).then(()=>{ if (el.isConnected) paint(); });
  });
}
go.book = openBook;

/* =========================================================
   19. BOOK FILTERS
   ========================================================= */
function bookFilters(b, current, apply){
  const d={ months:[...(current.months||[])], cats:[...(current.cats||[])], venues:[...(current.venues||[])], members:[...(current.members||[])], privacy:current.privacy||'all' };
  const base = b ? bookPhotos({...b, filter:{}}) : S.photos();
  const months=[...new Set(base.map(p=>monthKey(p.date)))].sort().reverse();
  const people=b && b.kind==='crew' ? S.crewMembers() : [];
  let q='';
  openSheet(body=>{
    const paint=()=>{
      const n=bookPhotos(b||{kind:'album'}, d).length;
      const vHits = q ? S.searchVenues(q, 6).filter(v=>base.some(p=>p.venueId===v.id)) : [];
      const topVenues = [...new Set(base.map(p=>p.venueId))].slice(0,6).filter(id=>!d.venues.includes(id));
      const nV = new Set(bookPhotos(b||{kind:'album'}, d).map(p=>p.venueId)).size;
      body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-lg">Filter Photobook <span class="hand">Al-Daftar</span></h2><p class="muted">Refine memories across ${esc(APP.city)} pages</p></div><button class="btn btn-ghost btn-sm mono" data-x="clear" style="font-size:13px;letter-spacing:.08em">CLEAR<br>ALL</button></div>
        <div class="row between mt8"><span class="eyebrow" style="color:var(--ink)">${icon('calendar_month')} Time range / month</span></div>
        <div class="month-row mt12"><button class="month-chip${!d.months.length?' on':''}" data-month="">All Time</button>${months.map(m=>`<button class="month-chip${d.months.includes(m)?' on':''}" data-month="${m}">${d.months.includes(m)?icon('check'):''}${esc(fmtMonth(m))}</button>`).join('')}</div>
        <div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('local_cafe')} Category (taste &amp; mood)</span>${d.cats.length?`<span class="tag" style="background:var(--rust);color:#fff;text-transform:none">${d.cats.length} Selected</span>`:''}</div>
        <div class="cat-grid5 mt12">${CATEGORIES.map(c=>`<button class="cat-cell${d.cats.includes(c.id)?' on':''}" data-cat="${c.id}"><span class="cc">${iconSvg(c.id, d.cats.includes(c.id)?'#fff':c.color)}</span><span>${esc(c.label)}</span></button>`).join('')}</div>
        <div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('location_on')} Places &amp; spots</span></div>
        <label class="search mt12">${icon('search')}<input id="bfQ" placeholder="Search a place" value="${esc(q)}"></label>
        <div class="chip-scroll mt12">${d.venues.map(id=>`<button class="person-chip on" data-venue-x="${id}" style="padding-left:14px;background:var(--rust-soft);box-shadow:0 3px 0 var(--rust)">${icon('location_on')}${esc(S.venue(id)?.name||'')}${icon('close')}</button>`).join('')}${(q?vHits.map(v=>v.id):topVenues).filter(id=>!d.venues.includes(id)).map(id=>`<button class="person-chip" data-venue-add="${id}" style="padding-left:14px">${esc(S.venue(id)?.name||'')}</button>`).join('')}</div>
        ${people.length>1?`<div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('group')} Crew members (shared book)</span></div><p class="muted small mt4">Filters photos by who took or uploaded them</p>
        <div class="chip-scroll mt12"><button class="person-chip${!d.members.length?' on':''}" data-mem="">${icon('groups')}Everyone</button>${people.map(u=>`<button class="person-chip${d.members.includes(u.id)?' on':''}" data-mem="${u.id}">${avatarHTML(u,30)}@${esc(u.id===S.me().id?'you':u.handle)}${d.members.includes(u.id)?icon('check_circle'):''}</button>`).join('')}</div>`:''}
        ${!b||b.kind!=='crew'?`<div class="row between mt20"><span class="eyebrow" style="color:var(--ink)">${icon('visibility')} Privacy scope</span><span class="hand">Scrapbook Access</span></div>
        <div class="mt12">${seg('priv',[['all','All Photos','photo_library'],['shared','Shared Only','groups'],['private','Private Only','lock']],d.privacy)}</div>`:''}
        <div class="sheet-foot"><button class="btn btn-gold btn-block" data-x="apply">${icon('menu_book')}${b?`Show ${plural(n,'Photo')} (Apply)`:`Use ${plural(n,'photo')}`}</button><p class="center hand mt8">Matching ${plural(nV,'place')} in your scrapbook</p></div>`;
      const qi=body.querySelector('#bfQ'); qi.oninput=()=>{ q=qi.value; const pos=qi.selectionStart; keep(); const n2=body.querySelector('#bfQ'); n2.focus(); n2.setSelectionRange(pos,pos); };
      bindSeg(body,'priv',v=>{ d.privacy=v; keep(); });
    };
    const keep=()=>{ const s=body.scrollTop; paint(); body.scrollTop=s; };
    body.addEventListener('click', e=>{
      const t=e.target.closest('button'); if (!t) return;
      const tog=(arr,v)=>{ const i=arr.indexOf(v); i>-1?arr.splice(i,1):arr.push(v); };
      if (t.dataset.x==='clear'){ d.months=[]; d.cats=[]; d.venues=[]; d.members=[]; d.privacy='all'; }
      else if (t.dataset.x==='apply'){ back(); apply({...d}); return; }
      else if ('month' in t.dataset){ t.dataset.month ? tog(d.months,t.dataset.month) : d.months=[]; }
      else if (t.dataset.cat){ tog(d.cats,t.dataset.cat); }
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
      el.innerHTML = topbar({title:'Photo Detail Viewer', eyebrow:'Scrapbook Page', actions:''}) + `<div class="screen-body">
        <div class="viewer-bar"><button class="icon-btn" data-act="back" aria-label="Close">${icon('close')}</button><span class="count"><span>${icon('photo_library')}${i+1} OF ${ids.length}</span></span>
          <button class="icon-btn" id="vShare" aria-label="Share">${icon('ios_share')}</button><button class="icon-btn" id="vBm" aria-label="Bookmark">${icon(bm?'bookmark':'bookmark_border','',bm)}</button></div>
        <div class="viewer-card mt16"><span class="tape-label">${esc(APP.city.toUpperCase())} MEMORY</span>
          <div class="viewer-img" id="vImg"><img src="${esc(S.photoURL(p))}" alt="${esc(p.caption||'')}"><span class="pol-badge">${icon('camera')}${esc(zoneLabel(v?.zone).toUpperCase())}</span>${p.private?`<span class="pol-badge tr">${icon('lock')}Only me</span>`:''}</div>
          <div class="caption-box">${mine?`<input id="vCap" value="${esc(p.caption||'')}" placeholder="Write a caption…" maxlength="60"><button class="icon-btn" style="background:var(--rust-fixed);width:40px;height:40px" id="vCapBtn" aria-label="Edit caption">${icon('edit')}</button>`:`<span class="hand">${esc(p.caption?`“${p.caption}”`:'')}</span>`}</div>
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
        S.updatePhoto(p.id,{private:!p.private}); toast(p.private?'Only you can see this photo':'Shared with your crew'); paint();
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
   21. ADD PHOTOS
   ========================================================= */
function addPhotos(opts){
  opts=opts||{};
  const me=S.me();
  const picked=[];        // {blob, url, caption, time, on}
  let venue = opts.venueId ? S.venue(opts.venueId) : null;
  let kind='visit', priv = me.shareDefault==='private', q='';
  const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.multiple=true;
  openScreen(el=>{
    const paint=()=>{
      const sel=picked.filter(p=>p.on), crew=S.myCrew(), members=crew?S.crewMembers(crew).filter(u=>u.id!==me.id):[];
      const step = !sel.length ? 1 : !venue ? 2 : 3;
      const room = APP.photoLimit - S.myPhotoCount();
      const visitsHere = venue ? S.entries({venueId:venue.id, userId:me.id, kind:'visit'}).length : 0;
      const hits = q ? S.searchVenues(q, 5) : [];
      el.innerHTML = topbar({title:'Add Scrapbook Memory', eyebrow:'Scrapbook & Notes', actions:''}) + `<div class="screen-body">
        <div class="row between mt8"><button class="row btn-ghost" data-act="back" style="gap:4px;color:var(--ink-2)">${icon('close')}Cancel</button>
          <div class="center"><span class="hand">Memory Entry</span><div class="h-sm">Add to Photobook</div></div>
          <button class="btn btn-gold btn-sm" id="apNext" style="border-radius:999px" ${sel.length&&venue?'':'disabled'}>Next <span class="tag soft" style="background:rgba(255,255,255,.5)">${sel.length}</span></button></div>
        <div class="stepper mt16"><span class="${step>=1?'on':''}"><i>1</i>Photos</span><b></b><span class="${step>=2?'on':''}"><i>2</i>Place</span><b></b><span class="${step>=3?'on':''}"><i>3</i>Review</span></div>
        <div class="row between mt24"><span class="row h-md" style="gap:8px">${icon('photo_library')}1. Selected Photos <span class="tag">${sel.length} of ${picked.length}</span></span><button class="hand" id="apPick">${picked.length?'Reselect roll ›':'Choose ›'}</button></div>
        ${picked.length?`<div class="sel-grid mt12">${picked.map((p,i)=>`<div style="position:relative" data-toggle="${i}">${p.on?`<span class="tick" style="position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;z-index:3">${icon('check')}</span>`:''}${polaroidHTML({src:p.url, id:'s'+i, tape:false, rot:0, badge:`<span class="pol-badge" style="left:6px;bottom:6px">${esc(p.time)}</span>`, sub:`<input data-cap="${i}" value="${esc(p.caption)}" placeholder="caption" maxlength="40" style="width:100%;border:0;background:none;font-family:var(--f-hand);font-size:17px;text-align:center;outline:none">`, cls:p.on?'':'dim'})}</div>`).join('')}</div>`
          : `<label class="add-photo mt12" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:150px;border:2px dashed var(--outline-v);border-radius:16px;background:var(--sc-low);color:var(--rust)">${icon('add_photo_alternate')}<b>Choose photos from your roll</b><span class="muted small">Up to ${Math.min(24, room)} at a time</span></label>`}
        <div class="row between mt24"><span class="row h-md" style="gap:8px">${icon('storefront')}2. Choose Place</span>${venue&&typeof venue.lat==='number'?'<span class="mono" style="color:var(--green);font-size:12px;font-weight:700">● EXACT SPOT</span>':''}</div>
        ${venue?`<div class="card mt12"><div class="row" style="background:var(--sc);border-radius:14px;padding:12px">${`<span class="stamp st-visited"><span class="st-paper"><span class="st-ico">${iconSvg(M.primaryCat(venue),'#7e5700')}</span></span></span>`}<div class="grow"><b class="h-sm">${esc(venue.name)} ${icon('verified')}</b><div class="muted small">${esc(zoneLabel(venue.zone))}</div><span class="tag rust mt4">${esc(catById(M.primaryCat(venue)).label)}</span></div><span style="width:40px;height:40px;border-radius:50%;background:var(--gold-deep);color:#fff;display:flex;align-items:center;justify-content:center">${icon('check')}</span></div>
            <div class="row between mt8"><span class="hand">Not the right branch?</span><button class="mono" id="apChange" style="color:var(--gold-deep);font-weight:700;font-size:12px">Change location</button></div></div>`
          : `<label class="search mt12">${icon('search')}<input id="apQ" placeholder="Search a place" value="${esc(q)}" autocomplete="off"></label>
            <div class="stack mt12">${hits.map(v=>`<button class="search-result" data-v="${v.id}"><span class="sr-ico">${iconSvg(M.primaryCat(v), catById(M.primaryCat(v)).color)}</span><span class="grow"><b>${esc(v.name)}</b><span class="muted small" style="display:block">${esc(zoneLabel(v.zone))}</span></span>${icon('chevron_right')}</button>`).join('')}</div>`}
        ${venue?`<div class="card-peach mt20" style="border-radius:var(--r-xl)"><div class="row" style="align-items:flex-start"><span style="width:44px;height:44px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 3px 0 var(--gold-deep)">${icon('push_pin')}</span><div><b class="h-md">This adds a visit to ${esc(venue.name)}</b><p class="muted">Have you been there today or collecting notes for next time?</p></div></div>
          <div class="stack mt16"><button class="radio-card${kind==='visit'?' on':''}" data-kind="visit"><span class="rc-head"><span class="dot"></span>Been here ${icon('verified')}<span class="grow"></span><span class="tag">Visit #${visitsHere+1}</span></span><p>Adds visit #${visitsHere+1} to your log with today's date <span class="mono">(${esc(fmtDate(todayISO()))})</span>.</p></button>
          <button class="radio-card${kind==='want'?' on':''}" data-kind="want"><span class="rc-head"><span class="dot"></span>Want to try ${icon('bookmark')}<span class="grow"></span><span class="tag soft">Wishlist</span></span><p>Saves photos as inspiration for an upcoming visit or tasting route.</p></button></div></div>
        <div class="card mt20" style="border-radius:var(--r-xl)"><div class="row"><span style="width:52px;height:52px;border-radius:14px;background:var(--green-fixed);color:var(--green);display:flex;align-items:center;justify-content:center">${icon('groups','',true)}</span><div class="grow"><span class="hand">Crew Photobook</span><div class="h-md">${crew?`Share with ${esc(crew.name)}`:'Share with your crew'}</div></div>${toggleHTML('apShare', !priv, 'Share with crew')}</div>
          <p class="row muted mt12" style="gap:8px;align-items:flex-start">${icon('lock')}Turn off to keep strictly private in “My Book” archive.</p>
          ${members.length?`<div class="row mt12" style="background:var(--sc-low);border-radius:12px;padding:8px 12px">${avatarStack(members,28,3)}<span class="mono small" style="font-size:12px">Visible to ${esc(members.slice(0,2).map(u=>u.name).join(', '))}${members.length>2?` & ${members.length-2} others`:''}</span></div>`:''}</div>`:''}
        <button class="btn btn-gold btn-block mt24" id="apGo" style="min-height:64px" ${sel.length&&venue?'':'disabled'}>${icon('menu_book')}${sel.length?`Add ${plural(sel.length,'Photo')} to ${esc(venue?venue.name:'a place')}${venue?' Chapter':''}`:'Add photos'}</button>
        <p class="center hand mt12" style="color:var(--ink)">Memory will be stamped in your ${esc(APP.name)} Shelf</p>
      </div>`;
      const keep=fn=>{ const s=el.scrollTop; fn(); el.scrollTop=s; };
      el.querySelector('#apPick')?.addEventListener('click', ()=>input.click());
      el.querySelector('label.add-photo')?.addEventListener('click', e=>{ e.preventDefault(); input.click(); });
      el.querySelectorAll('[data-toggle]').forEach(t=>t.addEventListener('click', e=>{ if (e.target.closest('input')) return; const k=+t.dataset.toggle; picked[k].on=!picked[k].on; keep(paint); }));
      el.querySelectorAll('[data-cap]').forEach(c=>c.oninput=()=>{ picked[+c.dataset.cap].caption=c.value; });
      const aq=el.querySelector('#apQ'); if (aq) aq.oninput=()=>{ q=aq.value; const pos=aq.selectionStart; keep(paint); const n=el.querySelector('#apQ'); n.focus(); n.setSelectionRange(pos,pos); };
      el.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ venue=S.venue(b.dataset.v); q=''; keep(paint); });
      const ch=el.querySelector('#apChange'); if (ch) ch.onclick=()=>{ venue=null; keep(paint); };
      el.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{ kind=b.dataset.kind; keep(paint); });
      const sh=el.querySelector('#apShare'); if (sh) bindToggle(sh, on=>{ priv=!on; });
      const go2=async()=>{
        const list=picked.filter(p=>p.on);
        if (!list.length || !venue) return;
        if (list.length > room) return toast(`Your photo roll only has room for ${room} more`);
        el.querySelector('#apGo').disabled=true;
        const e=S.addEntry({venueId:venue.id, kind, rating:0, date:todayISO(), notes:'', private:priv});
        await S.addPhotos(list.map(p=>({blob:p.blob, caption:p.caption.trim(), venueId:venue.id, entryId:e.id, date:e.date, private:priv})));
        picked.forEach(p=>URL.revokeObjectURL(p.url));
        back(); go.refresh();
        toast(`${plural(list.length,'photo')} added to ${venue.name}`, 'Open book', ()=>{ const b=S.books().find(x=>x.kind==='personal'); openBook(b.id); });
      };
      el.querySelector('#apGo').onclick=go2; el.querySelector('#apNext').onclick=go2;
    };
    input.onchange=async()=>{
      const files=[...input.files].slice(0,24);
      for (const f of files){
        try{
          const blob=await compressImage(f, 1400, 0.8);
          const t=new Date(f.lastModified||Date.now());
          picked.push({blob, url:URL.createObjectURL(blob), caption:'', time:t.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}), on:true});
        }catch(_){ toast(`Couldn't read ${f.name}`); }
      }
      input.value=''; paint();
    };
    paint();
    setTimeout(()=>{ if (!picked.length) input.click(); }, 350);
  });
}
go.addPhotos = addPhotos;
