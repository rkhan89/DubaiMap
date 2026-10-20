// The book as a book: the hard cover swings open from the spine, then one visit per page, turned with a page curl
// that follows your finger (StPageFlip, https://github.com/Nodlik/StPageFlip, MIT). Buttons under the book turn
// pages too (and say which page you're on), so it works with a screen reader or a keyboard. With reduced motion,
// or if the page-curl library can't load, pages cross-fade instead.
//
// Pages are drawn on the fixed design canvas from paper.js and scaled to fit; only the pages near the open one are
// filled in, so a long book stays light.
import { esc, plural } from './data.js';
import { icon } from './ui.js';
import { PAGE_W, PAGE_H, pageHTML, coverHTML, hydrateMaps } from './paper.js';
import { moments, reduceMotion, developIn } from './feel.js';

// pinned to an exact version: a new release can't change what runs here without a deploy
const LIB = 'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.module.js';
let libLoading = null;
const loadLib = ()=> libLoading || (libLoading = import(LIB).then(m=>m.PageFlip).catch(()=>{ libLoading = null; return null; }));
// fetch the page-curl library ahead of time (the shelf calls this), so opening a book doesn't wait for it
export const preloadBook = ()=>{ if (!reduceMotion()) loadLib(); };
const NEAR = 3;   // pages filled in either side of the open one

