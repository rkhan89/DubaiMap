// Crew leaderboard and monthly goals (Phase 2, own design).
import * as S from './store.js';
import * as MAP from './map.js';
import { userStats, leaderboard, thisMonth, POINTS } from './stats.js';
import { catById, esc, plural, fmtMonth, monthKey } from './data.js';
import { avatarHTML } from './avatar.js';
import { icon, openScreen, topbar, seg, bindSeg, toast } from './ui.js';
import { go } from './go.js';

/* =========================================================
   LEADERBOARD
   ========================================================= */
function leaderboardScreen(){
  let period = 'month';
  openScreen(el=>{
    const paint = ()=>{
      const me = S.me(), crew = S.myCrew();
      const rows = leaderboard(period==='month' ? thisMonth() : null);
      const podium = rows.slice(0,3), rest = rows.slice(3);
      const order = [podium[1], podium[0], podium[2]].filter(Boolean);
      el.innerHTML = topbar({title:'Leaderboard', eyebrow: crew ? crew.name : 'Your crew'}) + `<div class="screen-body">
        ${seg('period', [['month', fmtMonth(thisMonth()).split(' ')[0]], ['all','All time']], period).replace('class="seg"','class="seg mt16"')}
        ${rows.length < 2 ? `<div class="empty">${icon('groups')}<h3 class="h-md">It's just you so far</h3><p class="muted">Invite friends to your crew and see who really knows the city.</p><button class="btn btn-gold" id="lbInvite">${icon('person_add')}Invite friends</button></div>` : `
        <div class="podium mt20">${order.map(r=>{ const place = rows.indexOf(r)+1; return `
          <button class="pod pod-${place}" data-user="${r.u.id}">${avatarHTML(r.u, place===1?72:58)}
            <b class="trunc">${r.u.id===me.id?'You':esc(r.u.name||r.u.handle)}</b><span class="mono small">${r.s.points} pts</span>
            <span class="pod-step"><em>${place}</em></span></button>`; }).join('')}</div>
        <div class="stack mt16">${rows.map((r,i)=>`<button class="person-row lb-row${r.u.id===me.id?' is-me':''}" data-user="${r.u.id}"><span class="lb-rank">${i+1}</span>${avatarHTML(r.u, 40)}
          <span class="pr-main"><span class="pr-name">${r.u.id===me.id?'You':esc(r.u.name||r.u.handle)}</span><span class="pr-sub">${plural(r.s.places,'place')} • ${plural(r.s.areaCount,'area')}${r.s.photos?` • ${plural(r.s.photos,'photo')}`:''}</span></span>
          <b class="mono">${r.s.points}</b></button>`).join('')}</div>`}
        <div class="note mt20">${icon('info')}<span>Points: new place ${POINTS.newPlace}, repeat visit ${POINTS.repeat}, first in the crew +${POINTS.firstInCrew}, each photo +${POINTS.photo}, check-in +${POINTS.checkin}. Private logs only count toward your own score on your phone.</span></div>
      </div>`;
      bindSeg(el, 'period', v=>{ period = v; paint(); });
      el.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>go.profile(b.dataset.user));
      const inv = el.querySelector('#lbInvite'); if (inv) inv.onclick = ()=>go.crew();
    };
    paint();
  });
}
go.leaderboard = leaderboardScreen;

/* =========================================================
   GOALS (this month)
   ========================================================= */
const GOALS = [
  { id:'places',  name:'Try new places',             short:'New places', ic:'add_location_alt', def:4,  max:30 },
  { id:'kinds',   name:'Try new kinds of place',     short:'New kinds',  ic:'category',         def:2,  max:10 },
  { id:'areas',   name:'Explore new areas',          short:'New areas',  ic:'explore',          def:2,  max:20 },
  { id:'photos',  name:'Add photos',                 short:'Photos',     ic:'photo_camera',     def:8,  max:60 },
  { id:'wishlist',name:'Go to places you saved',     short:'Wishlist',   ic:'bookmark_added',   def:1,  max:10 },
];
const goalsKey = ()=>'bites-goals-'+(S.me()?.id||'');
function targets(){ let t={}; try{ t = JSON.parse(localStorage.getItem(goalsKey()))||{}; }catch(_){} return Object.fromEntries(GOALS.map(g=>[g.id, t[g.id]||g.def])); }
function setTarget(id, n){ const t = targets(); t[id] = n; try{ localStorage.setItem(goalsKey(), JSON.stringify(t)); }catch(_){} }

