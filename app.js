// App shell: map (Me / Crew modes, stamps, peek card), list feed, filters, profile, nav.
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import { CATEGORIES, catById, iconSvg, esc, fmtRating, ago, agoLong, plural } from './data.js';
import { avatarHTML, avatarStack, spriteSvg, DEFAULT_AVATAR } from './avatar.js';
import { $, $$, icon, toast, openSheet, back, stampHTML, catChip, seg, bindSeg, toggleHTML, bindToggle, ratingPill } from './ui.js';
import { go, state } from './go.js';
import './onboarding.js';
import './crew.js';
import './place.js';
import './book.js';

const scopeKey = 'bites-scope';
state.scope = (()=>{ const s=M.defaultScope(); try{ const p=JSON.parse(localStorage.getItem(scopeKey)); if (p && p.mode) s.mode=p.mode; }catch(_){} return s; })();
const scope = ()=> state.scope;
function saveScope(){ try{ localStorage.setItem(scopeKey, JSON.stringify({mode:scope().mode})); }catch(_){} }

/* =========================================================
   BRAND
   ========================================================= */
function applyBrand(){
  document.title = APP.name;
  $('#brandName').textContent = APP.name;
  $('#brandTag').textContent = APP.tagline;
}
function paintProfileButtons(){
  const me=S.me();
  $$('.profile-btn').forEach(b=>{ b.innerHTML = me ? avatarHTML(me, 44) : icon('person'); });
}
document.addEventListener('click', e=>{
  const b=e.target.closest('[data-act="profile"]'); if (b){ e.preventDefault(); openProfile(); }
  const bk=e.target.closest('[data-act="back"]'); if (bk){ e.preventDefault(); back(); }
});

/* =========================================================
   MAP: stamps + overlays
   ========================================================= */
const PRIO = { crew:5, visited:4, private:3.5, want:3, unlit:0 };
let modelCache = [];
function stampItems(){
  modelCache = M.mapModel(scope());
  return modelCache.map(sum=>({ id:sum.v.id, w:MAP.placeWorld(sum.v), prio:PRIO[sum.state] + (sum.rating||0)/10 + sum.visitorIds.length/100, faint:sum.state==='unlit', data:sum }));
}
function renderStamp(cl){
  if (cl.items.length>1){
    const cats=[...new Set(cl.items.flatMap(i=>i.data.v.categories||[]))];
    return stampHTML('cluster', {count:cl.items.length, cats});
  }
  const sum=cl.items[0].data, v=sum.v, st=sum.state;
  const others = sum.visitorIds.map(S.user).filter(Boolean);
  const html = stampHTML(st, {
    cat:M.primaryCat(v),
    visits: st==='visited' ? (sum.myVisitCount||sum.visitCount) : 0,
    rating: st==='crew' ? sum.rating : (sum.myRating||sum.rating),
    avatars: st==='crew' ? avatarStack(others, 20, 2) : '',
  });
  // close-up callout card
  let line='', foot='';
  if (st==='unlit'){ line = catById(M.primaryCat(v))?.label || ''; foot = 'Undiscovered'; }
  else if (st==='want'){
    const w = sum.wantIds.map(S.user).filter(Boolean);
    line = w.length ? `${w[0].id===S.me()?.id?'You':w[0].name} saved this` : 'Want to try';
    foot = `<span class="tag">To try</span>`;
  } else {
    line = sum.noteEntry ? sum.noteEntry.notes : (catById(M.primaryCat(v))?.label||'');
    foot = st==='crew' ? `${avatarStack(others,18,3)}${sum.visitorIds.length} in crew` : `${sum.myVisitCount>1?`Visited ${sum.myVisitCount}x`:'Visited'}${st==='private'?' • only me':''}`;
    if (sum.rating) foot += `<span style="margin-left:auto">★ ${fmtRating(sum.rating)}</span>`;
  }
  const card = `<div class="stamp-card"><span class="tape"></span><div class="sc-name">${esc(v.name)}</div><div class="sc-line">${esc(line)}</div><div class="sc-foot">${foot}</div></div>`;
  return card + html;
}
function rebuild(){
  if (!S.me()) return;
  const sc=scope();
  const crew=S.myCrew(), members=S.crewMembers();
  // stamps
  MAP.setStamps(stampItems());
  const counts={}; modelCache.forEach(s=>{ if (s.state!=='unlit') counts[s.v.zone]=(counts[s.v.zone]||0)+1; });
  MAP.setAreaCounts(counts);
  // mode toggle
  $('#mapMode').innerHTML = `<button data-v="me" class="${sc.mode==='me'?'on':''}">${icon('person')}Me</button><button data-v="crew" class="${sc.mode==='crew'?'on':''}">${icon('group')}Crew${crew&&members.length>1?' <i class="live"></i>':''}</button>`;
  // member chips (crew mode)
  const row=$('#memberRow');
  if (sc.mode==='crew' && members.length>1){
    const total = modelCache.filter(s=>s.state!=='unlit').length;
    row.innerHTML = `<button class="person-chip${!sc.members?' on':''}" data-m="all"><span class="ms" style="font-size:18px">done_all</span>All <em>${total}</em></button>` +
      members.map(u=>`<button class="person-chip${sc.members&&sc.members.has(u.id)?' on':''}" data-m="${u.id}">${avatarHTML(u,30)}${esc(u.id===S.me().id?'You':u.name||u.handle)}</button>`).join('');
    row.hidden=false;
  } else { row.innerHTML=''; row.hidden=true; }
  // me-mode status line
  if (sc.mode==='me'){
    const mine = modelCache.filter(s=>s.state!=='unlit');
    const priv = mine.filter(s=>s.hasPrivate).length;
    $('#meNoteLine').innerHTML = `Showing your <b>&nbsp;${mine.length}&nbsp;</b> ${mine.length===1?'place':'places'}${priv?` (including ${priv} private ${icon('lock','',true).replace('class="ms"','class="ms" style="font-size:13px"')})`:''}`;
  } else $('#meNoteLine').innerHTML='';
  // ticker
  paintTicker();
  // crew bar
  const cb=$('#crewBar');
  if (crew){ cb.innerHTML = `${icon('groups')}<b>Crew: ${esc(crew.name)}</b><i></i><span>${members.length} ${members.length===1?'member':'active'}</span>`; }
  else cb.innerHTML = `${icon('group_add')}<b>Crew of one</b><i></i><span>invite friends</span>`;
  cb.hidden = false;
  // filter dot
  const filtered = isFiltered();
  $('#btnFilter').classList.toggle('filtered', filtered);
  if (state.view==='list') renderList();
  paintProfileButtons();
}
function isFiltered(){ const sc=scope(); return !!(sc.cats || sc.members || sc.privacy!=='all' || !sc.status.been || !sc.status.want); }
let rebuildT=null;
function scheduleRebuild(){ clearTimeout(rebuildT); rebuildT=setTimeout(rebuild, 40); }
go.refresh = scheduleRebuild;

