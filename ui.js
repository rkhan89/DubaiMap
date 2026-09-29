// Shared UI: layers (full screens + bottom sheets, both closable with the phone's back
// button), toasts, and the components every screen reuses: stamps, polaroids, stars, chips.
import { APP } from './config.js';
import { CATEGORIES, catById, iconSvg, esc, fmtRating, tilt } from './data.js';
import { avatarHTML } from './avatar.js';
import { me as currentUser } from './store.js';

export const $ = (s, r)=> (r||document).querySelector(s);
export const $$ = (s, r)=> Array.from((r||document).querySelectorAll(s));
export const icon = (name, cls, fill)=> `<span class="ms${cls?' '+cls:''}"${fill?' style="font-variation-settings:\'FILL\' 1"':''} aria-hidden="true">${name}</span>`;
export function brandName(){ return esc(APP.name); }

/* =========================================================
   LAYERS: screens and sheets share one stack tied to history,
   so Android back / swipe-back closes the top one.
   ========================================================= */
const stack = [];
const nextFrame = fn=> document.documentElement.classList.contains('still') ? fn() : requestAnimationFrame(fn);
let ignorePop = 0;
window.addEventListener('popstate', ()=>{
  if (ignorePop){ ignorePop--; return; }
  const top = stack.pop();
  if (top) top.close(true);
});
function pushLayer(layer){
  stack.push(layer);
  history.pushState({layer:stack.length}, '');
}
// close the top layer programmatically (keeps history in step)
export function back(){ if (stack.length) history.back(); }
export function closeAll(){ const n=stack.length; if (!n) return; stack.splice(0).reverse().forEach(l=>l.close(true)); ignorePop++; history.go(-n); }
export function topLayer(){ return stack[stack.length-1]||null; }

