(function(){
"use strict";

/* =========================================================
   STORAGE
   This build uses localStorage: zero setup, works the moment
   it's hosted on Vercel, but data lives on one browser/phone
   only. If you want it synced across devices, swap the four
   functions in this block for calls to a real backend
   (Supabase's free tier is the easy path: a `places` table
   with the same fields, `supabase.from('places').select()` /
   `.insert()` / `.update()` / `.delete()` in place of the
   localStorage calls below). Everything else in this file is
   storage-agnostic and won't need to change.
   ========================================================= */
const LOCAL_KEY = 'dubai-bites-places-v1';
function loadPlaces(){
  try{ return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; }catch(e){ return []; }
}
function persistPlaces(){
  try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(places)); }
  catch(e){ alert('Could not save: this browser\'s storage is full. Try removing some photos, or export a backup from the List tab.'); }
}
function upsertPlace(data, id){
  if (id){
    const idx = places.findIndex(p=>p.id===id);
    if (idx>-1) places[idx] = {...places[idx], ...data};
  } else {
    const newId = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('p'+Date.now()+Math.random().toString(36).slice(2));
    places.unshift({id:newId, createdAt: Date.now(), ...data});
  }
  persistPlaces();
}
function removePlace(id){
  places = places.filter(p=>p.id!==id);
  persistPlaces();
}

/* =========================================================
   CATEGORIES
   ========================================================= */
const CATEGORIES = [
  {id:'coffee',    label:'Coffee',     color:'#8B5A2B', icon:c=>`<path d="M5 8h11v6.5A3.5 3.5 0 0 1 12.5 18h-4A3.5 3.5 0 0 1 5 14.5V8z" fill="none" stroke="${c}" stroke-width="2"/><path d="M16 9.2c2.4-.3 3.6 1.2 3.6 2.8s-1.2 3-3.6 2.8" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 4.5c-.6.7-.6 1.3 0 2M11 4.5c-.6.7-.6 1.3 0 2" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`},
  {id:'matcha',    label:'Matcha',     color:'#5F8D4E', icon:c=>`<path d="M4 9.5c0 4.5 3.6 8 8 8s8-3.5 8-8" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="9.5" x2="20" y2="9.5" stroke="${c}" stroke-width="2"/><path d="M9 4l.6 4M12 3.5l0 4M15 4l-.6 4" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`},
  {id:'dessert',   label:'Dessert',    color:'#E1699A', icon:c=>`<path d="M7 11h10l-1.4 8.2a1 1 0 0 1-1 .8H9.4a1 1 0 0 1-1-.8L7 11z" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 11c0-2.8 1.8-5 4-5s4 2.2 4 5" fill="none" stroke="${c}" stroke-width="2"/><circle cx="12" cy="4.6" r="1.2" fill="${c}"/>`},
  {id:'burger',    label:'Burger',     color:'#C9622D', icon:c=>`<path d="M5 10.5c0-3 3.1-5.3 7-5.3s7 2.3 7 5.3H5z" fill="none" stroke="${c}" stroke-width="2"/><line x1="4.5" y1="13" x2="19.5" y2="13" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><path d="M5 16.5h14a1.6 1.6 0 0 1-1.6 2.3H6.6A1.6 1.6 0 0 1 5 16.5z" fill="none" stroke="${c}" stroke-width="2"/>`},
  {id:'fastfood',  label:'Fast food',  color:'#D6A72C', icon:c=>`<path d="M7.5 10h9l-1.3 9.4a1 1 0 0 1-1 .8H9.8a1 1 0 0 1-1-.8L7.5 10z" fill="none" stroke="${c}" stroke-width="2"/><line x1="10" y1="4" x2="9.6" y2="10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="3.5" x2="12" y2="10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><line x1="14" y1="4" x2="14.4" y2="10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`},
  {id:'cafeteria', label:'Cafeteria',  color:'#7A8B99', icon:c=>`<rect x="4.5" y="7" width="15" height="10" rx="2" fill="none" stroke="${c}" stroke-width="2"/><line x1="9.5" y1="7" x2="9.5" y2="17" stroke="${c}" stroke-width="1.6"/><line x1="14.5" y1="7" x2="14.5" y2="17" stroke="${c}" stroke-width="1.6"/>`},
  {id:'karak',     label:'Karak',      color:'#B5451B', icon:c=>`<path d="M9 5h6l-.9 11a1.3 1.3 0 0 1-1.3 1.2h-1.6A1.3 1.3 0 0 1 9.9 16L9 5z" fill="none" stroke="${c}" stroke-width="2"/><ellipse cx="12" cy="19" rx="4.5" ry="1.1" fill="none" stroke="${c}" stroke-width="1.6"/>`},
  {id:'pizza',     label:'Pizza',      color:'#D64545', icon:c=>`<path d="M12 4.3 20 19H4L12 4.3z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M5.4 17.3h13.2" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="11" r=".9" fill="${c}"/><circle cx="9.8" cy="14.5" r=".9" fill="${c}"/><circle cx="14.2" cy="14.5" r=".9" fill="${c}"/>`}
];
const catById = id => CATEGORIES.find(c=>c.id===id);
function iconSvg(catId, color){
  const cat = catById(catId); if(!cat) return '';
  return `<svg viewBox="0 0 24 24" fill="none">${cat.icon(color||'#fff')}</svg>`;
}

/* =========================================================
   GEOGRAPHY
   The map is a real (stylised) projection of Dubai. Lat/lng is
   converted to km, then rotated into a frame whose first axis
   runs along the coast (Marina -> Deira) and whose second axis
   points inland. Those two axes are the iso grid's row/col axes,
   which is what puts the coastline on the screen diagonal.
     a = km along the coast from JBR beach, i = km inland
   ========================================================= */
const GEO = { lat0:25.078, lng0:55.131, kx:100.75, ky:110.57, ax:0.604, ay:0.797 };
function toAI(lat,lng){
  const e=(lng-GEO.lng0)*GEO.kx, n=(lat-GEO.lat0)*GEO.ky;
  return { a:e*GEO.ax+n*GEO.ay, i:e*GEO.ay-n*GEO.ax };
}
function toLatLng(a,i){
  const e=a*GEO.ax+i*GEO.ay, n=a*GEO.ay-i*GEO.ax;
  return { lat:GEO.lat0+n/GEO.ky, lng:GEO.lng0+e/GEO.kx };
}
const G = (lat,lng)=>{ const p=toAI(lat,lng); return [p.a,p.i]; };

const T = 0.2;                                   // km per tile
const A_MIN=-3.4, A_MAX=32.6, I_MIN=-9.0, I_MAX=10.2;
const ROWS = Math.round((A_MAX-A_MIN)/T);        // along the coast
const COLS = Math.round((I_MAX-I_MIN)/T);        // inland
const TW=16, TH=8, LIP=3.5, SLAB=16;
const aiToGrid = (a,i)=>({ gx:(i-I_MIN)/T, gy:(A_MAX-a)/T });
const gridToAI = (gx,gy)=>({ a:A_MAX-gy*T, i:I_MIN+gx*T });

const WORLD = (function(){
  const PADX=50, PADTOP=90, PADB=50;
  return {
    ox: ROWS*TW/2 + PADX, oy: PADTOP,
    w: (ROWS+COLS)*TW/2 + PADX*2,
    h: (ROWS+COLS)*TH/2 + PADTOP + SLAB + PADB
  };
})();
function proj(gx,gy){ return { x:(gx-gy)*TW/2 + WORLD.ox, y:(gx+gy)*TH/2 + WORLD.oy }; }
function aiToWorld(a,i){ const g=aiToGrid(a,i); return proj(g.gx,g.gy); }
function worldToAI(x,y){
  const X=x-WORLD.ox, Y=y-WORLD.oy;
  return gridToAI(X/TW + Y/TH, Y/TH - X/TW);
}
function inMap(a,i){ return a>A_MIN && a<A_MAX && i>I_MIN && i<I_MAX; }

/* ---------- small math helpers ---------- */
function lerpPts(pts, x){
  if (x<=pts[0][0]) return pts[0][1];
  for (let k=1;k<pts.length;k++){
    if (x<=pts[k][0]){ const [x0,y0]=pts[k-1], [x1,y1]=pts[k]; return y0+(y1-y0)*(x-x0)/(x1-x0); }
  }
  return pts[pts.length-1][1];
}
function distSeg(px,py, ax,ay, bx,by){
  const dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy;
  let t = L ? ((px-ax)*dx+(py-ay)*dy)/L : 0; t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}
