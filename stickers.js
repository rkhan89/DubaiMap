// The sticker catalogue: what's in decorate mode's tray, what's unlocked, and how each sticker is drawn.
//   Starter     a disc for each of the 13 kinds of place, and the tape rolls (6 colours, 2 patterns): everyone
//   Milestones  the milestone stickers (badges.js), unlocked as today
//   Critters    each critter you've caught, die-cut with a white border
//   Districts   a passport stamp for each area of the map, unlocked by your first visit logged there
//   Mine        food cutouts from your photos (phase 4, waiting on the cutout approach)
// Locked stickers show greyed out with a one-line hint, so the tray doubles as the collection.
// Keys: "starter:coffee", "milestone:first", "critter:gecko", "district:deira"; tape styles are "gold", "stripes"…
import * as S from './store.js';
import * as MAP from './map.js';
import { CATEGORIES, catById, iconSvg, esc, fmtDate, hashStr } from './data.js';
import { BADGES, badgeStatus, stickerHTML } from './badges.js';
import { CRITTERS, LANDMARK_CRITTERS, critterImg } from './critters.js';

export const TAPES = [
  ['gold','Gold','rgba(232,169,43,.62)'], ['mint','Mint','rgba(156,206,170,.66)'], ['rose','Rose','rgba(242,160,170,.62)'],
  ['sky','Sky','rgba(140,190,232,.62)'], ['kraft','Kraft','rgba(196,160,112,.72)'], ['ink','Ink','rgba(43,29,18,.72)'],
  ['stripes','Stripes',null], ['dots','Dots',null],
];
export const tapeById = id => TAPES.find(t=>t[0]===id) || TAPES[0];

/* ---------- who's unlocked what ---------- */
// the districts you've logged a visit in (your own visits, not ones you were tagged on), with the first date
export function myDistricts(){
  const m = S.me(); if (!m) return new Map();
  const first = new Map();
  S.entries({ userId:m.id, kind:'visit' }).forEach(e=>{ const z = S.venue(e.venueId)?.zone; if (!z) return; const d = first.get(z); if (!d || (e.date||'') < d) first.set(z, e.date); });
  return first;
}
// everything unlocked now, and record any new unlocks (user_stickers) so they're kept with the date
export function unlockedNow(){
  const m = S.me(); if (!m) return new Set();
  const keys = [
    ...badgeStatus(m.id).filter(b=>b.done).map(b=>'milestone:'+b.id),
    ...[...S.caughtIds()].map(id=>'critter:'+id),
    ...[...myDistricts().keys()].map(z=>'district:'+z),
  ];
  S.unlockStickers(keys);
  return new Set([...CATEGORIES.map(c=>'starter:'+c.id), ...keys]);
}

/* ---------- the tray ---------- */
// tab -> [{ key, label, locked, hint }]
export function trayItems(tab, unlocked){
  unlocked = unlocked || unlockedNow();
  if (tab === 'starter') return CATEGORIES.map(c=>({ key:'starter:'+c.id, label:c.label, locked:false }));
  if (tab === 'milestones') return BADGES.map(b=>({ key:'milestone:'+b.id, label:b.name, locked:!unlocked.has('milestone:'+b.id), hint:b.desc }));
  if (tab === 'critters') return [...CRITTERS, ...LANDMARK_CRITTERS].map(c=>({ key:'critter:'+c.id, label:c.name, locked:!unlocked.has('critter:'+c.id), hint:c.landmarkId ? 'Find it at a landmark' : 'Catch it to unlock' }))
    .filter(x=>!x.locked || !LANDMARK_CRITTERS.some(c=>'critter:'+c.id===x.key));   // landmark critters stay secret until found
  if (tab === 'districts') return MAP.ZONES.map(z=>({ key:'district:'+z.id, label:z.label, locked:!unlocked.has('district:'+z.id), hint:`Log a visit in ${z.label}` }))
    .sort((a,b)=>(a.locked - b.locked) || a.label.localeCompare(b.label));
  return [];
}

/* ---------- drawing a sticker ---------- */
// the art for a key, at its natural size (the decoration scales it): a disc, a milestone, a critter, a district stamp
export const STICKER_PX = 64;
export function stickerArt(key, opts){
  opts = opts || {};
  const [src, id] = String(key).split(':');
  if (src === 'starter'){
    const c = catById(id) || CATEGORIES[0];
    return `<span class="sk sk-disc" style="--c:${c.color}">${iconSvg(c.id, '#fff')}</span>`;
  }
  if (src === 'milestone'){
    const b = BADGES.find(x=>x.id===id); if (!b) return '';
    return `<span class="sk sk-milestone">${stickerHTML({ ...b, done:!opts.locked }, STICKER_PX)}</span>`;
  }
  if (src === 'critter'){
    return `<span class="sk sk-critter${opts.locked?' locked':''}"><img src="${esc(critterImg(id))}" alt="" draggable="false"></span>`;
  }
  if (src === 'district'){
    const z = MAP.zoneById(id); if (!z) return '';
    return districtStampHTML(z, opts.date, opts.locked);
  }
  return '';
}
// a passport stamp for an area: its name in capitals, DXB, the date of your first visit there; the shape and ink
// colour are picked from the area's id, styled like the kind-of-place stamps
const INKS = ['#2f5d8a','#8b2f3a','#3c6b3c','#7a4a1c','#5b3f8a','#1f6f6b'];
const SHAPES = ['round','rect','oval','rect'];
export function districtStampHTML(z, date, locked){
  const h = hashStr(z.id), ink = INKS[h % INKS.length], shape = SHAPES[(h >> 3) % SHAPES.length];
  const day = date ? fmtDate(date, { day:'2-digit', month:'short', year:'numeric' }).toUpperCase() : 'DXB';
  const name = z.label.toUpperCase();
  return `<span class="sk sk-district ${shape}${locked?' locked':''}" style="--ink:${ink}"><b class="${name.length > 11 ? 'long' : ''}">${esc(name)}</b><i>${esc(day)}</i></span>`;
}
// a strip of tape between two points on the page (in design px): stretched, turned, with torn ends
export function tapeHTML(style, len){
  const t = tapeById(style);
  return `<span class="sk-tape tape-${esc(t[0])}" style="width:${Math.max(24, Math.round(len))}px;${t[2]?`--tc:${t[2]}`:''}"></span>`;
}
// the tray's swatch for a tape roll
export function tapeRollHTML(style){ const t = tapeById(style); return `<span class="tape-roll tape-${esc(t[0])}" style="${t[2]?`--tc:${t[2]}`:''}"><i></i></span>`; }
