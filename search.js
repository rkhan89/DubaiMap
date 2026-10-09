// Koko search: places and scrapbook entries, by name, area (with its aliases), cuisine, what you had (dish tags),
// notes, captions, scrapbook text, who was there and, when photo tagging is on, what's in the photos (ai tags).
// Pure: no DOM, no store, so it's tested on its own (tests/search.test.mjs). It runs on the phone over what the
// phone already has (everything you and your crews can see): instant, and it works offline.
//
// Every word of the query has to match something. Words that run together into a known phrase ("ice cream",
// "dubai marina") count as one; synonyms count as the same word; small typos still match ("pasat" finds pasta).
// Ranking: your own dish tags and notes, then the place's name, then its area, then the rest, then photo tags;
// ties go to the most recent visit. A match only through a photo's tags is marked "from photo".

const CLASS = { mine:0, name:1, area:2, other:3, photo:4 };

export const norm = s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = s=>norm(s).split(' ').filter(Boolean);

// edit distance with transpositions (optimal string alignment), stopping early past `max`
export function osa(a, b, max){
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length:a.length + 1 }, (_, i)=>[i, ...new Array(b.length).fill(0)]);
  for (let j=1; j<=b.length; j++) d[0][j] = j;
  for (let i=1; i<=a.length; i++){
    let best = Infinity;
    for (let j=1; j<=b.length; j++){
      const c = a[i-1] === b[j-1] ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + c);
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) d[i][j] = Math.min(d[i][j], d[i-2][j-2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}
// pg_trgm's similarity: shared trigrams over all trigrams (each word padded with two spaces in front, one behind)
const trigrams = w=>{ const s = '  ' + w + ' ', t = new Set(); for (let k=0; k<s.length-2; k++) t.add(s.slice(k, k+3)); return t; };
export function similarity(a, b){ const A = trigrams(a), B = trigrams(b); let n = 0; A.forEach(t=>{ if (B.has(t)) n++; }); return n / (A.size + B.size - n); }
const typoBudget = n=>n >= 7 ? 2 : n >= 4 ? 1 : 0;

// does one query term (a word or a phrase) match a word of a field?
function termMatchesWord(term, w, last){
  if (w === term) return true;
  if (term.length >= 3 && w.startsWith(term) && (last || term.length >= 4)) return true;   // still typing, or a stem
  const k = typoBudget(term.length);
  return k > 0 && w.length >= 3 && (osa(term, w, k) <= k || (term.length >= 5 && similarity(term, w) >= 0.45));
}
// does a query term match a field (its words, and its whole text for phrases)?
function termMatches(term, field, last){
  if (term.includes(' ')) return field.text.includes(term) || (field.text.length && osa(term, field.text, typoBudget(term.length)) <= typoBudget(term.length));
  return field.words.some(w=>termMatchesWord(term, w, last));
}
const field = (s)=>{ const t = norm(s); return { text:t, words:t ? t.split(' ') : [] }; };
const tagField = list=>list.map(field);

/* ---------- the data, read once: areas, synonyms, and a record for each place and visit ---------- */
// data: { me, venues, entries, photos, pages, users:id->{name,handle}, areas, synonyms, categories:id->label }
export function buildIndex(data){
  const areas = (data.areas||[]).map(a=>({ ...a, terms:[a.name, ...(a.aliases||[])].map(norm).filter(Boolean) }));
  const areaById = new Map(areas.map(a=>[a.id, a]));
  const synonyms = (data.synonyms||[]).map(g=>g.map(norm).filter(Boolean));
  const catLabel = id=>(data.categories && data.categories[id]) || id;
  const userText = id=>{ const u = data.users && data.users[id]; return u ? [u.name, u.handle].filter(Boolean).join(' ') : ''; };
  const areaOf = v=>venueArea(v, areas);
  const photosBy = new Map(), pagesBy = new Map();
  (data.photos||[]).forEach(p=>{ if (!p.entryId) return; if (!photosBy.has(p.entryId)) photosBy.set(p.entryId, []); photosBy.get(p.entryId).push(p); });
  Object.values(data.pages||{}).forEach(pg=>{ if (!pg.entryId || !pg.note) return; if (!pagesBy.has(pg.entryId)) pagesBy.set(pg.entryId, []); pagesBy.get(pg.entryId).push(pg.note); });
  const venues = new Map((data.venues||[]).map(v=>[v.id, v]));
  // one visit's fields, each with its rank class
  const entryFields = e=>{
    const mine = e.userId === data.me, ps = photosBy.get(e.id) || [], out = [];
    (e.dishTags||[]).forEach(t=>out.push({ f:field(t), c:mine ? CLASS.mine : CLASS.other, tag:true }));
    if (e.notes) out.push({ f:field(e.notes), c:mine ? CLASS.mine : CLASS.other });
    ps.forEach(p=>{ if (p.caption) out.push({ f:field(p.caption), c:CLASS.other }); (p.aiTags||[]).forEach(t=>out.push({ f:field(t), c:CLASS.photo, tag:true, photo:true })); });
    (pagesBy.get(e.id)||[]).forEach(n=>out.push({ f:field(n), c:CLASS.other }));
    [e.userId, ...(e.taggedIds||[])].forEach(id=>{ const t = userText(id); if (t) out.push({ f:field(t), c:CLASS.other }); });
    return out;
  };
  const venueFields = v=>{
    const out = [{ f:field(v.name), c:CLASS.name }];
    (v.categories||[]).forEach(id=>out.push({ f:field(catLabel(id) + ' ' + id), c:CLASS.other }));
    return out;
  };
  const visits = (data.entries||[]).filter(e=>e.kind === 'visit' && venues.has(e.venueId));
  const byVenue = new Map(); visits.forEach(e=>{ if (!byVenue.has(e.venueId)) byVenue.set(e.venueId, []); byVenue.get(e.venueId).push(e); });
  const when = e=>e.date ? Date.parse(e.date) || e.createdAt || 0 : e.createdAt || 0;
  const places = [...venues.values()].map(v=>{
    const es = byVenue.get(v.id) || [], area = areaOf(v);
    return { kind:'place', venue:v, area, fields:[...venueFields(v), ...es.flatMap(entryFields)], recent:Math.max(0, ...es.map(when), v.createdAt||0) };
  });
  const entries = visits.map(e=>{ const v = venues.get(e.venueId), area = areaOf(v);
    return { kind:'entry', entry:e, venue:v, area, fields:[...venueFields(v), ...entryFields(e)], recent:when(e) }; });
  // phrases worth keeping whole when they appear in a query
  const phrases = new Set([...areas.flatMap(a=>a.terms), ...synonyms.flat(), ...[...visits.flatMap(e=>e.dishTags||[]), ...(data.photos||[]).flatMap(p=>p.aiTags||[])].map(norm)].filter(t=>t.includes(' ')));
  return { areas, areaById, synonyms, places, entries, phrases };
}

// a place's area: the nearest area whose centre is within its radius (from the place's coordinates), or its chosen
// zone's area when it has no coordinates; null if it's outside every area
export function venueArea(v, areas){
  if (!v) return null;
  if (typeof v.lat === 'number' && typeof v.lng === 'number'){
    let best = null, bd = Infinity;
    for (const a of areas){ if (typeof a.lat !== 'number') continue; const d = Math.hypot((v.lat - a.lat)*110.57, (v.lng - a.lng)*100.75); if (d <= (a.radius_km || 3) && d < bd){ bd = d; best = a; } }
    return best ? best.id : null;
  }
  const z = areas.find(a=>a.zone_id === v.zone); return z ? z.id : null;
}

/* ---------- the query ---------- */
export function parse(index, q){
  const ws = words(q), out = [];
  for (let i=0; i<ws.length; ){
    let took = 1;
    for (let n=Math.min(4, ws.length - i); n>1; n--){ const p = ws.slice(i, i+n).join(' '); if (index.phrases.has(p)){ out.push(p); took = n; break; } }
    if (took === 1) out.push(ws[i]);
    i += took;
  }
  return out.map((t, k)=>{
    // the word itself, and its synonyms
    const alts = new Set([t]); index.synonyms.forEach(g=>{ if (g.includes(t)) g.forEach(x=>alts.add(x)); });
    // the areas it names (an exact name or alias, or one typo off one), and their neighbours (also_matches)
    const areas = new Set();
    index.areas.forEach(a=>{ if (a.terms.some(x=>x === t || (t.length >= 4 && osa(t, x, 1) <= 1))){ areas.add(a.id); (a.also_matches||[]).forEach(id=>areas.add(id)); } });
    return { t, alts:[...alts], areas, last:k === ws.length - 1 };
  });
}
// how well a record matches every term: the sum of each term's best class, or null if some term matches nothing
function score(rec, terms){
  let total = 0, photoOnly = false;
  for (const term of terms){
    let best = Infinity;
    if (rec.area && term.areas.has(rec.area)) best = CLASS.area;
    for (const fd of rec.fields){
      if (fd.c >= best) continue;
      if (term.alts.some(a=>fd.tag ? (norm(fd.f.text) === a || termMatches(a, fd.f, term.last)) : termMatches(a, fd.f, term.last))) best = fd.c;
    }
    if (best === Infinity) return null;
    if (best === CLASS.photo) photoOnly = true;
    total += best;
  }
  return { total, photoOnly };
}
export function search(index, q){
  const terms = parse(index, q);
  if (!terms.length) return { terms, places:[], entries:[] };
  const run = list=>list.map(r=>{ const s = score(r, terms); return s && { ...r, score:s.total, fromPhoto:s.photoOnly }; }).filter(Boolean)
    .sort((a, b)=>a.score - b.score || b.recent - a.recent);
  return { terms, places:run(index.places), entries:run(index.entries) };
}
