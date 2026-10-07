// First-run guide: "your map looks empty, let's fix it". Walks a new person through pinning
// their first place (search → add it → where/what → rate → photo → who sees it → save), then
// a quick look at the map controls. Floating prompts point at the real controls; each step
// moves on when you do the thing (or tap Next). Skip is always there, and it can be replayed
// from Settings. Also owns the empty-map card shown to anyone with nothing on their map.
import * as S from './store.js';
import { icon } from './ui.js';
import { go } from './go.js';

const $ = s => document.querySelector(s);
const has = s => !!$(s);
const logOpen = () => has('#logQ') || has('#lStars') || has('#lSave') || has('#vfN');

// step: { id, target, title, body, next (show a Next button), done (moves on by itself), ctx (where it lives) }
const STEPS = [
  { id:'intro', intro:true },
  { id:'search', target:'#logQ', title:'Where did you go?', body:'Type its name: a café, a karak stop, the shawarma place you swear by.',
    ctx:logOpen, done:()=>($('#logQ')?.value||'').trim().length>=2 || has('#vfN') || has('#lStars') },
  { id:'add', target:'#lNew, #lRes [data-v]', title:'Put it on the map', body:'Tap to add it. Every place on the map starts with someone pinning it.',
    ctx:logOpen, done:()=>has('#vfN') || has('#lStars') },
  { id:'where', target:'#vfZ', title:'Where is it?', body:'Pick the area. “Pick on map” drops an exact pin if you know the spot.', next:true,
    ctx:()=>has('#vfN') || has('#lStars'), skipIf:()=>has('#lStars') },
  { id:'kind', target:'#vfC', title:'What kind of place?', body:'Choose one or more, then tap Save place.',
    ctx:()=>has('#vfN') || has('#lStars'), done:()=>has('#lStars'), skipIf:()=>has('#lStars') },
  { id:'rate', target:'#lStars', title:'How was it?', body:'Tap a star. Tap the left half of one for a half star.', next:true,
    ctx:()=>has('#lStars'), done:()=>has('#lStars .on, #lStars .half') },
  { id:'photo', target:'.reel .add-photo', title:'Add a photo (optional)', body:'Photos go on this visit’s scrapbook page. No photos? It still gets a page.', next:true, ctx:()=>has('#lSave') },
  { id:'share', target:'#lWho', title:'Who sees it?', body:'Pick Just me, or one of your crews to put it on their map. You choose every time.', next:true, ctx:()=>has('#lSave') },
  { id:'save', target:'#lSave', title:'Save it', body:'That’s it. Watch it land on your map.', ctx:()=>has('#lSave') || tourSaved, done:()=>tourSaved },
  { id:'stamp', target:'.stamp-anchor.dropped .stamp, .stamp-anchor.selected .stamp, .stamp-anchor .stamp', title:'Your first stamp', body:'Every place you log becomes a stamp. Tap one any time for its card, notes and photos.', next:true, wait:1500 },
  { id:'mode', target:'#mapMode', title:'You, or your crew', body:'Me shows your own places, private ones included. Crew shows what your friends share, each friend’s pins in their own colour, with their face up close.', next:true },
  { id:'filter', target:'#btnFilter', title:'Filters', body:'Filter by friend, kind of place or meal, or colour the areas you’ve explored.', next:true },
  { id:'bell', target:'#btnBell', title:'Crew news', body:'A dot here means a friend logged somewhere, planned a bite or tagged you (add your own rating). Memories from this day in past years show up here too.', next:true },
  { id:'crew', target:'#nav [data-tab="crew"]', title:'Bring your crew', body:'Invite friends with a link. Your map fills up fast when they log too.', next:true },
  { id:'shelf', target:'#nav [data-tab="shelf"]', title:'Your scrapbook', body:'Every visit you log becomes a page, taped in automatically. Your critters and stickers live here too.', next:true },
  { id:'critters', target:'#navLog', title:'Find critters', body:'Twelve pixel animals live at real places around Dubai. When you’re out, tap + then Check in where I am. No clues: just explore.', next:true, last:true },
];

let tourSaved = false, root = null, raf = 0, idx = -1, since = 0, missingSince = 0, scrolledFor = -1;
const finish = ()=>{ S.setFlag('tourDone'); stop(); go.refresh && go.refresh(); };
function stop(){ cancelAnimationFrame(raf); raf = 0; if (root){ root.remove(); root = null; } idx = -1; }
export function tourActive(){ return idx >= 0; }

