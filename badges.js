// Badge stickers: what they are, the sticker page, and the unlock moment.
// Badges are derived from your visible logs (stats.js), so there's nothing extra to store
// except which unlocks you've already seen (per person, on this device).
import * as S from './store.js';
import { userStats } from './stats.js';
import { esc, CATEGORIES, monthKey } from './data.js';
import { icon, openScreen, topbar, back } from './ui.js';
import { go } from './go.js';

const CAT_ICONS = { restaurant:'restaurant', shisha:'smoking_rooms', icecream:'icecream', coffee:'coffee', matcha:'emoji_food_beverage', dessert:'cake', burger:'lunch_dining', fastfood:'fastfood', cafeteria:'storefront', karak:'local_cafe', pizza:'local_pizza', acai:'nutrition', froyo:'icecream' };
const OLD_DUBAI = ['deira','burdubai','alseef','karama','oudmetha'];
const has = (s, ...cats)=>{ const set = new Set(); cats.forEach(c=>(s.catPlaces.get(c)||new Set()).forEach(v=>set.add(v))); return set.size; };
// progress(s) -> [have, need]
export const BADGES = [
  { id:'first',     name:'First bite',        desc:'Log your first visit',                     ic:'restaurant',      color:'#E5A93C', progress:s=>[s.visits, 1] },
  { id:'explorer',  name:'Explorer',          desc:'Eat in 5 different areas',                 ic:'explore',         color:'#3F7FD9', progress:s=>[s.areaCount, 5] },
  { id:'karak',     name:'Karak connoisseur', desc:'Five karak spots',                         ic:'emoji_food_beverage', color:'#B5451B', progress:s=>[has(s,'karak'), 5] },
  { id:'sweet',     name:'Sweet tooth',       desc:'Five dessert, ice cream, froyo or acai spots', ic:'icecream', color:'#E1699A', progress:s=>[has(s,'dessert','icecream','froyo','acai'), 5] },
  { id:'caffeine',  name:'Caffeine trail',    desc:'Five coffee spots',                        ic:'coffee',          color:'#8B5A2B', progress:s=>[has(s,'coffee'), 5] },
  { id:'regular',   name:'Regular',           desc:'Go back to the same place 3 times',        ic:'autorenew',       color:'#5F8D4E', progress:s=>[s.maxRepeat, 3] },
  { id:'olddubai',  name:'Old Dubai',         desc:'Three places in Deira, Bur Dubai or Karama', ic:'mosque',        color:'#C9622D', progress:s=>[s.visitList.filter((e,i,a)=>{ const v=S.venue(e.venueId); return v && OLD_DUBAI.includes(v.zone) && a.findIndex(x=>x.venueId===e.venueId)===i; }).length, 3] },
  { id:'shutter',   name:'Shutterbug',        desc:'Add 20 photos',                            ic:'photo_camera',    color:'#7A8B99', progress:s=>[s.photos, 20] },
  { id:'critic',    name:'Critic',            desc:'Rate and review 10 visits',                ic:'rate_review',     color:'#8E4FD6', progress:s=>[s.reviews, 10] },
  { id:'pioneer',   name:'Crew pioneer',      desc:'First in your crew at 5 places',           ic:'flag',            color:'#486636', progress:s=>[s.firstInCrew, 5] },
  { id:'dreamer',   name:'Dreamer',           desc:'Save 10 places to try',                    ic:'bookmark_heart',  color:'#D6A72C', progress:s=>[s.wants, 10] },
  { id:'onthespot', name:'On the spot',       desc:'Check in at a place while you’re there',   ic:'where_to_vote',   color:'#2F9C8F', progress:s=>[s.checkins, 1] },
  { id:'omnivore',  name:'Omnivore',          desc:'Try all 10 kinds of place',                ic:'lunch_dining',    color:'#D64545', progress:s=>[s.cats.size, 10] },
  { id:'cartographer', name:'Cartographer',   desc:'Eat in 15 different areas',                ic:'map',             color:'#1E6B8F', progress:s=>[s.areaCount, 15] },
  { id:'legend',    name:'Local legend',      desc:'Visit 50 different places',                ic:'workspace_premium', color:'#7E5700', progress:s=>[s.places, 50] },
  // earned through the scrapbook: a busy month, a visit with the whole crew, a first of each kind
  { id:'busymonth', name:'Full scrapbook',    desc:'Log 8 visits in one month',                ic:'auto_stories',    color:'#B5451B', progress:s=>[busiestMonth(s), 8] },
  { id:'wholecrew', name:'Whole crew',        desc:'A visit with everyone in your crew tagged', ic:'diversity_3',     color:'#486636', progress:s=>[wholeCrew(s), 1] },
  ...CATEGORIES.map(c=>({ id:'cat-'+c.id, name:'First '+c.label.toLowerCase(), desc:`Your first ${c.label.toLowerCase()} visit`, ic:CAT_ICONS[c.id]||'restaurant', color:c.color, cat:true, progress:s=>[has(s, c.id), 1] })),
];
// the busiest month: most visits logged in one month
function busiestMonth(s){ const n=new Map(); s.visitList.forEach(e=>{ const k=monthKey(e.date); n.set(k, (n.get(k)||0)+1); }); return Math.max(0, ...n.values()); }
// visits where whoever logged it plus everyone tagged is a whole crew (of two or more) you're in
function wholeCrew(s){
  const crews = S.myCrews().filter(c=>c.memberIds.length>=2 && c.memberIds.includes(s.userId));
  return s.visitList.filter(e=>{ const there=new Set([e.userId, ...(e.taggedIds||[])]); return crews.some(c=>c.memberIds.every(id=>there.has(id))); }).length;
}

