// The map sheet and layout B (Map · Crew · + · Scrapbook · You). A panel over the map with three heights
// (peek, half, full) that holds the places list. The only navigation since 2026-11-20 (the old List tab, header and
// ?nav=old are gone).
//
// How it behaves:
//   - dragging the sheet never pans the map (the sheet sits outside the map's touch area, and stops the events)
//   - at peek and half the whole sheet drags; at full its list scrolls, and pulling down from the top drags it again
//   - Android back (and a swipe back) lowers it a step instead of leaving the app
//   - Safari's rubber band can't pull the page: the list contains its own overscroll
import { back, pushBackLayer, icon } from './ui.js';
import { haptic } from './haptics.js';
const calm = ()=>typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
import { avatarHTML } from './avatar.js';

// heights, as the sheet's top edge measured from the bottom of the map area. Peek ends just under peekTo()
// (the Feed / Places switch), so nothing shows half cut off; 148 until that can be measured.
const PEEK = 148;

export function mountSheet({ host, list, onStop, peekTo }){
  let peek = PEEK;
  const stops = (h)=>[peek, Math.round(h * 0.5), h - 64];
  document.body.classList.add('nav-sheet');
  const el = document.createElement('div');
  el.className = 'msheet'; el.id = 'mSheet';
  el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Places on the map');
  el.innerHTML = `<div class="ms-grab" aria-hidden="true"><i></i></div><div class="ms-body"></div>`;
  host.appendChild(el);
  const body = el.querySelector('.ms-body');
  body.appendChild(list);                       // the List's own content moves in
  list.classList.add('active');

  let at = 0, y = PEEK, lastY = PEEK, release = null;         // at: 0 peek, 1 half, 2 full; y: current top, from the bottom
  const H = ()=>host.clientHeight;
  const measure = ()=>{
    const t = peekTo && peekTo(); if (!t) return;
    const below = t.getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop;   // from the body's top
    const clear = parseFloat(getComputedStyle(document.body).getPropertyValue('--plus-clear')) || 0;
    if (below > 0) peek = Math.round(28 + below + 12 + clear);                                          // grabber 28, then 12 of room
  };
  const place = (px, animate)=>{
    y = Math.max(peek - 40, Math.min(H() - 64, px));
    // going up it springs a touch past and settles; going down it eases in (an overshoot there would lift the sheet)
    const up = px > lastY; lastY = px;
    el.style.transition = animate && !calm() ? (up ? 'transform .42s cubic-bezier(.3,1.18,.5,1)' : 'transform .3s cubic-bezier(.2,.9,.3,1)') : 'none';
    el.style.transform = `translateY(${H() - y}px)`;
    host.style.setProperty('--sheet-y', Math.min(y, Math.round(H() * 0.5)) + 'px');
    el.style.setProperty('--sheet-vis', y + 'px');
  };
  const go = (i, animate=true)=>{
    const was = at; at = Math.max(0, Math.min(2, i));
    measure();
    if (at === 0) body.scrollTop = 0;
    place(stops(H())[at], animate);
    el.classList.toggle('full', at === 2);
    el.dataset.stop = ['peek','half','full'][at];
    // above peek, back lowers the sheet
    if (at > 0 && !release) release = pushBackLayer(()=>{ release = null; go(0); });
    if (at === 0 && release){ const r = release; release = null; r(); }
    if (was !== at){ if (animate) haptic('tick'); onStop && onStop(el.dataset.stop); }
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
  // the map area changes size on rotation, and when the header goes (layout B)
  if (window.ResizeObserver) new ResizeObserver(()=>go(at, false)).observe(host); else addEventListener('resize', ()=>go(at, false));
  go(0, false);
  return { go, get stop(){ return el.dataset.stop; }, get peek(){ return peek; }, el };
}

// Layout B: Map · Crew · + · Scrapbook · You (index.html). You is your own face in a ring of your pin colour
// (gold stays for check-in); the bell sits beside the map's search.
export function mountNavB({ nav }){
  document.body.classList.add('nav-b');
  const you = nav.querySelector('.nav-you');
  return function paint(me, color){
    you.style.setProperty('--you-c', color);
    you.querySelector('.you-face').innerHTML = me ? avatarHTML(me, 24) : icon('person');
  };
}
