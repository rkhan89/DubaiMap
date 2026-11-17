// SPIKE (step 4, behind a flag): the map sheet. A panel over the map with three heights (peek, half, full) that
// holds what the List tab shows today. Off unless the address has ?nav=sheet (it then stays on, on this phone,
// until ?nav=old). Nothing else changes yet: routes, the tab bar and the guide are still the old ones.
//
// What it tries out, before any route moves:
//   - dragging the sheet never pans the map (the sheet sits outside the map's touch area, and stops the events)
//   - at peek and half the whole sheet drags; at full its list scrolls, and pulling down from the top drags it again
//   - Android back (and a swipe back) lowers it a step instead of leaving the app
//   - Safari's rubber band can't pull the page: the list contains its own overscroll
import { back, pushBackLayer } from './ui.js';

const KEY = 'koko-nav';
export function sheetFlag(){
  try{
    const q = new URLSearchParams(location.search).get('nav');
    if (q === 'sheet') localStorage.setItem(KEY, 'sheet');
    if (q === 'old') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === 'sheet';
  }catch(_){ return new URLSearchParams(location.search).get('nav') === 'sheet'; }
}

// heights, as the sheet's top edge measured from the bottom of the map area
const PEEK = 148;
const stops = (h)=>[PEEK, Math.round(h * 0.5), h - 64];

export function mountSheet({ host, list, onStop }){
  document.body.classList.add('nav-sheet');
  const el = document.createElement('div');
  el.className = 'msheet'; el.id = 'mSheet';
  el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Places on the map');
  el.innerHTML = `<div class="ms-grab" aria-hidden="true"><i></i></div><div class="ms-body"></div>`;
  host.appendChild(el);
  const body = el.querySelector('.ms-body');
  body.appendChild(list);                       // the List's own content moves in
  list.classList.add('active');

  let at = 0, y = PEEK, release = null;         // at: 0 peek, 1 half, 2 full; y: current top, from the bottom
  const H = ()=>host.clientHeight;
  const place = (px, animate)=>{
    y = Math.max(PEEK - 40, Math.min(H() - 64, px));
    el.style.transition = animate ? 'transform .32s cubic-bezier(.2,.9,.3,1)' : 'none';
    el.style.transform = `translateY(${H() - y}px)`;
    host.style.setProperty('--sheet-y', Math.min(y, Math.round(H() * 0.5)) + 'px');
  };
  const go = (i, animate=true)=>{
    const was = at; at = Math.max(0, Math.min(2, i));
    place(stops(H())[at], animate);
    el.classList.toggle('full', at === 2);
    el.dataset.stop = ['peek','half','full'][at];
    // above peek, back lowers the sheet
    if (at > 0 && !release) release = pushBackLayer(()=>{ release = null; go(0); });
    if (at === 0 && release){ const r = release; release = null; r(); }
    if (was !== at) onStop && onStop(el.dataset.stop);
  };

  // dragging: the grabber always; the list too, unless it's full and scrolled, or pulled up at full
  let drag = null;
  const start = (e)=>{
    if (e.button > 0) return;
    const onList = !!e.target.closest('.ms-body');
    if (onList && at === 2 && body.scrollTop > 0) return;          // a scroll of the list
    drag = { id:e.pointerId, y0:e.clientY, top:y, t:performance.now(), v:0, last:e.clientY, onList, moved:false };
  };
  const move = (e)=>{
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.y0 - e.clientY;                                // up is positive
    if (!drag.moved){
      if (Math.abs(dy) < 6) return;
      // at full, an upward pull on the list is a scroll, not a drag
      if (drag.onList && at === 2 && dy > 0){ drag = null; return; }
      drag.moved = true; try{ el.setPointerCapture(e.pointerId); }catch(_){}
    }
    e.preventDefault();
    const now = performance.now(); drag.v = (drag.last - e.clientY) / Math.max(1, now - drag.t); drag.t = now; drag.last = e.clientY;
    place(drag.top + dy, false);
  };
  const end = (e)=>{
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moved) return;
    // a flick goes a stop in its direction; otherwise the nearest stop
    const s = stops(H());
    if (Math.abs(d.v) > 0.5) return go(at + (d.v > 0 ? 1 : -1));
    let best = 0; s.forEach((v, i)=>{ if (Math.abs(v - y) < Math.abs(s[best] - y)) best = i; });
    go(best);
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', move, { passive:false });
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  // none of this reaches the map
  ['pointerdown','pointermove','pointerup','wheel','touchstart','touchmove','click','dblclick'].forEach(t=>el.addEventListener(t, e=>e.stopPropagation(), { passive:true }));
  // a tap on the grabber steps up (and from full, back to peek)
  el.querySelector('.ms-grab').addEventListener('click', ()=>go(at === 2 ? 0 : at + 1));
  // at full and scrolled to the top, a pull down is the sheet's (touch-action lets the browser keep only upward
  // scrolls), so the list never rubber-bands and the sheet comes down instead
  const top = ()=>el.classList.toggle('at-top', body.scrollTop <= 0);
  body.addEventListener('scroll', top, { passive:true }); top();
  addEventListener('resize', ()=>go(at, false));
  go(0, false);
  return { go, get stop(){ return el.dataset.stop; }, el };
}
