// The scrapbook's feel: paper and stamp sounds, haptics, reduced motion, rubber stamps and photos that develop.
// Sounds are short WAVs made by tools/make-sounds.mjs, played through Web Audio and loaded the first time a book
// opens. They're off by default on the web and on by default in the Android app; Settings → Scrapbook has the
// switch (profiles.sounds_enabled, or this device's default while it's unset). Reduced motion turns page curls
// into cross-fades and lets stamps simply appear.
import * as S from './store.js';
import { haptic } from './haptics.js';

export const native = () => !!(typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export function soundsOn(){ const m = S.me(); const v = m && m.soundsEnabled; return typeof v === 'boolean' ? v : native(); }
export function setSounds(on){ S.updateMe({ soundsEnabled:!!on }); if (on) preloadSounds(); }

/* ---------- sounds ---------- */
const FILES = { flip:['flip-1','flip-2','flip-3'], creak:['creak'], stamp:['stamp'], press:['press'], rip:['rip'] };
let ctx = null, loading = null;
const buffers = new Map();
// load them all once (the first book you open), quietly; nothing plays until they're in
export function preloadSounds(){
  if (loading || !soundsOn()) return loading;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = ctx || new AC();
  loading = Promise.all(Object.values(FILES).flat().map(name=>fetch(`sounds/${name}.wav`).then(r=>r.arrayBuffer()).then(a=>new Promise((ok, no)=>ctx.decodeAudioData(a, ok, no))).then(b=>buffers.set(name, b)).catch(()=>{})));
  return loading;
}
// play one (a random one where there are variants, like the three page flips)
export function sound(kind, volume){
  if (!soundsOn() || !ctx) return;
  const list = FILES[kind]; if (!list) return;
  const b = buffers.get(list[Math.floor(Math.random()*list.length)]); if (!b) return;
  try{
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b; g.gain.value = volume == null ? 0.6 : volume;
    src.connect(g).connect(ctx.destination); src.start();
  }catch(_){}
}

/* ---------- haptics ----------
   light · medium · heavy. In the Android app, the Capacitor Haptics plugin; elsewhere the app's usual tick
   (haptics.js: a short vibration on Android browsers, the switch tick on iPhone, nothing on a computer). */
const IMPACT = { light:'LIGHT', medium:'MEDIUM', heavy:'HEAVY' };
const FALLBACK = { light:'tick', medium:'tap', heavy:'success' };
export function buzz(kind){
  try{
    const H = native() && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H){ H.impact({ style:IMPACT[kind] || 'LIGHT' }); return; }
  }catch(_){}
  haptic(FALLBACK[kind] || 'tick');
}

/* ---------- the moments ---------- */
export const moments = {
  bookOpen(){ preloadSounds(); sound('creak', 0.5); buzz('light'); },
  pageTurn(){ sound('flip'); buzz('light'); },
  stickerUp(){ buzz('light'); },
  stickerDown(){ sound('press', 0.7); buzz('medium'); },
  tape(){ sound('rip', 0.5); buzz('light'); },
  stamp(){ sound('stamp', 0.8); buzz('heavy'); },
  drop(){ sound('flip'); buzz('medium'); setTimeout(()=>{ sound('stamp', 0.8); buzz('heavy'); }, 900); },
};

/* ---------- a rubber stamp slams onto a page ----------
   Adds the stamp's ink mark to the element (it stays), with a slam and a bounce unless motion is reduced. */
export function slam(target, html){
  if (!target) return;
  const mark = document.createElement('span');
  mark.className = 'ink-slam' + (reduceMotion() ? ' calm' : '');
  mark.innerHTML = html;
  target.appendChild(mark);
  requestAnimationFrame(()=>mark.classList.add('in'));
  setTimeout(()=>moments.stamp(), reduceMotion() ? 0 : 160);
  return mark;
}

/* ---------- photos that develop ----------
   The first time a photo shows on a page on this phone, it fades from washed-out to full colour over 1.5 s.
   Remembered per photo (only the last few hundred), so it happens once. */
const SEEN_KEY = 'koko-developed';
let seen = null;
const seenSet = ()=>{ if (!seen){ try{ seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); }catch(_){ seen = new Set(); } } return seen; };
export function develops(photoId){ return !!photoId && !seenSet().has(photoId); }
export function developed(ids){
  const s = seenSet(); let changed = false;
  ids.forEach(id=>{ if (id && !s.has(id)){ s.add(id); changed = true; } });
  if (changed) try{ localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-600))); }catch(_){}
}
// start developing the photos inside el that haven't developed yet (call when the page is on screen)
export function developIn(el){
  if (!el) return;
  const imgs = [...el.querySelectorAll('img[data-develop]')];
  if (!imgs.length) return;
  if (reduceMotion()){ developed(imgs.map(i=>i.dataset.develop)); imgs.forEach(i=>i.removeAttribute("data-develop")); return; }
  imgs.forEach(img=>{
    const go = ()=>{ img.classList.add('developing'); setTimeout(()=>{ img.classList.remove('developing'); img.removeAttribute('data-develop'); }, 1600); };
    if (img.complete) requestAnimationFrame(go); else img.addEventListener('load', go, { once:true });
  });
  developed(imgs.map(i=>i.dataset.develop));
}
