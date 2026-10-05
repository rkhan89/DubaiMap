// The monthly recap as a scrapbook spread: an open book with your month (or your crew's) on
// the left page (counts, top places, who was there) and photos taped onto the right page
// (or the places' stamps when there are no photos). Drawn on a canvas so the exact same
// spread can be saved or shared as an image. It stays on light paper in both themes.
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import * as MAP from './map.js';
import * as P from './pages.js';
import { activeMonths, thisMonth } from './stats.js';
import { catById, iconSvg, esc, fmtMonth, fmtDate, plural, CATEGORIES } from './data.js';
import { spriteHead, DEFAULT_AVATAR } from './avatar.js';
import { icon, openScreen, topbar, toast, seg, bindSeg } from './ui.js';
import { go, state } from './go.js';

const W = 1080, H = 1350;
const INK = '#291709', SOFT = '#6b5c4c', GOLD = '#e5a93c', DEEP = '#7e5700', PAPER = '#fffaf3', PAPER2 = '#fbf1e4', LEATHER = '#8B5A2B', TAPE = 'rgba(250,188,77,0.78)';
const loadImg = src => new Promise(res=>{ if (!src) return res(null); const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = src; });
const svgImg = (svg, size) => {
  if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg', `<svg width="${size}" height="${size}"`);
  return loadImg('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));
};
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function cover(c, img, x, y, w, h){ const s = Math.max(w/img.width, h/img.height), sw = w/s, sh = h/s; c.drawImage(img, (img.width-sw)/2, (img.height-sh)/2, sw, sh, x, y, w, h); }
function fit(c, text, max){ let t = String(text); while (c.measureText(t).width > max && t.length > 3) t = t.slice(0,-2); return t===String(text) ? t : t.trimEnd()+'…'; }
function tape(c, x, y, w, rot){ c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = TAPE; c.fillRect(-w/2, -13, w, 26); c.restore(); }
// a wrapped line of text, at most n lines
function wrap(c, text, x, y, max, lh, n){ const words = String(text).split(' '); let line = '', k = 0; for (const w of words){ const t = line ? line+' '+w : w; if (c.measureText(t).width > max && line){ c.fillText(k===n-1 ? fit(c, line+' '+w, max) : line, x, y); y += lh; k++; line = w; if (k>=n) return y; } else line = t; } if (line && k<n){ c.fillText(fit(c, line, max), x, y); y += lh; } return y; }

// a postage stamp with the place's kind on it (for visits with no photos)
async function stampAt(c, cat, x, y, w, h){
  const k = catById(cat) || CATEGORIES[0];
  c.fillStyle = PAPER; c.fillRect(x, y, w, h);
  // perforations
  c.fillStyle = PAPER2; for (let i=x+8;i<x+w;i+=16){ c.beginPath(); c.arc(i, y, 5, 0, 7); c.arc(i, y+h, 5, 0, 7); c.fill(); }
  for (let j=y+8;j<y+h;j+=16){ c.beginPath(); c.arc(x, j, 5, 0, 7); c.arc(x+w, j, 5, 0, 7); c.fill(); }
  c.strokeStyle = k.color; c.lineWidth = 4; c.strokeRect(x+16, y+16, w-32, h-32);
  c.fillStyle = 'rgba(229,169,60,0.10)'; c.fillRect(x+18, y+18, w-36, h-36);
  const ic = await svgImg(iconSvg(k.id, k.color), 160); if (ic) c.drawImage(ic, x+w/2-70, y+h/2-90, 140, 140);
  c.fillStyle = INK; c.font = '700 26px "Space Mono"'; c.textAlign = 'center'; c.fillText(k.label.toUpperCase(), x+w/2, y+h-44); c.textAlign = 'left';
}
async function avatarImg(u){
  const a = (u && u.avatar) || {};
  if (a.photo) return loadImg(a.photo);
  if (a.pixel) return svgImg(spriteHead({ ...DEFAULT_AVATAR, ...a.pixel }, 8), 88);
  return null;
}

async function drawRecap(canvas, month, scope){
  await document.fonts.ready;
  const me = S.me(), w = S.pagesWorld(), d = P.recapData(scope, month, w), c = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  // the table and the open book
  c.fillStyle = '#e9d6bd'; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(126,87,0,0.06)'; for (let x=24;x<W;x+=34) for (let y=24;y<H;y+=34){ c.beginPath(); c.arc(x,y,2,0,7); c.fill(); }
  rr(c, 36, 70, W-72, H-140, 26); c.fillStyle = LEATHER; c.shadowColor = 'rgba(41,23,9,0.3)'; c.shadowBlur = 40; c.shadowOffsetY = 14; c.fill(); c.shadowColor = 'transparent';
  const L = { x:56, y:88, w:(W-112)/2, h:H-176 }, R = { x:W/2, y:88, w:(W-112)/2, h:H-176 };
  c.fillStyle = PAPER; c.fillRect(L.x, L.y, L.w, L.h); c.fillStyle = PAPER2; c.fillRect(R.x, R.y, R.w, R.h);
  // the gutter
  const g = c.createLinearGradient(W/2-40, 0, W/2+40, 0); g.addColorStop(0, 'rgba(41,23,9,0)'); g.addColorStop(.5, 'rgba(41,23,9,0.22)'); g.addColorStop(1, 'rgba(41,23,9,0)');
  c.fillStyle = g; c.fillRect(W/2-40, L.y, 80, L.h);
  // a bookmark ribbon
  c.fillStyle = '#b5451b'; c.beginPath(); c.moveTo(L.x+40, L.y-4); c.lineTo(L.x+84, L.y-4); c.lineTo(L.x+84, L.y+96); c.lineTo(L.x+62, L.y+78); c.lineTo(L.x+40, L.y+96); c.closePath(); c.fill();

  // ---- left page: the month in words ----
  const lx = L.x + 40, lw = L.w - 80;
  const mark = await loadImg(APP.brand.wordmark.light);
  if (mark) c.drawImage(mark, L.x+L.w-40-150, L.y+34, 150, 58);
  c.fillStyle = DEEP; c.font = '700 24px "Space Mono"'; c.fillText(fmtMonth(month).toUpperCase(), lx, L.y+150);
  c.fillStyle = INK; c.font = '900 64px "Nunito Sans"';
  const title = scope.crew ? scope.crew.name : 'My month';
  let y = wrap(c, title, lx, L.y+222, lw, 66, 2);
  c.fillStyle = SOFT; c.font = '500 26px "Plus Jakarta Sans"'; c.fillText(scope.crew ? 'in bites, together' : 'in bites', lx, y-14);
  y += 30;
  // three stamps of numbers
  const nums = [[d.visits, d.visits===1?'visit':'visits'], [d.newPlaces, 'new'], [d.places, d.places===1?'place':'places']];
  nums.forEach(([n, l], k)=>{
    const sx = lx + k*(lw/3), sw = lw/3 - 14;
    c.save(); c.translate(sx + sw/2, y + 64); c.rotate((k-1)*0.04);
    rr(c, -sw/2, -64, sw, 128, 16); c.fillStyle = k===1 ? GOLD : '#ffe3d0'; c.fill();
    c.fillStyle = k===1 ? '#3d2900' : INK; c.textAlign = 'center'; c.font = '900 56px "Nunito Sans"'; c.fillText(String(n), 0, 6);
    c.font = '700 20px "Space Mono"'; c.fillText(l.toUpperCase(), 0, 44); c.restore();
  });
  c.textAlign = 'left'; y += 172;
  // top places
  c.fillStyle = DEEP; c.font = '700 22px "Space Mono"'; c.fillText(d.top.length > 1 ? 'TOP PLACES' : 'TOP PLACE', lx, y); y += 22;
  if (!d.top.length){ c.fillStyle = SOFT; c.font = 'italic 500 26px "Plus Jakarta Sans"'; y = wrap(c, 'Nothing logged yet. Every visit becomes a page.', lx, y+36, lw, 34, 2); }
  for (const [k, t] of d.top.entries()){
    const v = S.venue(t.venueId); if (!v) continue;
    y += 18; c.strokeStyle = 'rgba(126,87,0,0.18)'; c.lineWidth = 2; c.beginPath(); c.moveTo(lx, y); c.lineTo(lx+lw, y); c.stroke();
    const ki = catById(M.primaryCat(v)), ic = await svgImg(iconSvg(ki.id, ki.color), 44);
    if (ic) c.drawImage(ic, lx, y+16, 44, 44);
    c.fillStyle = INK; c.font = '800 30px "Nunito Sans"'; c.fillText(fit(c, `${k+1}. ${v.name}`, lw-60), lx+58, y+44);
    c.fillStyle = SOFT; c.font = '500 21px "Plus Jakarta Sans"';
    c.fillText(fit(c, `${MAP.zoneById(v.zone)?.label||APP.city} • ${plural(t.visits,'visit')}${t.best?' • ★ '+t.best:''}`, lw-60), lx+58, y+74);
    y += 88;
  }
  // who was there
  const people = d.people.map(S.user).filter(Boolean).slice(0, 7);
  if (people.length){
    const py = L.y + L.h - 150;
    c.fillStyle = DEEP; c.font = '700 22px "Space Mono"'; c.fillText(scope.crew ? 'THE CREW THIS MONTH' : 'WITH', lx, py);
    for (const [k, u] of people.entries()){
      const ax = lx + k*58, ay = py + 20;
      c.save(); c.beginPath(); c.arc(ax+28, ay+28, 28, 0, 7); c.closePath(); c.fillStyle = '#f2cfb4'; c.fill(); c.clip();
      const im = await avatarImg(u);
      if (im) c.drawImage(im, ax+2, ay+2, 52, 52);
      else { c.fillStyle = INK; c.font = '800 22px "Nunito Sans"'; c.textAlign = 'center'; c.fillText((u.name||u.handle||'?').slice(0,2).toUpperCase(), ax+28, ay+36); c.textAlign = 'left'; }
      c.restore(); c.strokeStyle = PAPER; c.lineWidth = 4; c.beginPath(); c.arc(ax+28, ay+28, 28, 0, 7); c.stroke();
    }
  }

  // ---- right page: three things taped in (photos, else the places' stamps) ----
  const items = d.photos.map(p=>({ photo:p, venue:S.venue(p.venueId) }));
  for (const t of d.top) if (items.length < 3 && !items.some(i=>i.venue && i.venue.id===t.venueId)) items.push({ venue:S.venue(t.venueId) });
  const spots = [ { x:R.x+70, y:R.y+70, w:340, rot:-0.06 }, { x:R.x+130, y:R.y+460, w:300, rot:0.05 }, { x:R.x+50, y:R.y+800, w:280, rot:-0.03 } ];
  if (!items.length){
    c.fillStyle = SOFT; c.font = 'italic 500 28px "Plus Jakarta Sans"'; c.textAlign = 'center'; c.fillText('Photos and stamps', R.x+R.w/2, R.y+R.h/2-16); c.fillText('land here.', R.x+R.w/2, R.y+R.h/2+22); c.textAlign = 'left';
  }
  for (const [k, it] of items.slice(0, 3).entries()){
    const s = spots[k], pw = s.w, ph = pw * 1.16;
    c.save(); c.translate(s.x + pw/2, s.y + ph/2); c.rotate(s.rot);
    c.shadowColor = 'rgba(41,23,9,0.2)'; c.shadowBlur = 22; c.shadowOffsetY = 8;
    if (it.photo){
      c.fillStyle = '#fff'; c.fillRect(-pw/2, -ph/2, pw, ph); c.shadowColor = 'transparent';
      const img = await loadImg(S.photoURL(it.photo));
      if (img) cover(c, img, -pw/2+16, -ph/2+16, pw-32, pw-32); else { c.fillStyle = '#ffe3d0'; c.fillRect(-pw/2+16, -ph/2+16, pw-32, pw-32); }
      c.fillStyle = SOFT; c.font = '700 20px "Space Mono"'; c.fillText(fit(c, it.photo.caption || (it.venue ? it.venue.name : ''), pw-40), -pw/2+18, ph/2-26);
    } else {
      c.shadowColor = 'transparent';
      await stampAt(c, it.venue ? M.primaryCat(it.venue) : 'coffee', -pw/2, -ph/2, pw, ph-30);
      c.fillStyle = INK; c.font = '800 24px "Nunito Sans"'; c.textAlign = 'center'; c.fillText(fit(c, it.venue ? it.venue.name : '', pw), 0, ph/2+4); c.textAlign = 'left';
    }
    tape(c, 0, -ph/2, 120, -s.rot*3);
    c.restore();
  }
  c.fillStyle = DEEP; c.font = '700 20px "Space Mono"'; c.textAlign = 'right'; c.fillText(location.host.toUpperCase(), R.x+R.w-30, R.y+R.h-30); c.textAlign = 'left';
  return d;
}

function recapScreen(month, which){
  const me = S.me(); if (!me) return;
  const months = activeMonths(me.id); if (!months.includes(thisMonth())) months.unshift(thisMonth());
  month = month || months[0];
  // you, or your crew (the map's view decides where it starts)
  let mode = which || (state.scope && state.scope.mode==='crew' && S.myCrew() ? 'crew' : 'me');
  openScreen(el=>{
    const paint = async ()=>{
      const crew = S.myCrew(), scope = mode==='crew' && crew ? { crew } : {};
      el.innerHTML = topbar({title:'Your month', eyebrow:'Scrapbook spread'}) + `<div class="screen-body">
        ${crew ? seg('rcwho', [['me','Just me','person'],['crew',crew.name,'groups']], mode).replace('class="seg"','class="seg mt16"') : ''}
        <div class="month-row mt12">${months.slice(0,12).map(m=>`<button class="month-chip${m===month?' on':''}" data-m="${m}">${esc(fmtMonth(m))}</button>`).join('')}</div>
        <div class="recap-frame paper mt12"><canvas id="rcCanvas" aria-label="Scrapbook spread for ${esc(fmtMonth(month))}"></canvas></div>
        <p class="center muted small mt12" id="rcNote"></p>
        <div class="btn-grid mt16"><button class="btn btn-soft" id="rcSave">${icon('download')}Save image</button><button class="btn btn-gold" id="rcShare">${icon('ios_share')}Share</button></div>
      </div>`;
      bindSeg(el, 'rcwho', v=>{ mode = v; paint(); });
      const cv = el.querySelector('#rcCanvas');
      const d = await drawRecap(cv, month, scope);
      if (!d.visits) el.querySelector('#rcNote').textContent = `No visits in ${fmtMonth(month)} yet. Log a place and it lands on this spread.`;
      const blob = ()=>new Promise(r=>cv.toBlob(r, 'image/png'));
      const fname = `${APP.name.replace(/\W+/g,'-').toLowerCase()}-${month}${scope.crew?'-crew':''}.png`;
      const save = async ()=>{ const b = await blob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); };
      el.querySelector('#rcSave').onclick = save;
      el.querySelector('#rcShare').onclick = async ()=>{
        const f = new File([await blob()], fname, {type:'image/png'});
        try{ if (navigator.canShare && navigator.canShare({files:[f]})){ await navigator.share({files:[f], title:`${fmtMonth(month)} in bites`}); return; } }catch(e){ if (e.name==='AbortError') return; }
        await save(); toast('Saved the spread to your downloads');
      };
      el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ month = b.dataset.m; paint(); });
    };
    paint();
  });
}
go.recap = recapScreen;
