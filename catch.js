// Which critters a check-in catches. Pure (no DOM, no store), so it's tested on its own
// (tests/critters.test.mjs). A check-in is { lat, lng, accuracy (m), venue: bool }.

const R = 6371000;
// distance between two points on the earth, in metres
export function haversine(a, b){
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// how good the phone's location must be for this spot: half its radius, never stricter than the floor
export function accuracyNeeded(spot, cfg){ return Math.max(cfg.accuracyFloorM, spot.radius * cfg.accuracyShare); }

// every critter this check-in catches (not ones you already have), plus why any spot you're in didn't count
// returns { caught:[{ id, spot, distance }], tooVague:[{ id, spot, need }] }
export function critterCheck(pos, spots, have, cfg){
  const caught = [], tooVague = [];
  if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') return { caught, tooVague };
  for (const [id, list] of Object.entries(spots)){
    if (have.has(id) || caught.some(c=>c.id===id)) continue;          // once per critter
    for (const spot of list){
      if (spot.trigger === 'venue' && !pos.venue) continue;          // this one needs a café or venue check-in
      const d = haversine(pos, spot);
      if (d > spot.radius) continue;
      const need = accuracyNeeded(spot, cfg);
      if (!(pos.accuracy <= need)){ if (!tooVague.some(t=>t.id===id)) tooVague.push({ id, spot, need }); continue; }
      caught.push({ id, spot, distance:Math.round(d) });
      break;
    }
  }
  return { caught, tooVague:tooVague.filter(t=>!caught.some(c=>c.id===t.id)) };
}
