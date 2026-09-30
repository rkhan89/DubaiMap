// Derived views over the store: what each venue looks like for the current map mode,
// who's been, averages, the crew feed. Privacy is enforced by store.canSee(), which every
// query here goes through, so private records can't leak into crew views or totals.
import * as S from './store.js';
import { avg, catById } from './data.js';

// scope: { mode:'me'|'crew', members:Set<userId>|null (null = everyone in crew), privacy:'all'|'shared'|'private',
//          cats:Set|null, status:{been:bool, want:bool} }
export function defaultScope(){ return { mode:'crew', members:null, privacy:'all', cats:null, status:{been:true, want:true} }; }

function inScope(e, scope, meId){
  if (scope.mode==='me' && e.userId!==meId) return false;
  if (scope.mode==='crew' && scope.members && !scope.members.has(e.userId)) return false;
  if (scope.privacy==='shared' && e.private) return false;
  if (scope.privacy==='private' && !e.private) return false;
  return true;
}

// Everything a stamp, list card or place sheet needs about one venue.
export function venueSummary(v, scope, pre){
  const me = S.me(); const meId = me && me.id;
  const all = pre || S.entries({venueId:v.id});                // already privacy-filtered
  const es = all.filter(e=>inScope(e, scope, meId));
  const visits = es.filter(e=>e.kind==='visit'), wants = es.filter(e=>e.kind==='want');
  const mineV = visits.filter(e=>e.userId===meId), mineW = wants.filter(e=>e.userId===meId);
  const visitorIds = [...new Set(visits.map(e=>e.userId))];
  const wantIds = [...new Set(wants.map(e=>e.userId))].filter(id=>!visitorIds.includes(id));
  const ratings = visits.filter(e=>e.rating).map(e=>e.rating);
  const others = visitorIds.filter(id=>id!==meId);
  let state = 'unlit';
  if (visits.length){
    if (scope.mode==='crew' && others.length) state='crew';
    else if (mineV.length && mineV.every(e=>e.private)) state='private';
    else state='visited';
  } else if (wants.length) state = (mineW.length && mineW.every(e=>e.private) && !wantIds.some(id=>id!==meId)) ? 'private' : 'want';
  const latest = es.slice().sort((a,b)=>b.createdAt-a.createdAt)[0] || null;
  const noteEntry = visits.filter(e=>e.notes).sort((a,b)=>b.createdAt-a.createdAt)[0] || null;
  return {
    v, state, entries:es, visits, wants, mineV, mineW,
    visitorIds, wantIds, others,
    rating: ratings.length ? Math.round(avg(ratings)*10)/10 : 0,
    myRating: mineV.filter(e=>e.rating).sort((a,b)=>b.createdAt-a.createdAt)[0]?.rating || 0,
    visitCount: visits.length, myVisitCount: mineV.length,
    latest, noteEntry,
    hasPrivate: all.some(e=>e.userId===meId && e.private),
  };
}

// passes the category and status filters?
export function passes(sum, scope){
  if (scope.cats && !(sum.v.categories||[]).some(c=>scope.cats.has(c))) return false;
  const been = sum.visits.length>0, want = !been && sum.wants.length>0;
  if (!been && !want) return false;
  if (been && !scope.status.been) return false;
  if (want && !scope.status.want) return false;
  return true;
}

// venues with at least one visible entry in scope, plus unlit catalogue venues
export function mapModel(scope){
  const out=[], byVenue=new Map();
  // one pass over the entries instead of one per venue (keeps 500+ places fast)
  for (const e of S.entries()){ if (!byVenue.has(e.venueId)) byVenue.set(e.venueId, []); byVenue.get(e.venueId).push(e); }
  for (const v of S.venues()){
    const sum = venueSummary(v, scope, byVenue.get(v.id) || []);
    if (sum.state==='unlit'){
      if (!scope.cats || (v.categories||[]).some(c=>scope.cats.has(c))) out.push(sum);
    } else if (passes(sum, scope)) out.push(sum);
  }
  return out;
}

// who's in view: me + crew (members filter applies in crew mode)
export function people(){ return S.crewMembers(); }

// crew activity feed, newest first (visible records only)
export function activity(limit){
  const me=S.me(); if (!me) return [];
  const es = S.entries().filter(e=>!e.private || e.userId===me.id);
  return es.sort((a,b)=>b.createdAt-a.createdAt).slice(0, limit||20).map(e=>({ e, u:S.user(e.userId), v:S.venue(e.venueId) })).filter(x=>x.u && x.v);
}

export function counts(scope){
  const model = mapModel(scope).filter(s=>s.state!=='unlit');
  const byZone={}, byCat={};
  model.forEach(s=>{ byZone[s.v.zone]=(byZone[s.v.zone]||0)+1; (s.v.categories||[]).forEach(c=>byCat[c]=(byCat[c]||0)+1); });
  return { total:model.length, byZone, byCat };
}

// places pinned by a person (distinct venues with a visible entry)
export function placesPinned(userId){ return new Set(S.entries({userId}).map(e=>e.venueId)).size; }

export function primaryCat(v){ return catById((v.categories||[])[0]) ? v.categories[0] : 'coffee'; }