function distLine(a,i, pts){
  let m=Infinity;
  for (let k=1;k<pts.length;k++) m=Math.min(m, distSeg(a,i, pts[k-1][0],pts[k-1][1], pts[k][0],pts[k][1]));
  return m;
}
function mulberry32(s){ return function(){ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hash2(x,y){ let h=Math.imul(x,374761393)+Math.imul(y,668265263)|0; h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967295; }
function vnoise(x,y){
  const x0=Math.floor(x), y0=Math.floor(y), fx=x-x0, fy=y-y0, s=t=>t*t*(3-2*t);
  const a=hash2(x0,y0), b=hash2(x0+1,y0), c=hash2(x0,y0+1), d=hash2(x0+1,y0+1), u=s(fx), v=s(fy);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function shade(hex, f){
  const n=parseInt(hex.slice(1),16);
  const ch=v=>Math.max(0,Math.min(255,Math.round(v*f))).toString(16).padStart(2,'0');
  return '#'+ch((n>>16)&255)+ch((n>>8)&255)+ch(n&255);
}
function hashStr(str){ let h=0; for(let k=0;k<str.length;k++) h=(h*31+str.charCodeAt(k))>>>0; return h; }
function hashOffset(str, range){
  const h=hashStr(str);
  return [ ((h%1000)/1000-0.5)*range, (((h>>>10)%1000)/1000-0.5)*range ];
}

/* =========================================================
   CITY DATA  (all in a/i km; positions from real coordinates)
   ========================================================= */
const COAST = [[-3.4,-0.55],[-2.87,-0.49],[-1,-0.15],[0,0],[1.2,0.1],[2.24,0.05],[3.41,0.35],[5.4,0.6],[9,0.5],
  [12,0.45],[15,0.45],[17.5,0.35],[19.6,0.25],[20.2,-0.2],[21.2,-0.25],[21.8,0.15],[23.5,0.05],[26.6,-0.2],
  [28,0.1],[30,0.35],[32.6,0.5]];
const coastIn = a => lerpPts(COAST,a) + 0.06*Math.sin(a*2.1);

const CREEK = [G(25.2715,55.2880),G(25.2640,55.2970),G(25.2555,55.3060),G(25.2485,55.3150),G(25.2400,55.3260),
  G(25.2300,55.3350),G(25.2160,55.3420),G(25.2030,55.3440),G(25.1930,55.3400)];
const LAGOON = { c:G(25.1930,55.3400), r:0.85 };
const CANAL = [G(25.2160,55.3420),G(25.1990,55.3120),G(25.1890,55.2920),G(25.1850,55.2780),G(25.1870,55.2640),
  G(25.1920,55.2500),G(25.1990,55.2400),G(25.2040,55.2330)];
const MARINA = [G(25.0660,55.1335),G(25.0760,55.1400),G(25.0840,55.1440),G(25.0900,55.1470),G(25.0935,55.1440)];
const BURJ_LAKE = { c:[G(25.1972,55.2744)[0]+0.35, G(25.1972,55.2744)[1]+0.3], r:0.22 };

// Palm Jumeirah: trunk off Al Sufouh, a fan of fronds, and the crescent with Atlantis at its apex
const PALM = { base:[3.43,0.45], hub:[3.56,-1.15], fr0:0.3, fr1:2.35, fronds:15, span:1.72, cr:3.3, crW:0.13, crSpan:1.84 };
function palmAt(a,i){
  const [ha,hi]=PALM.hub;
  if (distSeg(a,i, PALM.base[0],PALM.base[1], ha,hi) < 0.17) return 2;         // trunk
  const da=a-ha, di=i-hi, r=Math.hypot(da,di);
  if (r<0.42) return 2;
  const th=Math.atan2(da,-di);
  if (r>=PALM.fr0 && r<=PALM.fr1 && Math.abs(th)<=PALM.span+0.05){
    const step=(2*PALM.span)/(PALM.fronds-1);
    const thk=-PALM.span+Math.round((th+PALM.span)/step)*step;
    if (Math.abs(th-thk)*r < 0.15) return 1;
  }
  if (Math.abs(r-PALM.cr)<PALM.crW && Math.abs(th)<PALM.crSpan && Math.abs(Math.abs(th)-0.95)>0.07) return 1;
  return 0;
}
const ATLANTIS = [PALM.hub[0], PALM.hub[1]-PALM.cr];

const ISLANDS = [
  {e:G(25.0806,55.1205), rx:0.42, ry:0.3, t:'urban'},     // Bluewaters
  {e:G(25.1412,55.1853), rx:0.14, ry:0.14, t:'beach'},    // Burj Al Arab
  {e:[18.6,-0.8], rx:0.3, ry:0.24, t:'beach'},            // Jumeirah Bay
  {r:[[2.35,3.05],[-0.6,0.12]], t:'urban'},               // Dubai Harbour
  {r:[[24.4,26.0],[-1.0,0.15]], t:'urban'},               // Port Rashid
  {r:[[27.2,28.4],[-1.9,-0.8]], t:'sand'},                // Deira Islands
  {r:[[28.7,31.2],[-2.6,-1.3]], t:'sand'},
  {r:[[29.6,32.2],[-3.9,-3.0]], t:'sand'},
];
const WORLD_ISLES = (function(){
  const rng=mulberry32(7), out=[];
  for (let k=0;k<95;k++){
    const ang=rng()*Math.PI*2, rr=Math.sqrt(rng());
    out.push({a:14.8+Math.cos(ang)*rr*3.0, i:-6.4+Math.sin(ang)*rr*1.8, r:0.09+rng()*0.15});
  }
  return out;
})();

const DISTRICTS = [
  {a:[-2.0,2.1],  i:[0.1,1.15], st:'glass', h:[24,70],  p:0.42},   // Marina + JBR
  {a:[-1.4,1.5],  i:[1.5,2.7],  st:'glass', h:[22,60],  p:0.38},   // JLT
  {a:[2.1,6.2],   i:[0.6,1.9],  st:'mid',   h:[10,22],  p:0.36},   // Media City / Al Sufouh
  {a:[4.6,9.6],   i:[2.3,4.6],  st:'mid',   h:[9,18],   p:0.34},   // Al Barsha
  {a:[6.3,17.6],  i:[0.75,2.5], st:'villa', h:[5,7],    p:0.55},   // Umm Suqeim
  {a:[9.8,16.6],  i:[3.2,6.3],  st:'ind',   h:[6,10],   p:0.5},    // Al Quoz
  {a:[17.6,23.9], i:[0.6,2.35], st:'low',   h:[7,16],   p:0.45},   // Jumeirah / Satwa / City Walk
  {a:[19.4,23.8], i:[2.35,3.5], st:'glass', h:[26,68],  p:0.45},   // SZR / DIFC
  {a:[17.9,20.6], i:[3.1,4.5],  st:'glass', h:[20,54],  p:0.3},    // Downtown
  {a:[16.8,20.6], i:[4.5,6.4],  st:'glass', h:[20,56],  p:0.38},   // Business Bay
  {a:[23.9,26.0], i:[1.7,5.3],  st:'mid',   h:[9,18],   p:0.4},    // Karama / Oud Metha
  {a:[23.9,26.3], i:[0.3,1.7],  st:'low',   h:[8,16],   p:0.55},   // Bur Dubai
  {a:[26.8,32.2], i:[0.4,5.3],  st:'mid',   h:[8,22],   p:0.42},   // Deira
  {a:[26.4,28.4], i:[6.6,8.6],  st:'mid',   h:[10,22],  p:0.32},   // Festival City
  {a:[6.8,11.6],  i:[6.2,9.5],  st:'villa', h:[5,7],    p:0.45},   // Dubai Hills
  {a:[1.2,5.8],   i:[6.1,9.3],  st:'mid',   h:[8,18],   p:0.38},   // JVC
];
const PARKS = [
  {a:[16.0,16.9], i:[3.0,3.6]},    // Safa Park
  {a:[23.6,24.7], i:[2.55,3.7]},   // Zabeel Park (Dubai Frame)
  {a:[8.0,9.4],   i:[6.9,8.3]},    // Dubai Hills Park
  {a:[25.3,25.95],i:[3.6,4.6]},    // Creek Park
];
const AIRPORT = {a:[28.3,30.4], i:[5.4,9.8]};
const RUNWAYS = [{a:29.0, i:[5.7,9.5]}, {a:29.6, i:[5.9,9.5]}];

// roads: 0 highway, 1 major, 2 minor. Width in world px, half-width in km for the building mask.
const RD = [ {w:6.5, km:0.15}, {w:4.4, km:0.1}, {w:3, km:0.07} ];
const ROADS = [
  {k:0, pts:[G(25.035,55.085),G(25.0705,55.1395),G(25.098,55.172),G(25.1185,55.2005),G(25.155,55.229),G(25.185,55.255),G(25.2045,55.2705),G(25.2255,55.2855),G(25.2330,55.2930)]}, // Sheikh Zayed Rd
  {k:0, pts:[G(25.2330,55.2930),G(25.2440,55.3035),G(25.2485,55.3150),G(25.2600,55.3260),G(25.2800,55.3420),G(25.300,55.360)]},  // Al Maktoum Bridge
  {k:0, pts:[G(25.030,55.140),G(25.050,55.165),G(25.080,55.195),G(25.115,55.225),G(25.150,55.245),G(25.175,55.270),G(25.190,55.300),G(25.2150,55.3300),G(25.2350,55.3450),G(25.2600,55.3480)]}, // Al Khail -> Garhoud
  {k:0, pts:[[-3.4,9.7],[24,9.7]]},                                                                   // Mohammed bin Zayed
  {k:1, pts:[[-3.4,-0.1],[0,0.42],[2.2,0.55],[3.4,0.8],[5.4,1.0],[9,0.95],[15,0.9],[17.5,0.8],[19.6,0.7],[21.2,0.62],[23.5,0.5],[26.2,0.45]]}, // Jumeirah Beach Rd
  {k:1, pts:[[26.9,0.3],[28,0.55],[30,0.8],[32.6,0.95]]},                                             // Deira corniche
  {k:1, pts:[[0.6,0.45],[0.6,9.7]]}, {k:1, pts:[[4.15,0.8],[4.15,9.7]]}, {k:1, pts:[[7.9,0.95],[7.9,9.7]]},
  {k:1, pts:[[11.4,0.92],[11.4,9.7]]}, {k:1, pts:[[14.9,0.9],[14.9,6.5]]}, {k:1, pts:[[21.3,0.62],[21.3,6.6]]},
  {k:1, pts:[[23.5,0.5],[23.5,5.5]]}, {k:1, pts:[[25.2,0.45],[25.2,6.0]]}, {k:1, pts:[[28.4,0.6],[28.4,5.4]]},
  {k:1, pts:[[30.6,0.8],[30.6,5.4]]},
  {k:2, pts:[[10.5,1.6],[24.3,1.5]]},                                                                 // Al Wasl Rd
  {k:2, pts:[[3.5,0.85],[3.56,-1.05]]},                                                                // Palm trunk
  {k:2, pts:[[8.87,-0.05],[8.87,0.95]]},                                                               // Burj Al Arab bridge
  {k:2, pts:[G(25.0806,55.1205),[-0.1,0.2]]},                                                         // Bluewaters bridge
  {k:2, pts:[[18.6,-0.6],[18.6,0.8]]},                                                                 // Jumeirah Bay bridge
];

const LANDMARKS = [
  {k:'burj',     at:G(25.1972,55.2744), name:'Burj Khalifa'},
  {k:'mall',     at:G(25.1985,55.2796)},
  {k:'baa',      at:G(25.1412,55.1853), name:'Burj Al Arab'},
  {k:'ain',      at:G(25.0797,55.1198), name:'Ain Dubai'},
  {k:'frame',    at:G(25.2353,55.3003), name:'Dubai Frame'},
  {k:'motf',     at:G(25.2192,55.2819), name:'Museum of the Future'},
  {k:'atlantis', at:ATLANTIS, name:'Atlantis'},
  {k:'moe',      at:[G(25.1181,55.2006)[0], G(25.1181,55.2006)[1]+0.35]},
  {k:'terminal', at:[30.05,6.9]},
];

/* =========================================================
   AREAS  (what a place is filed under; also map labels)
   ========================================================= */
const ZONES = [
  {id:'marina',      label:'Dubai Marina',  lat:25.0805, lng:55.1403},
  {id:'jbr',         label:'JBR',           lat:25.0780, lng:55.1340},
  {id:'jlt',         label:'JLT',           lat:25.0693, lng:55.1440},
  {id:'bluewaters',  label:'Bluewaters',    lat:25.0806, lng:55.1205},
  {id:'palm',        label:'Palm Jumeirah', lat:25.1124, lng:55.1390},
  {id:'mediacity',   label:'Media City',    lat:25.0950, lng:55.1560},
  {id:'barsha',      label:'Al Barsha',     lat:25.1100, lng:55.2000},
  {id:'umsuqeim',    label:'Umm Suqeim',    lat:25.1500, lng:55.2080},
  {id:'alquoz',      label:'Al Quoz',       lat:25.1400, lng:55.2300},
  {id:'dubaihills',  label:'Dubai Hills',   lat:25.1050, lng:55.2450},
  {id:'jvc',         label:'JVC',           lat:25.0600, lng:55.2100},
  {id:'jumeirah',    label:'Jumeirah',      lat:25.2030, lng:55.2500},
  {id:'lamer',       label:'La Mer',        lat:25.2280, lng:55.2530},
  {id:'citywalk',    label:'City Walk',     lat:25.2060, lng:55.2630},
  {id:'downtown',    label:'Downtown',      lat:25.1950, lng:55.2750},
  {id:'difc',        label:'DIFC',          lat:25.2130, lng:55.2810},
  {id:'businessbay', label:'Business Bay',  lat:25.1850, lng:55.2800},
  {id:'karama',      label:'Karama',        lat:25.2450, lng:55.3050},
  {id:'burdubai',    label:'Bur Dubai',     lat:25.2600, lng:55.2950},
  {id:'deira',       label:'Deira',         lat:25.2700, lng:55.3200},
  {id:'festivalcity',label:'Festival City', lat:25.2230, lng:55.3520},
];
ZONES.forEach(z=>{ const p=toAI(z.lat,z.lng); z.a=p.a; z.i=p.i; });
const zoneById = id => ZONES.find(z=>z.id===id);
function nearestZone(a,i){
  let best=ZONES[0], bd=Infinity;
  ZONES.forEach(z=>{ const d=Math.hypot(z.a-a, z.i-i); if(d<bd){bd=d; best=z;} });
  return best;
}
// tier 0 always visible, 1 when zoomed in a bit, 2 when zoomed in close
const LABELS = [
  {t:'Arabian Gulf', a:7.5, i:-6.6, tier:0, sea:true},
  {t:'The World', a:14.8, i:-8.6, tier:1, sea:true},
  {t:'Dubai Creek', a:26.25, i:4.9, tier:2, sea:true},
  ...['palm','marina','downtown','deira'].map(id=>({z:id, tier:0})),
  ...['jlt','barsha','alquoz','jumeirah','businessbay','karama','burdubai','dubaihills','jvc','umsuqeim','festivalcity'].map(id=>({z:id, tier:1})),
  ...['jbr','bluewaters','mediacity','citywalk','difc','lamer'].map(id=>({z:id, tier:2})),
  {t:'DXB Airport', a:29.3, i:9.9, tier:1},
  ...LANDMARKS.filter(l=>l.name).map(l=>({t:l.name, a:l.at[0], i:l.at[1], tier:2, lm:true})),
].map(l=>{ if (l.z){ const z=zoneById(l.z); return {t:z.label, a:z.a, i:z.i+0.35, tier:l.tier}; } return l; });

/* =========================================================
   TERRAIN RASTER
   ========================================================= */
const W_SEA=0, W_SHALLOW=1, L_BEACH=2, L_SAND=3, L_DUNE=4, L_URBAN=5, L_PARK=6, W_CANAL=7, L_TARMAC=8, L_PALM=9;
const TILE_COLORS = ['#58C8BF','#78D7CC','#F6DDA8','#EDC586','#E0AE6C','#EBD3A7','#8CC46B','#4DB6B3','#CEC7BD','#F3D89F'];
const isWaterT = t => t===W_SEA || t===W_SHALLOW || t===W_CANAL;
const tType = new Uint8Array(ROWS*COLS);
const roadMask = new Uint8Array(ROWS*COLS);
const reserved = new Uint8Array(ROWS*COLS);
const inRect = (a,i,R)=> a>=R.a[0] && a<=R.a[1] && i>=R.i[0] && i<=R.i[1];

function buildTerrain(){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const {a,i} = gridToAI(c+0.5, r+0.5);
    const ci = coastIn(a);
    let t = i < ci ? W_SEA : L_SAND;
    if (t===W_SEA){
      const pm = palmAt(a,i);
      if (pm) t = L_PALM;
      else {
        for (const is of ISLANDS){
          const hit = is.e ? (((a-is.e[0])/is.rx)**2 + ((i-is.e[1])/is.ry)**2 < 1)
                           : (a>=is.r[0][0] && a<=is.r[0][1] && i>=is.r[1][0] && i<=is.r[1][1]);
          if (hit){ t = is.t==='urban' ? L_URBAN : is.t==='sand' ? L_SAND : L_BEACH; break; }
        }
        if (t===W_SEA && a>11 && a<19 && i<-4 && i>-8.8){
          for (const w of WORLD_ISLES){ if (Math.hypot(a-w.a, i-w.i) < w.r){ t=L_BEACH; break; } }
        }
      }
    } else {
      if (i-ci < 0.28) t = L_BEACH;
      else if (vnoise(a*0.55+3, i*0.55+7)*0.65 + vnoise(a*1.3, i*1.3)*0.35 > 0.62) t = L_DUNE;
      if (t!==L_BEACH){
        if (DISTRICTS.some(d=>inRect(a,i,d))) t = L_URBAN;
        if (PARKS.some(p=>inRect(a,i,p))) t = L_PARK;
        if (inRect(a,i,AIRPORT)) t = L_TARMAC;
      }
      if (distLine(a,i,CREEK) < 0.21 || Math.hypot(a-LAGOON.c[0], i-LAGOON.c[1]) < LAGOON.r
          || distLine(a,i,CANAL) < 0.12 || distLine(a,i,MARINA) < 0.14
          || Math.hypot(a-BURJ_LAKE.c[0], i-BURJ_LAKE.c[1]) < BURJ_LAKE.r) t = W_CANAL;
    }
    tType[r*COLS+c] = t;
    if (!isWaterT(t)){
      for (const rd of ROADS){ if (distLine(a,i,rd.pts) < RD[rd.k].km+0.06){ roadMask[r*COLS+c]=1; break; } }
    }
  }
  // shallow water: open sea within ~0.4 km of land
  const R=2;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    if (tType[r*COLS+c]!==W_SEA) continue;
    let near=false;
    for (let dr=-R;dr<=R && !near;dr++) for (let dc=-R;dc<=R;dc++){
      const rr=r+dr, cc=c+dc;
      if (rr<0||cc<0||rr>=ROWS||cc>=COLS) continue;
      const t=tType[rr*COLS+cc];
      if (!isWaterT(t)){ near=true; break; }
    }
    if (near) tType[r*COLS+c]=W_SHALLOW;
  }
}

/* =========================================================
   OBJECTS  (buildings, trees, boats, landmarks) — depth sorted
   ========================================================= */
const OBJECTS = [];
const PAL = {
  glass: ['#8FC3DB','#6FAACB','#A7D0E2','#7FB0C8','#9DBFD0','#B7C9D6','#E3CFA8'],
  mid:   ['#EAD7B7','#E3C9A0','#F0E2C8','#D9BF96','#E8CDB0','#F2D9B5'],
  low:   ['#F1E3C9','#E9D3AE','#F4E8D4','#E2C8A2'],
  villa: ['#F7EEDC','#F2E4CB','#EFE0C6'],
  ind:   ['#D8CFC2','#CFC3B1','#E0D8CC','#C8BCA8'],
};
const ROOFS = ['#D98C5F','#C9764E','#E3A071','#F7EEDC','#F7EEDC'];

function tileWorld(c,r){ return proj(c+0.5, r+0.5); }
function reserveAround(a,i,rad){
  const g=aiToGrid(a,i), c0=Math.floor(g.gx), r0=Math.floor(g.gy);
  for (let dr=-rad;dr<=rad;dr++) for (let dc=-rad;dc<=rad;dc++){
    const r=r0+dr, c=c0+dc; if (r>=0&&c>=0&&r<ROWS&&c<COLS) reserved[r*COLS+c]=1;
  }
}

function buildObjects(){
  LANDMARKS.forEach(l=>{
    const rad = l.k==='mall'||l.k==='terminal'||l.k==='atlantis'||l.k==='burj' ? 2 : 1;
    reserveAround(l.at[0], l.at[1], rad);
    const g=aiToGrid(l.at[0], l.at[1]), p=proj(g.gx,g.gy);
    OBJECTS.push({k:'lm', lm:l.k, x:p.x, y:p.y, d:g.gx+g.gy+0.9});
  });

  const addBox = (c,r,st,h,rng)=>{
    const p = tileWorld(c,r), pal = PAL[st], base = pal[Math.floor(rng()*pal.length)];
    const s = st==='villa' ? 0.28 : st==='ind' ? 0.4 : st==='glass' ? 0.3 : 0.34;
    const sx = st==='ind' ? s : s - rng()*0.05, sy = st==='ind' ? s*0.8 : s - rng()*0.05;
    const roof = st==='villa' ? ROOFS[Math.floor(rng()*ROOFS.length)] : null;
    OBJECTS.push({k:'box', x:p.x, y:p.y, hx:sx, hy:sy, h, st, d:c+r+1,
      opts:{ top:roof||shade(base,1.07), left:shade(base,0.9), right:shade(base,0.72),
             floors: st==='glass'?5 : st==='villa'?0 : 4, mullion: st==='glass',
             floorColor: st==='glass'?'rgba(255,255,255,0.3)':undefined }});
  };
  const addTree = (c,r,rng)=>{
    const p = tileWorld(c,r);
    OBJECTS.push({k:'tree', x:p.x+(rng()-0.5)*8, y:p.y+(rng()-0.5)*4, d:c+r+1.05});
  };
  const free = (c,r)=>{ const k=r*COLS+c; return !roadMask[k] && !reserved[k]; };

  DISTRICTS.forEach((d,di)=>{
    const rng = mulberry32(100+di);
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
      const {a,i} = gridToAI(c+0.5,r+0.5);
      if (!inRect(a,i,d)) continue;
      const t = tType[r*COLS+c];
      if (t!==L_URBAN || !free(c,r)) continue;
      const roll = rng();
      if (roll < d.p){
        const h = d.h[0] + Math.pow(rng(),1.6)*(d.h[1]-d.h[0]);
        addBox(c,r,d.st,h,rng);
      } else if ((d.st==='villa' || d.st==='low') && roll < d.p+0.3) addTree(c,r,rng);
    }
  });

  const rng = mulberry32(999);
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const k=r*COLS+c, t=tType[k];
    const {a,i} = gridToAI(c+0.5,r+0.5);
    if (t===L_PALM && free(c,r)){
      const trunk = distSeg(a,i, PALM.base[0],PALM.base[1], PALM.hub[0],PALM.hub[1]) < 0.2;
      if (trunk){ if (rng()<0.6) addBox(c,r,'mid', 10+rng()*14, rng); }
      else if (Math.hypot(a-ATLANTIS[0], i-ATLANTIS[1])>0.6){
        const roll=rng(); if (roll<0.3) addBox(c,r,'villa',5+rng()*2,rng); else if (roll<0.5) addTree(c,r,rng);
      }
    } else if (t===L_PARK && !roadMask[k] && rng()<0.45) addTree(c,r,rng);
    else if (t===L_URBAN && free(c,r) && !DISTRICTS.some(d=>inRect(a,i,d))){
      // islands (Bluewaters, Dubai Harbour, Port Rashid)
      const roll=rng(); if (roll<0.45) addBox(c,r, a>20?'ind':'mid', 8+rng()*16, rng);
    } else if (t===L_BEACH && i>0 && rng()<0.07 && !roadMask[k]) addTree(c,r,rng);
  }

  // boats on the creek, the marina and off the Palm
  const boatAt = (a,i,kind)=>{ const g=aiToGrid(a,i), p=proj(g.gx,g.gy); OBJECTS.push({k:'boat', kind, x:p.x, y:p.y, d:g.gx+g.gy+0.5}); };
  [[0.18,'dhow'],[0.32,'abra'],[0.45,'dhow'],[0.6,'abra']].forEach(([f,kind])=>{
    const seg = CREEK[Math.floor(f*(CREEK.length-1))], nxt = CREEK[Math.floor(f*(CREEK.length-1))+1];
    boatAt((seg[0]+nxt[0])/2, (seg[1]+nxt[1])/2, kind);
  });
  boatAt(MARINA[1][0], MARINA[1][1], 'yacht'); boatAt(MARINA[3][0], MARINA[3][1], 'yacht');
  boatAt(6.2,-1.8,'yacht'); boatAt(11.5,-2.4,'dhow'); boatAt(21.5,-2.2,'yacht'); boatAt(26.4,-1.6,'dhow');

  OBJECTS.sort((p,q)=>p.d-q.d);
}

