// Crew challenges and your own monthly goals: each one simply done or not done, no counters.
import * as S from './store.js';
import * as P from './pages.js';
import { userStats, thisMonth } from './stats.js';
import { esc, plural, fmtMonth, monthKey } from './data.js';
import { avatarStack } from './avatar.js';
import { icon, openScreen, topbar } from './ui.js';
import { go } from './go.js';

export function crewChallengeList(){ const crew = S.myCrew(); return crew ? P.crewChallenges(crew, thisMonth(), S.pagesWorld()) : []; }

/* =========================================================
   GOALS (this month): fixed and the same for everyone
   ========================================================= */
const GOALS = [
  { id:'places',  name:'Try 4 new places',            short:'New places', ic:'add_location_alt', need:4 },
  { id:'kinds',   name:'Try 2 new kinds of place',    short:'New kinds',  ic:'category',         need:2 },
  { id:'areas',   name:'Explore 2 new areas',         short:'New areas',  ic:'explore',          need:2 },
  { id:'photos',  name:'Add 8 photos',                short:'Photos',     ic:'photo_camera',     need:8 },
  { id:'wishlist',name:'Go to a place you saved',     short:'Wishlist',   ic:'bookmark_added',   need:1 },
];
// goals used to have targets you could change, kept on the phone: those are gone
try{ Object.keys(localStorage).filter(k=>k.startsWith('bites-goals-')).forEach(k=>localStorage.removeItem(k)); }catch(_){}

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
  return GOALS.map(g=>({ id:g.id, name:g.name, short:g.short, ic:g.ic, done:have[g.id]>=g.need }));
}

const tick = done => `<span class="goal-tick${done?' done':''}">${icon(done?'check':'radio_button_unchecked','',done)}</span>`;
function goalsScreen(){
  openScreen(el=>{
    const paint = ()=>{
      const crew = S.myCrew(), month = thisMonth();
      const challenges = crewChallengeList(), list = goalProgress();
      const daysLeft = (()=>{ const d=new Date(), end=new Date(d.getFullYear(), d.getMonth()+1, 0); return end.getDate()-d.getDate(); })();
      const wants = S.entries({userId:S.me().id, kind:'want'}).map(e=>S.venue(e.venueId)).filter(Boolean).slice(0,3);
      el.innerHTML = topbar({title:'Crew challenges', eyebrow:fmtMonth(month)}) + `<div class="screen-body">
        ${crew ? `<div class="passport mt16 row"><span class="tape"></span><span class="pp-icon">${icon('flag','',true)}</span>
          <div class="grow"><b class="h-sm">${esc(crew.name)}, this month</b><div class="muted small">${plural(daysLeft,'day')} left. New challenges on the 1st.</div></div></div>
        <div class="stack mt16">${challenges.map(c=>`<div class="goal-card challenge${c.done?' done':''}">
          ${tick(c.done)}
          <div class="grow" style="min-width:0"><b>${esc(c.name)}</b><div class="mono small muted">${c.done?'Done':'Not done yet'}</div>
            ${c.hint && !c.done ? `<div class="hand small">${esc(c.hint)}</div>` : ''}
            ${c.who.length ? `<div class="row mt8" style="gap:6px">${avatarStack(c.who.map(S.user).filter(Boolean), 26, 5)}<span class="muted small">chipped in</span></div>` : ''}</div>
        </div>`).join('')}</div>
        <p class="center muted small mt12">Everyone in ${esc(crew.name)} sees the same challenges. Visits shared with the crew count.</p>`
        : `<div class="empty mt16">${icon('groups')}<h3 class="h-md">Challenges are for crews</h3><p class="muted">Start or join a crew and you'll get three challenges to do together each month.</p><button class="btn btn-gold" id="gcCrew">${icon('group_add')}Start a crew</button></div>`}
        <div class="row between mt32"><span class="h-md">Just me</span></div>
        <div class="stack mt12">${list.map(g=>`<div class="goal-card${g.done?' done':''}">
          ${tick(g.done)}
          <div class="grow"><b>${esc(g.name)}</b><div class="mono small muted">${g.done?'Done':'Not done yet'}</div>
            ${g.id==='wishlist' && !g.done && wants.length ? `<div class="chip-wrap mt8">${wants.map(v=>`<button class="tag soft" data-venue="${v.id}">${esc(v.name)}</button>`).join('')}</div>` : ''}</div>
        </div>`).join('')}</div>
        <p class="center muted small mt16">Only you see these.</p>
      </div>`;
      el.querySelectorAll('[data-venue]').forEach(b=>b.onclick=()=>go.place(b.dataset.venue));
      const gc = el.querySelector('#gcCrew'); if (gc) gc.onclick = ()=>go.crew();
    };
    paint();
    el._repaint = paint;
  });
}
go.goals = goalsScreen;