$('#mapMode').addEventListener('click', e=>{
  const b=e.target.closest('button'); if (!b) return;
  scope().mode=b.dataset.v; scope().members=null; saveScope(); hidePeek(); rebuild();
});
$('#memberRow').addEventListener('click', e=>{
  const b=e.target.closest('[data-m]'); if (!b) return;
  const sc=scope(), id=b.dataset.m;
  if (id==='all') sc.members=null;
  else {
    sc.members = sc.members ? new Set(sc.members) : new Set();
    sc.members.has(id) ? sc.members.delete(id) : sc.members.add(id);
    if (!sc.members.size) sc.members=null;
  }
  rebuild();
});
$('#crewBar').addEventListener('click', ()=>go.crew());

/* ---------- ticker: latest crew activity ---------- */
let tickIdx=0, tickTimer=null;
function paintTicker(){
  const t=$('#ticker');
  if (scope().mode!=='crew' || S.crewMembers().length<2){ t.hidden=true; clearInterval(tickTimer); return; }
  const acts = M.activity(8).filter(a=>a.u.id!==S.me().id);
  if (!acts.length){ t.hidden=true; return; }
  const show=()=>{
    const a=acts[tickIdx%acts.length];
    const verb = a.e.kind==='want' ? 'saved' : 'pinned';
    const z=MAP.zoneById(a.v.zone);
    t.innerHTML = `<span class="tape"></span><span class="tk-text"><b>${esc(a.u.name||a.u.handle)}</b> ${verb} <span class="hl">${esc(a.v.name)}</span>${z?` in ${esc(z.label)}`:''}</span><span class="tk-ago">${ago(a.e.createdAt)}</span>${icon('chevron_right')}`;
    t.onclick=()=>go.place(a.v.id);
  };
  show(); t.hidden=false;
  clearInterval(tickTimer); tickTimer=setInterval(()=>{ tickIdx++; show(); }, 5000);
}

