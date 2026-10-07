// Derived counts for profiles, stickers, goals and recaps.
// Everything is computed from visible records (store.canSee), so a friend's private
// logs never count toward what you can see of them.
import * as S from './store.js';
import { monthKey } from './data.js';

// who was first (earliest shared visit) at each venue in the crew
function firstVisitors(){
  const first = new Map();
  S.entries({kind:'visit'}).filter(e=>!e.private).forEach(e=>{
    const f = first.get(e.venueId);
    if (!f || e.createdAt < f.createdAt) first.set(e.venueId, e);
  });
  return first;
}

// month: 'YYYY-MM' to limit to one month (by visit date), otherwise all time
// until: only what had been logged by that moment (ms), to find when a sticker was earned
export function userStats(userId, month, until){
  const all = S.entries({userId}).filter(e=>!until || e.createdAt<=until).sort((a,b)=>a.createdAt-b.createdAt);
  const inMonth = e => !month || monthKey(e.date || new Date(e.createdAt).toISOString()) === month;
  const visits = all.filter(e=>e.kind==='visit');
  const wants = all.filter(e=>e.kind==='want');
  const first = firstVisitors();
  const perVenue = new Map();
  let firstInCrew = 0, checkins = 0, photoCount = 0;
  const places = new Set(), areas = new Set(), cats = new Map(), catPlaces = new Map(), mVisits = [];
  const photosByEntry = new Map();
  S.photos({userId}).filter(p=>!until || p.createdAt<=until).forEach(p=>photosByEntry.set(p.entryId, (photosByEntry.get(p.entryId)||0)+1));
  for (const e of visits){
    const v = S.venue(e.venueId); if (!v) continue;
    perVenue.set(v.id, (perVenue.get(v.id)||0)+1);
    if (!inMonth(e)) continue;
    mVisits.push(e);
    const ph = photosByEntry.get(e.id)||0;
    if (first.get(v.id)?.id === e.id) firstInCrew++;
    if (e.checkin) checkins++;
    photoCount += ph;
    places.add(v.id); areas.add(v.zone);
    (v.categories||[]).forEach(c=>{ cats.set(c, (cats.get(c)||0)+1); if (!catPlaces.has(c)) catPlaces.set(c, new Set()); catPlaces.get(c).add(v.id); });
  }
  const rated = mVisits.filter(e=>e.rating);
  const reviews = mVisits.filter(e=>e.rating && (e.notes||'').trim().length >= 10).length;
  // new places this period (first ever visit falls inside it)
  const firstEver = new Map(); visits.forEach(e=>{ if (!firstEver.has(e.venueId)) firstEver.set(e.venueId, e); });
  const newPlaces = [...firstEver.values()].filter(inMonth).length;
  // wants you later went to
  const wantedThenVisited = wants.filter(w=>visits.some(v=>v.venueId===w.venueId && v.createdAt > w.createdAt && inMonth(v))).length;
  return {
    userId, month: month||null,
    visits: mVisits.length, places: places.size, newPlaces, areas, areaCount: areas.size,
    cats, catPlaces, photos: photoCount, rated: rated.length, reviews,
    avgRating: rated.length ? rated.reduce((s,e)=>s+e.rating,0)/rated.length : 0,
    wants: wants.filter(inMonth).length, wantedThenVisited,
    firstInCrew, checkins,
    maxRepeat: Math.max(0, ...perVenue.values()),
    visitList: mVisits,
  };
}

export function thisMonth(){ return new Date().toISOString().slice(0,7); }

// months that have any of your visits, newest first
export function activeMonths(userId){
  const set = new Set(S.entries({userId, kind:'visit'}).map(e=>monthKey(e.date)));
  return [...set].filter(Boolean).sort().reverse();
}
