// Memories on the map screen: a small strip above the map controls that opens the newest
// scrapbook page for the view you're on (Me, or the crew you're looking at), and on days when
// you have one, an "On this day" card instead ("A year ago today you were at Ravi with Kabir").
// The same memory is an entry in the activity bell. In the app only: there are no push alerts.
import * as S from './store.js';
import * as M from './model.js';
import * as P from './pages.js';
import { catById, iconSvg, esc, fmtDate, todayISO, CATEGORIES } from './data.js';
import { icon } from './ui.js';
import { go, state } from './go.js';

const dismissKey = ()=>'koko-otd-dismissed-'+(S.me()?.id||'');
const dismissed = ()=>{ try{ return localStorage.getItem(dismissKey()) || ''; }catch(_){ return ''; } };
export function dismissOnThisDay(){ try{ localStorage.setItem(dismissKey(), todayISO()); }catch(_){} paintStrip(); }

// today's memory, if there is one (ignoring whether the card was dismissed: the bell keeps it)
export function onThisDay(ignoreDismissed){
  if (!S.me()) return null;
  const m = P.onThisDay(todayISO(), S.pagesWorld(), ignoreDismissed ? '' : dismissed());
  if (!m) return null;
  const v = S.venue(m.entry.venueId); if (!v) return null;
  const names = m.withIds.map(S.user).filter(Boolean).map(u=>u.name||u.handle);
  return { ...m, venue:v, text:`you were at ${v.name}${names.length ? ' '+P.withText(names) : ''}` };
}
// the book and page a memory opens: your book for your visits, your Tagged book for the rest
export function openMemory(m){
  const bs = S.books(), mine = m.entry.userId === S.me().id;
  const b = bs.find(x=>x.kind===(mine ? 'personal' : 'tagged')) || bs.find(x=>x.kind==='personal');
  go.bookPage(b.id, P.pageId(b.id, m.entry.id));
}
// the newest page in the view you're on
function latestPage(){
  const bs = S.books(), mode = state.scope && state.scope.mode;
  const b = mode==='crew' ? bs.find(x=>x.kind==='crew') : bs.find(x=>x.kind==='personal');
  if (!b) return null;
  const pg = P.bookPages(b, S.pagesWorld()).find(p=>p.entry);
  return pg ? { book:b, page:pg } : null;
}
const thumb = (photo, venue, date)=>{
  if (photo) return `<span class="ms-thumb"><img src="${esc(S.photoURL(photo))}" alt=""></span>`;
  const c = catById(venue ? M.primaryCat(venue) : 'coffee') || CATEGORIES[0];
  return `<span class="ms-thumb ms-stamp" style="--c:${c.color}">${iconSvg(c.id, c.color)}</span>`;
};

export function paintStrip(){
  const el = document.getElementById('memStrip'); if (!el) return;
  if (!S.me()){ el.hidden = true; return; }
  const m = onThisDay(false);
  if (m){
    const ph = S.photos({ entryId:m.entry.id })[0];
    el.className = 'mem-strip map-ui otd';
    el.innerHTML = `<button class="ms-open" data-ms="otd">${thumb(ph, m.venue, m.entry.date)}<span class="ms-text"><span class="ms-eyebrow">${icon('history')}${esc(m.when)}</span><b class="ms-line">${esc(m.text.charAt(0).toUpperCase()+m.text.slice(1))}</b></span></button>
      <button class="ms-x" data-ms="x" aria-label="Dismiss this memory">${icon('close')}</button>`;
    el.hidden = false;
    el.querySelector('[data-ms="otd"]').onclick = ()=>openMemory(m);
    el.querySelector('[data-ms="x"]').onclick = e=>{ e.stopPropagation(); dismissOnThisDay(); };
    return;
  }
  const lp = latestPage();
  if (!lp){ el.hidden = true; return; }
  const e = lp.page.entry, v = S.venue(e.venueId), ph = lp.page.photos[0];
  el.className = 'mem-strip map-ui';
  el.innerHTML = `<button class="ms-open" data-ms="page">${thumb(ph, v, e.date)}<span class="ms-text"><span class="ms-eyebrow">${icon('auto_stories')}Latest page • ${esc(lp.book.kind==='crew' ? 'crew book' : 'your book')}</span><b class="ms-line">${esc(v ? v.name : 'A visit')} <span class="ms-date">${esc(fmtDate(e.date,{day:'numeric', month:'short'}))}</span></b></span>${icon('chevron_right')}</button>`;
  el.hidden = false;
  el.querySelector('[data-ms="page"]').onclick = ()=>go.bookPage(lp.book.id, lp.page.id);
}
go.paintStrip = paintStrip;