function mount(){
  root = document.createElement('div'); root.className = 'tour';
  root.innerHTML = `<div class="tour-ring"></div><div class="tour-bubble" role="dialog" aria-live="polite"></div><div class="tour-pause"></div>`;
  document.body.appendChild(root);
  root.addEventListener('click', e=>{
    const x = e.target.closest('[data-t]')?.dataset.t; if (!x) return;
    if (x==='skip') return finish();
    if (x==='next') return advance();
    if (x==='start'){ advance(); go.switchView && go.switchView('map'); go.log({}); }
    if (x==='resume'){ go.log({}); }
  });
}
function advance(){
  idx++;
  while (idx < STEPS.length && STEPS[idx].skipIf && STEPS[idx].skipIf()) idx++;
  since = performance.now(); missingSince = 0; scrolledFor = -1;
  if (idx >= STEPS.length) return finish();
  paintStep();
}
function paintStep(){
  const s = STEPS[idx], bub = root.querySelector('.tour-bubble');
  root.classList.toggle('intro', !!s.intro);
  bub.classList.toggle('paper', !!s.intro);   // the intro card is paper: light in both themes
  const n = STEPS.filter(x=>!x.intro).length, k = STEPS.slice(0, idx).filter(x=>!x.intro).length + 1;
  bub.innerHTML = s.intro
    ? `<span class="tape"></span><div class="tour-art">${icon('add_location_alt','',true)}</div>
       <h2 class="h-lg">Your map looks empty</h2>
       <p class="muted mt8">Let's fix that. Pin a place you've been to recently. It takes about a minute, and you'll see how everything works on the way.</p>
       <button class="btn btn-gold btn-block mt20" data-t="start">${icon('push_pin')}Pin my first place</button>
       <button class="btn btn-ghost btn-block mt8" data-t="skip">Skip the tour</button>`
    : `<div class="row between"><span class="tour-step">${k} / ${n}</span><button class="tour-skip" data-t="skip">Skip tour</button></div>
       <b class="tour-title">${s.title}</b><p class="tour-body">${s.body}</p>
       ${s.next ? `<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn btn-gold btn-sm" data-t="next">${s.last?'Done':'Next'} ${icon(s.last?'check':'arrow_forward')}</button></div>` : ''}`;
}
function frame(){
  raf = requestAnimationFrame(frame);
  if (!root || idx < 0) return;
  const s = STEPS[idx], ring = root.querySelector('.tour-ring'), bub = root.querySelector('.tour-bubble'), pause = root.querySelector('.tour-pause');
  if (s.intro){ ring.style.display='none'; pause.style.display='none'; bub.style.cssText=''; return; }
  if (s.done && s.done()){ advance(); return; }
  // the step's screen was closed before it finished: offer to pick up again
  const inCtx = !s.ctx || s.ctx();
  if (!inCtx){
    if (!missingSince) missingSince = performance.now();
    if (performance.now()-missingSince > 700){
      ring.style.display='none'; bub.style.display='none';
      pause.style.display='flex';
      pause.innerHTML = `${icon('push_pin')}<span class="grow">Pin your first place?</span><button class="btn btn-gold btn-sm" data-t="resume">Continue</button><button class="icon-btn" data-t="skip" aria-label="Skip the tour">${icon('close')}</button>`;
    }
    return;
  }
  missingSince = 0; pause.style.display='none';
  if (s.wait && performance.now()-since < s.wait){ ring.style.display='none'; bub.style.display='none'; return; }
  const t = [...document.querySelectorAll(s.target)].find(el=>{ const r=el.getBoundingClientRect(); return r.width && r.height; });
  if (!t){ ring.style.display='none'; bub.style.display='none'; return; }
  if (scrolledFor !== idx){ scrolledFor = idx; const r0=t.getBoundingClientRect(); if (r0.top < 70 || r0.bottom > innerHeight-150) t.scrollIntoView({block:'center', behavior:'smooth'}); }
  const r = t.getBoundingClientRect(), pad = 6;
  Object.assign(ring.style, { display:'block', left:(r.left-pad)+'px', top:(r.top-pad)+'px', width:(r.width+pad*2)+'px', height:(r.height+pad*2)+'px' });
  bub.style.display = 'block';
  const bw = Math.min(320, innerWidth-24), bh = bub.offsetHeight || 140;
  const below = r.bottom + 14 + bh < innerHeight - 8 && (r.top < innerHeight*0.55 || r.top - bh - 14 < 60);
  const left = Math.max(12, Math.min(innerWidth-bw-12, r.left + r.width/2 - bw/2));
  bub.style.width = bw+'px'; bub.style.left = left+'px';
  bub.style.top = (below ? r.bottom + 14 : Math.max(12, r.top - bh - 14)) + 'px';
  bub.classList.toggle('above', !below);
  bub.style.setProperty('--ax', Math.max(18, Math.min(bw-18, r.left + r.width/2 - left))+'px');
}

// start: from the top for someone with nothing logged, or at the map tour otherwise
export function startTour(opts){
  opts = opts || {};
  stop(); tourSaved = false;
  document.querySelector('#emptyMap')?.remove();
  mount();
  const mine = S.me() ? S.entries({userId:S.me().id, kind:'visit'}).length : 0;
  idx = (mine && !opts.fromStart) ? STEPS.findIndex(s=>s.id==='mode') - 1 : -1;
  advance();
  raf = requestAnimationFrame(frame);
}
go.startTour = startTour;
go.coach = ()=>startTour();
go.tourSaved = ()=>{ tourSaved = true; };

// new people get the guide once; people from before it existed already saw the old map tour
export function maybeStartTour(){
  if (!S.me() || S.flag('tourDone') || S.flag('coachDone')) return;
  setTimeout(()=>startTour(), 600);
}

/* ---------- empty map: a gentle nudge whenever there's nothing to show ---------- */
export function paintEmptyMap(count){
  let el = $('#emptyMap');
  const show = count===0 && !tourActive() && S.me();
  if (!show){ if (el) el.remove(); return; }
  if (!el){
    el = document.createElement('div'); el.id = 'emptyMap'; el.className = 'empty-map paper map-ui';
    el.innerHTML = `<span class="tape"></span><b>Your map looks empty</b><span class="muted small">Pin a place you've been to recently and it lands here as a stamp.</span>
      <div class="row mt12" style="gap:8px"><button class="btn btn-gold btn-sm" data-e="pin">${icon('push_pin')}Pin a place</button><button class="btn btn-soft btn-sm" data-e="tour">${icon('tour')}Show me around</button></div>`;
    el.addEventListener('click', e=>{ const x=e.target.closest('[data-e]')?.dataset.e; if (x==='pin') go.log({}); if (x==='tour') startTour({fromStart:true}); });
    $('#mapWrap').appendChild(el);
  }
}