// stage: the element to fill; o: { book, pages, paper, count, photos, startAt (index into pages, or -1 for the cover),
//   onPage(i), onAction(el, event) }
export function mountBook(stage, o){
  const pages = o.pages, total = pages.length;
  let pf = null, cur = -1, destroyed = false, scale = 1;
  // leaves: the cover, the pages, and an end page
  const leaf = (cls, inner, density)=>{ const d = document.createElement('div'); d.className = 'kb-leaf ' + cls; if (density) d.dataset.density = density; d.innerHTML = inner || ''; return d; };
  const coverLeaf = leaf('kb-cover-leaf', `<div class="kb-scale">${coverHTML(o.book, o.count, o.photos)}</div>`, 'hard');
  const pageLeaves = pages.map((_, i)=>leaf('kb-page-leaf', '', 'soft'));
  const endLeaf = leaf('kb-end-leaf', `<div class="kb-scale"><div class="kb-endpaper paper-${esc(o.paper||'plain')}"><span class="hand">${total ? `The end, for now • ${plural(total, 'page')}` : 'No pages yet'}</span></div></div>`, 'hard');
  const leaves = [coverLeaf, ...pageLeaves, endLeaf];

  stage.innerHTML = `<div class="kb-desk"></div>`;
  const desk = stage.querySelector('.kb-desk');
  let host = null;
  // a fresh book element each start (StPageFlip takes over the one it's given)
  const newHost = ()=>{
    desk.innerHTML = `<div class="kb-book" role="region" aria-roledescription="book" aria-label="${esc(o.book.title || 'Scrapbook')}"></div>`;
    host = desk.querySelector('.kb-book');
    // taps on things inside a page (photos, places, ratings) go to the book screen
    host.addEventListener('click', e=>o.onAction && o.onAction(e));
  };

  const fill = (i)=>{   // i: index into pages
    const el = pageLeaves[i]; if (!el || el.dataset.filled) return;
    el.dataset.filled = '1';
    el.innerHTML = `<div class="kb-scale">${pageHTML(pages[i], { book:o.book, n:i+1, total, paper:o.paper })}</div>`;
  };
  // the open page now; its neighbours (and their map postcards) when the phone is idle, so a turn never waits
  const idle = window.requestIdleCallback ? fn=>requestIdleCallback(fn, { timeout:400 }) : fn=>setTimeout(fn, 60);
  let pending = 0;
  const near = (i)=>{
    fill(i);
    const open = pageLeaves[i]; if (open){ hydrateMaps(open); developIn(open); }
    const job = ++pending;
    const order = []; for (let d = 1; d <= NEAR; d++){ order.push(i+d, i-d); }
    const step = ()=>{ if (job !== pending || destroyed) return; const k = order.shift(); if (k == null) return;
      if (k >= 0 && k < total && !pageLeaves[k].dataset.filled){ fill(k); hydrateMaps(pageLeaves[k]); }
      idle(step); };
    idle(step);
  };
  const fit = ()=>{
    const w = desk.clientWidth, h = desk.clientHeight;
    scale = Math.max(0.3, Math.min(w / PAGE_W, h / PAGE_H));
    stage.style.setProperty('--kb-s', scale);
    stage.style.setProperty('--kb-w', Math.floor(PAGE_W*scale) + 'px');
    stage.style.setProperty('--kb-h', Math.floor(PAGE_H*scale) + 'px');
  };
  // leaf index (0 = cover) <-> page index
  const toPage = li => li - 1;
  const announce = ()=>{ o.onPage && o.onPage(cur); };
  const settle = (li, quiet)=>{
    const was = cur; cur = toPage(li);
    near(Math.max(0, Math.min(total-1, cur)));
    pageLeaves.forEach((l, k)=>{ const pg = l.querySelector('.kb-page'); if (pg) pg.classList.toggle('open', k===cur); });
    if (!quiet && was !== cur) moments.pageTurn();
    announce();
  };

  // ---- the page curl ----
  const curl = async ()=>{
    const PageFlip = await loadLib();
    if (destroyed) return false;
    if (!PageFlip) return false;
    leaves.forEach(l=>host.appendChild(l));
    pf = new PageFlip(host, { width:Math.floor(PAGE_W*scale), height:Math.floor(PAGE_H*scale), size:'fixed', showCover:true, usePortrait:true,
      drawShadow:true, maxShadowOpacity:0.45, flippingTime:650, mobileScrollSupport:false, disableFlipByClick:true, clickEventForward:true,
      swipeDistance:24, showPageCorners:false, startPage:0, autoSize:false });
    pf.loadFromHTML(leaves);
    pf.on('flip', e=>settle(e.data));
    return true;
  };
  // ---- the cross-fade fallback (reduced motion, or no library) ----
  let fadeAt = 0;
  const fade = ()=>{
    host.classList.add('kb-fade');
    leaves.forEach(l=>host.appendChild(l));
    const show = (li)=>{ li = Math.max(0, Math.min(leaves.length-1, li)); leaves.forEach((l, k)=>l.classList.toggle('on', k===li)); fadeAt = li; settle(li); };
    // swipe to turn
    let x0 = null;
    host.addEventListener('pointerdown', e=>{ x0 = e.clientX; });
    host.addEventListener('pointerup', e=>{ if (x0===null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 48) show(fadeAt + (dx < 0 ? 1 : -1)); });
    return show;
  };
  let fadeShow = null;
  const api = {
    get index(){ return cur; }, total,
    turnTo(i, quiet){   // i: page index; -1 is the cover
      const li = Math.max(0, Math.min(leaves.length-1, i+1));
      if (pf){ if (quiet) { pf.turnToPage(li); settle(li, true); } else pf.flip(li); }
      else if (fadeShow) fadeShow(li);
    },
    next(){ if (pf) pf.flipNext(); else if (fadeShow) fadeShow(fadeAt+1); },
    prev(){ if (pf) pf.flipPrev(); else if (fadeShow) fadeShow(fadeAt-1); },
    pageEl(i){ fill(i); return pageLeaves[i] && pageLeaves[i].querySelector('.kb-page'); },
    lock(on){ stage.classList.toggle('kb-locked', !!on); },
    destroy(){ destroyed = true; try{ pf && pf.destroy(); }catch(_){} pf = null; removeEventListener('resize', onResize); },
  };
  let rt = null;
  const onResize = ()=>{ if (!stage.isConnected) return api.destroy(); clearTimeout(rt); rt = setTimeout(()=>{ const at = cur; api.destroy(); destroyed = false; addEventListener('resize', onResize); start(at, true); }, 250); };
  // open the cover (unless we're starting at a page): the cover swings from the spine
  const start = async (at, quiet)=>{
    fit();
    newHost();
    // the closed cover straight away, while the page curl loads
    host.appendChild(coverLeaf); coverLeaf.classList.add('kb-waiting');
    const ok = !reduceMotion() && await curl();
    coverLeaf.classList.remove('kb-waiting');
    if (destroyed) return;
    if (!ok) fadeShow = fade();
    if (at != null && at >= 0){ near(at); api.turnTo(at, true); return; }
    settle(0, true);
    if (!quiet && total){ setTimeout(()=>{ if (destroyed) return; moments.bookOpen(); near(0); api.next(); }, reduceMotion() ? 200 : 450); }
  };
  addEventListener('resize', onResize);
  start(o.startAt);
  return api;
}

// the controls under the book: previous, where you are (also a slider), next, and the newest page
export function pagerHTML(){
  return `<div class="kb-pager">
    <button class="icon-btn" data-kb="prev" aria-label="Previous page">${icon('chevron_left')}</button>
    <label class="kb-where"><span class="kb-count" aria-live="polite">Cover</span><input type="range" min="0" max="0" value="0" data-kb="slide" aria-label="Go to page"></label>
    <button class="icon-btn" data-kb="next" aria-label="Next page">${icon('chevron_right')}</button>
    <button class="icon-btn" data-kb="last" aria-label="Newest page">${icon('last_page')}</button>
    <button class="kb-wand" id="kbWand" aria-label="Dress up this page" hidden>${icon('auto_fix_high')}</button>
  </div>`;
}
