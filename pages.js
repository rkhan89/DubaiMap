// Scrapbook pages. Every visit is a page in each book it belongs to; nothing about a page is
// stored except how someone dressed it up (store: pages, server: book_pages). So a page can
// never be seen by anyone who can't see its visit, and there's nothing to backfill or duplicate.
//
// Which book a visit belongs in (the same rules as public.page_fits on the server):
//   personal  your own visits
//   tagged    visits someone tagged you on
//   crew      visits shared with that crew, by someone still in it
//   album     any visit you can see (an album is a filter)
//
import { placeRating } from './ratings.js';
// No DOM and no store here, so the rules can be tested on their own (tests/pages.test.mjs).
// "world" is { meId, entries (the visits you can see), photos, pages, crews, venue(id) }.

export const pageId = (bookId, entryId) => bookId + '|' + entryId;
const visit = e => e && e.kind === 'visit';

export function belongs(book, e, w){
  if (!book || !visit(e)) return false;
  if (book.kind === 'personal') return e.userId === book.ownerId;
  if (book.kind === 'tagged') return e.userId !== book.ownerId && (e.taggedIds||[]).includes(book.ownerId);
  if (book.kind === 'crew'){
    if (e.private) return false;
    const crew = (w.crews||{})[book.crewId]; if (!crew || !crew.memberIds.includes(e.userId)) return false;
    // older visits (and the sample crew) have no crewIds: shared with the owner's crew
    return (e.crewIds||[]).length ? e.crewIds.includes(book.crewId) : true;
  }
  return book.kind === 'album';
}

const byNewest = (a, b) => (b.date||'').localeCompare(a.date||'') || (b.createdAt||0) - (a.createdAt||0);

// the pages of a book, newest first: { id, entry, photos, cfg, loose }
export function bookPages(book, w, filter){
  const photosOf = new Map();
  (w.photos||[]).forEach(p=>{ if (p.entryId){ if (!photosOf.has(p.entryId)) photosOf.set(p.entryId, []); photosOf.get(p.entryId).push(p); } });
  let out = (w.entries||[]).filter(e=>belongs(book, e, w)).map(e=>{
    const id = pageId(book.id, e.id), cfg = (w.pages||{})[id] || null;
    let ps = (photosOf.get(e.id)||[]).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const order = cfg && cfg.order || [];
    if (order.length) ps.sort((a,b)=>{ const x=order.indexOf(a.id), y=order.indexOf(b.id); return (x<0?99:x)-(y<0?99:y); });
    return { id, entry:e, photos:ps, cfg, date:e.date, createdAt:e.createdAt };
  });
  // your own photos that aren't on a visit (from before every photo had one): a page per day
  if (book.kind === 'personal'){
    const visits = new Set((w.entries||[]).filter(visit).map(e=>e.id)), days = new Map();
    (w.photos||[]).filter(p=>p.userId===book.ownerId && (!p.entryId || !visits.has(p.entryId)) && !(w.entries||[]).some(e=>e.id===p.entryId && e.kind==='want'))
      .forEach(p=>{ if (!days.has(p.date)) days.set(p.date, []); days.get(p.date).push(p); });
    days.forEach((ps, d)=>out.push({ id:pageId(book.id, 'loose-'+d), entry:null, loose:true, photos:ps, cfg:null, date:d, createdAt:Math.max(...ps.map(p=>p.createdAt||0)), venueId:ps[0].venueId }));
  }
  if (filter) out = filterPages(out, filter, w);
  return out.sort(byNewest);
}

// filters from the book filter sheet (months, kinds, places, who logged it, who you were with, privacy)
export function filterPages(pages, f, w){
  f = f || {};
  const venueOf = p => p.entry ? p.entry.venueId : p.venueId;
  return pages.filter(p=>{
    const e = p.entry;
    if (f.months && f.months.length && !f.months.includes((p.date||'').slice(0,7))) return false;
    if (f.cats && f.cats.length && !((w.venue && w.venue(venueOf(p)) || {}).categories||[]).some(c=>f.cats.includes(c))) return false;
    if (f.venues && f.venues.length && !f.venues.includes(venueOf(p))) return false;
    if (f.members && f.members.length && !(e ? f.members.includes(e.userId) : f.members.includes(w.meId))) return false;
    if (f.tagged && f.tagged.length){ if (!e) return false; const t=e.taggedIds||[]; if (!f.tagged.some(id=>t.includes(id) || (e.userId===id && t.includes(w.meId)))) return false; }
    if (f.privacy==='shared' && (!e || e.private)) return false;
    if (f.privacy==='private' && e && !e.private) return false;
    if (f.withPhotos && !p.photos.length) return false;
    return true;
  });
}