export function badgeStatus(userId){
  const s = userStats(userId);
  return BADGES.map(b=>{ const [have, need] = b.progress(s); return { ...b, have:Math.min(have, need), need, done:have>=need }; });
}

// the sticker itself: a die-cut round sticker with a white edge; locked ones are a dashed outline
export function stickerHTML(b, size, opts){
  size = size || 76; opts = opts || {};
  const tilt = ((b.id.charCodeAt(0)+b.id.length*7)%9-4)*1.2;
  return `<span class="sticker${b.done?'':' locked'}${opts.cls?' '+opts.cls:''}" style="--s:${size}px;--c:${b.color};--t:${b.done?tilt:0}deg" title="${esc(b.name)}">
    <span class="st-disc">${icon(b.done?b.ic:'lock', '', b.done)}</span>
    ${!b.done && b.need>1 && opts.progress!==false ? `<span class="st-prog"><i style="width:${Math.round(b.have/b.need*100)}%"></i></span>` : ''}
  </span>`;
}

/* ---------- sticker page ---------- */
function stickerPage(userId){
  const me = S.me(); userId = userId || me.id;
  const u = S.user(userId), mine = userId===me.id;
  openScreen(el=>{
    const list = badgeStatus(userId), got = list.filter(b=>b.done).length;
    el.innerHTML = topbar({title: mine ? 'Your stickers' : `${u.name||u.handle}'s stickers`, eyebrow:'Sticker book'}) + `<div class="screen-body">
      <div class="sticker-sheet paper mt16"><span class="tape"></span>
        <div class="row between"><div><span class="eyebrow">Collected</span><div class="h-lg">${got} of ${list.length}</div></div>
          <span class="mono muted small">${mine?'Peel them all':'Their collection'}</span></div>
        <div class="sticker-grid mt16">${list.map(b=>`<button class="sticker-cell" data-b="${b.id}">${stickerHTML(b, 72)}<b>${esc(b.name)}</b><small>${b.done?'Unlocked':`${b.have} / ${b.need}`}</small></button>`).join('')}</div>
      </div>
      <p class="center muted small mt16">Stickers come from your own logs. Private logs count for you, but friends only see what you share.</p>
    </div>`;
    el.querySelectorAll('[data-b]').forEach(c=>c.onclick=()=>{ const b=list.find(x=>x.id===c.dataset.b); showBadge(b, mine); });
  });
}
function showBadge(b, mine){
  const wrap = document.createElement('div'); wrap.className = 'unlock';
  wrap.innerHTML = `<div class="unlock-card paper">${stickerHTML(b, 132, {progress:false})}
    <h2 class="h-lg mt16">${esc(b.name)}</h2><p class="muted mt8">${esc(b.desc)}</p>
    ${b.done ? '' : `<div class="cap-bar mt16" style="width:180px;margin-inline:auto"><i style="width:${Math.round(b.have/b.need*100)}%"></i></div><p class="mono small muted mt8">${b.have} of ${b.need}${mine?'':' (shared logs only)'}</p>`}
    <button class="btn btn-soft btn-block mt20">Close</button></div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(()=>wrap.classList.add('in'));
  const close = ()=>{ wrap.classList.remove('in'); setTimeout(()=>wrap.remove(), 250); };
  wrap.onclick = e=>{ if (e.target===wrap || e.target.closest('button')) close(); };
}
go.stickers = stickerPage;

/* ---------- unlock moment ---------- */
const seenKey = ()=>'bites-badges-seen-'+(S.me()?.id||'');
const seen = ()=>{ try{ return new Set(JSON.parse(localStorage.getItem(seenKey())||'[]')); }catch(_){ return new Set(); } };
const markSeen = ids=>{ try{ localStorage.setItem(seenKey(), JSON.stringify([...ids])); }catch(_){} };
// first run: whatever you already have counts as seen, so nobody gets a flood of confetti
export function primeBadges(){
  if (!S.me()) return;
  try{
    const v2 = seenKey()+'-v2';
    if (localStorage.getItem(seenKey())===null){ markSeen(badgeStatus(S.me().id).filter(b=>b.done).map(b=>b.id)); localStorage.setItem(v2, '1'); return; }
    // stickers added later (the scrapbook ones) that you'd already earned count as seen, quietly
    if (!localStorage.getItem(v2)){ const s0 = seen(); badgeStatus(S.me().id).filter(b=>b.done).forEach(b=>s0.add(b.id)); markSeen(s0); localStorage.setItem(v2, '1'); }
  }catch(_){}
}
// after something you did: celebrate anything newly unlocked, one at a time
export function checkBadges(){
  if (!S.me()) return;
  primeBadges();
  const s = seen(), fresh = badgeStatus(S.me().id).filter(b=>b.done && !s.has(b.id));
  if (!fresh.length) return;
  fresh.forEach(b=>s.add(b.id)); markSeen(s);
  peel(fresh);
}
// the small moment: a sticker peels onto a card at the top; tap it for the full sticker
function peel(list){
  document.querySelectorAll('.sticker-peel').forEach(x=>x.remove());
  const b = list[0], el = document.createElement('button');
  el.className = 'sticker-peel'; el.type = 'button';
  el.innerHTML = `${stickerHTML(b, 50, {progress:false, cls:'pop'})}<span class="sp-text"><span class="eyebrow">${list.length>1 ? list.length+' stickers unlocked' : 'Sticker unlocked'}</span><b>${esc(list.map(x=>x.name).join(', '))}</b><span class="sp-hint">Stick it on a page with the page’s ✦ button</span></span>`;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('in'));
  const hide = ()=>{ el.classList.remove('in'); setTimeout(()=>el.remove(), 300); };
  const t = setTimeout(hide, 4200);
  el.onclick = ()=>{ clearTimeout(t); hide(); const queue = list.slice(); const next = ()=>{ const x = queue.shift(); if (x) celebrate(x, next); }; next(); };
}
function celebrate(b, done){
  const wrap = document.createElement('div'); wrap.className = 'unlock celebrate';
  const bits = Array.from({length:18}, (_,k)=>`<i style="--a:${k*20}deg;--d:${60+(k%4)*18}px;--c:${['#E5A93C','#E1699A','#3F7FD9','#5F8D4E','#fff'][k%5]}"></i>`).join('');
  wrap.innerHTML = `<div class="unlock-card paper"><span class="eyebrow" style="color:var(--rust)">New sticker</span>
    <div class="peel">${bits}${stickerHTML(b, 140, {progress:false, cls:'pop'})}</div>
    <h2 class="h-lg mt8">${esc(b.name)}</h2><p class="muted mt8">${esc(b.desc)}</p>
    <div class="btn-grid mt20"><button class="btn btn-soft" data-x="book">See stickers</button><button class="btn btn-gold" data-x="ok">Nice!</button></div></div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(()=>wrap.classList.add('in'));
  const close = (then)=>{ wrap.classList.remove('in'); setTimeout(()=>{ wrap.remove(); then && then(); }, 250); };
  wrap.onclick = e=>{
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (x==='book') close(()=>stickerPage());
    else if (x==='ok' || e.target===wrap) close(done);
  };
}
go.checkBadges = checkBadges;
