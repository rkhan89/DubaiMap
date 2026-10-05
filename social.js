// Crew leaderboard and monthly goals (Phase 2, own design).
import * as S from './store.js';
import * as MAP from './map.js';
import * as P from './pages.js';
import { userStats, leaderboard, thisMonth, POINTS } from './stats.js';
import { catById, esc, plural, fmtMonth, monthKey } from './data.js';
import { avatarHTML, avatarStack } from './avatar.js';
import { icon, openScreen, topbar, seg, bindSeg, toast } from './ui.js';
import { go } from './go.js';

/* =========================================================
   LEADERBOARD: your crew, this month, in playful categories
   (counts only visits shared with the crew, so everyone sees the same board;
   points still exist and count quietly, they're just not the ranking any more)
   ========================================================= */
function leaderboardScreen(){
  openScreen(el=>{
    const paint = ()=>{
      const me = S.me(), crew = S.myCrew(), month = thisMonth();
      const members = crew ? S.crewMembers(crew) : [];
      const cats = crew ? P.leaderboardCategories(crew, month, S.pagesWorld()) : [];
      const who = id => { const u = S.user(id); return u ? (u.id===me.id ? 'You' : (u.name||u.handle)) : ''; };
      const unit = (c, n) => `${n} ${n===1 ? c.unit[0] : c.unit[1]}`;
      el.innerHTML = topbar({title:'Leaderboard', eyebrow: crew ? `${crew.name} • ${fmtMonth(month)}` : 'Your crew'}) + `<div class="screen-body">
        ${members.length < 2 ? `<div class="empty">${icon('groups')}<h3 class="h-md">It's just you so far</h3><p class="muted">Invite friends to your crew and see who's the dessert champion this month.</p><button class="btn btn-gold" id="lbInvite">${icon('person_add')}Invite friends</button></div>` : `
        <div class="lb-cats mt16">${cats.map(c=>`<div class="lb-cat paper${c.winner?'':' lb-none'}"><span class="tape"></span>
          <div class="row" style="gap:10px"><span class="lb-ic">${icon(c.ic,'',true)}</span><b class="h-sm grow">${esc(c.title)}</b></div>
          ${c.winner ? `<button class="lb-winner mt12" data-user="${c.winner.userId}">${avatarHTML(S.user(c.winner.userId), 52)}<span class="grow"><span class="eyebrow">Winner</span><b class="trunc">${esc(who(c.winner.userId))}</b><span class="mono small">${esc(unit(c, c.winner.n))}</span></span><span class="lb-medal">1</span></button>
            ${c.runnerUp ? `<button class="lb-runner" data-user="${c.runnerUp.userId}">${avatarHTML(S.user(c.runnerUp.userId), 30)}<span class="grow trunc">Runner-up: <b>${esc(who(c.runnerUp.userId))}</b></span><span class="mono small">${esc(unit(c, c.runnerUp.n))}</span></button>` : `<p class="muted small mt8">No runner-up yet. Your move.</p>`}`
          : `<p class="muted small mt12">Nobody yet this month. First one takes it.</p>`}
        </div>`).join('')}</div>`}
        <div class="note mt20">${icon('info')}<span>Counts visits shared with ${esc(crew ? crew.name : 'the crew')} in ${esc(fmtMonth(month))}. Just me visits and other crews' visits don't count. A fresh board on the 1st.</span></div>
      </div>`;
      el.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>go.profile(b.dataset.user));
      const inv = el.querySelector('#lbInvite'); if (inv) inv.onclick = ()=>go.crew();
    };
    paint();
  });
}
go.leaderboard = leaderboardScreen;
// what you lead this month (for the profile)
export function myLeads(){
  const crew = S.myCrew(), me = S.me(); if (!crew || !me) return [];
  return P.leaderboardCategories(crew, thisMonth(), S.pagesWorld()).filter(c=>c.winner && c.winner.userId===me.id);
}
export function crewChallengeList(){ const crew = S.myCrew(); return crew ? P.crewChallenges(crew, thisMonth(), S.pagesWorld()) : []; }

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
      const crew = S.myCrew(), month = thisMonth();
      const challenges = crewChallengeList(), list = goalProgress(), done = list.filter(g=>g.done).length;
      const daysLeft = (()=>{ const d=new Date(), end=new Date(d.getFullYear(), d.getMonth()+1, 0); return end.getDate()-d.getDate(); })();
      const wants = S.entries({userId:S.me().id, kind:'want'}).map(e=>S.venue(e.venueId)).filter(Boolean).slice(0,3);
      el.innerHTML = topbar({title:'Crew challenges', eyebrow:fmtMonth(month)}) + `<div class="screen-body">
        ${crew ? `<div class="passport mt16 row"><span class="tape"></span><span class="pp-icon">${icon('flag','',true)}</span>
          <div class="grow"><b class="h-sm">${challenges.filter(c=>c.done).length} of ${challenges.length} done together</b><div class="muted small">${esc(crew.name)} • ${plural(daysLeft,'day')} left. New challenges on the 1st.</div></div></div>
        <div class="stack mt16">${challenges.map(c=>`<div class="goal-card challenge${c.done?' done':''}">
          <span class="ring big" style="--p:${Math.round(c.pct*100)}"><span>${c.done?icon('check','',true):icon(c.ic)}</span></span>
          <div class="grow" style="min-width:0"><b>${esc(c.name)}</b><div class="mono small muted">${c.have} of ${c.target}${c.done?' • done!':''}</div>
            ${c.hint && !c.done ? `<div class="hand small">${esc(c.hint)}</div>` : ''}
            ${c.have && c.who.length ? `<div class="row mt8" style="gap:6px">${avatarStack(c.who.map(S.user).filter(Boolean), 26, 5)}<span class="muted small">chipped in</span></div>` : ''}</div>
        </div>`).join('')}</div>
        <p class="center muted small mt12">Everyone in ${esc(crew.name)} sees the same challenges. Visits shared with the crew count.</p>`
        : `<div class="empty mt16">${icon('groups')}<h3 class="h-md">Challenges are for crews</h3><p class="muted">Start or join a crew and you'll get three challenges to do together each month.</p><button class="btn btn-gold" id="gcCrew">${icon('group_add')}Start a crew</button></div>`}
        <div class="row between mt32"><span class="h-md">Just me</span><span class="mono muted small">${done} of ${list.length} goals</span></div>
        <div class="stack mt12">${list.map(g=>`<div class="goal-card${g.done?' done':''}">
          <span class="ring big" style="--p:${Math.round(g.pct*100)}"><span>${g.done?icon('check','',true):icon(g.ic)}</span></span>
          <div class="grow"><b>${esc(g.name)}</b><div class="mono small muted">${Math.min(g.have,g.target)} of ${g.target}${g.done?' • done':''}</div>
            ${g.id==='wishlist' && !g.done && wants.length ? `<div class="chip-wrap mt8">${wants.map(v=>`<button class="tag soft" data-venue="${v.id}">${esc(v.name)}</button>`).join('')}</div>` : ''}</div>
          <div class="stepper-mini"><button data-g="${g.id}" data-d="-1" aria-label="Lower target">${icon('remove')}</button><button data-g="${g.id}" data-d="1" aria-label="Raise target">${icon('add')}</button></div>
        </div>`).join('')}</div>
        <p class="center muted small mt16">Your own targets. Only you see these.</p>
      </div>`;
      el.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{
        const g = GOALS.find(x=>x.id===b.dataset.g), t = targets()[g.id] + (+b.dataset.d);
        setTarget(g.id, Math.max(1, Math.min(g.max, t))); paint();
      });
      el.querySelectorAll('[data-venue]').forEach(b=>b.onclick=()=>go.place(b.dataset.venue));
      const gc = el.querySelector('#gcCrew'); if (gc) gc.onclick = ()=>go.crew();
    };
    paint();
    el._repaint = paint;
  });
}
go.goals = goalsScreen;