/* ---------- the old per-day page settings ----------
   Before, a book's page was a day, dressed up in book.pages[YYYY-MM-DD]. Each becomes the page
   of that day's visit: the visit whose photo came first on the page, else the day's first
   visit. Rows that already exist are left alone, so running it again changes nothing.
   (The server does the same in 0008_pages.sql; this one is for books kept on this phone.) */
export function legacyPageRows(book, w){
  const rows = [], have = w.pages || {};
  Object.entries(book.pages||{}).forEach(([day, cfg])=>{
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !cfg) return;
    const order = cfg.order || [];
    const firstAt = e => { const xs = (w.photos||[]).filter(p=>p.entryId===e.id).map(p=>order.indexOf(p.id)).filter(i=>i>=0); return xs.length ? Math.min(...xs) : 1e9; };
    const cands = (w.entries||[]).filter(e=>e.date===day && belongs(book, e, w)).sort((a,b)=>firstAt(a)-firstAt(b) || (a.createdAt||0)-(b.createdAt||0));
    const e = cands[0]; if (!e) return;
    const id = pageId(book.id, e.id);
    if (have[id] || rows.some(r=>r.id===id)) return;
    rows.push({ id, bookId:book.id, entryId:e.id, layout:['scrapbook','grid','hero'].includes(cfg.layout)?cfg.layout:'scrapbook',
      order: order.filter(pid=>(w.photos||[]).some(p=>p.id===pid && p.entryId===e.id)), stickers:(cfg.stickers||[]).slice(0,3), note:String(cfg.note||'').slice(0,160) });
  });
  return rows;
}

/* ---------- on this day ----------
   Your own visits and ones you were tagged on (never anyone else's), on this day of the month
   in an earlier month or year. Whole years first (the longest ago), then whole months; then
   ones with photos, then the best rated. Nothing on a day you've dismissed. */
export function onThisDay(today, w, dismissed){
  if (dismissed === today) return null;
  const [ty, tm, td] = today.split('-').map(Number);
  const mine = (w.entries||[]).filter(e=>visit(e) && (e.userId===w.meId || (e.taggedIds||[]).includes(w.meId)) && e.date && e.date < today);
  const photoN = id => (w.photos||[]).filter(p=>p.entryId===id).length;
  const hits = mine.map(e=>{
    const [y, m, d] = e.date.split('-').map(Number);
    if (d !== td) return null;
    const months = (ty - y) * 12 + (tm - m); if (months < 1) return null;
    return { entry:e, years: months % 12 === 0 ? months/12 : 0, months };
  }).filter(Boolean);
  if (!hits.length) return null;
  hits.sort((a,b)=> (b.years - a.years) || (a.years ? 0 : b.months - a.months) || (photoN(b.entry.id) - photoN(a.entry.id)) || ((b.entry.rating||0) - (a.entry.rating||0)) || ((b.entry.createdAt||0) - (a.entry.createdAt||0)));
  const h = hits[0];
  const when = h.years ? (h.years===1 ? 'A year ago today' : `${h.years} years ago today`) : (h.months===1 ? 'A month ago today' : `${h.months} months ago today`);
  // who you were with: whoever logged it (if not you) and everyone tagged, but not you
  const withIds = [...new Set([h.entry.userId, ...(h.entry.taggedIds||[])])].filter(id=>id!==w.meId);
  return { entry:h.entry, when, years:h.years, months:h.months, withIds };
}
// "with Kabir", "with Kabir and Maya", "with Kabir, Maya and 2 more"
export function withText(names){
  if (!names.length) return '';
  if (names.length === 1) return 'with ' + names[0];
  if (names.length === 2) return `with ${names[0]} and ${names[1]}`;
  return `with ${names[0]}, ${names[1]} and ${names.length-2} more`;
}