/* ---------- peek card ---------- */
let peekId=null;
function showPeek(venueId){
  const v=S.venue(venueId); if (!v) return;
  const sum=M.venueSummary(v, {...scope(), members:null});
  peekId=venueId;
  const z=MAP.zoneById(v.zone);
  const latest = sum.latest && S.user(sum.latest.userId);
  let tag='', by='';
  if (sum.state==='crew') tag = sum.rating>=4.5 ? '<span class="tag green">Crew favourite</span>' : `<span class="tag green">${sum.visitorIds.length} in crew</span>`;
  else if (sum.state==='visited') tag = `<span class="tag">Visited${sum.myVisitCount>1?` ${sum.myVisitCount}x`:''}</span>`;
  else if (sum.state==='private') tag = `<span class="tag dark">${icon('lock','',true)}Only me</span>`;
  else if (sum.state==='want') tag = '<span class="tag">To try</span>';
  else tag = '<span class="tag soft">Undiscovered</span>';
  if (latest) by = `<span class="hand" style="font-size:19px">${sum.latest.kind==='want'?'Saved':'Added'} by ${esc(latest.id===S.me().id?'you':latest.name||latest.handle)} ${agoLong(sum.latest.createdAt)}</span>`;
  const q = sum.noteEntry;
  const qu = q && S.user(q.userId);
  const photos = S.photos({venueId});
  $('#peek').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="peek-top">${tag}${by}</div>
    ${sum.rating?`<div class="peek-score">${fmtRating(sum.rating)}<span class="ms" style="font-size:16px">star</span></div>`:''}
    <h2 style="padding-right:${sum.rating?'64px':'0'}">${esc(v.name)}</h2>
    <div class="addr">${icon('location_on')}${esc(z?z.label:APP.city)}${(v.categories||[]).length?` • ${esc(catById(v.categories[0])?.label||'')}`:''}</div>
    ${q?`<div class="peek-quote">${avatarHTML(qu,34)}<q>${esc(q.notes)}</q>${photos.length?`<button class="btn btn-soft btn-sm" data-pk="view">View (${photos.length})</button>`:''}</div>`
       : (photos.length?`<div class="peek-quote"><span class="grow muted">${plural(photos.length,'photo')} from the crew</span><button class="btn btn-soft btn-sm" data-pk="view">View</button></div>`:'')}
    <div class="peek-btns">
      <button class="btn btn-soft" data-pk="open">${icon('menu_book')}Details</button>
      <button class="btn btn-gold" data-pk="log">${icon('add_a_photo')}Add Bite</button>
    </div>`;
  const p=$('#peek'); p.hidden=false; requestAnimationFrame(()=>p.classList.add('in'));
}
function hidePeek(){ const p=$('#peek'); if (p.hidden) return; p.classList.remove('in'); peekId=null; setTimeout(()=>{ if (!p.classList.contains('in')) p.hidden=true; }, 280); }
$('#peek').addEventListener('click', e=>{
  const b=e.target.closest('[data-pk]');
  const id=peekId;
  if (!b){ if (e.target.closest('h2, .addr, .peek-top')) go.place(id); return; }
  if (b.dataset.pk==='open') go.place(id);
  if (b.dataset.pk==='log') go.log({venueId:id});
  if (b.dataset.pk==='view'){ const ps=S.photos({venueId:id}); if (ps.length) go.viewer(ps.map(p=>p.id), 0); }
});
// swipe the peek up for the full place sheet, down to dismiss
(function(){
  const p=$('#peek'); let y0=null;
  p.addEventListener('pointerdown', e=>{ if (e.target.closest('button')) return; y0=e.clientY; });
  p.addEventListener('pointerup', e=>{ if (y0===null) return; const dy=e.clientY-y0; y0=null; if (dy<-40 && peekId) go.place(peekId); else if (dy>50) hidePeek(); });
})();

/* ---------- cluster list ---------- */
function openClusterList(items){
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">${items.length} spots here</h2><span class="hand">zoom in to split them up</span></div></div>
      <div class="stack">${items.map(i=>venueRowHTML(i.data)).join('')}</div>`;
    body.querySelectorAll('[data-venue]').forEach(r=>r.addEventListener('click', ()=>{ back(); setTimeout(()=>go.place(r.dataset.venue), 60); }));
  });
}
function venueRowHTML(sum){
  const v=sum.v, z=MAP.zoneById(v.zone);
  return `<button class="person-row" data-venue="${v.id}" style="text-align:left;width:100%">
    ${stampHTML(sum.state==='cluster'?'visited':sum.state, {cat:M.primaryCat(v), rating:0})}
    <span class="pr-main"><span class="pr-name trunc">${esc(v.name)}</span><span class="pr-sub">${esc(z?z.label:'')}${sum.visitorIds.length?` • ${plural(sum.visitorIds.length,'visitor')}`:''}</span></span>
    ${sum.rating?ratingPill(sum.rating):''}
  </button>`;
}
go.venueRowHTML = venueRowHTML;