/* =========================================================
   RENDERING
   ========================================================= */
const OUT = '#4A3B30';
let LW = 0.8;   // outline width in world px (set per render)
const up = (p,h)=>[p[0], p[1]-h];

function polyPath(ctx, pts){
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for (let k=1;k<pts.length;k++) ctx.lineTo(pts[k][0],pts[k][1]);
  ctx.closePath();
}
function face(ctx, pts, fill){ polyPath(ctx,pts); ctx.fillStyle=fill; ctx.fill(); ctx.stroke(); }

// axis-aligned iso box centred on world point (cx,cy); hx/hy = half size in tiles along gx/gy
function isoBox(ctx, cx, cy, hx, hy, z0, h, base, opts){
  opts = opts||{};
  const ax=TW/2*hx, ay=TH/2*hx, bx=-TW/2*hy, by=TH/2*hy;
  const N=[cx-ax-bx, cy-ay-by-z0], E=[cx+ax-bx, cy+ay-by-z0], S=[cx+ax+bx, cy+ay+by-z0], W=[cx-ax+bx, cy-ay+by-z0];
  const left=opts.left||shade(base,0.9), right=opts.right||shade(base,0.72), top=opts.top||shade(base,1.07);
  face(ctx,[W,S,up(S,h),up(W,h)], left);
  face(ctx,[S,E,up(E,h),up(S,h)], right);
  if (opts.floors && h>9){
    ctx.beginPath();
    for (let z=opts.floors; z<h-3; z+=opts.floors){ ctx.moveTo(W[0],W[1]-z); ctx.lineTo(S[0],S[1]-z); ctx.lineTo(E[0],E[1]-z); }
    ctx.save(); ctx.strokeStyle = opts.floorColor || 'rgba(60,40,25,0.16)'; ctx.lineWidth = LW*0.7; ctx.stroke(); ctx.restore();
  }
  if (opts.mullion && h>20){
    ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=LW*0.9; ctx.beginPath();
    const ml=[(W[0]+S[0])/2,(W[1]+S[1])/2], mr=[(S[0]+E[0])/2,(S[1]+E[1])/2];
    ctx.moveTo(ml[0],ml[1]-2); ctx.lineTo(ml[0],ml[1]-h+2); ctx.moveTo(mr[0],mr[1]-2); ctx.lineTo(mr[0],mr[1]-h+2);
    ctx.stroke(); ctx.restore();
  }
  face(ctx,[up(N,h),up(E,h),up(S,h),up(W,h)], top);
  return {N,E,S,W};
}

