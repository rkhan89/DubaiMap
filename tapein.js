// The "taped in" moment: after a visit is saved, its page drops onto the cover of the book it
// went to (the crew's book if it's shared there, your own if it's Just me) and is taped down.
// About a second; a tap skips it; with reduced motion it's a plain fade. Then a toast that
// opens the page, then any sticker it unlocked.
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import { pageId } from './pages.js';
import { catById, iconSvg, esc, fmtDate, CATEGORIES } from './data.js';
import { icon, toast } from './ui.js';
import { go } from './go.js';

export function tapeIn(entry, done){
  const home = S.homeBookFor(entry), b = home.book;
  if (!b){ done && done(); return; }
  const v = S.venue(entry.venueId), ph = S.photos({ entryId:entry.id })[0];
  const cat = catById(v ? M.primaryCat(v) : 'coffee') || CATEGORIES[0];
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const light = ['#f2cfb4','#fdae7e','#e5a93c'].includes(b.tint);
  const wrap = document.createElement('div');
  wrap.className = 'tapein' + (reduce ? ' calm' : '');
  wrap.setAttribute('role', 'status');
  wrap.innerHTML = `<div class="ti-stage">
      <div class="ti-book" style="background:${esc(b.tint||'#8B5A2B')};${light?'color:var(--ink-on-light)':''}"><span class="ti-rings"><i></i><i></i><i></i></span><span class="ti-title">${esc(b.title)}</span></div>
      <div class="ti-page"><span class="ti-img">${ph ? `<img src="${esc(S.photoURL(ph))}" alt="">` : `<span class="ti-stamp" style="--c:${cat.color}">${iconSvg(cat.id, cat.color)}</span>`}</span>
        <b class="ti-name">${esc(v ? v.name : APP.name)}</b><span class="ti-date">${esc(fmtDate(entry.date,{day:'numeric', month:'short'}))}</span>
        <span class="ti-tape a"></span><span class="ti-tape b"></span></div>
    </div><p class="ti-caption">Taped into ${esc(b.title)}</p>`;
  document.body.appendChild(wrap);
  let over = false;
  const finish = ()=>{
    if (over) return; over = true;
    wrap.classList.add('out');
    setTimeout(()=>wrap.remove(), 220);
    const more = home.others ? ` and ${home.others} more` : '';
    toast(`Taped into ${b.title}${more}`, 'Open page', ()=>go.bookPage && go.bookPage(b.id, pageId(b.id, entry.id)), 4500);
    if (done) setTimeout(done, 400);
  };
  wrap.addEventListener('click', finish);
  requestAnimationFrame(()=>wrap.classList.add('in'));
  setTimeout(finish, reduce ? 900 : 1150);
}
go.tapeIn = tapeIn;