/* ---------- area sheet (tap "Business Bay 3") ---------- */
function openArea(zoneId){
  const z=MAP.zoneById(zoneId); if (!z) return;
  const inZone = S.venues().filter(v=>v.zone===zoneId).map(v=>M.venueSummary(v, scope()));
  const lit = inZone.filter(s=>s.state!=='unlit' && M.passes(s, scope())).sort((a,b)=>PRIO[b.state]-PRIO[a.state] || b.rating-a.rating);
  const unlit = inZone.filter(s=>s.state==='unlit');
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">${scope().mode==='me'?'Your':'Crew'} places in</span><h2 class="h-lg">${esc(z.label)}</h2><span class="hand">${plural(lit.length,'spot')} stamped${unlit.length?`, ${unlit.length} undiscovered`:''}</span></div></div>
      <div class="stack">${lit.map(venueRowHTML).join('') || '<div class="empty"><span class="hand">Nothing stamped here yet</span></div>'}</div>
      ${unlit.length?`<div class="eyebrow mt24">Undiscovered nearby</div><div class="stack mt12">${unlit.slice(0,30).map(venueRowHTML).join('')}</div>`:''}
      <div class="sheet-foot btn-grid"><button class="btn btn-soft" id="aShow">${icon('map')}Show on map</button><button class="btn btn-gold" id="aAdd">${icon('add')}Log here</button></div>`;
    body.querySelectorAll('[data-venue]').forEach(r=>r.addEventListener('click', ()=>{ back(); setTimeout(()=>go.place(r.dataset.venue), 60); }));
    body.querySelector('#aShow').onclick=()=>{ back(); switchView('map'); const pts=lit.map(s=>MAP.placeWorld(s.v)); pts.length?MAP.fitPoints(pts,true):MAP.flyToWorld(MAP.placeWorld({id:'z',zone:zoneId})); };
    body.querySelector('#aAdd').onclick=()=>{ back(); go.log({zone:zoneId}); };
  });
}
go.area = openArea;

/* =========================================================
   FILTER SHEET (Me/Crew, members, categories, status, privacy)
   ========================================================= */
function openFilters(){
  const sc=scope();
  const draft = { mode:sc.mode, members:sc.members?new Set(sc.members):null, cats:sc.cats?new Set(sc.cats):null, privacy:sc.privacy, status:{...sc.status} };
  const members=S.crewMembers();
  openSheet((body)=>{
    const paint=()=>{
      const n = M.mapModel({...draft}).filter(s=>s.state!=='unlit').length;
      body.innerHTML = `
      <div class="sheet-head"><span class="round-btn" style="width:44px;height:44px;box-shadow:none;background:var(--gold-fixed)">${icon('filter_list')}</span>
        <div class="grow"><h2 class="h-md">Filter Scrapbook</h2><span class="hand">refine street discoveries</span></div>
        <button class="btn btn-ghost btn-sm" data-f="clear">Clear all</button></div>
      <div class="eyebrow">1. View mode</div>
      <div class="seg seg-white mt8" data-f="mode"><button data-v="me" class="${draft.mode==='me'?'on':''}">${icon('person')}Me Mode</button><button data-v="crew" class="${draft.mode==='crew'?'on':''}">${icon('groups')}Crew View</button></div>
      ${members.length>1?`<div class="row between mt24"><span class="eyebrow">2. Members</span><span class="hand">${members.length-1} friends in ${esc(APP.city)}</span></div>
      <div class="chip-scroll mt8" data-f="members"><button class="person-chip${!draft.members?' on':''}" data-m="all">${icon('done_all')}Select all</button>${members.map(u=>`<button class="person-chip${draft.members&&draft.members.has(u.id)?' on':''}" data-m="${u.id}">${avatarHTML(u,30)}${esc(u.id===S.me().id?'You':u.name||u.handle)}</button>`).join('')}</div>`:''}
      <div class="eyebrow mt24">${members.length>1?3:2}. Categories</div>
      <div class="chip-wrap mt12" data-f="cats">${CATEGORIES.map(c=>catChip(c.id, !draft.cats || draft.cats.has(c.id))).join('')}</div>
      <div class="eyebrow mt24">${members.length>1?4:3}. Visit status</div>
      <div class="btn-grid mt12" data-f="status">
        <button class="radio-card${draft.status.been?' on':''}" data-s="been"><span class="rc-head">${icon('verified')}Been here<span class="grow"></span>${draft.status.been?icon('check_box','',true):icon('check_box_outline_blank')}</span><p style="margin-left:0">★★★★☆ <span class="hand">rated</span></p></button>
        <button class="radio-card${draft.status.want?' on':''}" data-s="want"><span class="rc-head">${icon('bookmark')}Want to try<span class="grow"></span>${draft.status.want?icon('check_box','',true):icon('check_box_outline_blank')}</span><p style="margin-left:0"><span class="tag">To try ribbon</span></p></button>
      </div>
      <div class="eyebrow mt24">${members.length>1?5:4}. Privacy scope</div>
      <div class="opt-grid mt12" style="grid-template-columns:1fr 1fr 1fr" data-f="privacy">
        ${[['shared','Shared only','public'],['private','Private only','lock'],['all','All places','layers']].map(([v,l,ic])=>`<button class="opt-card${draft.privacy===v?' on':''}" data-p="${v}" style="flex-direction:column;justify-content:center;gap:6px;padding:12px 6px;font-family:var(--f-mono);font-size:12px;text-align:center">${icon(ic)}${l}</button>`).join('')}
      </div>
      <div class="sheet-foot"><button class="btn btn-gold btn-block" data-f="apply">${icon('check_circle')}Apply filters (${plural(n,'place')})</button></div>`;
    };
    paint();
    body.addEventListener('click', e=>{
      const t=e.target.closest('button'); if (!t) return;
      const f=t.closest('[data-f]')?.dataset.f || t.dataset.f;
      if (f==='clear'){ draft.members=null; draft.cats=null; draft.privacy='all'; draft.status={been:true,want:true}; }
      else if (f==='mode' && t.dataset.v){ draft.mode=t.dataset.v; }
      else if (f==='members'){ const id=t.dataset.m; if (id==='all') draft.members=null; else { draft.members=draft.members?new Set(draft.members):new Set(); draft.members.has(id)?draft.members.delete(id):draft.members.add(id); if (!draft.members.size) draft.members=null; } }
      else if (f==='cats' && t.dataset.cat){ const id=t.dataset.cat; const s=draft.cats?new Set(draft.cats):new Set(CATEGORIES.map(c=>c.id)); s.has(id)?s.delete(id):s.add(id); draft.cats = s.size===CATEGORIES.length?null:s; }
      else if (f==='status' && t.dataset.s){ draft.status[t.dataset.s]=!draft.status[t.dataset.s]; if (!draft.status.been && !draft.status.want) draft.status[t.dataset.s==='been'?'want':'been']=true; }
      else if (f==='privacy' && t.dataset.p){ draft.privacy=t.dataset.p; }
      else if (f==='apply'){ Object.assign(scope(), draft); saveScope(); back(); rebuild(); return; }
      else return;
      const st=body.scrollTop; paint(); body.scrollTop=st;
    });
  });
}
$('#btnFilter').addEventListener('click', openFilters);
go.filters = openFilters;

/* =========================================================
   LIST VIEW (feed)
   ========================================================= */
let listQuery='', listSort='recent', listCat=null;
function renderList(){
  const el=$('#listView'); const sc=scope(); const crew=S.myCrew();
  const meCount = M.mapModel({...sc, mode:'me', members:null}).filter(s=>s.state!=='unlit').length;
  const crewCount = M.mapModel({...sc, mode:'crew'}).filter(s=>s.state!=='unlit').length;
  let items = modelCache.filter(s=>s.state!=='unlit');
  const byCat={}; items.forEach(s=>(s.v.categories||[]).forEach(c=>byCat[c]=(byCat[c]||0)+1));
  if (listCat) items = items.filter(s=>(s.v.categories||[]).includes(listCat));
  const q=listQuery.trim().toLowerCase();
  if (q) items = items.filter(s=>{ const z=MAP.zoneById(s.v.zone); return [s.v.name, z?z.label:'', ...s.entries.map(e=>e.notes||'')].join(' ').toLowerCase().includes(q); });
  const lastTs = s=>Math.max(0,...s.entries.map(e=>e.createdAt));
  if (listSort==='rating') items.sort((a,b)=>b.rating-a.rating);
  else if (listSort==='name') items.sort((a,b)=>a.v.name.localeCompare(b.v.name));
  else if (listSort==='visits') items.sort((a,b)=>b.visitCount-a.visitCount);
  else items.sort((a,b)=>lastTs(b)-lastTs(a));
  const cats = Object.keys(byCat).sort((a,b)=>byCat[b]-byCat[a]);
  const hidden = sc.mode==='crew' ? 0 : M.mapModel({...sc, privacy:'all', cats:null, status:{been:true,want:true}}).filter(s=>s.state!=='unlit').length - meCount;
  const unlitCount = modelCache.filter(s=>s.state==='unlit').length;
  el.innerHTML = `<div class="list-inner">
    <div class="search-row"><label class="search">${icon('search')}<input id="lq" type="search" placeholder="Search ${items.length} spots…" value="${esc(listQuery)}" aria-label="Search"></label>
      <button class="sq-btn${isFiltered()?' filtered':''}" id="lFilter" aria-label="Filters">${icon('tune')}</button></div>
    <div class="seg mt12" id="lMode"><button data-v="me" class="${sc.mode==='me'?'on':''}">Me <em>${meCount}</em></button><button data-v="crew" class="${sc.mode==='crew'?'on':''}">Crew <em>${crewCount}</em></button></div>
    <div class="chip-scroll mt12" id="lCats">
      <button class="person-chip${!listCat?' on':''}" data-c="" style="padding-left:16px">All <em>${modelCache.filter(s=>s.state!=='unlit').length}</em></button>
      ${cats.map(c=>`<button class="person-chip${listCat===c?' on':''}" data-c="${c}" style="padding-left:8px"><span style="width:26px;height:26px;display:flex">${iconSvg(c, catById(c).color)}</span>${esc(catById(c).label)} <em>${byCat[c]}</em></button>`).join('')}
    </div>
    <div class="feed-head"><span class="hand">${sc.mode==='crew' && crew ? `${esc(crew.name)} shared feed` : 'Your scrapbook'}</span>
      <select class="sort-sel" id="lSort" aria-label="Sort">${[['recent','Recent visits'],['rating','Top rated'],['visits','Most visited'],['name','A–Z']].map(([v,l])=>`<option value="${v}"${listSort===v?' selected':''}>${l}</option>`).join('')}</select></div>
    ${items.map(feedCardHTML).join('') || `<div class="empty">${stampHTML('unlit',{cat:'coffee', big:true})}<h3 class="h-md">${q?'Nothing matches that':'No stamps yet'}</h3><p class="muted">${q?'Try another name, area or dish.':'Log your first bite with the + button, or tap an undiscovered spot on the map.'}</p></div>`}
    ${items.length?`<div class="feed-end"><span class="tag soft">${icon('local_activity')}End of scrapbook page</span><span class="hand">${hidden>0?`${plural(hidden,'more entry','more entries')} hidden by your filters`:`${unlitCount} undiscovered spots still on the map`}</span></div>`:''}
  </div>`;
  const lq=el.querySelector('#lq');
  lq.addEventListener('input', ()=>{ listQuery=lq.value; const pos=lq.selectionStart; renderList(); const n=$('#lq'); n.focus(); n.setSelectionRange(pos,pos); });
  el.querySelector('#lFilter').onclick=openFilters;
  el.querySelector('#lMode').addEventListener('click', e=>{ const b=e.target.closest('button'); if (!b) return; scope().mode=b.dataset.v; scope().members=null; saveScope(); rebuild(); });
  el.querySelector('#lCats').addEventListener('click', e=>{ const b=e.target.closest('[data-c]'); if (!b) return; listCat=b.dataset.c||null; renderList(); });
  el.querySelector('#lSort').onchange=e=>{ listSort=e.target.value; renderList(); };
  el.querySelectorAll('[data-venue]').forEach(c=>c.addEventListener('click', ()=>go.place(c.dataset.venue)));
}
function feedCardHTML(sum){
  const v=sum.v, cat=catById(M.primaryCat(v)), z=MAP.zoneById(v.zone);
  const ph = S.photos({venueId:v.id}).filter(p=>scope().mode==='crew' || p.userId===S.me().id)[0];
  const want = sum.state==='want';
  const priv = sum.state==='private' || (sum.hasPrivate && !sum.others.length);
  let quote='';
  if (sum.noteEntry){
    const u=S.user(sum.noteEntry.userId);
    quote = `<div class="fc-quote"><span class="hand">${u.id===S.me().id?'':esc(u.name||u.handle)+': '}“${esc(sum.noteEntry.notes)}”</span>${sum.visitorIds.length?avatarStack(sum.visitorIds.map(S.user).filter(Boolean),24,3):''}</div>`;
  } else if (want){
    const ws=sum.wantIds.map(S.user).filter(Boolean);
    const names = ws.map(u=>u.id===S.me().id?'you':u.name||u.handle);
    quote = `<div class="fc-quote">${icon('favorite')}<span class="grow">Saved by ${esc(names.slice(0,2).join(' & '))}${names.length>2?` +${names.length-2}`:''}</span>${avatarStack(ws,24,3)}</div>`;
  }
  return `<button class="feed-card${priv?' private':''}" data-venue="${v.id}">
    <span class="fc-thumb">${ph?`<img src="${esc(S.photoURL(ph))}" alt="" loading="lazy">`:iconSvg(cat.id, cat.color)}${priv?`<span class="fc-lock">${icon('lock','',true)}</span>`:(sum.rating?ratingPill(sum.rating):'')}</span>
    <span class="fc-main">
      <span class="fc-cat">${iconSvg(cat.id, cat.color)}${esc(cat.label)}${priv?` <span class="tag soft" style="margin-left:4px">${icon('lock')}Private</span>`:''}</span>
      <span class="fc-name trunc" style="display:block;padding-right:18px">${esc(v.name)}</span>
      <span class="fc-loc">${icon('location_on')}${esc(z?z.label:APP.city)}</span>
      ${quote}
    </span>
    ${want?'<span class="fc-ribbon">TO TRY</span>':`<span class="fc-chev">${icon('chevron_right')}</span>`}
  </button>`;
}

/* =========================================================
   NAV
   ========================================================= */
function switchView(v){
  state.view=v;
  $$('#nav [data-tab]').forEach(b=>b.classList.toggle('on', b.dataset.tab===v));
  $('#mapView').classList.toggle('active', v==='map');
  $('#listView').classList.toggle('active', v==='list');
  $('#listView').classList.toggle('list-view', true);
  if (v==='map'){ MAP.resize(); } else renderList();
  hidePeek();
}
go.switchView = switchView;
$('#nav').addEventListener('click', e=>{
  const b=e.target.closest('button'); if (!b) return;
  if (b.id==='navLog') return go.log({});
  const t=b.dataset.tab;
  if (t==='map'||t==='list') switchView(t);
  if (t==='crew') go.crew();
  if (t==='shelf') go.shelf();
});

/* map controls */
$('#zoomIn').onclick=()=>MAP.zoomBy(1.6);
$('#zoomOut').onclick=()=>MAP.zoomBy(1/1.6);
$('#btnFit').onclick=()=>{ const pts=modelCache.filter(s=>s.state!=='unlit').map(s=>MAP.placeWorld(s.v)); pts.length?MAP.fitPoints(pts,true):MAP.fitCity(true); };
$('#btnLocate').onclick=()=>MAP.startTracking(true);
$('#locPill').onclick=()=>{ const z=MAP.viewZone(); if (z) openArea(z.id); else MAP.startTracking(true); };
let locT=0;
function onViewChange(){
  const now=performance.now(); if (now-locT<250) return; locT=now;
  const z=MAP.viewZone(); $('#locPillText').textContent = z && MAP.zoomRatio()>1.6 ? z.label : APP.city;
}

/* =========================================================
   PROFILE (own design: settings are Phase 2)
   ========================================================= */
function openProfile(){
  const me=S.me(); if (!me) return;
  openSheet(body=>{
    const paint=()=>{
      const crew=S.myCrew();
      body.innerHTML = `
      <div class="row" style="gap:16px">${avatarHTML(me,72)}<div class="grow"><h2 class="h-lg">${esc(me.name||'@'+me.handle)}</h2><span class="mono muted">@${esc(me.handle)} • ${me.points||0} pts</span></div></div>
      ${APP.previewMode?`<div class="note mt16">${icon('science')}<span><b>Preview mode.</b> Your account, crew and photos live on this phone until sign-in goes live. Export a backup to move them.</span></div>`:''}
      <div class="stack mt20">
        <button class="person-row" data-p="avatar">${icon('face')}<span class="pr-main"><span class="pr-name">Edit avatar</span><span class="pr-sub">Pixel you on the map</span></span>${icon('chevron_right')}</button>
        <button class="person-row" data-p="handle">${icon('alternate_email')}<span class="pr-main"><span class="pr-name">Name & handle</span><span class="pr-sub">@${esc(me.handle)}</span></span>${icon('chevron_right')}</button>
        <button class="person-row" data-p="crew">${icon('groups')}<span class="pr-main"><span class="pr-name">${crew?esc(crew.name):'Your crew'}</span><span class="pr-sub">${crew?plural(crew.memberIds.length,'member'):'Start or join a crew'}</span></span>${icon('chevron_right')}</button>
        <div class="person-row">${icon('share')}<span class="pr-main"><span class="pr-name">Share new places with my crew</span><span class="pr-sub">Default for new logs. You can change any single place.</span></span>${toggleHTML('pShare', me.shareDefault!=='private','Share with crew by default')}</div>
        <div class="person-row">${icon('my_location')}<span class="pr-main"><span class="pr-name">Show me on the map</span><span class="pr-sub">Only on this phone, never saved</span></span>${toggleHTML('pLoc', MAP.isTracking(),'Show my location')}</div>
        ${APP.previewMode?`<div class="person-row">${icon('diversity_3')}<span class="pr-main"><span class="pr-name">Preview with a sample crew</span><span class="pr-sub">Adds Maya, Omar, Layla, Kabir & Noor with real-looking logs and photos</span></span>${toggleHTML('pDemo', S.demoOn(),'Sample crew')}</div>`:''}
        <button class="person-row" data-p="tour">${icon('tour')}<span class="pr-main"><span class="pr-name">Replay the map tour</span></span>${icon('chevron_right')}</button>
        ${S.legacyPlaces().length?`<button class="person-row" data-p="import">${icon('install_mobile')}<span class="pr-main"><span class="pr-name">Import from this phone</span><span class="pr-sub">${plural(S.legacyPlaces().length,'place')} from the old version</span></span>${icon('chevron_right')}</button>`:''}
        <button class="person-row" data-p="export">${icon('download')}<span class="pr-main"><span class="pr-name">Export backup</span><span class="pr-sub">Your logs and photos as one file</span></span>${icon('chevron_right')}</button>
        <label class="person-row" style="position:relative">${icon('upload')}<span class="pr-main"><span class="pr-name">Import backup</span></span>${icon('chevron_right')}<input type="file" accept="application/json,.json" id="pImport" style="position:absolute;inset:0;opacity:0"></label>
        <button class="btn btn-danger btn-block mt8" data-p="signout">${icon('logout')}Sign out</button>
      </div>`;
      bindToggle(body.querySelector('#pShare'), on=>{ S.updateMe({shareDefault:on?'crew':'private'}); toast(on?'New places will be shared with your crew':'New places will stay private'); });
      bindToggle(body.querySelector('#pLoc'), on=>{ on?MAP.startTracking(true):MAP.stopTracking(); });
      const d=body.querySelector('#pDemo'); if (d) bindToggle(d, async on=>{ await S.setDemo(on); toast(on?'Sample crew added':'Sample crew removed'); paint(); });
      body.querySelector('#pImport').addEventListener('change', async e=>{
        const f=e.target.files[0]; if (!f) return;
        try{ const n=await S.importBackup(JSON.parse(await f.text())); toast(`Imported ${plural(n,'log')}`); }catch(_){ toast("That file isn't a backup from this app"); }
      });
    };
    paint();
    body.addEventListener('click', async e=>{
      const b=e.target.closest('[data-p]'); if (!b) return;
      const p=b.dataset.p;
      if (p==='avatar'){ back(); setTimeout(()=>go.editAvatar(), 60); }
      if (p==='handle'){ back(); setTimeout(()=>go.editHandle(), 60); }
      if (p==='crew'){ back(); setTimeout(()=>go.crew(), 60); }
      if (p==='tour'){ back(); setTimeout(()=>go.coach(), 300); }
      if (p==='import'){ back(); setTimeout(()=>go.importPhone(), 60); }
      if (p==='export'){
        toast('Preparing backup…');
        const data=await S.exportBackup();
        const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${APP.name.replace(/\W+/g,'-').toLowerCase()}-backup.json`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      }
      if (p==='signout'){ S.signOut(); back(); setTimeout(()=>go.onboarding(), 300); }
    });
  });
}
go.profile = openProfile;