function drawGround(ctx, view){
  const n = TILE_COLORS.length;
  const tiles = Array.from({length:n}, ()=>new Path2D());
  const faceL = Array.from({length:n}, ()=>new Path2D());
  const faceR = Array.from({length:n}, ()=>new Path2D());
  const waterGrid = new Path2D(), landGrid = new Path2D(), foam = new Path2D();
  const hw=TW/2, hh=TH/2;
  for (let r=0;r<ROWS;r++){
    for (let c=0;c<COLS;c++){
      const x=(c-r)*hw+WORLD.ox, y=(c+r)*hh+WORLD.oy;         // N corner
      if (view && (x+hw<view.x0 || x-hw>view.x1 || y+TH+SLAB<view.y0 || y>view.y1)) continue;
      const k=r*COLS+c, t=tType[k], water=isWaterT(t);
      const p=tiles[t];
      p.moveTo(x,y); p.lineTo(x+hw,y+hh); p.lineTo(x,y+TH); p.lineTo(x-hw,y+hh); p.closePath();
      if (water){ waterGrid.moveTo(x-hw,y+hh); waterGrid.lineTo(x,y); waterGrid.lineTo(x+hw,y+hh); }
      else if (t===L_URBAN || t===L_PARK || t===L_TARMAC){ landGrid.moveTo(x-hw,y+hh); landGrid.lineTo(x,y); landGrid.lineTo(x+hw,y+hh); }
      // coastline foam on the land's back edges
      if (!water){
        if (c>0 && isWaterT(tType[k-1])){ foam.moveTo(x-hw,y+hh); foam.lineTo(x,y); }
        if (r>0 && isWaterT(tType[k-COLS])){ foam.moveTo(x,y); foam.lineTo(x+hw,y+hh); }
      }
      // front faces: a lip where land meets water, the slab at the map's front edges
      const dR = c===COLS-1 ? SLAB : (!water && isWaterT(tType[k+1]) ? LIP : 0);
      if (dR){ const f=faceR[t]; f.moveTo(x,y+TH); f.lineTo(x+hw,y+hh); f.lineTo(x+hw,y+hh+dR); f.lineTo(x,y+TH+dR); f.closePath(); }
      const dL = r===ROWS-1 ? SLAB : (!water && isWaterT(tType[k+COLS]) ? LIP : 0);
      if (dL){ const f=faceL[t]; f.moveTo(x-hw,y+hh); f.lineTo(x,y+TH); f.lineTo(x,y+TH+dL); f.lineTo(x-hw,y+hh+dL); f.closePath(); }
    }
  }
  for (let t=0;t<n;t++){ ctx.fillStyle=TILE_COLORS[t]; ctx.fill(tiles[t]); }
  ctx.lineWidth=LW*0.6;
  ctx.strokeStyle='rgba(255,255,255,0.42)'; ctx.stroke(waterGrid);
  ctx.strokeStyle='rgba(110,80,50,0.14)'; ctx.stroke(landGrid);
  ctx.lineWidth=LW*1.3; ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.stroke(foam);
  ctx.lineWidth=LW*0.8; ctx.strokeStyle=OUT;
  for (let t=0;t<n;t++){
    ctx.fillStyle=shade(TILE_COLORS[t], isWaterT(t)?0.8:0.82); ctx.fill(faceL[t]); ctx.stroke(faceL[t]);
    ctx.fillStyle=shade(TILE_COLORS[t], isWaterT(t)?0.66:0.66); ctx.fill(faceR[t]); ctx.stroke(faceR[t]);
  }
}

let ROADS_W=null, MAP_CLIP=null, RUNWAYS_W=null;
function prepRoads(){
  ROADS_W = ROADS.map(r=>({k:r.k, pts:r.pts.map(([a,i])=>{ const p=aiToWorld(a,i); return [p.x,p.y]; })}));
  const c=[proj(0,0),proj(COLS,0),proj(COLS,ROWS),proj(0,ROWS)];
  MAP_CLIP = new Path2D(); MAP_CLIP.moveTo(c[0].x,c[0].y); c.slice(1).forEach(p=>MAP_CLIP.lineTo(p.x,p.y)); MAP_CLIP.closePath();
  RUNWAYS_W = RUNWAYS.map(rw=>{
    const q=(a,i)=>{ const p=aiToWorld(a,i); return [p.x,p.y]; };
    return { poly:[q(rw.a-0.09,rw.i[0]),q(rw.a+0.09,rw.i[0]),q(rw.a+0.09,rw.i[1]),q(rw.a-0.09,rw.i[1])], line:[q(rw.a,rw.i[0]+0.1),q(rw.a,rw.i[1]-0.1)] };
  });
}
function strokeLine(ctx, pts){ ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let k=1;k<pts.length;k++) ctx.lineTo(pts[k][0],pts[k][1]); ctx.stroke(); }
function drawRoads(ctx){
  ctx.save(); ctx.clip(MAP_CLIP);
  ctx.lineCap='round'; ctx.lineJoin='round';
  RUNWAYS_W.forEach(rw=>{ ctx.lineWidth=LW*0.8; ctx.strokeStyle=OUT; face(ctx, rw.poly, '#B7B0A6'); });
  ctx.setLineDash([4,3]); ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=0.9; RUNWAYS_W.forEach(rw=>strokeLine(ctx, rw.line)); ctx.setLineDash([]);
  [2,1,0].forEach(k=>{ ctx.strokeStyle='#6C5E54'; ctx.lineWidth=RD[k].w+LW*2; ROADS_W.filter(r=>r.k===k).forEach(r=>strokeLine(ctx,r.pts)); });
  [2,1,0].forEach(k=>{ ctx.strokeStyle= k===0 ? '#948A83' : '#A1968E'; ctx.lineWidth=RD[k].w; ROADS_W.filter(r=>r.k===k).forEach(r=>strokeLine(ctx,r.pts)); });
  ctx.setLineDash([3,3]); ctx.strokeStyle='#FBF4E6'; ctx.lineWidth=0.6;
  ROADS_W.filter(r=>r.k<2).forEach(r=>strokeLine(ctx,r.pts));
  ctx.setLineDash([]);
  ctx.restore();
}

