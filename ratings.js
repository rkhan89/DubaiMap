// Place ratings: the one calculation every screen uses (scrapbook pages, Place Details, the map
// peek and stamps, list cards, the monthly recap), so the numbers never disagree.
//
//   per person  = the average of that person's ratings for the place
//   overall     = the average of the per-person ratings, to one decimal, with the number of raters
//
// A visit's ratings: whoever logged it (entries.rating) plus anyone tagged on it who added their
// own (visit_ratings, ratingsOf(entryId)). Which ones count depends on the scope:
//   me       only your ratings (Just me visits too: they're yours)
//   crew     visits shared with that crew by people in it, and ratings from people still in it
//   friends  everything you can see (your personal and Tagged books)
// The server only ever sends ratings you're allowed to see (migration 0009); the scope rules
// here decide which of those belong in a given view. No DOM, no store: tested in tests/ratings.test.mjs.

const round1 = x => Math.round(x * 10) / 10;
const visit = e => e && e.kind === 'visit';

// is this visit part of the crew's view? (shared with it, by someone in it)
export function inCrew(e, crew){
  if (!visit(e) || e.private || !crew || !crew.memberIds.includes(e.userId)) return false;
  return (e.crewIds||[]).length ? e.crewIds.includes(crew.id) : true;   // older visits: shared with the crew
}

// every rating on one visit that counts in this scope: [{ userId, rating, note, logger }]
export function visitRatings(e, scope, w){
  if (!visit(e)) return [];
  if (scope.kind === 'crew' && !inCrew(e, scope.crew)) return [];
  const out = [];
  if (e.rating) out.push({ userId:e.userId, rating:+e.rating, note:'', logger:true });
  const tagged = new Set(e.taggedIds||[]);
  ((w.ratingsOf && w.ratingsOf(e.id)) || []).forEach(r=>{
    if (!r.rating || r.userId === e.userId || !tagged.has(r.userId)) return;
    out.push({ userId:r.userId, rating:+r.rating, note:r.note||'', logger:false });
  });
  return out.filter(r=>{
    if (scope.kind === 'me') return r.userId === w.meId;
    if (scope.kind === 'crew') return scope.crew.memberIds.includes(r.userId);
    return true;
  });
}

// a place's rating from the visits there you can see: { people:[{userId, rating, n}], rating, raters }
export function placeRating(entries, scope, w){
  const per = new Map();
  (entries||[]).forEach(e=>visitRatings(e, scope, w).forEach(r=>{
    const p = per.get(r.userId) || { userId:r.userId, sum:0, n:0 };
    p.sum += r.rating; p.n++; per.set(r.userId, p);
  }));
  const people = [...per.values()].map(p=>({ userId:p.userId, rating:round1(p.sum/p.n), n:p.n, raw:p.sum/p.n }));
  const rating = people.length ? round1(people.reduce((s,p)=>s+p.raw, 0) / people.length) : 0;
  return { people:people.map(({raw, ...p})=>p).sort((a,b)=>b.rating-a.rating), rating, raters:people.length };
}

// "Crew avg ★ 4.3 · 3 ratings" / "★ 4.5 · 1 rating" / "" (nobody yet)
export function ratingText(r, label){
  if (!r || !r.raters) return '';
  const n = r.raters === 1 ? '1 rating' : `${r.raters} ratings`;
  return r.raters === 1 ? `★ ${fmt(r.rating)} · ${n}` : `${label||'Crew'} avg ★ ${fmt(r.rating)} · ${n}`;
}
export const fmt = r => { r = +r || 0; return r % 1 ? r.toFixed(1) : String(r); };

// the people on one visit, each with their own rating for it (null = not rated, or not visible here)
export function visitPeople(e, scope, w){
  if (!e) return [];
  const rs = new Map(visitRatings(e, scope.kind === 'me' ? { kind:'friends' } : scope, w).map(r=>[r.userId, r]));
  return [...new Set([e.userId, ...(e.taggedIds||[])])].map(id=>({ userId:id, rating:rs.get(id)?.rating || null, note:rs.get(id)?.note || '', logger:id===e.userId }));
}