export function goalProgress(){
  const me = S.me(); if (!me) return [];
  const m = thisMonth(), s = userStats(me.id, m);
  // first time ever in a category / area, falling in this month
  const firstCat = new Map(), firstArea = new Map();
  S.entries({userId:me.id, kind:'visit'}).sort((a,b)=>a.createdAt-b.createdAt).forEach(e=>{
    const v = S.venue(e.venueId); if (!v) return;
    (v.categories||[]).forEach(c=>{ if (!firstCat.has(c)) firstCat.set(c, e); });
    if (!firstArea.has(v.zone)) firstArea.set(v.zone, e);
  });
  const inM = e => monthKey(e.date)===m;
  const have = { places:s.newPlaces, kinds:[...firstCat.values()].filter(inM).length, areas:[...firstArea.values()].filter(inM).length, photos:s.photos, wishlist:s.wantedThenVisited };
  const t = targets();
  return GOALS.map(g=>({ ...g, target:t[g.id], have:have[g.id], pct:Math.min(1, have[g.id]/t[g.id]), done:have[g.id]>=t[g.id] }));
}

function goalsScreen(){
  openScreen(el=>{
    const paint = ()=>{
      const list = goalProgress(), done = list.filter(g=>g.done).length;
      const daysLeft = (()=>{ const d=new Date(), end=new Date(d.getFullYear(), d.getMonth()+1, 0); return end.getDate()-d.getDate(); })();
      const wants = S.entries({userId:S.me().id, kind:'want'}).map(e=>S.venue(e.venueId)).filter(Boolean).slice(0,3);
      el.innerHTML = topbar({title:`${fmtMonth(thisMonth())} goals`, eyebrow:'This month'}) + `<div class="screen-body">
        <div class="passport mt16 row"><span class="tape"></span><span class="pp-icon">${icon('flag','',true)}</span>
          <div class="grow"><b class="h-sm">${done} of ${list.length} goals done</b><div class="muted small">${plural(daysLeft,'day')} left this month. Goals reset on the 1st.</div></div></div>
        <div class="stack mt16">${list.map(g=>`<div class="goal-card${g.done?' done':''}">
          <span class="ring big" style="--p:${Math.round(g.pct*100)}"><span>${g.done?icon('check','',true):icon(g.ic)}</span></span>
          <div class="grow"><b>${esc(g.name)}</b><div class="mono small muted">${Math.min(g.have,g.target)} of ${g.target}${g.done?' • done':''}</div>
            ${g.id==='wishlist' && !g.done && wants.length ? `<div class="chip-wrap mt8">${wants.map(v=>`<button class="tag soft" data-venue="${v.id}">${esc(v.name)}</button>`).join('')}</div>` : ''}</div>
          <div class="stepper-mini"><button data-g="${g.id}" data-d="-1" aria-label="Lower target">${icon('remove')}</button><button data-g="${g.id}" data-d="1" aria-label="Raise target">${icon('add')}</button></div>
        </div>`).join('')}</div>
        <p class="center muted small mt16">Set the targets that feel right. They're just for you.</p>
      </div>`;
      el.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{
        const g = GOALS.find(x=>x.id===b.dataset.g), t = targets()[g.id] + (+b.dataset.d);
        setTarget(g.id, Math.max(1, Math.min(g.max, t))); paint();
      });
      el.querySelectorAll('[data-venue]').forEach(b=>b.onclick=()=>go.place(b.dataset.venue));
    };
    paint();
    el._repaint = paint;
  });
}
go.goals = goalsScreen;
