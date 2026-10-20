// Pictures of pages, made from the same markup the book shows (stickers included), so a share is exactly the page:
//   story card  1080 x 1920 PNG: the page (or both pages of a spread) on the book's paper, the Koko wordmark and
//               "We were here" at the bottom
//   postcard    1200 x 1500 PNG: one photo in a polaroid frame with the district stamp, the date and the place
//   page        720 x 1200 PNG: the page alone (the picture behind a page link)
// People show by first name only. Rendered with modern-screenshot (pinned, from jsdelivr) off screen.
import * as S from './store.js';
import * as MAP from './map.js';
import { APP } from './config.js';
import { esc, fmtDate, tilt } from './data.js';
import { pageHTML, spreadPageHTML, hydrateMaps, PAGE_W, PAGE_H } from './paper.js';
import { districtStampHTML } from './stickers.js';

const LIB = 'https://cdn.jsdelivr.net/npm/modern-screenshot@4.6.7/+esm';
let lib = null;
const loadLib = ()=> lib || (lib = import(LIB).catch(e=>{ lib = null; throw e; }));
const firstName = u => u ? ((u.name||'').trim().split(/\s+/)[0] || u.handle || 'Friend') : 'Friend';

// an off-screen stage of the given design size, filled with html; resolves once images and the map are in
async function stage(w, h, html){
  // a holder off screen, and the stage inside it at its own origin (the stage is what's drawn)
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;';
  const el = document.createElement('div');
  el.className = 'export-stage';
  el.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden;`;
  el.innerHTML = html;
  holder.appendChild(el); document.body.appendChild(holder);
  // first names only
  el.querySelectorAll('.rater[data-user]').forEach(r=>{ const n = r.querySelector('.rp-who'); if (n) n.textContent = firstName(S.user(r.dataset.user)); });
  // icons are a web font that doesn't come along into a picture (its names would show as words): leave them out,
  // with the buttons that are only there to tap
  el.querySelectorAll('.ms, figcaption button, .rp-add, .kb-more').forEach(n=>n.remove());
  el.querySelectorAll('img[loading="lazy"]').forEach(i=>i.loading = 'eager');
  el.querySelectorAll('img[data-develop]').forEach(i=>i.removeAttribute('data-develop'));
  hydrateMaps(el);
  await Promise.all([...el.querySelectorAll('img')].map(i=>i.complete ? null : new Promise(r=>{ i.onload = i.onerror = r; setTimeout(r, 6000); })));
  await new Promise(r=>setTimeout(r, el.querySelector('canvas.kb-map') ? 1600 : 150));
  return el;
}
async function shoot(el, w, h, scale){
  try{
    const { domToBlob } = await loadLib();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return await domToBlob(el, { width:w, height:h, scale, type:'image/png', backgroundColor:null, fetch:{ requestInit:{ mode:'cors', cache:'force-cache' } } });
  } finally { el.parentElement ? el.parentElement.remove() : el.remove(); }
}
// (a book's own share is its cover: target.html)
const pageMarkup = (target, paper)=> target.html ? `<div class="ex-cover">${target.html}</div>` : target.spread
  ? spreadPageHTML(target.spread, target.side || 'L', { paper })
  : pageHTML(target.pg, { book:target.book, n:target.n || 1, paper });

// the page alone, at twice its design size
export async function pageImage(target){
  const paper = target.book.paper || 'plain';
  const el = await stage(PAGE_W, PAGE_H, pageMarkup(target, paper));
  return shoot(el, PAGE_W, PAGE_H, 2);
}
// the 9:16 story card (a spread shows both its pages, side by side)
export async function storyCard(target){
  const paper = target.book.paper || 'plain', W = 360, H = 640;
  const inner = target.spread
    ? `<div class="ex-spread"><div class="ex-page">${spreadPageHTML(target.spread, 'L', { paper })}</div><div class="ex-page">${spreadPageHTML(target.spread, 'R', { paper })}</div></div>`
    : `<div class="ex-one" style="--r:${tilt('story'+(target.pg?.id||''), 3).toFixed(2)}deg">${pageMarkup(target, paper)}</div>`;
  const el = await stage(W, H, `<div class="ex-story paper-${esc(paper)}">${inner}<div class="ex-foot"><span class="ex-wordmark" role="img" aria-label="${esc(APP.name)}"></span><span class="ex-tag">We were here</span></div></div>`);
  return shoot(el, W, H, 3);
}
// a postcard of one photo: polaroid frame, district stamp, the date and the place
export async function postcard(target, photo){
  const e = target.pg && target.pg.entry, v = S.venue(photo.venueId || (e && e.venueId)), z = v && MAP.zoneById(v.zone);
  const date = photo.date || (e && e.date);
  const W = 400, H = 500;
  const el = await stage(W, H, `<div class="ex-postcard">
      <figure class="ex-pc-pol" style="--r:${tilt(photo.id, 4).toFixed(2)}deg"><span class="ex-pc-img"><img src="${esc(S.photoURL(photo))}" alt=""></span><figcaption>${esc(photo.caption || v?.name || '')}</figcaption></figure>
      ${z ? `<span class="ex-pc-stamp">${districtStampHTML(z, date)}</span>` : ''}
      <div class="ex-pc-text"><b>${esc(v?.name || '')}</b><span>${esc(date ? fmtDate(date, { day:'numeric', month:'long', year:'numeric' }) : '')}</span></div>
      <span class="ex-wordmark small" role="img" aria-label="${esc(APP.name)}"></span>
    </div>`);
  return shoot(el, W, H, 3);
}
// hand an image to the phone's share sheet, or save it where sharing files isn't possible
export async function shareImage(blob, name, title){
  const file = new File([blob], name, { type:'image/png' });
  try{ if (navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title }); return 'shared'; } }
  catch(e){ if (e && e.name === 'AbortError') return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
