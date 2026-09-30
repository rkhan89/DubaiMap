// Development only: ?synthetic=500 fills the map with N extra places so the map's level of
// detail can be tested at scale. Nothing here is ever saved (the store goes read-only).
import { ZONES, onLand } from './map.js';
import { CATEGORIES } from './data.js';

const BUSY = ['downtown','marina','jumeirah','businessbay','jlt','alquoz','difc','karama','deira','burdubai','barsha','jvc','citywalk','satwa','alseef'];
const A = ['Little','Golden','Salt','Saffron','Olive','Cardamom','Urban','Desert','Old Town','Harbour','Midnight','Sunset','Rose','Copper','Palm','Date','Karak','Pistachio'];
const B = ['Kitchen','Bakehouse','Cafe','Roasters','Grill','Tea House','Diner','Shawarma','Dessert Bar','Canteen','Bistro','Social','Corner','Pantry','Cafeteria','Supper Club'];

function rng(seed){ return ()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

export function synthesize(db, n, { meId, circle }){
  const r = rng(42), gauss = ()=>{ let u=0,v=0; while(!u) u=r(); while(!v) v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
  const zones = ZONES.flatMap(z=>BUSY.includes(z.id) ? [z,z,z,z] : [z]);
  const friends = circle.filter(id=>id!==meId);
  const cats = CATEGORIES.map(c=>c.id);
  const now = Date.now(), day = 864e5;
  let made = 0, guard = 0;
  while (made < n && guard++ < n*40){
    const z = zones[Math.floor(r()*zones.length)];
    const lat = z.lat + gauss()*0.006, lng = z.lng + gauss()*0.006;
    if (!onLand(lat, lng)) continue;
    const id = 'syn-v'+made;
    db.venues[id] = { id, name:`${A[Math.floor(r()*A.length)]} ${B[Math.floor(r()*B.length)]}`, zone:z.id,
      categories:[cats[Math.floor(r()*cats.length)]], lat, lng, address:'', createdBy:null, createdAt:now, seed:false };
    const roll = r(), entry = (userId, extra)=>{
      const eid = 'syn-e'+Object.keys(db.entries).length;
      db.entries[eid] = { id:eid, venueId:id, userId, kind:'visit', rating:Math.round((3+r()*2)*2)/2, notes:'', date:'2026-09-01',
        private:false, createdAt:now - Math.floor(r()*60)*day - Math.floor(r()*day), ...extra };
    };
    const friend = ()=>friends.length ? friends[Math.floor(r()*friends.length)] : meId;
    if (roll < 0.55) entry(friend());
    else if (roll < 0.72){ entry(meId); if (r()<0.4) entry(friend()); }
    else if (roll < 0.82) entry(friend(), { kind:'want', rating:0 });
    else if (roll < 0.88) entry(meId, { private:true });
    else if (roll < 0.94) entry(meId, { kind:'want', rating:0 });
    else { entry(friend()); entry(friend()); }
    made++;
  }
  return made;
}