/* =========================================================
   COACH MARKS (3 steps after onboarding)
   ========================================================= */
function coach(){
  switchView('map');
  const steps = [
    { tag:'Venue diary pin', icon:'local_cafe', title:'Tap a stamp to see who visited', body:'Every postal stamp is a spot your crew discovered. Tap one to flip it open for tasting notes, photos and honest ratings.', target:()=>$('.stamp-anchor:not(.faint) .stamp') },
    { tag:'Me / Crew', icon:'group', title:'Flip between you and your crew', body:'Me shows your own scrapbook, private spots included. Crew shows everything your friends have shared.', target:()=>$('#mapMode') },
    { tag:'Log a bite', icon:'add_a_photo', title:'Stamp your first spot', body:'Tap + to log a place: rate it, add photos, and choose whether your crew can see it.', target:()=>$('#navLog') },
  ];
  let i=0;
  const wrap=document.createElement('div'); wrap.className='coach';
  const ring=document.createElement('div'); ring.className='coach-target';
  document.body.append(wrap, ring);
  const end=()=>{ wrap.remove(); ring.remove(); S.setFlag('coachDone'); };
  const paint=()=>{
    const s=steps[i];
    wrap.innerHTML = `<div class="coach-card"><span class="tape"></span>
      <div class="row between"><span class="tag rust">${icon(s.icon)}${s.tag}</span><span class="mono muted">0${i+1} / 0${steps.length}</span></div>
      <h2>${s.title}</h2><p class="muted" style="font-size:15px">${s.body}</p>
      <div class="coach-foot"><button class="link" data-c="skip">Skip quick tour</button><button class="btn btn-gold" data-c="next">${i<steps.length-1?`Next (${i+1}/${steps.length})`:'Let’s go'} ${icon('arrow_forward')}</button></div></div>
      <p class="coach-tip">✎ Tip: tap anywhere outside to jump straight in.</p>`;
    const t=s.target();
    if (t){ const r=t.getBoundingClientRect(); Object.assign(ring.style,{left:(r.left-6)+'px',top:(r.top-6)+'px',width:(r.width+12)+'px',height:(r.height+12)+'px',display:'block'}); }
    else ring.style.display='none';
  };
  wrap.addEventListener('click', e=>{
    const b=e.target.closest('[data-c]');
    if (!b){ if (!e.target.closest('.coach-card')) end(); return; }
    if (b.dataset.c==='skip') return end();
    i++; if (i>=steps.length) end(); else paint();
  });
  paint();
}
go.coach = coach;