/* ---------- landmarks ---------- */
function drawLandmark(ctx, o){
  const x=o.x, y=o.y;
  switch(o.lm){
    case 'burj': {
      const tiers=[[0.62,30],[0.52,30],[0.43,28],[0.34,26],[0.26,24],[0.19,20],[0.13,18]];
      let z=0;
      isoBox(ctx,x,y,0.95,0.95,0,3,'#9BC98A');                              // plaza
      z=3;
      tiers.forEach(([s,h],k)=>{
        isoBox(ctx,x,y,s,s,z,h,'#8CB9D2',{top:'#D6EAF3',left:'#9FC8DD',right:'#6897B6',mullion:true,floors:6,floorColor:'rgba(255,255,255,0.25)'});
        z+=h;
        if (k<tiers.length-1) isoBox(ctx,x,y,s*0.92,s*0.92,z,2.5,'#B98A5E');
        z+=k<tiers.length-1?2.5:0;
      });
      ctx.save(); ctx.lineCap='round';
      ctx.strokeStyle=OUT; ctx.lineWidth=2.8; ctx.beginPath(); ctx.moveTo(x,y-z); ctx.lineTo(x,y-z-46); ctx.stroke();
      ctx.strokeStyle='#E6F1F6'; ctx.lineWidth=1.4; ctx.stroke(); ctx.restore();
      break;
    }
    case 'mall': isoBox(ctx,x,y,1.3,0.9,0,9,'#F1E2C4',{floors:4}); isoBox(ctx,x-4,y-1,0.4,0.4,9,5,'#E7D3AE'); break;
    case 'baa': {
      ctx.save();
      ctx.lineWidth=LW;
      ctx.strokeStyle=OUT; ctx.fillStyle='#F8F5EE';
      ctx.beginPath(); ctx.moveTo(x+5,y-2); ctx.quadraticCurveTo(x-24,y-38,x+3,y-80); ctx.lineTo(x+6,y-74); ctx.lineTo(x+6,y-2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='rgba(120,140,160,0.45)'; ctx.lineWidth=LW*0.6; ctx.beginPath();
      for (let z=10; z<70; z+=7){ const w=Math.max(1,14-Math.abs(z-38)*0.35); ctx.moveTo(x+5,y-z); ctx.lineTo(x+5-w,y-z-2); }
      ctx.stroke();
      ctx.lineCap='round'; ctx.strokeStyle=OUT; ctx.lineWidth=3.4; ctx.beginPath(); ctx.moveTo(x+7,y-1); ctx.lineTo(x+7,y-88); ctx.stroke();
      ctx.strokeStyle='#A9B5C0'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#7FA38A'; ctx.strokeStyle=OUT; ctx.lineWidth=LW; ctx.beginPath(); ctx.ellipse(x-8,y-56,5,2.4,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.restore(); break;
    }
    case 'ain': {
      const cy=y-36, R=30;
      ctx.save(); ctx.lineCap='round';
      ctx.strokeStyle=OUT; ctx.lineWidth=2.6; ctx.beginPath(); ctx.moveTo(x-8,y); ctx.lineTo(x,cy); ctx.lineTo(x+8,y); ctx.stroke();
      ctx.strokeStyle='#D9DDE1'; ctx.lineWidth=1.4; ctx.stroke();
      ctx.strokeStyle='rgba(74,59,48,0.55)'; ctx.lineWidth=0.5; ctx.beginPath();
      for (let k=0;k<12;k++){ const t=k/12*Math.PI*2; ctx.moveTo(x,cy); ctx.lineTo(x+Math.cos(t)*R*0.38, cy+Math.sin(t)*R); } ctx.stroke();
      ctx.strokeStyle=OUT; ctx.lineWidth=3.6; ctx.beginPath(); ctx.ellipse(x,cy,R*0.38,R,0,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle='#F4F6F8'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#E8B84B';
      for (let k=0;k<16;k++){ const t=k/16*Math.PI*2; ctx.beginPath(); ctx.arc(x+Math.cos(t)*R*0.38, cy+Math.sin(t)*R, 1.1, 0, Math.PI*2); ctx.fill(); }
      ctx.restore(); break;
    }
    case 'frame': {
      const gold='#E2B544', o=0.5;
      isoBox(ctx,x,y,0.9,0.5,0,2,'#9BC98A');
      isoBox(ctx,x-TW/2*o,y-TH/2*o,0.13,0.13,2,48,gold,{floors:6});
      isoBox(ctx,x+TW/2*o,y+TH/2*o,0.13,0.13,2,48,gold,{floors:6});
      isoBox(ctx,x,y,o+0.13,0.13,44,7,gold);
      break;
    }
    case 'motf': {
      isoBox(ctx,x,y,0.55,0.55,0,4,'#8FC77A');
      ctx.save(); ctx.lineWidth=LW; ctx.strokeStyle=OUT;
      ctx.fillStyle='#D3D8DE'; ctx.beginPath(); ctx.ellipse(x,y-18,10,13,-0.35,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#8E99A5'; ctx.beginPath(); ctx.ellipse(x+1.5,y-19,4.2,7.2,-0.35,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='rgba(74,59,48,0.35)'; ctx.lineWidth=LW*0.5; ctx.beginPath(); ctx.moveTo(x-6,y-10); ctx.lineTo(x-3,y-26); ctx.moveTo(x+5,y-8); ctx.lineTo(x+8,y-24); ctx.stroke();
      ctx.restore(); break;
    }
    case 'atlantis': {
      const c='#E8A48A';
      isoBox(ctx,x,y,1.6,0.45,0,13,c,{floors:4});
      isoBox(ctx,x-TW/2*0.45,y-TH/2*0.45,0.25,0.3,13,20,c,{floors:4});
      isoBox(ctx,x+TW/2*0.45,y+TH/2*0.45,0.25,0.3,13,20,c,{floors:4});
      isoBox(ctx,x,y,0.7,0.3,31,6,'#F0BCA4');
      break;
    }
    case 'moe': isoBox(ctx,x,y,1.1,0.55,0,11,'#E9DCC6',{top:'#F6FAFC',floors:4}); break;
    case 'terminal':
      isoBox(ctx,x,y,1.6,0.35,0,8,'#E5EBEE',{floors:4});
      isoBox(ctx,x+30,y+6,0.12,0.12,0,28,'#E5EBEE'); isoBox(ctx,x+30,y+6,0.22,0.22,28,5,'#9FC0D6');
      break;
  }
}
function drawTree(ctx,o){
  ctx.strokeStyle=OUT; ctx.lineWidth=LW;
  ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x,o.y-3); ctx.stroke();
  ctx.fillStyle='#6DB35A'; ctx.beginPath(); ctx.arc(o.x,o.y-5,2.7,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.arc(o.x-0.9,o.y-6,1,0,Math.PI*2); ctx.fill();
}
function drawBoat(ctx,o){
  const x=o.x, y=o.y; ctx.strokeStyle=OUT; ctx.lineWidth=LW;
  if (o.kind==='yacht'){
    face(ctx,[[x-6,y-1],[x+6,y-1],[x+4,y+2],[x-4,y+2]],'#FFFFFF'); face(ctx,[[x-2,y-4],[x+3,y-4],[x+3,y-1],[x-2,y-1]],'#D8E4EA');
  } else {
    face(ctx,[[x-6,y-1],[x+6,y-2],[x+4,y+2],[x-4,y+2]],'#A0683A');
    if (o.kind==='dhow') face(ctx,[[x-1,y-2],[x-1,y-13],[x+6,y-3]],'#F5EBD6');
    else face(ctx,[[x-3,y-4],[x+3,y-4],[x+3,y-1],[x-3,y-1]],'#E8C06A');
  }
}
function drawObjects(ctx, view){
  ctx.lineJoin='round';
  for (const o of OBJECTS){
    if (view && (o.x<view.x0-40 || o.x>view.x1+40 || o.y<view.y0-10 || o.y>view.y1+280)) continue;
    ctx.strokeStyle=OUT; ctx.lineWidth=LW;
    if (o.k==='box') isoBox(ctx,o.x,o.y,o.hx,o.hy,0,o.h,null,o.opts);
    else if (o.k==='tree') drawTree(ctx,o);
    else if (o.k==='boat') drawBoat(ctx,o);
    else drawLandmark(ctx,o);
  }
}
function drawScene(ctx, view){
  ctx.lineJoin='round'; ctx.lineCap='butt';
  drawGround(ctx, view);
  drawRoads(ctx);
  drawObjects(ctx, view);
}

/* =========================================================
   STATE
   ========================================================= */
let places = loadPlaces();
let activeCats = new Set(CATEGORIES.map(c=>c.id));
let topRatedOnly = false;
let statusFilter = 'all';
let sortMode = 'recent';
let searchQuery = '';
let editingId = null;
let pendingPhoto = null;
let draft = null;             // {status, zone, lat, lng} while the form is open
let picking = false;
let lastDeleted = null;
let highlightId = null;
let newPinId = null;
let meWorld = null;

const cam = { x:0, y:0, s:1 };
let baseFit = 0.2, MIN_S = 0.15;
const MAX_S = 7;
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =========================================================
   CANVAS + CACHE
   ========================================================= */
const wrap = document.getElementById('mapWrap');
const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');
let dpr = Math.min(window.devicePixelRatio||1, 2);
let cache = null, cacheScale = 1;
let viewW = 0, viewH = 0;
let interacting = false;
let rafPending = false;

function buildCache(){
  const maxPx = 9e6;
  cacheScale = Math.min(1.7, Math.sqrt(maxPx/(WORLD.w*WORLD.h)));
  cache = document.createElement('canvas');
  cache.width = Math.round(WORLD.w*cacheScale); cache.height = Math.round(WORLD.h*cacheScale);
  const c = cache.getContext('2d');
  c.scale(cacheScale, cacheScale);
  LW = 0.75;
  drawScene(c, null);
}

function resizeCanvas(){
  const r = wrap.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  viewW = r.width; viewH = r.height;
  dpr = Math.min(window.devicePixelRatio||1, 2);
  canvas.width = Math.round(viewW*dpr); canvas.height = Math.round(viewH*dpr);
  canvas.style.width = viewW+'px'; canvas.style.height = viewH+'px';
  return true;
}

function requestRender(){ if (!rafPending){ rafPending=true; requestAnimationFrame(render); } }
function render(){
  rafPending = false;
  if (!viewW || !cache) return;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(dpr*cam.s,0,0,dpr*cam.s,dpr*cam.x,dpr*cam.y);
  const needCrisp = cam.s*dpr > cacheScale*1.15;
  const visTiles = (viewW/cam.s)*(viewH/cam.s)/(TW*TH/2);
  // while panning/zooming through busy views use the cached bitmap; redraw crisp once you let go
  if (!needCrisp || (interacting && visTiles > 1100)){
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cache, 0, 0, WORLD.w, WORLD.h);
  } else {
    LW = Math.max(0.22, Math.min(0.8, 1.05/cam.s));
    drawScene(ctx, { x0:-cam.x/cam.s, y0:-cam.y/cam.s, x1:(viewW-cam.x)/cam.s, y1:(viewH-cam.y)/cam.s });
  }
  updateOverlay();
}

/* =========================================================
   CAMERA
   ========================================================= */
const FRAME = (function(){
  // the part of the map worth framing: palm crescent to airport
  const pts=[[-2.4,-4.8],[31.8,-4.8],[31.8,9.9],[-2.4,9.9]].map(([a,i])=>aiToWorld(a,i));
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  return { x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys)-60, y1:Math.max(...ys) };
})();
function clampCam(){
  cam.s = Math.max(MIN_S, Math.min(MAX_S, cam.s));
  const cx=(viewW/2-cam.x)/cam.s, cy=(viewH/2-cam.y)/cam.s;
  const ccx=Math.max(FRAME.x0, Math.min(FRAME.x1, cx)), ccy=Math.max(FRAME.y0, Math.min(FRAME.y1, cy));
  cam.x = viewW/2 - ccx*cam.s; cam.y = viewH/2 - ccy*cam.s;
}
function setView(cx, cy, s){ cam.s=s; cam.x=viewW/2-cx*s; cam.y=viewH/2-cy*s; clampCam(); requestRender(); }
function viewCenter(){ return { x:(viewW/2-cam.x)/cam.s, y:(viewH/2-cam.y)/cam.s }; }
function fitScaleFor(b, pad){
  pad = pad||{x:40,top:90,bottom:40};
  return Math.min((viewW-pad.x*2)/Math.max(1,b.x1-b.x0), (viewH-pad.top-pad.bottom)/Math.max(1,b.y1-b.y0));
}
function computeBaseFit(){
  // on narrow portrait screens let the far ends crop a little rather than shrink the city to a sliver
  const narrow = viewW < 600;
  const b = narrow ? {x0:FRAME.x0+(FRAME.x1-FRAME.x0)*0.1, x1:FRAME.x1-(FRAME.x1-FRAME.x0)*0.06, y0:FRAME.y0, y1:FRAME.y1} : FRAME;
  baseFit = fitScaleFor(b, {x:10, top:20, bottom:20});
  MIN_S = baseFit*0.8;
  return b;
}
function fitCity(animate){
  const b = computeBaseFit();
  const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
  animate ? flyTo(cx,cy,baseFit) : setView(cx,cy,baseFit);
}
function fitPlaces(list, animate){
  const pts = list.map(p=>placeWorld(p));
  if (!pts.length) return fitCity(animate);
  const b = { x0:Math.min(...pts.map(p=>p.x)), x1:Math.max(...pts.map(p=>p.x)), y0:Math.min(...pts.map(p=>p.y)), y1:Math.max(...pts.map(p=>p.y)) };
  const s = Math.max(baseFit, Math.min(2.2, fitScaleFor(b, {x:50, top:110, bottom:50})));
  const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2 - 20/s;
  animate ? flyTo(cx,cy,s) : setView(cx,cy,s);
}
let flyAnim = null;
function flyTo(cx, cy, s, dur){
  s = Math.max(MIN_S, Math.min(MAX_S, s));
  if (reduceMotion){ setView(cx,cy,s); return; }
  dur = dur || 520;
  const from = viewCenter(), s0 = cam.s, t0 = performance.now();
  cancelAnimationFrame(flyAnim); stopInertia();
  interacting = true;
  const ease = t=>t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
  const step = now=>{
    const t = Math.min(1,(now-t0)/dur), e=ease(t);
    const sc = Math.exp(Math.log(s0)+(Math.log(s)-Math.log(s0))*e);
    cam.s = sc; cam.x = viewW/2-(from.x+(cx-from.x)*e)*sc; cam.y = viewH/2-(from.y+(cy-from.y)*e)*sc;
    clampCam(); requestRender();
    if (t<1) flyAnim = requestAnimationFrame(step); else { interacting=false; requestRender(); }
  };
  flyAnim = requestAnimationFrame(step);
}
function zoomAt(sx, sy, ns){
  ns = Math.max(MIN_S, Math.min(MAX_S, ns));
  const wx=(sx-cam.x)/cam.s, wy=(sy-cam.y)/cam.s;
  cam.s=ns; cam.x=sx-wx*ns; cam.y=sy-wy*ns; clampCam(); requestRender();
}

/* =========================================================
   GESTURES: pan (with momentum), pinch, wheel, double-tap
   ========================================================= */
let inertia = null;
function stopInertia(){ if (inertia){ cancelAnimationFrame(inertia); inertia=null; interacting=false; } }
(function initGestures(){
  const pointers = new Map();
  let downAt=null, dragged=false, lastDist=null, lastMid=null, vel={x:0,y:0}, lastMove=0, lastTap={t:0,x:0,y:0};
  const SLOP=6;
  const uiTarget = t => t.closest('.map-ctrl, .cluster-pop, .pick-actions, .empty-card');

  wrap.addEventListener('pointerdown', e=>{
    if (pointers.size===0) dragged=false;
    if (uiTarget(e.target)) return;
    stopInertia(); cancelAnimationFrame(flyAnim);
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pointers.size===1){ downAt={x:e.clientX,y:e.clientY}; vel={x:0,y:0}; lastMove=performance.now(); }
  });
  wrap.addEventListener('pointermove', e=>{
    if (!pointers.has(e.pointerId)) return;
    const prev=pointers.get(e.pointerId), cur={x:e.clientX,y:e.clientY};
    if (!dragged){
      if (pointers.size===1 && Math.hypot(cur.x-downAt.x, cur.y-downAt.y) < SLOP) return;
      dragged=true; interacting=true; hidePopover();
    }
    try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    pointers.set(e.pointerId, cur);
    if (pointers.size===1){
      const now=performance.now(), dt=Math.max(1,now-lastMove);
      cam.x += cur.x-prev.x; cam.y += cur.y-prev.y; clampCam(); requestRender();
      vel = { x:0.8*(cur.x-prev.x)/dt*16 + 0.2*vel.x, y:0.8*(cur.y-prev.y)/dt*16 + 0.2*vel.y };
      lastMove=now;
    } else if (pointers.size===2){
      const [p1,p2]=Array.from(pointers.values());
      const d=Math.hypot(p1.x-p2.x,p1.y-p2.y), m={x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2};
      if (lastDist){
        const r=wrap.getBoundingClientRect();
        cam.x += m.x-lastMid.x; cam.y += m.y-lastMid.y;
        zoomAt(m.x-r.left, m.y-r.top, cam.s*d/lastDist);
      }
      lastDist=d; lastMid=m; vel={x:0,y:0};
    }
  });
  function endPointer(e){
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size<2){ lastDist=null; lastMid=null; }
    if (pointers.size===1){ const [p]=pointers.values(); downAt=p; lastMove=performance.now(); }
    if (pointers.size===0){
      if (dragged && performance.now()-lastMove < 60 && Math.hypot(vel.x,vel.y) > 1.2 && !reduceMotion){
        const step=()=>{
          vel.x*=0.93; vel.y*=0.93; cam.x+=vel.x; cam.y+=vel.y; clampCam(); requestRender();
          if (Math.hypot(vel.x,vel.y) > 0.25) inertia=requestAnimationFrame(step); else { inertia=null; interacting=false; requestRender(); }
        };
        inertia=requestAnimationFrame(step);
      } else { interacting=false; requestRender(); }
      if (!dragged && e.type==='pointerup' && !e.target.closest('.pin')){
        const now=performance.now();
        if (now-lastTap.t < 300 && Math.hypot(e.clientX-lastTap.x, e.clientY-lastTap.y) < 30){
          const r=wrap.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
          const wx=(sx-cam.x)/cam.s, wy=(sy-cam.y)/cam.s, ns=Math.min(MAX_S, cam.s*2);
          flyTo(wx - (sx-viewW/2)/ns, wy - (sy-viewH/2)/ns, ns, 320);
          lastTap={t:0,x:0,y:0};
        } else lastTap={t:now, x:e.clientX, y:e.clientY};
      }
    }
  }
  ['pointerup','pointercancel'].forEach(ev=>wrap.addEventListener(ev, endPointer));
  wrap.addEventListener('pointerleave', e=>{ if (e.pointerType==='mouse') endPointer(e); });
  wrap.addEventListener('click', e=>{ if (dragged){ e.stopPropagation(); e.preventDefault(); } }, true);

  let wheelTimer=null;
  wrap.addEventListener('wheel', e=>{
    e.preventDefault(); stopInertia();
    interacting=true; clearTimeout(wheelTimer); wheelTimer=setTimeout(()=>{ interacting=false; requestRender(); }, 160);
    const r=wrap.getBoundingClientRect();
    const dy = e.deltaMode===1 ? e.deltaY*16 : e.deltaY;
    zoomAt(e.clientX-r.left, e.clientY-r.top, cam.s*Math.exp(-dy*0.0022));
  }, {passive:false});

  const zoomCenter = f=>{ const c=viewCenter(); flyTo(c.x, c.y, cam.s*f, 260); };
  document.getElementById('zoomIn').addEventListener('click', ()=>zoomCenter(1.6));
  document.getElementById('zoomOut').addEventListener('click', ()=>zoomCenter(1/1.6));
  document.getElementById('btnFit').addEventListener('click', ()=>{
    const vis = places.filter(matchesFilters);
    vis.length ? fitPlaces(vis, true) : fitCity(true);
  });
  document.getElementById('btnLocate').addEventListener('click', locateMe);
})();