/* ---------- the crew leaderboard: this month, playful categories ----------
   Counts only visits shared with this crew by people in it, so everyone in the crew sees
   the same board. Each category: { id, title, unit, ic, winner:{userId,n}, runnerUp }. */
const SWEET = ['dessert','icecream','froyo','acai'];
export const CATEGORIES_LB = [
  { id:'dessert', title:'Most dessert runs', unit:['run','runs'], ic:'icecream' },
  { id:'first',   title:'First to find',     unit:['new place','new places'], ic:'flag' },
  { id:'tagged',  title:'Most tagged',       unit:['tag','tags'], ic:'sell' },
  { id:'checkin', title:'Most check-ins',    unit:['check-in','check-ins'], ic:'where_to_vote' },
  { id:'visits',  title:'Most visits',       unit:['visit','visits'], ic:'restaurant' },
];
export function crewVisits(crew, w){ return (w.entries||[]).filter(e=>belongs({ kind:'crew', crewId:crew.id }, e, { ...w, crews:{ ...(w.crews||{}), [crew.id]:crew } })); }
export function leaderboardCategories(crew, month, w){
  const all = crewVisits(crew, w), inM = all.filter(e=>(e.date||'').slice(0,7)===month);
  const tally = () => new Map(crew.memberIds.map(id=>[id, 0]));
  const t = Object.fromEntries(CATEGORIES_LB.map(c=>[c.id, tally()]));
  const add = (k, id, n=1) => { if (t[k].has(id)) t[k].set(id, t[k].get(id)+n); };
  // first crew visit ever at each place (by date, then when it was logged)
  const first = new Map();
  all.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'') || (a.createdAt||0)-(b.createdAt||0)).forEach(e=>{ if (!first.has(e.venueId)) first.set(e.venueId, e); });
  inM.forEach(e=>{
    const v = w.venue ? w.venue(e.venueId) : null;
    add('visits', e.userId);
    if (e.checkin) add('checkin', e.userId);
    if (v && (v.categories||[]).some(c=>SWEET.includes(c))) add('dessert', e.userId);
    if (first.get(e.venueId) === e) add('first', e.userId);
    (e.taggedIds||[]).forEach(id=>add('tagged', id));
  });
  return CATEGORIES_LB.map(c=>{
    const rows = [...t[c.id]].filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1] || String(a[0]).localeCompare(String(b[0])));
    return { ...c, winner: rows[0] ? { userId:rows[0][0], n:rows[0][1] } : null, runnerUp: rows[1] ? { userId:rows[1][0], n:rows[1][1] } : null };
  });
}

/* ---------- crew challenges: three a month, the same for everyone in the crew ----------
   Picked from the crew's id and the month, so nothing needs storing; progress counts the
   crew's shared visits this month. */
