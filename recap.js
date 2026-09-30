// Monthly recap card (Phase 2, own design). Drawn on a canvas so the exact same card can be
// shared as an image. It stays on light paper in both themes.
import { APP } from './config.js';
import * as S from './store.js';
import * as MAP from './map.js';
import { userStats, activeMonths, levelFor, leaderboard, thisMonth } from './stats.js';
import { catById, iconSvg, esc, fmtMonth, plural } from './data.js';
import { icon, openScreen, topbar, toast } from './ui.js';
import { go } from './go.js';

const W = 1080, H = 1350;
const INK = '#291709', SOFT = '#6b5c4c', GOLD = '#e5a93c', DEEP = '#7e5700', PAPER = '#fff8f5', PEACH = '#ffe3d0';
const loadImg = src => new Promise(res=>{ if (!src) return res(null); const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = src; });
const svgImg = (svg, size) => loadImg('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`)));
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function cover(c, img, x, y, w, h){ const s = Math.max(w/img.width, h/img.height), sw = w/s, sh = h/s; c.drawImage(img, (img.width-sw)/2, (img.height-sh)/2, sw, sh, x, y, w, h); }
function fit(c, text, max){ let t = text; while (c.measureText(t).width > max && t.length > 3) t = t.slice(0,-2); return t===text ? t : t.trimEnd()+'…'; }

async function drawRecap(canvas, month){
  await document.fonts.ready;
  const me = S.me(), s = userStats(me.id, month), c = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  c.fillStyle = PAPER; c.fillRect(0,0,W,H);
  // dotted paper
  c.fillStyle = 'rgba(126,87,0,0.07)'; for (let x=30;x<W;x+=36) for (let y=30;y<H;y+=36){ c.beginPath(); c.arc(x,y,2.2,0,7); c.fill(); }
  // header
  const mark = await loadImg(APP.brand.wordmark.light);            // 258 x 100: keep its proportions
  if (mark) c.drawImage(mark, 72, 72, 72*2.58*0.9, 72*0.9);
  c.fillStyle = SOFT; c.font = '500 30px "Plus Jakarta Sans"'; c.fillText(APP.tagline + '  ·  ' + fmtMonth(month), 72, 176);
  c.fillStyle = INK; c.font = '900 92px "Nunito Sans"'; c.fillText('My month', 72, 300); c.fillText('in bites', 72, 400);
  // stat tiles
  const tiles = [[s.places,'places'],[s.visits,'visits'],[s.areaCount,'areas'],[s.photos,'photos']];
  tiles.forEach(([n,l],k)=>{
    const x = 72 + k*238, y = 450;
    rr(c, x, y, 216, 170, 28); c.fillStyle = k===0 ? GOLD : PEACH; c.fill();
    c.fillStyle = k===0 ? '#3d2900' : INK; c.font = '900 76px "Nunito Sans"'; c.textAlign = 'center'; c.fillText(String(n), x+108, y+98);
    c.font = '700 24px "Space Mono"'; c.fillText(l.toUpperCase(), x+108, y+142); c.textAlign = 'left';
  });
  // top place: best rated this month, with its photo
  const best = s.visitList.slice().sort((a,b)=>(b.rating||0)-(a.rating||0) || b.createdAt-a.createdAt)[0];
  const bv = best && S.venue(best.venueId);
  const photo = bv && S.photos({venueId:bv.id, userId:me.id})[0];
  const pimg = photo ? await loadImg(S.photoURL(photo)) : null;
  // polaroid
  c.save(); c.translate(90, 680); c.rotate(-0.045);
  c.fillStyle = '#fff'; c.shadowColor = 'rgba(41,23,9,0.18)'; c.shadowBlur = 30; c.shadowOffsetY = 10; c.fillRect(0,0,420,480); c.shadowColor = 'transparent';
  if (pimg) cover(c, pimg, 22, 22, 376, 376);
  else { c.fillStyle = PEACH; c.fillRect(22,22,376,376); if (bv){ const ci = await svgImg(iconSvg((bv.categories||[])[0]||'coffee', DEEP), 200); if (ci) c.drawImage(ci, 110, 110, 200, 200); } }
  c.fillStyle = SOFT; c.font = '700 22px "Space Mono"'; c.fillText(fit(c, bv ? (photo?.caption || bv.name) : 'Your first bite is waiting', 376), 22, 444);
  c.restore();
  c.fillStyle = SOFT; c.font = '700 24px "Space Mono"'; c.fillText('TOP SPOT', 560, 730);
  c.fillStyle = INK; c.font = '900 50px "Nunito Sans"';
  const name = bv ? bv.name : 'Nothing yet';
  const words = name.split(' '); let line = '', y = 792;
  for (const w of words){ const t = line ? line+' '+w : w; if (c.measureText(t).width > 440 && line){ c.fillText(line, 560, y); y += 58; line = w; } else line = t; }
  c.fillText(fit(c, line, 440), 560, y);
  if (best && best.rating){ c.fillStyle = GOLD; c.font = '700 44px "Plus Jakarta Sans"'; c.fillText('★'.repeat(Math.floor(best.rating)) + (best.rating%1?'½':''), 560, y+62); }
  const z = bv && MAP.zoneById(bv.zone);
  if (z){ c.fillStyle = SOFT; c.font = '500 30px "Plus Jakarta Sans"'; c.fillText(z.label, 560, y+112); }
  // favourite kind + level
  const topCat = [...s.cats].sort((a,b)=>b[1]-a[1])[0];
  const lvl = levelFor(userStats(me.id).points);
  const yb = 1210;
  if (topCat){
    const k = catById(topCat[0]), ci = await svgImg(iconSvg(k.id, k.color), 64);
    rr(c, 560, yb-96, 448, 96, 48); c.fillStyle = '#fff'; c.fill();
    if (ci) c.drawImage(ci, 584, yb-80, 64, 64);
    c.fillStyle = INK; c.font = '800 34px "Nunito Sans"'; c.fillText(fit(c, `${k.label} fan`, 320), 664, yb-36);
  }
  c.fillStyle = SOFT; c.font = '700 24px "Space Mono"'; c.fillText(`LEVEL ${lvl.n} · ${lvl.name.toUpperCase()}`, 72, 1250);
  const crew = S.myCrew();
  if (crew && S.crewMembers().length > 1){
    const top = leaderboard(month)[0];
    if (top && top.s.points) { c.font = '500 28px "Plus Jakarta Sans"'; c.fillText(fit(c, `${top.u.id===me.id?'You':top.u.name} topped ${crew.name} this month`, 900), 72, 1296); }
  }
  c.fillStyle = DEEP; c.font = '700 22px "Space Mono"'; c.textAlign = 'right'; c.fillText(location.host.toUpperCase(), W-72, 1296); c.textAlign = 'left';
}

function recapScreen(month){
  const me = S.me(); if (!me) return;
  const months = activeMonths(me.id); if (!months.includes(thisMonth())) months.unshift(thisMonth());
  month = month || months[0];
  openScreen(el=>{
    const paint = async ()=>{
      const s = userStats(me.id, month);
      el.innerHTML = topbar({title:'Your recap', eyebrow:'Month in bites'}) + `<div class="screen-body">
        <div class="month-row mt16">${months.slice(0,12).map(m=>`<button class="month-chip${m===month?' on':''}" data-m="${m}">${esc(fmtMonth(m))}</button>`).join('')}</div>
        <div class="recap-frame paper mt12"><canvas id="rcCanvas" aria-label="Recap card for ${esc(fmtMonth(month))}"></canvas></div>
        ${s.visits ? '' : `<p class="center muted small mt12">No visits logged in ${esc(fmtMonth(month))} yet. Log a place and it shows up here.</p>`}
        <div class="btn-grid mt16"><button class="btn btn-soft" id="rcSave">${icon('download')}Save image</button><button class="btn btn-gold" id="rcShare">${icon('ios_share')}Share</button></div>
      </div>`;
      const cv = el.querySelector('#rcCanvas');
      await drawRecap(cv, month);
      const blob = ()=>new Promise(r=>cv.toBlob(r, 'image/png'));
      const fname = `${APP.name.replace(/\W+/g,'-').toLowerCase()}-${month}.png`;
      const save = async ()=>{ const b = await blob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); };
      el.querySelector('#rcSave').onclick = save;
      el.querySelector('#rcShare').onclick = async ()=>{
        const f = new File([await blob()], fname, {type:'image/png'});
        try{ if (navigator.canShare && navigator.canShare({files:[f]})){ await navigator.share({files:[f], title:`${fmtMonth(month)} in bites`}); return; } }catch(e){ if (e.name==='AbortError') return; }
        await save(); toast('Saved the card to your downloads');
      };
      el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ month = b.dataset.m; paint(); });
    };
    paint();
  });
}
go.recap = recapScreen;