/* =========================================================
   OVERLAY: labels, pins, clusters
   ========================================================= */
const labelsLayer = document.getElementById('labelsLayer');
const pinsLayer = document.getElementById('pinsLayer');
const labelEls = LABELS.map(l=>{
  const el=document.createElement('div');
  el.className='map-label'+(l.sea?' sea':'')+(l.lm?' lm':'');
  el.innerHTML=`<span>${l.t}</span>`;
  const p=aiToWorld(l.a,l.i); el._wx=p.x; el._wy=p.y; el._tier=l.tier;
  labelsLayer.appendChild(el); return el;
});

const worldCache = new Map();
function placeAI(p){
  if (typeof p.lat==='number' && typeof p.lng==='number') return toAI(p.lat,p.lng);
  const z = zoneById(p.zone) || zoneById('downtown');
  const [oa,oi] = hashOffset(String(p.id), 0.55);
  return { a:z.a+oa, i:z.i+oi };
}
function placeWorld(p){
  const key = p.id+'|'+p.lat+'|'+p.lng+'|'+p.zone;
  let w = worldCache.get(key);
  if (!w){ const ai=placeAI(p); w=aiToWorld(ai.a,ai.i); worldCache.set(key,w); }
  return w;
}

function matchesFilters(p){
  const status = p.status||'been';
  if (statusFilter!=='all' && status!==statusFilter) return false;
  if (!(p.categories||[]).some(c=>activeCats.has(c))) return false;
  if (topRatedOnly && (status==='want' || (p.rating||0)<4)) return false;
  return true;
}

let clusters = [], clusterScale = -1, clustersDirty = true, pinEls = [];
function computeClusters(){
  const R = 44/cam.s;
  const items = places.filter(matchesFilters).map(p=>({p, w:placeWorld(p)}));
  items.sort((a,b)=>(b.p.rating||0)-(a.p.rating||0));   // best-rated place fronts each cluster
  const out=[], used=new Uint8Array(items.length);
  for (let k=0;k<items.length;k++){
    if (used[k]) continue;
    const g=[items[k]]; used[k]=1;
    for (let j=k+1;j<items.length;j++){
      if (used[j]) continue;
      if (Math.hypot(items[k].w.x-items[j].w.x, items[k].w.y-items[j].w.y) < R){ g.push(items[j]); used[j]=1; }
    }
    const x=g.reduce((s,v)=>s+v.w.x,0)/g.length, y=g.reduce((s,v)=>s+v.w.y,0)/g.length;
    out.push({x,y,items:g.map(v=>v.p)});
  }
  out.sort((a,b)=>a.y-b.y);
  return out;
}
function photoStyle(p, cat){ return p.photo ? `background-image:url(${p.photo})` : `background:${cat?cat.color:'#ccc'}`; }
function buildPins(){
  pinsLayer.innerHTML='';
  pinEls = clusters.map(cl=>{
    const first=cl.items[0], cat=catById((first.categories||[])[0])||CATEGORIES[0];
    const rot = ((hashStr(String(first.id))%1200)/100)-6;
    const want = (first.status||'been')==='want';
    const el=document.createElement('div');
    el.className='pin'+(cl.items.length>1?' pin-cluster':'')+(want?' want':'')
      +(cl.items.some(p=>p.id===highlightId)?' highlight':'')+(cl.items.some(p=>p.id===newPinId)?' pin-new':'');
    el.innerHTML=`
      <div class="pin-bob" style="animation-delay:${(Math.abs(rot)*0.1).toFixed(2)}s">
        <div class="polaroid"${cl.items.length>1?` data-count="${cl.items.length}"`:''} style="transform:rotate(${rot.toFixed(1)}deg)">
          <div class="tape"></div>
          <div class="photo" style="${photoStyle(first,cat)}">${first.photo?'':iconSvg(cat.id,'#fff')}</div>
          <div class="rating">${want?'to try':'★ '+(first.rating||0)}</div>
        </div>
        ${cl.items.length===1?`<div class="pin-name">${escapeHtml(first.name||'Untitled')}</div>`:''}
      </div>`;
    el.addEventListener('click', e=>{
      e.stopPropagation();
      if (picking) return;
      cl.items.length===1 ? openDetail(first.id) : onClusterTap(cl, e);
    });
    el._cl=cl;
    pinsLayer.appendChild(el);
    return el;
  });
  newPinId=null;
}
function updateOverlay(){
  if (clustersDirty || Math.abs(cam.s-clusterScale)/clusterScale > 0.04){
    const next=computeClusters();
    const sig=cl=>cl.map(c=>c.items.map(p=>p.id).join(',')).join('|');
    const changed = clustersDirty || sig(next)!==sig(clusters);
    clusters=next; clusterScale=cam.s; clustersDirty=false;
    if (changed) buildPins(); else pinEls.forEach((el,k)=>{ el._cl=clusters[k]; });
  }
  const z = cam.s/baseFit;
  // polaroids shrink a little when you're zoomed right out, full size from ~2x in
  const pk = Math.max(0.72, Math.min(1, 0.72 + (z-1)*0.28));
  pinsLayer.style.setProperty('--pin-k', pk.toFixed(3));
  const boxes = [];   // screen rects already taken, so labels never sit under a pin or another label
  pinEls.forEach(el=>{
    const cl=el._cl, sx=cl.x*cam.s+cam.x, sy=cl.y*cam.s+cam.y;
    el.style.transform=`translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
    boxes.push([sx-30*pk, sy-72*pk, sx+30*pk, sy+6]);
  });
  pinsLayer.classList.toggle('show-names', z>=3.2);
  labelEls.forEach(el=>{
    let show = el._tier===0 || (el._tier===1 && z>=1.7) || (el._tier===2 && z>=3.2);
    const sx=el._wx*cam.s+cam.x, sy=el._wy*cam.s+cam.y;
    if (show){
      if (sx<-80 || sx>viewW+80 || sy<-20 || sy>viewH+20) show=false;
      else {
        if (!el._w){ el.classList.remove('hidden'); el._w=el.firstChild.offsetWidth||60; el._h=el.firstChild.offsetHeight||14; }
        const b=[sx-el._w/2-2, sy-el._h/2-2, sx+el._w/2+2, sy+el._h/2+2];
        if (boxes.some(o=>b[0]<o[2] && b[2]>o[0] && b[1]<o[3] && b[3]>o[1])) show=false;
        else boxes.push(b);
      }
    }
    el.classList.toggle('hidden', !show);
    if (show) el.style.transform=`translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
  });
  const me=document.getElementById('meDot');
  if (meWorld){ me.classList.remove('hidden'); me.style.transform=`translate3d(${(meWorld.x*cam.s+cam.x).toFixed(1)}px,${(meWorld.y*cam.s+cam.y).toFixed(1)}px,0)`; }
}
function refreshPins(){ clustersDirty=true; requestRender(); }

function onClusterTap(cl, evt){
  const pts=cl.items.map(placeWorld);
  const b={x0:Math.min(...pts.map(p=>p.x)), x1:Math.max(...pts.map(p=>p.x)), y0:Math.min(...pts.map(p=>p.y)), y1:Math.max(...pts.map(p=>p.y))};
  const spread = Math.max(b.x1-b.x0, b.y1-b.y0);
  const target = Math.min(MAX_S, fitScaleFor(b,{x:70,top:120,bottom:60}), 44/Math.max(0.01,spread)*2.2);
  // zoom in if that would actually split the cluster; otherwise list what's in it
  if (spread*MAX_S > 44 && target > cam.s*1.35) flyTo((b.x0+b.x1)/2, (b.y0+b.y1)/2 - 25/target, target);
  else openClusterPopover(cl, evt);
}
function hidePopover(){ document.getElementById('clusterPop').classList.add('hidden'); }
function openClusterPopover(cl, evt){
  const pop=document.getElementById('clusterPop');
  pop.innerHTML=cl.items.map(p=>{
    const cat=catById((p.categories||[])[0])||CATEGORIES[0], want=(p.status||'been')==='want';
    return `<button class="cluster-row" data-id="${p.id}">
      <div class="thumb" style="${photoStyle(p,cat)}">${p.photo?'':iconSvg(cat.id,'#fff')}</div>
      <div class="name">${escapeHtml(p.name||'Untitled')}</div>
      <div class="rate">${want?'to try':'★'+(p.rating||0)}</div>
    </button>`;
  }).join('');
  pop.querySelectorAll('.cluster-row').forEach(row=>row.addEventListener('click', ()=>{ hidePopover(); openDetail(row.dataset.id); }));
  pop.classList.remove('hidden');
  const r=wrap.getBoundingClientRect(), pw=pop.offsetWidth, ph=pop.offsetHeight;
  const tx=evt.clientX-r.left, ty=evt.clientY-r.top;
  let top=ty-ph-40; if (top<8) top=Math.min(ty+24, r.height-ph-8);
  pop.style.left=Math.max(8,Math.min(tx-pw/2, r.width-pw-8))+'px';
  pop.style.top=Math.max(8,top)+'px';
}
wrap.addEventListener('click', e=>{ if (!e.target.closest('.cluster-pop')) hidePopover(); });

