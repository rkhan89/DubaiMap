// The landmark card (TAP_BEHAVIOUR.md): tap a landmark on the map and a sheet opens with its sprite at a whole-number
// size, its name and area, one fact under "Did you know", and "More" with a bonus fact and its source. Buttons: add a
// pin here (the add flow, prefilled with the landmark's spot) and directions (the phone's maps app). A distance chip
// only if location is already allowed (never asked from here). The Dubai Fountain's chip says when it next plays.
// Facts are bundled (landmark-facts.js) so the card works offline. No points or scores anywhere here.
import * as S from './store.js';
import { esc } from './data.js';
import { icon, openSheet, back } from './ui.js';
import { go } from './go.js';
import { landmarkById, landmarkCritter, SHOW_LANDMARK_CRITTER } from './landmarks.js';
import { factsFor } from './landmark-facts.js';
import { CARDS } from './landmark-cards.js';
import { now } from './shows.js';
import { whereAmI } from './locate.js';
import { haversine } from './catch.js';
import * as MAP from './map.js';

// a place in the app that is this landmark (first name match, ignoring case)
function venueFor(lm){
  const names = (lm.venue || []).map(n=>n.toLowerCase());
  if (!names.length) return null;
  return S.venues().find(v=>names.includes((v.name||'').toLowerCase()))
      || S.venues().find(v=>names.some(n=>(v.name||'').toLowerCase().includes(n)));
}
// the area a landmark is in (the map's own area names)
function areaOf(lm){ const ai = MAP.toAI(lm.lat, lm.lng); return MAP.nearestZone(ai.a, ai.i).label; }

// the Dubai Fountain: "Show on now" during a show, else "Next show HH:MM" (Dubai time), from its schedule
export function fountainChip(sch, at){
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Dubai', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })
    .formatToParts(at || now()).map(p=>[p.type, p.value]));
  const mins = t=>{ const [h, m] = t.split(':').map(Number); return h*60 + m; }, hhmm = m=>String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
  const day = d=>{ const list = (d === 'Fri' ? sch.afternoon.fri : sch.afternoon.satThu).map(mins);
    for (let m = mins(sch.evening.from); m <= mins(sch.evening.to); m += sch.evening.everyMin) list.push(m); return list; };
  const cur = Number(parts.hour)*60 + Number(parts.minute), today = day(parts.weekday);
  if (today.some(m=>cur >= m && cur < m + sch.showMin)) return 'Show on now';
  const next = today.find(m=>m > cur);
  if (next != null) return 'Next show ' + hhmm(next);
  const order = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], tomorrow = order[(order.indexOf(parts.weekday) + 1) % 7];
  return 'Next show ' + hhmm(day(tomorrow)[0]);
}
const fmtKm = m=>m >= 1000 ? (m/1000).toFixed(1) + ' km from you' : Math.round(m) + ' m from you';
const directionsURL = (lat, lng)=>/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document
  ? `https://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export function openLandmark(id){
  const lm = landmarkById(id); if (!lm) return;
  const f = factsFor(id), card = CARDS[lm.sprite], v = venueFor(lm), critter = landmarkCritter(id);
  const name = (f && f.name) || (card && card.title) || lm.name;
  const area = (f && f.area) || (card && card.area) || areaOf(lm);
  const fact = (f && f.fact) || (card && card.famous && card.fact) || lm.fact || '';
  const bonus = f ? f.bonus : null, source = f ? f.source : (card && card.famous ? card.source : null);
  // the sprite at 3x, or the biggest whole size up to that which fits the sheet
  const [w, h] = lm.size, k = Math.max(1, Math.min(3, Math.floor(300/h), Math.floor(330/w)));
  const chip = id === 'dubai_fountain' && f && f.schedule ? fountainChip(f.schedule) : '';
  openSheet(body=>{
    body.innerHTML = `<div class="lm-card">
      <div class="lm-art"><img src="map-art/${esc(lm.sprite)}.png" alt="" width="${w*k}" height="${h*k}"></div>
      <h2 class="h-lg mt12">${esc(name)}</h2>
      <p class="lm-area">${esc(area)}</p>
      <div class="lm-chips">${chip ? `<span class="tag soft lm-show">${icon('water_drop')}<span class="lm-chip-t">${esc(chip)}</span></span>` : ''}<span class="tag soft lm-dist" hidden></span></div>
      ${fact ? `<div class="lm-fact"><span class="eyebrow">Did you know</span><p class="mt4">${esc(fact)}</p>
        ${card && !f && card.verify ? `<p class="fact-check mt8">${icon('fact_check')}Fact being checked</p>` : ''}</div>` : ''}
      ${bonus ? `<details class="lm-more"><summary>More</summary><p class="mt4">${esc(bonus)}</p>${source ? `<p class="lm-source mt8"><a href="${esc(source)}" target="_blank" rel="noopener">Source</a></p>` : ''}</details>`
        : (source && !f ? `<p class="lm-source mt8"><a href="${esc(source)}" target="_blank" rel="noopener">Source</a></p>` : '')}
      ${SHOW_LANDMARK_CRITTER && critter ? `<div class="lm-critter mt16"><span class="silhouette critter-art"></span><div><b>A critter lives here</b><span class="muted small">Check in here to find it.</span></div></div>` : ''}
      <div class="btn-grid mt20"><button class="btn btn-gold" id="lmPin">${icon('add_location_alt')}Add a pin here</button><button class="btn btn-soft" id="lmDir">${icon('directions')}Directions</button></div>
      ${v ? `<button class="btn btn-soft btn-block mt12" id="lmPlace">${icon('storefront')}Open ${esc(v.name)}</button>` : ''}
    </div>`;
    body.querySelector('#lmPin').onclick = ()=>{ back(); setTimeout(()=>go.log({ prefill:{ name, lat:lm.lat, lng:lm.lng } }), 250); };
    body.querySelector('#lmDir').onclick = ()=>window.open(directionsURL(lm.lat, lm.lng), '_blank', 'noopener');
    if (v) body.querySelector('#lmPlace').onclick = ()=>{ back(); setTimeout(()=>go.place(v.id), 300); };
    // how far, only if location is already allowed: never asked from here
    const dist = body.querySelector('.lm-dist');
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name:'geolocation' }).then(p=>{
      if (p.state !== 'granted') return;
      return whereAmI().then(pos=>{ if (!dist.isConnected) return; dist.innerHTML = icon('near_me') + esc(fmtKm(haversine(pos, { lat:lm.lat, lng:lm.lng }))); dist.hidden = false; });
    }).catch(()=>{});
  }, { cls:'lm-sheet' });
}
go.landmark = openLandmark;