const screensRoot = ()=> $('#screens');
// Full-screen page. render(el) fills it; returns the element.
export function openScreen(render, opts){
  opts=opts||{};
  const el=document.createElement('section');
  el.className='screen'+(opts.cls?' '+opts.cls:'');
  el.setAttribute('role','dialog');
  screensRoot().appendChild(el);
  const layer = { el, kind:'screen', close:(fromPop)=>{
    if (opts.onClose) opts.onClose();
    el.classList.remove('in'); el.classList.add('out');
    setTimeout(()=>el.remove(), 260);
    if (!fromPop){ const i=stack.indexOf(layer); if (i>-1){ stack.splice(i,1); ignorePop++; history.back(); } }
  }};
  el._layer = layer;
  render(el, layer);
  nextFrame(()=>el.classList.add('in'));
  if (opts.replace && stack.length && stack[stack.length-1].kind==='screen'){
    // swap the current screen for this one (onboarding steps) without growing history
    const prev = stack.pop(); prev.el.remove();
    stack.push(layer); history.replaceState({layer:stack.length}, '');
  } else pushLayer(layer);
  return el;
}
// Bottom sheet. render(body, layer). Drag the handle down to dismiss.
export function openSheet(render, opts){
  opts=opts||{};
  const scrim=document.createElement('div'); scrim.className='scrim';
  const el=document.createElement('div');
  el.className='sheet'+(opts.cls?' '+opts.cls:'');
  el.setAttribute('role','dialog');
  el.innerHTML=`<div class="sheet-handle"></div><div class="sheet-inner"></div>`;
  const root = opts.root || document.body;
  root.append(scrim, el);
  const layer = { el, kind:'sheet', close:(fromPop)=>{
    if (opts.onClose) opts.onClose();
    el.classList.remove('in'); scrim.classList.remove('in');
    setTimeout(()=>{ el.remove(); scrim.remove(); }, 280);
    if (!fromPop){ const i=stack.indexOf(layer); if (i>-1){ stack.splice(i,1); ignorePop++; history.back(); } }
  }};
  el._layer = layer;
  render(el.querySelector('.sheet-inner'), layer);
  scrim.addEventListener('click', ()=>back());
  // drag down to close
  const handle=el.querySelector('.sheet-handle');
  let y0=null, dy=0;
  handle.addEventListener('pointerdown', e=>{ y0=e.clientY; dy=0; el.style.transition='none'; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', e=>{ if (y0===null) return; dy=Math.max(0,e.clientY-y0); el.style.transform=`translateY(${dy}px)`; });
  const end=()=>{ if (y0===null) return; y0=null; el.style.transition=''; el.style.transform=''; if (dy>80) back(); };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  nextFrame(()=>{ el.classList.add('in'); scrim.classList.add('in'); });
  pushLayer(layer);
  return el;
}

/* =========================================================
   TOAST
   ========================================================= */
let toastTimer=null;
export function toast(msg, action, fn, ms){
  let el=$('#toast');
  el.innerHTML=`<span class="toast-msg"></span>${action?`<button class="toast-btn"></button>`:''}`;
  el.querySelector('.toast-msg').textContent=msg;
  if (action){ const b=el.querySelector('.toast-btn'); b.textContent=action; b.onclick=()=>{ el.classList.remove('show'); fn(); }; }
  el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'), ms||(action?5000:2400));
}
// the dark "points" bar from the log screen
export function pointsToast(parts){
  const el=$('#points');
  el.innerHTML = `${icon('auto_awesome','',true)}<span class="pts">${parts.map(p=>`<b>+${p[0]}</b> ${esc(p[1])}`).join('<i>•</i>')}</span>${parts.length>1?'<em>Combo!</em>':''}`;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 3200);
}

/* =========================================================
   COMPONENTS
   ========================================================= */
export function topbar({title, eyebrow, back:showBack=true, actions='', profile=true, center=false, progress=null}){
  return `<header class="topbar${center?' center':''}">
    ${showBack?`<button class="icon-btn" data-act="back" aria-label="Back">${icon('arrow_back')}</button>`:''}
    <div class="tb-title">
      ${eyebrow?`<span class="tb-eyebrow">${esc(eyebrow)}</span>`:''}
      <h1>${esc(title)}</h1>
      ${progress?`<span class="tb-progress">${Array.from({length:progress[1]},(_,i)=>`<i class="${i===progress[0]?'on':''}"></i>`).join('')}</span>`:''}
    </div>
    <div class="tb-actions">${actions}${profile?`<button class="profile-btn" data-act="profile" aria-label="Your profile">${currentUser()?avatarHTML(currentUser(),44):icon('person')}</button>`:''}</div>
  </header>`;
}
export function catChip(id, on, count){
  const c=catById(id); if (!c) return '';
  return `<button class="cat-chip${on?' on':''}" data-cat="${id}" style="--c:${c.color}"><span class="cc-ico">${iconSvg(id, on?'#fff':c.color)}</span>${esc(c.label)}${count!=null?`<em>${count}</em>`:''}</button>`;
}
export function starsStatic(r, size){
  r=+r||0; let o='';
  for (let k=1;k<=5;k++) o+=`<i class="${k<=r?'on':(k-0.5===r?'half':'')}">★</i>`;
  return `<span class="stars" style="font-size:${size||14}px">${o}</span>`;
}
export function ratingPill(r, cls){ return r ? `<span class="rating-pill ${cls||''}">${icon('star','',false)}${fmtRating(r)}</span>` : ''; }
// star input with halves: tap the left half of a star for .5, tap the same value again to clear
export function starInput(el, value, onChange){
  const draw=()=>{ el.innerHTML=[1,2,3,4,5].map(k=>`<button type="button" data-v="${k}" class="${k<=value?'on':(k-0.5===value?'half':'')}" aria-label="${k} star${k>1?'s':''}">★</button>`).join(''); };
  draw();
  el.addEventListener('click', e=>{
    const b=e.target.closest('button'); if (!b) return;
    const r=b.getBoundingClientRect(), half = e.clientX && (e.clientX-r.left) < r.width/2;
    const v=parseInt(b.dataset.v,10)-(half?0.5:0);
    value = v===value ? 0 : v; draw(); onChange && onChange(value);
  });
  return { get:()=>value, set:v=>{ value=v; draw(); } };
}

/* ---------- stamps: the six map states ---------- */
// state: unlit | want | visited | private | crew | cluster
export function stampHTML(state, o){
  o=o||{};
  const cat = catById(o.cat) || CATEGORIES[0];
  const ico = iconSvg(cat.id, state==='unlit' ? '#a8957c' : (state==='crew' ? '#486636' : '#7e5700'));
  let inner='', marks='';
  if (state==='cluster'){
    inner = `<span class="st-count">${o.count}</span><span class="st-mini">${(o.cats||[]).slice(0,4).map(c=>iconSvg(c,'#7e5700')).join('')}</span>`;
  } else {
    inner = `<span class="st-ico">${ico}</span>${o.label?`<span class="st-label">${esc(o.label)}</span>`:''}`;
  }
  if (state==='want') marks += `<span class="st-ribbon">TRY</span>`;
  if (state==='visited' && o.visits>1) marks += `<span class="st-badge">#${o.visits}</span>`;
  if ((state==='visited' || state==='crew') && o.rating) marks += `<span class="st-score">★${fmtRating(o.rating)}</span>`;
  if (state==='private') marks += `<span class="st-lock">${icon('lock','',true)}</span>`;
  if (state==='crew' && o.avatars) marks += `<span class="st-avs">${o.avatars}</span>`;
  return `<span class="stamp st-${state}${o.big?' big':''}"><span class="st-paper">${inner}</span>${marks}</span>`;
}

/* ---------- polaroid ---------- */
export function polaroidHTML({src, caption, id, rot, tape=true, badge='', cls='', sub=''}){
  const r = rot!=null ? rot : tilt(id||caption||src, 5);
  return `<figure class="polaroid ${cls}" style="--r:${r.toFixed(2)}deg" ${id?`data-photo="${esc(id)}"`:''}>
    ${tape?'<span class="tape"></span>':''}
    <span class="pol-img">${src?`<img src="${esc(src)}" alt="" loading="lazy">`:''}${badge}</span>
    ${caption||sub?`<figcaption>${caption?`<span class="hand">${esc(caption)}</span>`:''}${sub}</figcaption>`:''}
  </figure>`;
}

/* ---------- misc ---------- */
export function seg(name, options, value){
  return `<div class="seg" data-seg="${name}">${options.map(([v,l,ic])=>`<button type="button" data-v="${v}" class="${v===value?'on':''}">${ic?icon(ic):''}${l}</button>`).join('')}</div>`;
}
export function bindSeg(root, name, fn){
  const el=root.querySelector(`[data-seg="${name}"]`); if (!el) return;
  el.addEventListener('click', e=>{
    const b=e.target.closest('button'); if (!b) return;
    el.querySelectorAll('button').forEach(x=>x.classList.toggle('on', x===b));
    fn(b.dataset.v);
  });
}
export function toggleHTML(id, on, label){ return `<button type="button" class="switch${on?' on':''}" role="switch" aria-checked="${on}" ${id?`id="${id}"`:''} aria-label="${esc(label||'')}"><i></i></button>`; }
export function bindToggle(el, fn){
  el.addEventListener('click', ()=>{ const on=!el.classList.contains('on'); el.classList.toggle('on',on); el.setAttribute('aria-checked',on); fn(on); });
}
export async function share({title, text, url}){
  try{
    if (navigator.share){ await navigator.share({title, text, url}); return 'shared'; }
  }catch(e){ if (e && e.name==='AbortError') return 'cancelled'; }
  try{ await navigator.clipboard.writeText(url||text); toast('Link copied'); return 'copied'; }catch(_){ prompt('Copy this link', url||text); return 'prompted'; }
}
export async function copy(text, msg){ try{ await navigator.clipboard.writeText(text); toast(msg||'Copied'); }catch(_){ prompt('Copy', text); } }
// resize + compress a picked image file to a JPEG blob
export function compressImage(file, maxSide, quality){
  maxSide=maxSide||1280; quality=quality||0.8;
  return new Promise((res, rej)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{
      const s=Math.min(1, maxSide/Math.max(img.width,img.height));
      const w=Math.round(img.width*s), h=Math.round(img.height*s);
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      c.toBlob(b=>b?res(b):rej(new Error('encode')), 'image/jpeg', quality);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src=url;
  });
}
