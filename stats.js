// Derived numbers for profiles, badges, the leaderboard, goals and recaps.
// Everything is computed from visible records (store.canSee), so a friend's private
// logs never count toward what you can see of them.
import * as S from './store.js';
import { monthKey } from './data.js';

// Points, the same formula for everyone: 10 for a new place (4 for a repeat visit),
// +5 for being first in the crew there, +2 per photo, +3 for a check-in.
export const POINTS = { newPlace:10, repeat:4, firstInCrew:5, photo:2, checkin:3 };

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
export function userStats(userId, month){
  const all = S.entries({userId}).sort((a,b)=>a.createdAt-b.createdAt);
  const inMonth = e => !month || monthKey(e.date || new Date(e.createdAt).toISOString()) === month;
  const visits = all.filter(e=>e.kind==='visit');
  const wants = all.filter(e=>e.kind==='want');
  const first = firstVisitors();
  const seen = new Set();                 // venues visited before (all time), for new vs repeat
  const perVenue = new Map();
  let points = 0, firstInCrew = 0, checkins = 0, photoCount = 0;
  const places = new Set(), areas = new Set(), cats = new Map(), catPlaces = new Map(), mVisits = [];
  const photosByEntry = new Map();
  S.photos({userId}).forEach(p=>photosByEntry.set(p.entryId, (photosByEntry.get(p.entryId)||0)+1));
  for (const e of visits){
    const v = S.venue(e.venueId); if (!v) continue;
    const isNew = !seen.has(v.id); seen.add(v.id);
    perVenue.set(v.id, (perVenue.get(v.id)||0)+1);
    if (!inMonth(e)) continue;
    mVisits.push(e);
    const ph = photosByEntry.get(e.id)||0;
    points += (isNew ? POINTS.newPlace : POINTS.repeat) + ph*POINTS.photo + (e.checkin ? POINTS.checkin : 0);
    if (first.get(v.id)?.id === e.id){ points += POINTS.firstInCrew; firstInCrew++; }
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
    firstInCrew, checkins, points,
    maxRepeat: Math.max(0, ...perVenue.values()),
    visitList: mVisits,
  };
}

// levels: a name for every stretch of points
export const LEVELS = [
  [0,'New in town'], [30,'Street snacker'], [80,'Karak regular'], [160,'Food scout'],
  [300,'Neighbourhood insider'], [500,'City taster'], [800,'Bites legend'],
];
export function levelFor(points){
  let i = 0; while (i < LEVELS.length-1 && points >= LEVELS[i+1][0]) i++;
  const [from, name] = LEVELS[i], next = LEVELS[i+1];
  return { n:i+1, name, from, to: next ? next[0] : null, progress: next ? (points-from)/(next[0]-from) : 1 };
}

export function thisMonth(){ return new Date().toISOString().slice(0,7); }

// the crew, ranked by points (month or all time)
export function leaderboard(month){
  return S.crewMembers().map(u=>({ u, s:userStats(u.id, month) }))
    .sort((a,b)=>b.s.points-a.s.points || b.s.places-a.s.places || (a.u.name||'').localeCompare(b.u.name||''));
}

// months that have any of your visits, newest first
export function activeMonths(userId){
  const set = new Set(S.entries({userId, kind:'visit'}).map(e=>monthKey(e.date)));
  return [...set].filter(Boolean).sort().reverse();
}