/* =========================================================
   LOCATION
   ========================================================= */
function getPosition(){
  return new Promise((res,rej)=>{
    if (!navigator.geolocation) return rej(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(p=>res(p.coords), rej, {enableHighAccuracy:true, timeout:10000, maximumAge:60000});
  });
}
async function locateMe(){
  const btn=document.getElementById('btnLocate'); btn.classList.add('busy');
  try{
    const c=await getPosition(), ai=toAI(c.latitude,c.longitude);
    if (!inMap(ai.a,ai.i)){ toast("You're outside the map. Come back to Dubai!"); return; }
    meWorld=aiToWorld(ai.a,ai.i);
    flyTo(meWorld.x, meWorld.y-20/Math.max(cam.s,2.4), Math.max(cam.s,2.4));
  }catch(e){ toast(e && e.code===1 ? 'Location permission is off for this site.' : "Couldn't get your location."); }
  finally{ btn.classList.remove('busy'); }
}

/* =========================================================
   FILTERS
   ========================================================= */
function renderFilters(){
  const grid=document.getElementById('filterCats');
  grid.innerHTML=CATEGORIES.map(c=>`<button class="chip ${activeCats.has(c.id)?'':'off'}" data-cat="${c.id}">
      <span class="dot" style="background:${c.color}">${iconSvg(c.id,'#fff')}</span>${c.label}</button>`).join('');
  grid.querySelectorAll('[data-cat]').forEach(btn=>btn.addEventListener('click', ()=>{
    const id=btn.dataset.cat; activeCats.has(id)?activeCats.delete(id):activeCats.add(id);
    filtersChanged();
  }));
  document.getElementById('chipTopRated').classList.toggle('off', !topRatedOnly);
  document.querySelectorAll('#filterStatus button').forEach(b=>b.classList.toggle('on', b.dataset.v===statusFilter));
  const filtered = topRatedOnly || statusFilter!=='all' || activeCats.size<CATEGORIES.length;
  document.getElementById('btnFilter').classList.toggle('filtered', filtered);
}
function filtersChanged(){ renderFilters(); refreshPins(); renderList(); }
document.getElementById('chipTopRated').addEventListener('click', ()=>{ topRatedOnly=!topRatedOnly; filtersChanged(); });
document.querySelectorAll('#filterStatus button').forEach(b=>b.addEventListener('click', ()=>{ statusFilter=b.dataset.v; filtersChanged(); }));
document.getElementById('filterReset').addEventListener('click', ()=>{
  activeCats=new Set(CATEGORIES.map(c=>c.id)); topRatedOnly=false; statusFilter='all'; filtersChanged();
});

/* =========================================================
   LIST
   ========================================================= */
function fmtDate(d){
  if (!d) return '';
  const dt=new Date(d+'T00:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined,{month:'short', day:'numeric', year:'numeric'});
}
function todayLocal(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function renderList(){
  const body=document.getElementById('listBody');
  const q=searchQuery.trim().toLowerCase();
  let visible=places.filter(matchesFilters).filter(p=>{
    if (!q) return true;
    const z=zoneById(p.zone);
    return [(p.name||''),(p.notes||''),(z?z.label:'')].join(' ').toLowerCase().includes(q);
  });
  if (sortMode==='rating') visible.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else if (sortMode==='name') visible.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  else visible.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  const been=visible.filter(p=>(p.status||'been')==='been'), rated=been.filter(p=>p.rating);
  const avg = rated.length ? (rated.reduce((s,p)=>s+p.rating,0)/rated.length).toFixed(1) : null;
  document.getElementById('listCount').textContent =
    `${visible.length} place${visible.length!==1?'s':''}` + (avg?` · avg ★ ${avg}`:'') + (visible.length-been.length?` · ${visible.length-been.length} to try`:'');
  if (!visible.length){
    body.innerHTML=`<div class="list-empty">${places.length ? 'Nothing matches.' : 'No places yet. Tap + to add your first.'}</div>`;
    return;
  }
  body.innerHTML=visible.map(p=>{
    const z=zoneById(p.zone), cats=p.categories||[], cat0=catById(cats[0]), want=(p.status||'been')==='want';
    return `<button class="place-row${want?' want':''}" data-id="${p.id}">
      <div class="place-thumb" style="${photoStyle(p,cat0)}">${p.photo?'':iconSvg(cats[0]||'coffee','#fff')}</div>
      <div class="place-info">
        <div class="name">${escapeHtml(p.name||'Untitled')}</div>
        <div class="meta">${z?z.label:''}${want?' · want to try':(p.dateVisited?' · '+fmtDate(p.dateVisited):'')}</div>
      </div>
      <div class="place-cats">${cats.slice(0,3).map(c=>{const cat=catById(c); return cat?`<span class="mini" style="background:${cat.color}">${iconSvg(c,'#fff')}</span>`:'';}).join('')}</div>
      <div class="place-rating">${want?'<span class="tag-want">to try</span>':'★ '+(p.rating||0)}</div>
    </button>`;
  }).join('');
  body.querySelectorAll('.place-row').forEach(row=>row.addEventListener('click', ()=>openDetail(row.dataset.id)));
}
document.getElementById('sortSelect').addEventListener('change', e=>{ sortMode=e.target.value; renderList(); });
document.getElementById('searchInput').addEventListener('input', e=>{ searchQuery=e.target.value; renderList(); });

/* ---------- backup ---------- */
document.getElementById('btnExport').addEventListener('click', ()=>{
  const blob=new Blob([JSON.stringify({app:'dubai-bites', version:1, exportedAt:new Date().toISOString(), places},null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`dubai-bites-${todayLocal()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  toast(`Exported ${places.length} place${places.length!==1?'s':''}`);
});
document.getElementById('importFile').addEventListener('change', e=>{
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result), list=Array.isArray(data)?data:data.places;
      if (!Array.isArray(list)) throw new Error('bad file');
      const seen=new Set(places.map(p=>(p.name||'')+'|'+p.createdAt));
      let added=0;
      list.slice().reverse().forEach(p=>{
        if (!p || !p.name || seen.has(p.name+'|'+p.createdAt)) return;
        const {id, ...rest}=p; upsertPlace(rest); added++;
      });
      refreshPins(); renderList();
      toast(added ? `Imported ${added} place${added!==1?'s':''}` : 'Nothing new in that backup');
    }catch(err){ toast("That file doesn't look like a Dubai Bites backup."); }
    e.target.value='';
  };
  reader.readAsText(file);
});

/* =========================================================
   DETAIL
   ========================================================= */
function starsHtml(r){ let o=''; for(let k=1;k<=5;k++) o+=`<span class="${k<=r?'':'off'}">★</span>`; return o; }
function mapsUrl(p){
  const z=zoneById(p.zone);
  const q = typeof p.lat==='number' ? `${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : `${p.name}, ${z?z.label:''}, Dubai`;
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
}
function openDetail(id){
  const p=places.find(x=>x.id===id); if(!p) return;
  editingId=id;
  const z=zoneById(p.zone), cats=p.categories||[], want=(p.status||'been')==='want';
  document.getElementById('detailTitle').textContent=p.name||'Untitled';
  document.getElementById('detailBody').innerHTML=`
    ${p.photo?`<div class="detail-photo" style="background-image:url(${p.photo})"></div>`:''}
    <div class="detail-cats">
      ${want?'<span class="badge badge-want">Want to try</span>':''}
      ${cats.map(c=>{const cat=catById(c); return cat?`<span class="badge" style="background:${cat.color}"><span class="dot">${iconSvg(c,'#fff')}</span>${cat.label}</span>`:'';}).join('')}
    </div>
    <div class="detail-row">📍 <b>${z?z.label:'Dubai'}</b>${typeof p.lat==='number'?' <span class="exact">· exact spot</span>':''}</div>
    ${!want && p.dateVisited?`<div class="detail-row">📅 ${fmtDate(p.dateVisited)}</div>`:''}
    ${!want?`<div class="detail-row">Rating <div class="detail-stars">${starsHtml(p.rating||0)}</div></div>`:''}
    ${p.notes?`<div class="detail-notes">${escapeHtml(p.notes)}</div>`:''}
    <div class="detail-actions">
      <button class="btn btn-ghost btn-sm" id="detailShow">Show on map</button>
      <a class="btn btn-ghost btn-sm" href="${mapsUrl(p)}" target="_blank" rel="noopener">Directions ↗</a>
    </div>`;
  document.getElementById('detailShow').addEventListener('click', ()=>showOnMap(id));
  openSheet('sheetDetail');
}
function showOnMap(id){
  const p=places.find(x=>x.id===id); if(!p) return;
  closeSheets(); switchView('map');
  if (!matchesFilters(p)){ activeCats=new Set(CATEGORIES.map(c=>c.id)); topRatedOnly=false; statusFilter='all'; renderFilters(); }
  highlightId=id; refreshPins();
  const w=placeWorld(p), s=separatingScale(p, baseFit*4.5);
  flyTo(w.x, w.y-30/s, s);
  setTimeout(()=>{ highlightId=null; refreshPins(); }, 2600);
}
// zoom at which this place's pin no longer clusters with its nearest neighbour
function separatingScale(p, atLeast){
  const w=placeWorld(p);
  let dmin=Infinity;
  places.forEach(q=>{ if (q.id!==p.id && matchesFilters(q)){ const v=placeWorld(q); dmin=Math.min(dmin, Math.hypot(v.x-w.x, v.y-w.y)); } });
  return Math.min(MAX_S, Math.max(cam.s, atLeast, dmin<Infinity ? 48/Math.max(dmin,0.1) : 0));
}
document.getElementById('detailDelete').addEventListener('click', ()=>{
  const p=places.find(x=>x.id===editingId); if(!p) return;
  lastDeleted=p;
  removePlace(p.id);
  closeSheets(); refreshPins(); renderList();
  toast(`Deleted “${p.name||'Untitled'}”`, 'Undo', ()=>{
    if (!lastDeleted) return;
    const {id, ...rest}=lastDeleted; upsertPlace(rest); lastDeleted=null;
    refreshPins(); renderList();
  });
});
document.getElementById('detailEdit').addEventListener('click', ()=>{ if(editingId) openForm(editingId); });

/* =========================================================
   FORM
   ========================================================= */
function buildFormStatics(){
  document.getElementById('fZone').innerHTML = ZONES.slice().sort((a,b)=>a.label.localeCompare(b.label))
    .map(z=>`<option value="${z.id}">${z.label}</option>`).join('');
  const grid=document.getElementById('fCats');
  grid.innerHTML=CATEGORIES.map(c=>`
    <button type="button" class="cat-pick" data-cat="${c.id}">
      <span class="dot" style="background:${c.color}">${iconSvg(c.id,'#fff')}</span><span>${c.label}</span>
    </button>`).join('');
  grid.querySelectorAll('.cat-pick').forEach(btn=>btn.addEventListener('click', ()=>btn.classList.toggle('on')));
  document.querySelectorAll('#fStars button').forEach(btn=>btn.addEventListener('click', ()=>{
    const v=parseInt(btn.dataset.v,10), cur=parseInt(document.getElementById('fStars').dataset.value||'0',10);
    const nv = v===cur ? 0 : v;   // tap the same star again to clear
    document.getElementById('fStars').dataset.value=nv;
    document.querySelectorAll('#fStars button').forEach(b=>b.classList.toggle('on', parseInt(b.dataset.v,10)<=nv));
  }));
  document.querySelectorAll('#fStatus button').forEach(b=>b.addEventListener('click', ()=>{ draft.status=b.dataset.v; syncStatus(); }));
  document.getElementById('fZone').addEventListener('change', e=>{ draft.zone=e.target.value; draft.lat=null; draft.lng=null; syncLocation(); });
}
function syncStatus(){
  document.querySelectorAll('#fStatus button').forEach(b=>b.classList.toggle('on', b.dataset.v===draft.status));
  document.getElementById('sheetForm').classList.toggle('status-want', draft.status==='want');
}
function syncLocation(){
  const z=zoneById(draft.zone);
  document.getElementById('fZone').value=draft.zone;
  document.getElementById('fLocText').textContent = typeof draft.lat==='number' ? 'Exact spot pinned' : `Somewhere in ${z?z.label:'Dubai'}`;
  document.getElementById('fLocText').classList.toggle('exact', typeof draft.lat==='number');
}
function openForm(id, opts){
  editingId=id||null; pendingPhoto=null;
  const p=id?places.find(x=>x.id===id):null;
  draft = { status:p?(p.status||'been'):((opts&&opts.status)||'been'), zone:p?p.zone:(opts&&opts.zone)||'downtown',
            lat:p&&typeof p.lat==='number'?p.lat:null, lng:p&&typeof p.lng==='number'?p.lng:null };
  if (!p && opts && typeof opts.lat==='number'){ draft.lat=opts.lat; draft.lng=opts.lng; }
  document.getElementById('formTitle').textContent=id?'Edit place':'Add place';
  document.querySelector('#sheetForm .sheet-body').scrollTop=0;
  const fName=document.getElementById('fName'); fName.classList.remove('invalid');
  fName.value=p?(p.name||''):'';
  document.getElementById('fDate').value=p?(p.dateVisited||todayLocal()):todayLocal();
  document.getElementById('fNotes').value=p?(p.notes||''):'';
  document.getElementById('fPhoto').value='';
  document.querySelectorAll('#fCats .cat-pick').forEach(b=>b.classList.toggle('on', p?(p.categories||[]).includes(b.dataset.cat):false));
  const rating=p?(p.rating||0):0;
  document.getElementById('fStars').dataset.value=rating;
  document.querySelectorAll('#fStars button').forEach(b=>b.classList.toggle('on', parseInt(b.dataset.v,10)<=rating));
  setPhotoPreview(p&&p.photo);
  syncStatus(); syncLocation();
  openSheet('sheetForm');
}
function setPhotoPreview(src){
  const drop=document.getElementById('fPhotoDrop'), label=document.getElementById('fPhotoLabel');
  drop.querySelectorAll('img').forEach(i=>i.remove());
  drop.classList.toggle('has-img', !!src);
  if (src){ const img=document.createElement('img'); img.src=src; img.alt=''; drop.appendChild(img); }
  label.style.display=src?'none':'block';
}
document.getElementById('fPhoto').addEventListener('change', e=>{
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const maxW=600, scale=Math.min(1, maxW/img.width);
      const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      pendingPhoto=cv.toDataURL('image/jpeg',0.7);
      setPhotoPreview(pendingPhoto);
    };
    img.onerror=()=>toast("Couldn't read that image.");
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
});
document.getElementById('fPhotoRemove').addEventListener('click', e=>{
  e.preventDefault(); e.stopPropagation();
  pendingPhoto=''; setPhotoPreview(null); document.getElementById('fPhoto').value='';
});
document.getElementById('fUseLoc').addEventListener('click', async ()=>{
  const btn=document.getElementById('fUseLoc'); btn.classList.add('busy');
  try{
    const c=await getPosition(), ai=toAI(c.latitude,c.longitude);
    if (!inMap(ai.a,ai.i)){ toast("You're outside the map area."); return; }
    draft.lat=c.latitude; draft.lng=c.longitude; draft.zone=nearestZone(ai.a,ai.i).id; syncLocation();
    toast('Pinned to where you are');
  }catch(e){ toast(e && e.code===1 ? 'Location permission is off for this site.' : "Couldn't get your location."); }
  finally{ btn.classList.remove('busy'); }
});
document.getElementById('fPickMap').addEventListener('click', ()=>startPick());

document.getElementById('formSave').addEventListener('click', ()=>{
  const fName=document.getElementById('fName'), name=fName.value.trim();
  if (!name){
    fName.classList.add('invalid'); fName.focus();
    fName.addEventListener('input', ()=>fName.classList.remove('invalid'), {once:true});
    return;
  }
  const cats=Array.from(document.querySelectorAll('#fCats .cat-pick.on')).map(b=>b.dataset.cat);
  if (!cats.length){ toast('Pick at least one category'); document.getElementById('fCats').scrollIntoView({block:'center', behavior:'smooth'}); return; }
  const want = draft.status==='want';
  const data = {
    name, zone:draft.zone, status:draft.status, categories:cats,
    rating: want ? 0 : parseInt(document.getElementById('fStars').dataset.value||'0',10),
    dateVisited: want ? '' : (document.getElementById('fDate').value || todayLocal()),
    notes: document.getElementById('fNotes').value.trim(),
    lat: draft.lat, lng: draft.lng,
  };
  if (pendingPhoto!==null) data.photo = pendingPhoto || null;
  const wasNew = !editingId;
  upsertPlace(data, editingId);
  const savedId = wasNew ? places[0].id : editingId;
  closeSheets();
  if (!matchesFilters(places.find(p=>p.id===savedId))){ activeCats=new Set(CATEGORIES.map(c=>c.id)); topRatedOnly=false; statusFilter='all'; renderFilters(); }
  renderList(); updateEmpty();
  if (wasNew){
    newPinId=savedId; switchView('map'); refreshPins();
    const w=placeWorld(places[0]), s=separatingScale(places[0], baseFit*3.5);
    flyTo(w.x, w.y-30/s, s);
    toast('Pinned! 📌');
  } else { refreshPins(); toast('Saved'); }
});

/* ---------- pick location on the map ---------- */
function startPick(){
  picking=true;
  document.body.classList.add('picking');
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('sheetForm').classList.remove('open');
  switchView('map', true);
  const ai = typeof draft.lat==='number' ? toAI(draft.lat,draft.lng) : (()=>{ const z=zoneById(draft.zone); return {a:z.a,i:z.i}; })();
  const w=aiToWorld(ai.a,ai.i), s=Math.max(cam.s, baseFit*4);
  // the marker's tip sits at the view centre
  flyTo(w.x, w.y, s);
}
function endPick(confirmIt){
  if (confirmIt){
    const c=viewCenter(), ai=worldToAI(c.x,c.y), ll=toLatLng(ai.a,ai.i);
    draft.lat=ll.lat; draft.lng=ll.lng; draft.zone=nearestZone(ai.a,ai.i).id;
    syncLocation();
  }
  picking=false; document.body.classList.remove('picking');
  openSheet('sheetForm');
}
document.getElementById('pickConfirm').addEventListener('click', ()=>endPick(true));
document.getElementById('pickCancel').addEventListener('click', ()=>endPick(false));

/* =========================================================
   SHEETS / VIEWS / TOAST
   ========================================================= */
function openSheet(id){
  document.querySelectorAll('.sheet.open').forEach(s=>{ if(s.id!==id) s.classList.remove('open'); });
  hidePopover();
  document.getElementById('overlay').classList.add('open');
  const sh=document.getElementById(id); sh.style.transform=''; sh.classList.add('open');
}
function closeSheets(){
  document.getElementById('overlay').classList.remove('open');
  document.querySelectorAll('.sheet').forEach(s=>{ s.classList.remove('open'); s.style.transform=''; });
  editingId=null;
}
document.getElementById('overlay').addEventListener('click', closeSheets);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', closeSheets));
document.addEventListener('keydown', e=>{
  if (e.key!=='Escape') return;
  if (picking) endPick(false); else closeSheets();
  hidePopover();
});
// drag a sheet down by its handle/header to dismiss it
document.querySelectorAll('.sheet').forEach(sh=>{
  const grip=sh.querySelectorAll('.sheet-handle, .sheet-head');
  let y0=null, dy=0;
  grip.forEach(g=>{
    g.addEventListener('pointerdown', e=>{ if (e.target.closest('button')) return; y0=e.clientY; dy=0; sh.style.transition='none'; g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointermove', e=>{ if (y0===null) return; dy=Math.max(0,e.clientY-y0); sh.style.transform=`translateY(${dy}px)`; });
    const end=()=>{ if (y0===null) return; y0=null; sh.style.transition=''; if (dy>90) closeSheets(); else sh.style.transform=''; };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  });
});

function switchView(v, keepSheets){
  const map=v==='map';
  document.getElementById('tabMap').classList.toggle('active', map);
  document.getElementById('tabList').classList.toggle('active', !map);
  wrap.classList.toggle('hidden-view', !map);
  document.getElementById('listWrap').classList.toggle('active', !map);
  if (map){ if (resizeCanvas()){ if (needsCenter) initialView(); requestRender(); } }
  else renderList();
}
document.getElementById('tabMap').addEventListener('click', ()=>switchView('map'));
document.getElementById('tabList').addEventListener('click', ()=>switchView('list'));
document.getElementById('btnAdd').addEventListener('click', ()=>{
  // new places start where you're looking on the map
  let opts;
  if (!wrap.classList.contains('hidden-view') && viewW){
    const c=viewCenter(), ai=worldToAI(c.x,c.y);
    if (cam.s > baseFit*2.2 && inMap(ai.a,ai.i)) opts={ zone:nearestZone(ai.a,ai.i).id };
  }
  openForm(null, opts);
});
document.getElementById('btnFilter').addEventListener('click', ()=>openSheet('sheetFilter'));
document.getElementById('emptyAdd').addEventListener('click', ()=>openForm(null));

let toastTimer=null;
function toast(msg, action, fn){
  const el=document.getElementById('toast');
  document.getElementById('toastMsg').textContent=msg;
  const btn=document.getElementById('toastAction');
  btn.style.display=action?'':'none'; btn.textContent=action||'';
  btn.onclick = action ? ()=>{ fn(); el.classList.remove('show'); } : null;
  el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'), action?5000:2200);
}
function updateEmpty(){ document.getElementById('emptyState').classList.toggle('hidden', places.length>0); }

/* =========================================================
   BOOT
   ========================================================= */
let needsCenter=true, lastW=0;
function initialView(){
  computeBaseFit();
  const vis=places.filter(matchesFilters);
  vis.length ? fitPlaces(vis,false) : fitCity(false);
  // On a portrait phone the whole city is a thin diagonal strip; open closer in,
  // on the middle of your places (or Downtown), and let "fit" show the rest.
  if (viewW < 600 && cam.s < baseFit*1.9){
    let cx, cy;
    if (vis.length){ const pts=vis.map(placeWorld); cx=pts.reduce((s,p)=>s+p.x,0)/pts.length; cy=pts.reduce((s,p)=>s+p.y,0)/pts.length; }
    else { const z=zoneById('downtown'), w=aiToWorld(z.a-2,z.i); cx=w.x; cy=w.y; }
    setView(cx, cy, baseFit*1.9);
  }
  needsCenter=false; lastW=viewW;
}
buildFormStatics();
renderFilters();
renderList();
updateEmpty();
// a timer, not rAF: rAF never fires in a background tab, and the city should be ready when you switch to it
setTimeout(()=>{
  buildTerrain(); buildObjects(); prepRoads(); buildCache();
  document.getElementById('mapLoading').classList.add('done');
  if (resizeCanvas()) initialView();
  requestRender();
});
new ResizeObserver(()=>{
  if (!cache || wrap.classList.contains('hidden-view')) return;
  if (!resizeCanvas()) return;
  // only re-frame on width changes; height changes on phones are the URL bar / keyboard
  if (needsCenter) initialView();
  else if (Math.abs(viewW-lastW) > 40){ const c=viewCenter(); computeBaseFit(); setView(c.x,c.y,Math.max(cam.s,MIN_S)); lastW=viewW; }
  clampCam(); requestRender();
}).observe(wrap);
document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) requestRender(); });
})();