/* =========================================================
   BOOT
   ========================================================= */
async function boot(){
  if (new URLSearchParams(location.search).has('still')) document.documentElement.classList.add('still');
  applyBrand();
  await S.init();
  S.onChange(what=>{ if (what==='quota') toast('Storage is full on this phone. Export a backup and remove some photos.'); scheduleRebuild(); paintProfileButtons(); });
  MAP.initMap({
    wrap:$('#mapWrap'), canvas:$('#mapCanvas'), overlay:$('#mapOverlay'),
    renderStamp,
    initialPoints:()=>modelCache.filter(s=>s.state!=='unlit').map(s=>MAP.placeWorld(s.v)),
    onStampTap:(item)=>showPeek(item.id),
    onClusterList:(items)=>openClusterList(items),
    onAreaTap:(z)=>openArea(z),
    onMeTap:()=>go.editAvatar(),
    onEmptyTap:()=>hidePeek(),
    onDragStart:()=>hidePeek(),
    onViewChange,
    onLocation:(st)=>{
      const b=$('#btnLocate');
      b.classList.toggle('busy', st==='busy'); b.classList.toggle('on', st==='on');
      if (st==='outside') toast("You're outside the map. Come back to Dubai!");
      if (st==='denied') toast('Location permission is off for this site.');
      if (st==='error') toast("Couldn't get your location.");
    },
  });
  MAP.whenReady(()=>{ $('#mapLoading').classList.add('done'); });
  paintMe();
  const join = new URLSearchParams(location.search).get('join');
  if (join){ state.pendingJoin = join.toUpperCase(); history.replaceState(null,'',location.pathname); }
  if (!S.isOnboarded()) go.onboarding();
  else {
    rebuild();
    if (state.pendingJoin) go.inviteLanding(state.pendingJoin);
    else if (!S.flag('coachDone')) MAP.whenReady(()=>setTimeout(coach, 500));
  }
}
function paintMe(){ const me=S.me(); if (me) MAP.setMeSprite(spriteSvg({...DEFAULT_AVATAR, ...(me.avatar&&me.avatar.pixel||{})}, 3)); }
go.paintMe = paintMe;
go.afterOnboarding = ()=>{
  paintMe(); rebuild();
  MAP.whenReady(()=>{ MAP.fitCity(false); const pts=modelCache.filter(s=>s.state!=='unlit').map(s=>MAP.placeWorld(s.v)); if (pts.length) MAP.fitPoints(pts,false); });
  if (state.pendingJoin){ const code=state.pendingJoin; state.pendingJoin=null; go.inviteLanding(code); }
  else if (!S.flag('coachDone')) MAP.whenReady(()=>setTimeout(coach, 600));
};
boot();