const hash = s => { let h = 0; for (let k=0; k<s.length; k++) h = (h*31 + s.charCodeAt(k))>>>0; return h; };
const KIND_CHALLENGES = [['cafeteria','cafeterias'],['karak','karak spots'],['coffee','coffee spots'],['dessert','dessert spots'],['restaurant','restaurants'],['matcha','matcha spots'],['burger','burger joints'],['icecream','ice cream spots'],['shisha','shisha spots'],['pizza','pizza places']];
const OTHER_CHALLENGES = [
  { id:'areas',     ic:'explore',        name:n=>`Eat in ${n} different areas`, n:4, count:(m)=>new Set(m.map(e=>e.zone).filter(Boolean)).size },
  { id:'together',  ic:'group',          name:n=>`${n} visits together`,       n:3, count:(m)=>m.filter(e=>(e.taggedIds||[]).length).length, hint:'Tag who you were with' },
  { id:'breakfast', ic:'free_breakfast', name:n=>`${n} breakfasts out`,        n:3, count:(m)=>m.filter(e=>(e.meals||[]).includes('breakfast')).length },
  { id:'photos',    ic:'photo_camera',   name:n=>`${n} visits with photos`,    n:6, count:(m, w)=>m.filter(e=>(w.photos||[]).some(p=>p.entryId===e.id)).length },
  { id:'newplaces', ic:'add_location_alt', name:n=>`${n} places new to the crew`, n:5, count:(m, w, first)=>m.filter(e=>first.get(e.venueId)===e).length },
];
export function crewChallenges(crew, month, w){
  const all = crewVisits(crew, w).map(e=>({ ...e, zone:(w.venue && w.venue(e.venueId) || {}).zone }));
  const inM = all.filter(e=>(e.date||'').slice(0,7)===month);
  const first = new Map();
  all.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'') || (a.createdAt||0)-(b.createdAt||0)).forEach(e=>{ if (!first.has(e.venueId)) first.set(e.venueId, e); });
  const firstOrig = new Map([...first].map(([k,e])=>[k, inM.find(x=>x.id===e.id)]));
  const h = hash(crew.id + month);
  const [cat, label] = KIND_CHALLENGES[h % KIND_CHALLENGES.length];
  const target = 3 + (h >> 4) % 3;   // 3 to 5
  const newInCat = inM.filter(e=>firstOrig.get(e.venueId)===e && ((w.venue && w.venue(e.venueId) || {}).categories||[]).includes(cat));
  const others = OTHER_CHALLENGES.slice().sort((a,b)=>hash(a.id+month+crew.id)-hash(b.id+month+crew.id)).slice(0,2);
  const list = [
    { id:'kind-'+cat, ic:'category', cat, name:`Try ${target} new ${label}`, target, have:newInCat.length, who:[...new Set(newInCat.map(e=>e.userId))] },
    ...others.map(c=>({ id:c.id, ic:c.ic, name:c.name(c.n), target:c.n, hint:c.hint||'', have:c.count(inM, w, firstOrig), who:[...new Set(inM.map(e=>e.userId))] })),
  ];
  return list.map(c=>({ ...c, have:Math.min(c.have, c.target), pct:Math.min(1, c.have/c.target), done:c.have>=c.target }));
}

/* ---------- the monthly recap spread ----------
   For you (your visits and ones you were tagged on) or a crew (its shared visits). */
export function recapData(scope, month, w){
  const vs = (scope.crew ? crewVisits(scope.crew, w) : (w.entries||[]).filter(e=>visit(e) && (e.userId===w.meId || (e.taggedIds||[]).includes(w.meId))));
  const inM = vs.filter(e=>(e.date||'').slice(0,7)===month).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const before = new Set(vs.filter(e=>(e.date||'') < month+'-01').map(e=>e.venueId));
  const per = new Map();
  inM.forEach(e=>{ const p = per.get(e.venueId) || { venueId:e.venueId, visits:0, best:0, entries:[] }; p.visits++; p.entries.push(e); per.set(e.venueId, p); });
  // the place's rating this month, the same way every screen works it out (ratings.js)
  per.forEach(p=>{ p.best = placeRating(p.entries, scope.crew ? { kind:'crew', crew:scope.crew } : { kind:'me' }, w).rating; });
  const top = [...per.values()].sort((a,b)=>b.visits-a.visits || b.best-a.best).slice(0,3);
  const photos = (w.photos||[]).filter(p=>inM.some(e=>e.id===p.entryId)).sort((a,b)=>{ const ra=(inM.find(e=>e.id===a.entryId)||{}).rating||0, rb=(inM.find(e=>e.id===b.entryId)||{}).rating||0; return rb-ra || (b.createdAt||0)-(a.createdAt||0); });
  // one photo per place where possible
  const picked = [], seenV = new Set();
  photos.forEach(p=>{ if (picked.length<3 && !seenV.has(p.venueId)){ picked.push(p); seenV.add(p.venueId); } });
  photos.forEach(p=>{ if (picked.length<3 && !picked.includes(p)) picked.push(p); });
  const people = scope.crew ? scope.crew.memberIds.filter(id=>inM.some(e=>e.userId===id || (e.taggedIds||[]).includes(id)))
                            : [...new Set(inM.flatMap(e=>[e.userId, ...(e.taggedIds||[])]))].filter(id=>id!==w.meId);
  return { visits:inM.length, places:per.size, newPlaces:[...per.keys()].filter(v=>!before.has(v)).length, top, photos:picked, people, entries:inM };
}
