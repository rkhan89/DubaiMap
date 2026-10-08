// The landmark card: tap a landmark on the map (anywhere on its sprite) to see its name, one fact,
// and the place in the app if there is one.
import * as S from './store.js';
import { esc } from './data.js';
import { icon, openSheet, back } from './ui.js';
import { go } from './go.js';
import { landmarkById, landmarkCritter } from './landmarks.js';
import { CARDS } from './landmark-cards.js';
import * as MAP from './map.js';

// a place in the app that is this landmark (first name match, ignoring case)
function venueFor(lm){
  const names = (lm.venue || []).map(n=>n.toLowerCase());
  return S.venues().find(v=>names.includes((v.name||'').toLowerCase()))
      || S.venues().find(v=>names.some(n=>(v.name||'').toLowerCase().includes(n)));
}
// the area a landmark is in (the map's own area names)
function areaOf(lm){ const ai = MAP.toAI(lm.lat, lm.lng); return MAP.nearestZone(ai.a, ai.i).label; }
export function openLandmark(id){
  const lm = landmarkById(id); if (!lm) return;
  const v = venueFor(lm), critter = landmarkCritter(id), card = CARDS[lm.sprite];
  // the card's words: the art pack's text where it has some (famous: the fact and its source; otherwise the
  // title and the area), else the landmark's own fact
  const title = (card && card.title) || lm.name;
  let body2 = '';
  if (card && card.famous && card.fact){
    body2 = `<p class="mt8">${esc(card.fact)}</p>`
      + (card.verify ? `<p class="fact-check mt8">${icon('fact_check')}Fact being checked</p>` : '')
      + (card.source ? `<p class="lm-source mt8"><a href="${esc(card.source)}" target="_blank" rel="noopener">Source</a></p>` : '');
  } else if (card){
    body2 = `<p class="mt8 muted">${esc(card.area || areaOf(lm))}</p>`;
  } else body2 = `<p class="mt8">${esc(lm.fact || (lm.kind==='mall' ? `Shopping mall in ${areaOf(lm)}.` : ''))}</p>`;
  // the sprite at a whole-number size that fits ~150 px high
  const k = Math.max(1, Math.floor(150 / lm.size[1]));
  openSheet(body=>{
    body.innerHTML = `<div class="lm-card">
      <div class="lm-art"><img src="map-art/${lm.sprite}.png" alt="" width="${lm.size[0]*k}" height="${lm.size[1]*k}"></div>
      <h2 class="h-lg mt12">${esc(title)}</h2>
      ${body2}
      ${critter ? `<!-- landmark critter (landmarkCritter in landmarks.js): a locked silhouette until you check in here -->
        <div class="lm-critter mt16"><span class="silhouette critter-art" style="background-image:url(${esc(critter.art)})"></span><div><b>A critter lives here</b><span class="muted small">Check in here to find it.</span></div></div>` : ''}
      ${v ? `<button class="btn btn-gold btn-block mt20" id="lmPlace">${icon('storefront')}Open ${esc(v.name)}</button>` : ''}
      <button class="btn btn-soft btn-block mt12" data-x="close">Close</button>
    </div>`;
    if (v) body.querySelector('#lmPlace').onclick = ()=>{ back(); setTimeout(()=>go.place(v.id), 300); };
    body.querySelector('[data-x="close"]').onclick = ()=>back();
  }, { cls:'lm-sheet' });
}
go.landmark = openLandmark;
