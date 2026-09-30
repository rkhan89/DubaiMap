// The isometric Dubai map: a stylised but real projection of the city, drawn on a canvas.
// Static city = cached bitmap when zoomed out, culled crisp vectors when zoomed in.

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
const A_MIN=-6.0, A_MAX=36.0, I_MIN=-9.0, I_MAX=21.6;
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
const COAST = [[-6,-1.0],[-3.4,-0.55],[-2.87,-0.49],[-1,-0.15],[0,0],[1.2,0.1],[2.24,0.05],[3.41,0.35],[5.4,0.6],[9,0.5],
  [12,0.45],[15,0.45],[17.5,0.35],[19.6,0.25],[20.2,-0.2],[21.2,-0.25],[21.8,0.15],[23.5,0.05],[26.6,-0.2],
  [28,0.1],[30,0.35],[31.5,0.8],[32.6,1.9],[34,2.8],[36,3.3]];
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
// roughly: is this lat/lng on dry land (used by the synthetic test data)
function onLand(lat,lng){ const {a,i}=toAI(lat,lng); if (!inMap(a,i)) return false; if (palmAt(a,i)) return true; return i > coastIn(a)+0.3 && distLine(a,i,CREEK) > 0.35 && distLine(a,i,MARINA) > 0.2; }

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
  {a:[0.2,5.8],   i:[6.1,9.3],  st:'mid',   h:[8,18],   p:0.38},   // JVC / JVT
  {a:[3.2,5.0],   i:[2.3,3.2],  st:'glass', h:[20,48],  p:0.45},   // Barsha Heights (TECOM)
  {a:[-4.6,-1.6], i:[2.8,6.0],  st:'mid',   h:[8,16],   p:0.4},    // Al Furjan / Discovery Gardens
  {a:[1.0,4.8],   i:[9.9,11.8], st:'mid',   h:[8,16],   p:0.35},   // Motor City / Sports City
  {a:[4.8,8.8],   i:[11.8,14.6],st:'villa', h:[5,7],    p:0.45},   // Arabian Ranches
  {a:[16.5,20.5], i:[9.9,12.4], st:'villa', h:[5,7],    p:0.4},    // Nad Al Sheba
  {a:[23.4,25.3], i:[8.8,10.2], st:'glass', h:[22,58],  p:0.45},   // Dubai Creek Harbour
  {a:[23.6,25.4], i:[6.0,7.4],  st:'mid',   h:[9,20],   p:0.4},    // Al Jaddaf
  {a:[26.8,28.2], i:[5.4,6.5],  st:'low',   h:[7,12],   p:0.45},   // Al Garhoud
  {a:[31.8,35.6], i:[3.4,8.4],  st:'mid',   h:[9,20],   p:0.42},   // Al Qusais / Al Nahda
  {a:[28.6,31.8], i:[11.6,15.0],st:'villa', h:[5,7],    p:0.5},    // Mirdif
  {a:[25.6,28.6], i:[13.4,16.4],st:'villa', h:[5,7],    p:0.45},   // Al Warqa
  {a:[32.4,35.9], i:[16.4,20.4],st:'villa', h:[5,7],    p:0.3},    // Al Khawaneej
  {a:[23.6,25.8], i:[15.6,17.6],st:'mid',   h:[7,12],   p:0.55},   // International City
  {a:[17.8,20.0], i:[16.2,18.4],st:'mid',   h:[9,20],   p:0.4},    // Silicon Oasis
  {a:[20.2,22.2], i:[18.8,20.8],st:'ind',   h:[6,10],   p:0.35},   // Academic City
];
const PARKS = [
  {a:[16.0,16.9], i:[3.0,3.6]},    // Safa Park
  {a:[23.6,24.7], i:[2.55,3.7]},   // Zabeel Park (Dubai Frame)
  {a:[8.0,9.4],   i:[6.9,8.3]},    // Dubai Hills Park
  {a:[25.3,25.95],i:[3.6,4.6]},    // Creek Park
  {a:[31.3,32.5], i:[15.3,16.8]},  // Mushrif Park
  {a:[33.0,34.0], i:[17.0,17.8]},  // Khawaneej farms
  {a:[34.6,35.5], i:[18.4,19.3]},
  {a:[33.4,34.2], i:[19.4,20.2]},
];
const AIRPORT = {a:[28.3,30.4], i:[5.4,9.8]};
const RUNWAYS = [{a:29.0, i:[5.7,9.5]}, {a:29.6, i:[5.9,9.5]}];

// roads: 0 highway, 1 major, 2 minor. Width in world px, half-width in km for the building mask.
const RD = [ {w:6.5, km:0.15}, {w:4.4, km:0.1}, {w:3, km:0.07} ];
const ROADS = [
  {k:0, pts:[G(25.035,55.085),G(25.0705,55.1395),G(25.098,55.172),G(25.1185,55.2005),G(25.155,55.229),G(25.185,55.255),G(25.2045,55.2705),G(25.2255,55.2855),G(25.2330,55.2930)]}, // Sheikh Zayed Rd
  {k:0, pts:[G(25.2330,55.2930),G(25.2440,55.3035),G(25.2485,55.3150),G(25.2600,55.3260),G(25.2800,55.3420),G(25.300,55.360)]},  // Al Maktoum Bridge
  {k:0, pts:[G(25.030,55.140),G(25.050,55.165),G(25.080,55.195),G(25.115,55.225),G(25.150,55.245),G(25.175,55.270),G(25.190,55.300),G(25.2150,55.3300),G(25.2350,55.3450),G(25.2600,55.3480)]}, // Al Khail -> Garhoud
  {k:0, pts:[G(25.005,55.150),G(25.045,55.210),G(25.090,55.275),G(25.140,55.335),G(25.195,55.395),G(25.240,55.420),G(25.300,55.430)]}, // Mohammed bin Zayed (E311)
  {k:0, pts:[G(24.990,55.230),G(25.060,55.330),G(25.120,55.410),G(25.180,55.470),G(25.250,55.510),G(25.290,55.520)]}, // Emirates Rd (E611)
  {k:1, pts:[G(25.200,55.320),G(25.160,55.370),G(25.120,55.420),G(25.080,55.470)]},                   // Al Ain Rd (E66)
  {k:1, pts:[G(25.205,55.350),G(25.180,55.420),G(25.160,55.480),G(25.150,55.520)]},                   // Hatta Rd (E44)
  {k:1, pts:[G(25.258,55.365),G(25.245,55.420),G(25.235,55.480),G(25.230,55.520)]},                   // Al Khawaneej Rd
  {k:1, pts:[G(25.285,55.375),G(25.265,55.395),G(25.215,55.405),G(25.170,55.395)]},                   // Tripoli St / Mirdif
  {k:1, pts:[G(25.100,55.180),G(25.060,55.220),G(25.030,55.255)]},                                    // Hessa St
  {k:1, pts:[G(25.035,55.110),G(25.020,55.150),G(25.010,55.200)]},                                    // Furjan / Discovery Gardens
  {k:1, pts:[[-3.4,-0.1],[0,0.42],[2.2,0.55],[3.4,0.8],[5.4,1.0],[9,0.95],[15,0.9],[17.5,0.8],[19.6,0.7],[21.2,0.62],[23.5,0.5],[26.2,0.45]]}, // Jumeirah Beach Rd
  {k:1, pts:[[26.9,0.3],[28,0.55],[30,0.8],[31.6,1.25],[32.6,2.35],[34.5,3.3],[36,3.8]]},                                             // Deira corniche
  {k:1, pts:[[0.6,0.45],[0.6,9.7]]}, {k:1, pts:[[4.15,0.8],[4.15,9.7]]}, {k:1, pts:[[7.9,0.95],[7.9,9.7]]},
  {k:1, pts:[[11.4,0.92],[11.4,9.7]]}, {k:1, pts:[[14.9,0.9],[14.9,6.5]]}, {k:1, pts:[[21.3,0.62],[21.3,6.6]]},
  {k:1, pts:[[23.5,0.5],[23.5,5.5]]}, {k:1, pts:[[25.2,0.45],[25.2,6.0]]}, {k:1, pts:[[28.4,0.6],[28.4,5.4]]},
  {k:1, pts:[[30.6,0.8],[30.6,5.4]]},
  {k:2, pts:[[10.5,1.6],[24.3,1.5]]},                                                                 // Al Wasl Rd
  {k:2, pts:[[3.5,0.85],[3.56,-1.05]]},                                                                // Palm trunk
  {k:2, pts:(()=>{ const [a0,i0]=G(25.1412,55.1853), o=[]; for (let t=0;t<=1.001;t+=0.125){ const u=1-t; o.push([u*u*(a0+0.1)+2*u*t*(a0+0.5)+t*t*9.25, u*u*(i0+0.11)+2*u*t*(i0+0.24)+t*t*0.95]); } return o; })()}, // Burj Al Arab: curved causeway
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
  {k:'meydan',   at:G(25.1570,55.2980)},
  {k:'ibn',      at:G(25.0450,55.1180)},
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
  // creek-side
  {id:'alseef',      label:'Al Seef',       lat:25.2590, lng:55.2990},
  {id:'creekharbour',label:'Dubai Creek Harbour', lat:25.2010, lng:55.3500},
  {id:'aljaddaf',    label:'Al Jaddaf',     lat:25.2170, lng:55.3300},
  {id:'oudmetha',    label:'Oud Metha',     lat:25.2350, lng:55.3150},
  {id:'algarhoud',   label:'Al Garhoud',    lat:25.2400, lng:55.3450},
  // old Dubai + north
  {id:'satwa',       label:'Al Satwa',      lat:25.2250, lng:55.2750},
  {id:'alqusais',    label:'Al Qusais',     lat:25.2780, lng:55.3800},
  {id:'alnahda',     label:'Al Nahda',      lat:25.2900, lng:55.3700},
  {id:'almamzar',    label:'Al Mamzar',     lat:25.2960, lng:55.3450},
  // east
  {id:'mirdif',      label:'Mirdif',        lat:25.2180, lng:55.4200},
  {id:'alwarqa',     label:'Al Warqa',      lat:25.1900, lng:55.4100},
  {id:'alkhawaneej', label:'Al Khawaneej',  lat:25.2270, lng:55.4800},
  {id:'intlcity',    label:'International City', lat:25.1650, lng:55.4100},
  {id:'siliconoasis',label:'Silicon Oasis', lat:25.1200, lng:55.3800},
  {id:'meydan',      label:'Meydan',        lat:25.1600, lng:55.3000},
  {id:'nadalsheba',  label:'Nad Al Sheba',  lat:25.1500, lng:55.3300},
  {id:'d3',          label:'Design District', lat:25.1870, lng:55.2970},
  // south-west
  {id:'alsafa',      label:'Al Safa',       lat:25.1800, lng:55.2400},
  {id:'alsufouh',    label:'Al Sufouh',     lat:25.1100, lng:55.1700},
  {id:'barshaheights',label:'Barsha Heights', lat:25.0950, lng:55.1770},
  {id:'dubaiharbour',label:'Dubai Harbour', lat:25.0930, lng:55.1450},
  {id:'jvt',         label:'JVT',           lat:25.0500, lng:55.1900},
  {id:'motorcity',   label:'Motor City',    lat:25.0470, lng:55.2350},
  {id:'sportscity',  label:'Sports City',   lat:25.0400, lng:55.2200},
  {id:'ranches',     label:'Arabian Ranches', lat:25.0550, lng:55.2700},
  {id:'furjan',      label:'Al Furjan',     lat:25.0300, lng:55.1500},
  {id:'discovery',   label:'Discovery Gardens', lat:25.0400, lng:55.1400},
  {id:'ibnbattuta',  label:'Ibn Battuta',   lat:25.0450, lng:55.1180},
];
ZONES.forEach(z=>{ const p=toAI(z.lat,z.lng); z.a=p.a; z.i=p.i; });
const zoneById = id => ZONES.find(z=>z.id===id);
function nearestZone(a,i){
  let best=ZONES[0], bd=Infinity;
  ZONES.forEach(z=>{ const d=Math.hypot(z.a-a, z.i-i); if(d<bd){bd=d; best=z;} });
  return best;
}

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
    const rad = l.k==='meydan' ? 4 : l.k==='mall'||l.k==='terminal'||l.k==='atlantis'||l.k==='burj'||l.k==='ibn' ? 2 : 1;
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
  boatAt(6.2,-1.8,'yacht'); boatAt(13.2,-2.0,'dhow'); boatAt(21.5,-2.2,'yacht'); boatAt(26.4,-1.6,'dhow');

  OBJECTS.sort((p,q)=>p.d-q.d);
}

/* =========================================================
   RENDERING
   ========================================================= */
const OUT = '#4A3B30';
let LW = 0.8;   // outline width in world px (set per render)
const up = (p,h)=>[p[0], p[1]-h];

/* ---------- night palette: deep navy sea, dusky blue-grey land and roads ---------- */
let NIGHT = false;
const TILE_NIGHT = ['#0B1830','#112442','#394052','#333A4B','#2E3446','#2A3041','#1E322D','#0F223D','#252A36','#394052'];
const NIGHT_FIXED = {
  '#4A3B30':'#070B16', '#FFFFFF':'#4B5368', '#FBF4E6':'rgba(255,214,150,0.26)',
  'rgba(255,255,255,0.42)':'rgba(120,160,230,0.08)', 'rgba(110,80,50,0.14)':'rgba(0,0,0,0.22)', 'rgba(255,255,255,0.85)':'rgba(130,170,240,0.26)',
  'rgba(60,40,25,0.16)':'rgba(0,0,0,0.22)', 'rgba(255,255,255,0.45)':'rgba(150,180,230,0.08)', 'rgba(255,255,255,0.3)':'rgba(150,180,230,0.07)',
  'rgba(255,255,255,0.25)':'rgba(150,180,230,0.07)', 'rgba(255,255,255,0.28)':'rgba(255,255,255,0.04)', 'rgba(74,59,48,0.55)':'rgba(0,0,0,0.5)',
  'rgba(74,59,48,0.35)':'rgba(0,0,0,0.4)', 'rgba(120,140,160,0.45)':'rgba(0,0,0,0.3)',
};
const nightCache = new Map();
// every colour the renderer uses goes through C(): identity by day, a dusky night version after dark
function C(col){
  if (!NIGHT || typeof col!=='string') return col;
  let v = nightCache.get(col); if (v) return v;
  if (NIGHT_FIXED[col]) v = NIGHT_FIXED[col];
  else if (col[0]==='#' && col.length===7){
    const n=parseInt(col.slice(1),16), r=n>>16&255, g=n>>8&255, b=n&255, l=(0.299*r+0.587*g+0.114*b)/255;
    const ch=x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0');
    v = '#'+ch(r*0.12+20+l*30)+ch(g*0.14+26+l*32)+ch(b*0.2+42+l*40);
  } else v = col;
  nightCache.set(col, v); return v;
}

function polyPath(ctx, pts){
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for (let k=1;k<pts.length;k++) ctx.lineTo(pts[k][0],pts[k][1]);
  ctx.closePath();
}
function face(ctx, pts, fill){ polyPath(ctx,pts); ctx.fillStyle=C(fill); ctx.fill(); ctx.stroke(); }

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
    ctx.save(); ctx.strokeStyle=C(opts.floorColor || 'rgba(60,40,25,0.16)'); ctx.lineWidth = LW*0.7; ctx.stroke(); ctx.restore();
  }
  if (opts.mullion && h>20){
    ctx.save(); ctx.strokeStyle=C('rgba(255,255,255,0.45)'); ctx.lineWidth=LW*0.9; ctx.beginPath();
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
  const TC = NIGHT ? TILE_NIGHT : TILE_COLORS;
  for (let t=0;t<n;t++){ ctx.fillStyle=TC[t]; ctx.fill(tiles[t]); }
  ctx.lineWidth=LW*0.6;
  ctx.strokeStyle=C('rgba(255,255,255,0.42)'); ctx.stroke(waterGrid);
  ctx.strokeStyle=C('rgba(110,80,50,0.14)'); ctx.stroke(landGrid);
  ctx.lineWidth=LW*1.3; ctx.strokeStyle=C('rgba(255,255,255,0.85)'); ctx.stroke(foam);
  ctx.lineWidth=LW*0.8; ctx.strokeStyle=C(OUT);
  for (let t=0;t<n;t++){
    ctx.fillStyle=shade(TC[t], isWaterT(t)?0.8:0.82); ctx.fill(faceL[t]); ctx.stroke(faceL[t]);
    ctx.fillStyle=shade(TC[t], 0.66); ctx.fill(faceR[t]); ctx.stroke(faceR[t]);
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
  RUNWAYS_W.forEach(rw=>{ ctx.lineWidth=LW*0.8; ctx.strokeStyle=C(OUT); face(ctx, rw.poly, '#B7B0A6'); });
  ctx.setLineDash([4,3]); ctx.strokeStyle=C('#FFFFFF'); ctx.lineWidth=0.9; RUNWAYS_W.forEach(rw=>strokeLine(ctx, rw.line)); ctx.setLineDash([]);
  [2,1,0].forEach(k=>{ ctx.strokeStyle=C('#6C5E54'); ctx.lineWidth=RD[k].w+LW*2; ROADS_W.filter(r=>r.k===k).forEach(r=>strokeLine(ctx,r.pts)); });
  [2,1,0].forEach(k=>{ ctx.strokeStyle=C(k===0 ? '#948A83' : '#A1968E'); ctx.lineWidth=RD[k].w; ROADS_W.filter(r=>r.k===k).forEach(r=>strokeLine(ctx,r.pts)); });
  ctx.setLineDash([3,3]); ctx.strokeStyle=C('#FBF4E6'); ctx.lineWidth=0.6;
  ROADS_W.filter(r=>r.k<2).forEach(r=>strokeLine(ctx,r.pts));
  ctx.setLineDash([]);
  ctx.restore();
}


/* ---------- Burj Al Arab ----------
   On its round island off Umm Suqeim, joined to the shore by a curved causeway.
   A white sail with vertical ribs: one straight edge (the braced mast spine, needle on
   top) and one billowing edge; a helipad disc projecting near the top and the Skyview
   bar cantilevered a little below it. Geometry is in world px around the island's centre. */
function isoDisc(ctx, x, y, rx, ry, h, top, side){
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI); ctx.lineTo(x-rx, y-h); ctx.ellipse(x, y-h, rx, ry, 0, Math.PI, 0, true); ctx.closePath();
  ctx.fillStyle=C(side||shade(top,0.78)); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y-h, rx, ry, 0, 0, Math.PI*2); ctx.fillStyle=C(top); ctx.fill(); ctx.stroke();
}
const cub = (p0,p1,p2,p3,t)=>{ const u=1-t; return [u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0], u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]; };
// the sail outline as points relative to the island centre (shared by the canvas and the night glow)
const BAA = (()=>{
  const H = 92, spineB = [6,-3], spineT = [5,-H+2], tip = [3,-H];
  const edge = []; for (let t=0;t<=1.0001;t+=1/24) edge.push(cub([-2,-3],[-30,-28],[-23,-72],tip,t));
  return { H, spineB, spineT, tip, edge, heli:[-13,-H+15], bar:H-27 };
})();
function drawBAA(ctx, x, y){
  const g = BAA, P = p=>[x+p[0], y+p[1]];
  const spineAt = t=>[g.spineB[0]+(g.spineT[0]-g.spineB[0])*t, g.spineB[1]+(g.spineT[1]-g.spineB[1])*t];
  ctx.save(); ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
  isoDisc(ctx, x+1, y, 10, 5, 2.5, '#F1ECE1');                              // the island's plinth
  // sail body, then its shaded inner band along the spine
  ctx.beginPath(); ctx.moveTo(...P(g.spineB)); g.edge.forEach(p=>ctx.lineTo(...P(p))); ctx.lineTo(...P(g.spineT)); ctx.closePath();
  ctx.fillStyle=C('#FAF8F3'); ctx.fill(); ctx.stroke();
  const lerpTo = f => g.edge.map((p,i)=>{ const s=spineAt(i/(g.edge.length-1)); return [s[0]+(p[0]-s[0])*f, s[1]+(p[1]-s[1])*f]; });
  ctx.beginPath(); ctx.moveTo(...P(g.spineB)); lerpTo(0.28).forEach(p=>ctx.lineTo(...P(p))); ctx.lineTo(...P(g.spineT)); ctx.closePath();
  ctx.fillStyle=C('#E7ECEF'); ctx.fill();
  // vertical ribs following the billow
  ctx.strokeStyle=C('rgba(110,130,150,0.55)'); ctx.lineWidth=LW*0.55;
  [0.2,0.4,0.6,0.8].forEach(f=>{ ctx.beginPath(); lerpTo(f).forEach((q,i)=>i ? ctx.lineTo(...P(q)) : ctx.moveTo(...P(q))); ctx.stroke(); });
  // the braced mast: two rails with X bracing
  const r0=g.spineB[0], r1=r0+3.5, top=g.spineT[1]-3;
  ctx.fillStyle=C('#E3E8EC'); ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
  ctx.beginPath(); ctx.moveTo(x+r0,y-2); ctx.lineTo(x+r1,y-2); ctx.lineTo(x+r1-1,y+top); ctx.lineTo(x+r0-1,y+top); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=C('#8FA0AF'); ctx.lineWidth=LW*0.6; ctx.beginPath();
  for (let z=-4; z>top+4; z-=7){ ctx.moveTo(x+r0,y+z); ctx.lineTo(x+r1-1,y+z-7); ctx.moveTo(x+r1,y+z); ctx.lineTo(x+r0-1,y+z-7); }
  ctx.stroke();
  // needle
  const nx = x+r0+1.5, ny = y-g.H-2;
  ctx.strokeStyle=C(OUT); ctx.lineWidth=2.2; ctx.beginPath(); ctx.moveTo(nx,ny+2); ctx.lineTo(nx,ny-18); ctx.stroke();
  ctx.strokeStyle=C('#E6ECF0'); ctx.lineWidth=1; ctx.stroke();
  // Skyview bar: cantilevered off the mast, a little below the helipad
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
  isoBox(ctx, x+r0+TW/2*0.75, y+TH/2*0.75, 0.75, 0.2, g.bar, 4, '#E8EDF1', {top:'#F5F8FA', right:'#C6D1DA'});
  // helipad disc on its strut
  const hx = x+g.heli[0], hy = y+g.heli[1];
  ctx.lineWidth=LW*1.2; ctx.beginPath(); ctx.moveTo(hx+6, hy+3); ctx.lineTo(hx+1, hy+1); ctx.stroke();
  ctx.lineWidth=LW;
  isoDisc(ctx, hx, hy, 7, 3.3, 1.4, '#D5DDE2');
  ctx.strokeStyle=C('#FFFFFF'); ctx.lineWidth=LW*0.7; ctx.beginPath(); ctx.ellipse(hx, hy-1.4, 4.6, 2.2, 0, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}
// night glow outline (SVG path in local coords) for the overlay
function baaGlowPath(){ return 'M'+[BAA.spineB, ...BAA.edge, BAA.spineT].map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L')+'Z'; }

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
      ctx.strokeStyle=C(OUT); ctx.lineWidth=2.8; ctx.beginPath(); ctx.moveTo(x,y-z); ctx.lineTo(x,y-z-46); ctx.stroke();
      ctx.strokeStyle=C('#E6F1F6'); ctx.lineWidth=1.4; ctx.stroke(); ctx.restore();
      break;
    }
    case 'mall': isoBox(ctx,x,y,1.3,0.9,0,9,'#F1E2C4',{floors:4}); isoBox(ctx,x-4,y-1,0.4,0.4,9,5,'#E7D3AE'); break;
    case 'baa': drawBAA(ctx, x, y); break;
    case 'ain': {
      const cy=y-36, R=30;
      ctx.save(); ctx.lineCap='round';
      ctx.strokeStyle=C(OUT); ctx.lineWidth=2.6; ctx.beginPath(); ctx.moveTo(x-8,y); ctx.lineTo(x,cy); ctx.lineTo(x+8,y); ctx.stroke();
      ctx.strokeStyle=C('#D9DDE1'); ctx.lineWidth=1.4; ctx.stroke();
      ctx.strokeStyle=C('rgba(74,59,48,0.55)'); ctx.lineWidth=0.5; ctx.beginPath();
      for (let k=0;k<12;k++){ const t=k/12*Math.PI*2; ctx.moveTo(x,cy); ctx.lineTo(x+Math.cos(t)*R*0.38, cy+Math.sin(t)*R); } ctx.stroke();
      ctx.strokeStyle=C(OUT); ctx.lineWidth=3.6; ctx.beginPath(); ctx.ellipse(x,cy,R*0.38,R,0,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle=C('#F4F6F8'); ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle=C('#E8B84B');
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
      ctx.save(); ctx.lineWidth=LW; ctx.strokeStyle=C(OUT);
      ctx.fillStyle=C('#D3D8DE'); ctx.beginPath(); ctx.ellipse(x,y-18,10,13,-0.35,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle=C('#8E99A5'); ctx.beginPath(); ctx.ellipse(x+1.5,y-19,4.2,7.2,-0.35,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle=C('rgba(74,59,48,0.35)'); ctx.lineWidth=LW*0.5; ctx.beginPath(); ctx.moveTo(x-6,y-10); ctx.lineTo(x-3,y-26); ctx.moveTo(x+5,y-8); ctx.lineTo(x+8,y-24); ctx.stroke();
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
    case 'meydan': {
      // racecourse: an oval dirt track round a green infield, grandstand along the front straight
      const iso = (r,k)=>{ ctx.beginPath(); for (let t=0;t<=64;t++){ const a=t/64*Math.PI*2, gx=Math.cos(a)*r*1.5, gy=Math.sin(a)*r;
        const px=x+(gx-gy)*TW/2, py=y+(gx+gy)*TH/2; t?ctx.lineTo(px,py):ctx.moveTo(px,py); } ctx.closePath(); ctx.fillStyle=C(k); ctx.fill(); ctx.stroke(); };
      ctx.lineWidth=LW; ctx.strokeStyle=C(OUT);
      iso(2.6,'#C99A63'); iso(2.1,'#8CC46B'); iso(1.3,'#7FB862');
      isoBox(ctx, x-TW/2*2.95, y+TH/2*2.95, 2.2, 0.3, 0, 11, '#F2EEE6', {floors:4, top:'#DDE7EC'});   // just outside the track at gy=+2.95
      break;
    }
    case 'ibn': isoBox(ctx,x,y,0.5,1.8,0,8,'#E9C99A',{floors:4, top:'#D9A36E'}); break;
    case 'terminal':
      isoBox(ctx,x,y,1.6,0.35,0,8,'#E5EBEE',{floors:4});
      isoBox(ctx,x+30,y+6,0.12,0.12,0,28,'#E5EBEE'); isoBox(ctx,x+30,y+6,0.22,0.22,28,5,'#9FC0D6');
      break;
  }
}
function drawTree(ctx,o){
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
  ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x,o.y-3); ctx.stroke();
  ctx.fillStyle=C('#6DB35A'); ctx.beginPath(); ctx.arc(o.x,o.y-5,2.7,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle=C('rgba(255,255,255,0.28)'); ctx.beginPath(); ctx.arc(o.x-0.9,o.y-6,1,0,Math.PI*2); ctx.fill();
}
function drawBoat(ctx,o){
  const x=o.x, y=o.y; ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
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
    ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
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
   CITY LIGHTS (night only)
   Generated once from the city itself: lit windows on the towers (mostly warm,
   some cool, irregular), streetlights along the roads, DXB runway lights, the Palm
   crescent, boats, and the Burj Khalifa's spire. Drawn from pre-rendered bitmaps
   when zoomed out; culled dots when zoomed in. A small subset twinkles: those
   live on two extra canvases whose opacity CSS animates, so twinkling costs no JS.
   ========================================================= */
let LIGHTS = null, lightsBmp = null;
const WARM = ['#FFD27A','#FFC56B','#FFE0A3','#FFB85C'], COOL = ['#E4EEFF','#CFE0FF'];
function buildLights(){
  const L = [], rnd = mulberry32(4242);
  // k: 0 window, 1 streetlight, 2 accent (runway, boats, beacons); tw: 0 steady, 1 or 2 twinkle group
  const add = (x,y,c,k,tw)=>L.push({x,y,c,k,tw:tw||0});
  const twk = p => rnd()<p ? (rnd()<0.5?1:2) : 0;
  const faceLights = (A,B,h,p,step,cols,z0)=>{
    for (let z=z0||2.4; z<h-1.2; z+=step) for (let q=0;q<cols;q++){
      if (rnd()>p) continue;
      const u = (q+0.5)/cols*0.8+0.1+(rnd()-0.5)*0.05;
      add(A[0]+(B[0]-A[0])*u, A[1]+(B[1]-A[1])*u-z, rnd()<0.15 ? COOL[rnd()<0.5?0:1] : WARM[Math.floor(rnd()*4)], 0, twk(0.1));
    }
  };
  const corners = (x,y,hx,hy)=>{ const ax=TW/2*hx, ay=TH/2*hx, bx=-TW/2*hy, by=TH/2*hy;
    return { W:[x-ax+bx,y-ay+by], S:[x+ax+bx,y+ay+by], E:[x+ax-bx,y+ay-by] }; };
  for (const o of OBJECTS){
    if (o.k==='box'){
      const {W,S,E} = corners(o.x,o.y,o.hx,o.hy), st=o.st;
      if (st==='villa'){ if (rnd()<0.65){ const u=0.3+rnd()*0.4; add(W[0]+(S[0]-W[0])*u, W[1]+(S[1]-W[1])*u-2.3, WARM[Math.floor(rnd()*4)], 0, twk(0.08)); } continue; }
      const p = st==='glass'?0.4 : st==='mid'?0.32 : st==='low'?0.28 : 0.1, cols = st==='glass'?3:2, step = st==='glass'?3.4:3.2;
      faceLights(W,S,o.h,p,step,cols); faceLights(S,E,o.h,p*0.8,step,cols);
    } else if (o.k==='boat'){ add(o.x-3,o.y-2,'#FFE9B8',2); add(o.x+3,o.y-2, rnd()<0.5?'#FF6B5E':'#7CFFB2',2,1); }
    else if (o.k==='lm' && o.lm==='burj'){
      // the tower's lit column, then the spire: a white strobe and a red beacon at the tip
      const tiers=[[0.62,30],[0.52,30],[0.43,28],[0.34,26],[0.26,24],[0.19,20],[0.13,18]];
      let z=3;
      tiers.forEach(([s,h])=>{ const {W,S,E}=corners(o.x,o.y,s,s); for (let zz=z+2; zz<z+h-1; zz+=2.6){ [[W,S],[S,E]].forEach(([A,B])=>{ for (let q=0;q<2;q++){ if (rnd()<0.55){ const u=0.3+q*0.4; add(A[0]+(B[0]-A[0])*u, A[1]+(B[1]-A[1])*u-zz, COOL[q], 0, twk(0.06)); } } }); } z+=h+2.5; });
      add(o.x, o.y-z-30, '#FFFFFF', 2, 1); add(o.x, o.y-z-46, '#FF3B30', 2, 2);
    } else if (o.k==='lm' && o.lm==='baa'){
      // helipad ring, the Skyview bar's windows, and a beacon on the needle
      const g = BAA, hx = o.x+g.heli[0], hy = o.y+g.heli[1]-1.4;
      for (let t=0;t<Math.PI*2;t+=Math.PI/5) add(hx+Math.cos(t)*6, hy+Math.sin(t)*2.6, '#FFF6D8', 2, 1);
      for (let q=0;q<5;q++) add(o.x+g.spineB[0]+3+q*2.6, o.y-g.bar-2+q*1.3, '#FFD9A0', 0);
      add(o.x+g.spineB[0]+1.5, o.y-g.H-2-18, '#FF3B30', 2, 2);
    } else if (o.k==='lm' && (o.lm==='frame' || o.lm==='ain' || o.lm==='atlantis' || o.lm==='terminal')){
      for (let k=0;k<10;k++) add(o.x+(rnd()-0.5)*18, o.y-4-rnd()*30, WARM[k%4], 0, twk(0.2));
    }
  }
  // streetlights: brighter amber on the highways, warm white elsewhere, alternating sides
  for (const r of ROADS_W){
    const gap = r.k===0?5.5:r.k===1?7:9, off = RD[r.k].w/2+0.5, col = r.k===0?'#FFB257':'#FFDDA6';
    let carry = 0, side = 1;
    for (let k=1;k<r.pts.length;k++){
      const [x0,y0]=r.pts[k-1], [x1,y1]=r.pts[k], len=Math.hypot(x1-x0,y1-y0); if (!len) continue;
      const nx=-(y1-y0)/len, ny=(x1-x0)/len;
      for (let d=gap-carry; d<len; d+=gap){ const t=d/len; side=-side; add(x0+(x1-x0)*t+nx*off*side, y0+(y1-y0)*t+ny*off*side, col, 1); }
      carry = (carry+len)%gap;
    }
  }
  // DXB: blue edge lights and a warm centre line on both runways
  RUNWAYS.forEach(rw=>{ for (let i=rw.i[0]; i<=rw.i[1]; i+=0.1){
    [-0.09,0.09].forEach(da=>{ const p=aiToWorld(rw.a+da,i); add(p.x,p.y,'#8FCBFF',2); });
    const c=aiToWorld(rw.a,i+0.05); add(c.x,c.y,'#FFF1C4',2, i%0.4<0.1?1:0);
  }});
  // the Palm: lights along both edges of the crescent and down each frond
  for (let th=-PALM.crSpan; th<=PALM.crSpan; th+=0.03) [PALM.cr-PALM.crW-0.02, PALM.cr+PALM.crW+0.02].forEach(r=>{
    const p=aiToWorld(PALM.hub[0]+Math.sin(th)*r, PALM.hub[1]-Math.cos(th)*r); add(p.x,p.y,'#FFD58A',1, twk(0.15)); });
  const fstep=(2*PALM.span)/(PALM.fronds-1);
  for (let f=0; f<PALM.fronds; f++){ const th=-PALM.span+f*fstep;
    for (let r=PALM.fr0+0.25; r<PALM.fr1; r+=0.2){ const p=aiToWorld(PALM.hub[0]+Math.sin(th)*r, PALM.hub[1]-Math.cos(th)*r); add(p.x,p.y,'#FFE3AD',1, twk(0.12)); } }
  // boats moored in the marina
  for (let k=1;k<MARINA.length;k++) for (let t=0.15;t<1;t+=0.3){
    const a=MARINA[k-1][0]+(MARINA[k][0]-MARINA[k-1][0])*t, i=MARINA[k-1][1]+(MARINA[k][1]-MARINA[k-1][1])*t, p=aiToWorld(a,i);
    add(p.x-1.5,p.y,'#FFF4D6',2); add(p.x+1.5,p.y-0.5, rnd()<0.5?'#FF6B5E':'#7CFFB2',2, rnd()<0.5?1:2);
  }
  LIGHTS = L;
}
const glowCache = new Map();
function glowSprite(col){
  let g = glowCache.get(col); if (g) return g;
  g = document.createElement('canvas'); g.width = g.height = 32;
  const c = g.getContext('2d'), grd = c.createRadialGradient(16,16,0,16,16,16);
  grd.addColorStop(0, col); grd.addColorStop(0.18, col); grd.addColorStop(0.35, col+'66'); grd.addColorStop(1, col+'00');
  c.fillStyle = grd; c.fillRect(0,0,32,32);
  glowCache.set(col, g); return g;
}
// px = device pixels per world px, so dots stay visible when zoomed out
const LCELL = 96;
let LIGHT_GRID = null;
function lightsIn(view){
  if (!view) return LIGHTS;
  if (!LIGHT_GRID){
    LIGHT_GRID = new Map();
    for (const l of LIGHTS){ const k = Math.floor(l.x/LCELL)+','+Math.floor(l.y/LCELL); if (!LIGHT_GRID.has(k)) LIGHT_GRID.set(k,[]); LIGHT_GRID.get(k).push(l); }
  }
  const out = [];
  for (let cx=Math.floor((view.x0-4)/LCELL); cx<=Math.floor((view.x1+4)/LCELL); cx++)
    for (let cy=Math.floor((view.y0-4)/LCELL); cy<=Math.floor((view.y1+4)/LCELL); cy++){ const c = LIGHT_GRID.get(cx+','+cy); if (c) out.push(c); }
  return out.flat();
}
function drawLights(ctx, view, tw, px){
  const win = Math.max(0.8, 1.3/px), gl = Math.max(3.2, 5/px);
  for (const l of lightsIn(view)){
    if (l.tw !== tw) continue;
    if (l.k===0){ ctx.fillStyle = l.c; ctx.fillRect(l.x-win/2, l.y-win*0.6, win, win*1.2); }
    else { const r = l.k===2 ? gl*0.8 : gl; ctx.drawImage(glowSprite(l.c), l.x-r, l.y-r, r*2, r*2); }
  }
}
function buildLightBitmaps(){
  const sc = Math.min(1, cacheScale*0.75), mk = tw=>{
    const cv = document.createElement('canvas'); cv.width = Math.round(WORLD.w*sc); cv.height = Math.round(WORLD.h*sc);
    const c = cv.getContext('2d'); c.scale(sc, sc); drawLights(c, null, tw, sc); return cv; };
  lightsBmp = { sc, a:mk(1), b:mk(2) };
}


/* =========================================================
   CARS: little pixel cars driving the map's own roads
   Sheikh Zayed Road is busiest, side roads quiet. Coloured cars by day, headlights and
   taillights at night. They live on their own canvas under the stamps and labels,
   never take taps, fade out when zoomed out, and only roads in view get cars (80 max).
   The loop runs at ~30 fps and stops in the background, on low battery, when a
   full screen covers the map, and under reduced motion (a static frame instead).
   ========================================================= */
const CAR_MAX = 80, CAR_COLORS = ['#E5533D','#F2B233','#3F7FD9','#F7F4EE','#34343C','#4FAE6B','#C7CED6','#8E5BD6','#E07BAA'];
let carCanvas = null, carCtx = null, cars = [], carLoop = null, carLast = 0, lowPower = false, carRng = mulberry32(77);
function prepCarRoads(){
  ROADS_W.forEach((r,idx)=>{
    let L = 0; r.cum = [0];
    for (let k=1;k<r.pts.length;k++){ L += Math.hypot(r.pts[k][0]-r.pts[k-1][0], r.pts[k][1]-r.pts[k-1][1]); r.cum.push(L); }
    r.len = L;
    r.bb = { x0:Math.min(...r.pts.map(p=>p[0])), x1:Math.max(...r.pts.map(p=>p[0])), y0:Math.min(...r.pts.map(p=>p[1])), y1:Math.max(...r.pts.map(p=>p[1])) };
    r.busy = idx===0 ? 7 : r.k===0 ? 3 : r.k===1 ? 1 : 0.35;        // index 0 is Sheikh Zayed Road
    r.speed = r.k===0 ? 20 : r.k===1 ? 13 : 8;                     // world px per second
  });
  markHiddenRoad();
}
// Cars live on a layer above the city, so stretches of road that pass behind a building
// (one standing in front of them) are worked out once here and cars aren't drawn there.
const OCC_STEP = 1.5, LM_BOX = { burj:[20,240], baa:[30,115], frame:[16,56], ain:[24,70], atlantis:[30,40], motf:[12,34], terminal:[36,34], moe:[20,14], mall:[22,14], ibn:[16,12], meydan:[40,14] };
function markHiddenRoad(){
  const CELL = 32, grid = new Map(), key = (x,y)=>x+','+y;
  for (const o of OBJECTS){
    let hw, top, bot;
    if (o.k==='box'){ hw = TW/2*(o.hx+o.hy); top = o.y - o.h - TH/2*(o.hx+o.hy); bot = o.y + TH/2*(o.hx+o.hy); }
    else if (o.k==='lm' && LM_BOX[o.lm]){ hw = LM_BOX[o.lm][0]/2; top = o.y - LM_BOX[o.lm][1]; bot = o.y + 6; }
    else continue;
    const b = { x0:o.x-hw, x1:o.x+hw, y0:top, y1:bot, d:o.d };
    for (let cx=Math.floor(b.x0/CELL); cx<=Math.floor(b.x1/CELL); cx++) for (let cy=Math.floor(b.y0/CELL); cy<=Math.floor(b.y1/CELL); cy++){
      const k = key(cx,cy); if (!grid.has(k)) grid.set(k,[]); grid.get(k).push(b); }
  }
  ROADS_W.forEach(r=>{
    const n = Math.ceil(r.len/OCC_STEP)+1; r.occ = new Uint8Array(n);
    for (let i=0;i<n;i++){
      const p = roadPoint(r, i*OCC_STEP), ai = worldToAI(p.x, p.y), g = aiToGrid(ai.a, ai.i), d = g.gx+g.gy;
      const list = grid.get(key(Math.floor(p.x/CELL), Math.floor(p.y/CELL)));
      if (list && list.some(b=>b.d > d+0.6 && p.x>b.x0 && p.x<b.x1 && p.y>b.y0 && p.y<b.y1)) r.occ[i] = 1;
    }
  });
}
function roadPoint(r, s){
  let k = 1; while (k < r.cum.length-1 && r.cum[k] < s) k++;
  const a = r.pts[k-1], b = r.pts[k], seg = r.cum[k]-r.cum[k-1] || 1, t = Math.max(0, Math.min(1, (s-r.cum[k-1])/seg));
  return { x:a[0]+(b[0]-a[0])*t, y:a[1]+(b[1]-a[1])*t, dx:(b[0]-a[0])/seg, dy:(b[1]-a[1])/seg };
}
const inView = (x,y,v,m)=> x>v.x0-m && x<v.x1+m && y>v.y0-m && y<v.y1+m;
function roadsInView(v){
  return ROADS_W.filter(r=>r.bb.x1>v.x0 && r.bb.x0<v.x1 && r.bb.y1>v.y0 && r.bb.y0<v.y1).map(r=>{
    // how much of this road is on screen, weighted by how busy it is
    let on = 0; for (let k=1;k<r.pts.length;k++){ const [x,y]=r.pts[k]; if (inView(x,y,v,40)) on += r.cum[k]-r.cum[k-1]; }
    return { r, w:Math.max(on, 1)*r.busy };
  });
}
function spawnCar(list, v){
  let tot = list.reduce((s,o)=>s+o.w, 0), pick = carRng()*tot, r = list[0].r;
  for (const o of list){ pick -= o.w; if (pick <= 0){ r = o.r; break; } }
  // start somewhere on the visible stretch if we can
  let s = carRng()*r.len;
  for (let tries=0; tries<6; tries++){ const p = roadPoint(r, s); if (inView(p.x,p.y,v,20)) break; s = carRng()*r.len; }
  const dir = carRng()<0.5 ? 1 : -1;
  return { r, s, dir, v:r.speed*(0.75+carRng()*0.5), lane:dir*RD[r.k].w*0.22, c:CAR_COLORS[Math.floor(carRng()*CAR_COLORS.length)] };
}
function carView(){ return { x0:-cam.x/cam.s, y0:-cam.y/cam.s, x1:(viewW-cam.x)/cam.s, y1:(viewH-cam.y)/cam.s }; }
function carsWanted(){
  const z = cam.s/baseFit;
  return z >= LOD_MID && viewW > 0 && !document.hidden && !picking;
}
function updateCars(dt){
  const v = carView(), list = roadsInView(v);
  if (!list.length){ cars = []; return; }
  const visLen = list.reduce((s,o)=>s+o.w/o.r.busy, 0);
  const target = Math.min(CAR_MAX, Math.round(visLen/(22/Math.min(1.6, cam.s/baseFit/2))));
  while (cars.length < target) cars.push(spawnCar(list, v));
  if (cars.length > target) cars.length = target;
  for (let k=0;k<cars.length;k++){
    const c = cars[k];
    c.s += c.dir*c.v*dt;
    const p = c.s>=0 && c.s<=c.r.len ? roadPoint(c.r, c.s) : null;
    if (!p || !inView(p.x,p.y,v,60)) cars[k] = spawnCar(list, v);
  }
}
function drawCars(){
  if (!carCtx) return;
  carCtx.setTransform(1,0,0,1,0,0); carCtx.clearRect(0,0,carCanvas.width,carCanvas.height);
  if (!carsWanted()) return;
  carCtx.setTransform(dpr*cam.s,0,0,dpr*cam.s,dpr*cam.x,dpr*cam.y);
  const L = 1.7, Wd = 0.8;                     // half length / half width in world px
  for (const c of cars){
    if (c.r.occ[Math.round(c.s/OCC_STEP)]) continue;       // behind a building
    const p = roadPoint(c.r, c.s), dx = p.dx*c.dir, dy = p.dy*c.dir, nx = -dy, ny = dx;
    const x = p.x + nx*c.lane*c.dir, y = p.y + ny*c.lane*c.dir;
    const q = (a,b)=>[x+dx*a+nx*b, y+dy*a+ny*b];
    const body = [q(L,Wd), q(L,-Wd), q(-L,-Wd), q(-L,Wd)];
    carCtx.beginPath(); body.forEach((pt,i)=>i?carCtx.lineTo(pt[0],pt[1]):carCtx.moveTo(pt[0],pt[1])); carCtx.closePath();
    carCtx.fillStyle = C(c.c); carCtx.fill();
    if (cam.s > 1.2){ carCtx.lineWidth = 0.25; carCtx.strokeStyle = C(OUT); carCtx.stroke(); }
    if (NIGHT){
      // headlights ahead, taillights behind
      carCtx.drawImage(glowSprite('#FFF1C9'), x+dx*(L+1.2)-1.6, y+dy*(L+1.2)-1.6, 3.2, 3.2);
      carCtx.fillStyle = '#FF3B30'; const t = q(-L,0); carCtx.fillRect(t[0]-0.35, t[1]-0.35, 0.7, 0.7);
    } else {
      const r0 = q(0.5,0.55), r1 = q(-0.6,-0.55);   // roof
      carCtx.fillStyle = 'rgba(255,255,255,0.45)'; carCtx.fillRect(Math.min(r0[0],r1[0]), Math.min(r0[1],r1[1]), Math.abs(r0[0]-r1[0])||0.6, Math.abs(r0[1]-r1[1])||0.6);
    }
  }
}
function coveredByScreen(){ return !!document.querySelector('#screens .screen.in'); }
function carTick(t){
  carLoop = null;
  if (!carsWanted() || lowPower || reduceMotion || coveredByScreen()){ drawCars(); return; }
  const dt = Math.min(0.1, (t-(carLast||t))/1000);
  if (t - carLast >= 30){ carLast = t; updateCars(dt); drawCars(); }
  carLoop = requestAnimationFrame(carTick);
}
function kickCars(){
  if (!carCtx || !ROADS_W || !ROADS_W[0].cum) return;
  carCanvas.classList.toggle('on', carsWanted());
  if (carsWanted() && !cars.length) updateCars(0);
  if (!carLoop && carsWanted() && !lowPower && !reduceMotion && !coveredByScreen()){ carLast = 0; carLoop = requestAnimationFrame(carTick); }
  else if (!carLoop) drawCars();               // static frame (reduced motion, low battery, covered)
}
if (navigator.getBattery) navigator.getBattery().then(b=>{
  const f = ()=>{ lowPower = !b.charging && b.level <= 0.2; kickCars(); };
  f(); b.addEventListener('levelchange', f); b.addEventListener('chargingchange', f);
}).catch(()=>{});

/* =========================================================
   ENGINE: canvas, camera, gestures, overlay (stamps, area chips, you)
   The app hands the map a list of stamp items and a renderer; the map
   clusters them in screen space, positions them and reports taps back.
   ========================================================= */
const cam = { x:0, y:0, s:1 };
let baseFit = 0.2, MIN_S = 0.15;
const MAX_S = 7;
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

let wrap, canvas, ctx, stampsLayer, labelsLayer, fxLayer, meEl, twinkles = [], fxEls = [];
let opts = {};
let dpr = Math.min(window.devicePixelRatio||1, 2);
let cache = null, cacheScale = 1;
let viewW = 0, viewH = 0, interacting = false, rafPending = false, built = false;
let picking = false, needsCenter = true, lastW = 0;
const readyCbs = [];

function buildCache(){
  const maxPx = 9e6;
  cacheScale = Math.min(1.7, Math.sqrt(maxPx/(WORLD.w*WORLD.h)));
  cache = document.createElement('canvas');
  cache.width = Math.round(WORLD.w*cacheScale); cache.height = Math.round(WORLD.h*cacheScale);
  const c = cache.getContext('2d');
  c.scale(cacheScale, cacheScale);
  LW = 0.75;
  drawScene(c, null);
  // at night the steady city lights are baked in, so panning costs the same as by day
  if (NIGHT && LIGHTS){ c.globalAlpha = 0.85; drawLights(c, null, 0, cacheScale); c.globalAlpha = 1; }
}
function resizeCanvas(){
  const r = wrap.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  viewW = r.width; viewH = r.height;
  dpr = Math.min(window.devicePixelRatio||1, 2);
  [canvas, ...twinkles, carCanvas].forEach(cv=>{ cv.width = Math.round(viewW*dpr); cv.height = Math.round(viewH*dpr); cv.style.width = viewW+'px'; cv.style.height = viewH+'px'; });
  return true;
}
// lights sit dimmer at zoom levels where stamps and labels show, so they never compete
function blitLights(c, bmp, view){
  const sc = lightsBmp.sc, x0 = Math.max(0, view.x0), y0 = Math.max(0, view.y0), x1 = Math.min(WORLD.w, view.x1), y1 = Math.min(WORLD.h, view.y1);
  if (x1<=x0 || y1<=y0) return;
  c.drawImage(bmp, x0*sc, y0*sc, (x1-x0)*sc, (y1-y0)*sc, x0, y0, x1-x0, y1-y0);
}
let twinklePaused = false;
function renderLights(view, fromCache){
  const z = cam.s/baseFit, a = z < LOD_MID ? 1 : z < LOD_NEAR ? 0.78 : 0.6, px = cam.s*dpr;
  // steady lights come baked into the cached city; close up they're drawn crisp (and dimmer, under the stamps)
  if (!fromCache){ ctx.globalAlpha = a; drawLights(ctx, view, 0, px); ctx.globalAlpha = 1; }
  // twinkling pauses while the map moves (nobody sees it mid-pan) and resumes when it settles
  if (interacting){ if (!twinklePaused){ twinklePaused = true; wrap.classList.add('moving'); } return; }
  if (twinklePaused){ twinklePaused = false; wrap.classList.remove('moving'); }
  twinkles.forEach((tc,k)=>{
    const c = tc.getContext('2d');
    c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,tc.width,tc.height);
    c.setTransform(dpr*cam.s,0,0,dpr*cam.s,dpr*cam.x,dpr*cam.y); c.globalAlpha = a;
    if (px <= lightsBmp.sc*1.6) blitLights(c, k ? lightsBmp.b : lightsBmp.a, view); else drawLights(c, view, k+1, px);
  });
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
  const view = { x0:-cam.x/cam.s, y0:-cam.y/cam.s, x1:(viewW-cam.x)/cam.s, y1:(viewH-cam.y)/cam.s };
  // while panning/zooming through busy views use the cached bitmap; redraw crisp once you let go
  const fromCache = !needCrisp || (interacting && visTiles > 1100);
  if (fromCache){
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cache, 0, 0, WORLD.w, WORLD.h);
  } else {
    LW = Math.max(0.22, Math.min(0.8, 1.05/cam.s));
    drawScene(ctx, view);
  }
  if (NIGHT && LIGHTS) renderLights(view, fromCache);
  drawCars(); kickCars();
  updateOverlay();
  if (opts.onViewChange) opts.onViewChange();
}

/* ---------- camera ---------- */
function aiBounds(pts){
  const w=pts.map(([a,i])=>aiToWorld(a,i)), xs=w.map(p=>p.x), ys=w.map(p=>p.y);
  return { x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys)-60, y1:Math.max(...ys) };
}
// how far the camera may roam (all the land), and what "fit city" frames (palm crescent to the airport)
const FRAME = aiBounds([[-5.6,-4.8],[35.8,-4.8],[35.8,21.2],[-5.6,21.2]]);
const CORE  = aiBounds([[-2.4,-4.8],[31.8,-4.8],[31.8,9.9],[-2.4,9.9]]);
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
  const b = narrow ? {x0:CORE.x0+(CORE.x1-CORE.x0)*0.1, x1:CORE.x1-(CORE.x1-CORE.x0)*0.06, y0:CORE.y0, y1:CORE.y1} : CORE;
  baseFit = fitScaleFor(b, {x:10, top:20, bottom:20});
  MIN_S = Math.min(baseFit*0.8, fitScaleFor(FRAME, {x:10, top:20, bottom:20}));
  return b;
}
function fitCity(animate){
  const b = computeBaseFit();
  const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
  animate ? flyTo(cx,cy,baseFit) : setView(cx,cy,baseFit);
}
// frame a set of world points; on a phone never zoom out further than ~2x so the city stays readable
function fitPoints(pts, animate, pad){
  if (!pts.length) return fitCity(animate);
  const b = { x0:Math.min(...pts.map(p=>p.x)), x1:Math.max(...pts.map(p=>p.x)), y0:Math.min(...pts.map(p=>p.y)), y1:Math.max(...pts.map(p=>p.y)) };
  let s = Math.max(baseFit, Math.min(2.2, fitScaleFor(b, pad||{x:50, top:130, bottom:90})));
  let cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2 - 20/s;
  if (viewW < 600 && s < baseFit*1.9){ s = baseFit*1.9; }
  animate ? flyTo(cx,cy,s) : setView(cx,cy,s);
}
let flyAnim = null;
function flyTo(cx, cy, s, dur){
  s = Math.max(MIN_S, Math.min(MAX_S, s));
  if (reduceMotion || !viewW){ setView(cx,cy,s); return; }
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

/* ---------- gestures: pan (with momentum), pinch, wheel, double-tap ---------- */
let inertia = null;
function stopInertia(){ if (inertia){ cancelAnimationFrame(inertia); inertia=null; interacting=false; } }
function initGestures(){
  const pointers = new Map();
  let downAt=null, dragged=false, lastDist=null, lastMid=null, vel={x:0,y:0}, lastMove=0, lastTap={t:0,x:0,y:0};
  const SLOP=6;
  const uiTarget = t => t.closest('.map-ui');

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
      dragged=true; interacting=true;
      if (opts.onDragStart) opts.onDragStart();
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
      if (!dragged && e.type==='pointerup' && !e.target.closest('.stamp-anchor, .map-dot, .map-label, .me')){
        const now=performance.now();
        if (now-lastTap.t < 300 && Math.hypot(e.clientX-lastTap.x, e.clientY-lastTap.y) < 30){
          const r=wrap.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
          const wx=(sx-cam.x)/cam.s, wy=(sy-cam.y)/cam.s, ns=Math.min(MAX_S, cam.s*2);
          flyTo(wx - (sx-viewW/2)/ns, wy - (sy-viewH/2)/ns, ns, 320);
          lastTap={t:0,x:0,y:0};
        } else {
          lastTap={t:now, x:e.clientX, y:e.clientY};
          if (opts.onEmptyTap) opts.onEmptyTap();
        }
      }
    }
  }
  ['pointerup','pointercancel'].forEach(ev=>wrap.addEventListener(ev, endPointer));
  wrap.addEventListener('pointerleave', e=>{ if (e.pointerType==='mouse') endPointer(e); });
  // a drag that ends over a stamp must not also count as a tap on it
  wrap.addEventListener('click', e=>{ if (dragged){ e.stopPropagation(); e.preventDefault(); } }, true);

  let wheelTimer=null;
  wrap.addEventListener('wheel', e=>{
    if (uiTarget(e.target) && e.target.closest('.scrolls')) return;
    e.preventDefault(); stopInertia();
    interacting=true; clearTimeout(wheelTimer); wheelTimer=setTimeout(()=>{ interacting=false; requestRender(); }, 160);
    const r=wrap.getBoundingClientRect();
    const dy = e.deltaMode===1 ? e.deltaY*16 : e.deltaY;
    zoomAt(e.clientX-r.left, e.clientY-r.top, cam.s*Math.exp(-dy*0.0022));
  }, {passive:false});
}

/* =========================================================
   OVERLAY: level of detail, stamps and labels
   Three zoom bands keep the map calm however many places there are:
     far   one marker per area (stamp and count in one), nothing else
     mid   stamps clustered by screen density; names only for areas that have places
     near  single stamps, undiscovered spots as plain dots; a name only for the
           selected place and the few nearest ones
   Labels share one budget and never overlap. Only what's on screen gets a DOM element.
   ========================================================= */
const LOD_MID = 1.6, LOD_NEAR = 3.2, LABEL_BUDGET = 10, RECENT_MS = 14*864e5;
const lodOf = z => z < LOD_MID ? 0 : z < LOD_NEAR ? 1 : 2;

// item: { id, w:{x,y}, prio, faint, zone, label, recent, rating, data } (faint = undiscovered venue)
let items = [], clusters = [], clusterScale = -1, clusterLod = -1, clustersDirty = true;
let highlightId = null, droppedId = null, selectedId = null, areaCounts = {}, lastLodReported = -1;
const pool = new Map();                      // cluster key -> element, for clusters on screen only
function setStamps(list){ items = list; clustersDirty = true; requestRender(); }
function setAreaCounts(counts){ areaCounts = counts || {}; requestRender(); }
function setSelected(id){ id = id || null; if (selectedId === id) return; selectedId = id; clustersDirty = true; requestRender(); }

function makeCluster(g, kind, at){
  return { kind: kind || (g.length>1 ? 'cluster' : 'single'), items:g, prio:g[0].prio,
    x: at ? at.x : g.reduce((s,v)=>s+v.w.x,0)/g.length, y: at ? at.y : g.reduce((s,v)=>s+v.w.y,0)/g.length };
}
// greedy clustering over a spatial hash (cell = radius), so 500+ places stay cheap
function clusterList(list, R){
  const sorted = list.slice().sort((a,b)=>b.prio-a.prio), grid = new Map(), key = (x,y)=>x+','+y;
  sorted.forEach((it,k)=>{ const g=key(Math.floor(it.w.x/R), Math.floor(it.w.y/R)); if (!grid.has(g)) grid.set(g,[]); grid.get(g).push(k); });
  const used = new Uint8Array(sorted.length), out = [];
  for (let k=0;k<sorted.length;k++){
    if (used[k]) continue;
    const a = sorted[k], g = [a]; used[k] = 1;
    if (a.id !== selectedId){
      const cx = Math.floor(a.w.x/R), cy = Math.floor(a.w.y/R);
      for (let dx=-1;dx<=1;dx++) for (let dy=-1;dy<=1;dy++){
        const bucket = grid.get(key(cx+dx,cy+dy)); if (!bucket) continue;
        for (const j of bucket){
          if (used[j] || sorted[j].id === selectedId) continue;
          if (Math.hypot(a.w.x-sorted[j].w.x, a.w.y-sorted[j].w.y) < R){ g.push(sorted[j]); used[j] = 1; }
        }
      }
    }
    out.push(makeCluster(g));
  }
  return out;
}
// centroids drift, so merge any clusters that still sit closer than the radius
function settle(list, R){
  for (let pass=0; pass<3; pass++){
    let merged=false;
    const next = clusterList(list.map(cl=>({ id:cl.items[0].id, w:{x:cl.x, y:cl.y}, prio:cl.prio, cl })), R).map(g=>{
      if (g.items.length===1) return g.items[0].cl;
      merged = true;
      const all = g.items.flatMap(p=>p.cl.items).sort((a,b)=>b.prio-a.prio);
      return makeCluster(all);
    });
    list = next; if (!merged) break;
  }
  return list;
}
// far: one marker per area, merged with any neighbour it would overlap
function areaMarkers(list, R){
  const byZone = new Map();
  list.forEach(it=>{ const z = it.zone || '_'; if (!byZone.has(z)) byZone.set(z,[]); byZone.get(z).push(it); });
  const groups = [...byZone].map(([zid,g])=>{
    const z = zoneById(zid), w = z ? aiToWorld(z.a, z.i) : g[0].w;
    return { zones:[zid], items:g, x:w.x, y:w.y };
  }).sort((a,b)=>b.items.length-a.items.length);
  const out = [];
  groups.forEach(g=>{
    const host = out.find(o=>Math.hypot(o.x-g.x, o.y-g.y) < R);
    if (host){ host.items.push(...g.items); host.zones.push(...g.zones); } else out.push(g);
  });
  return out.map(o=>{ const cl = makeCluster(o.items.sort((a,b)=>b.prio-a.prio), 'area', o); cl.zones = o.zones; return cl; });
}
function computeClusters(lod){
  const lit = items.filter(i=>!i.faint);
  if (lod === 0) return areaMarkers(lit, 60/cam.s);
  const R = (lod===1 ? 62 : 50)/cam.s, out = settle(clusterList(lit, R), R*0.92);
  // undiscovered spots: plain dots, thinned so they never pile up into blobs
  if (lod === 2) clusterList(items.filter(i=>i.faint), 11/cam.s).forEach(cl=>out.push({ kind:'dot', x:cl.items[0].w.x, y:cl.items[0].w.y, items:[cl.items[0]], prio:0 }));
  return out;
}
const clusterKey = cl => cl.kind + ':' + (cl.kind==='area' ? cl.zones.join('+') : cl.items.map(i=>i.id).join(','));
function bounds(pts){ return { x0:Math.min(...pts.map(p=>p.x)), x1:Math.max(...pts.map(p=>p.x)), y0:Math.min(...pts.map(p=>p.y)), y1:Math.max(...pts.map(p=>p.y)) }; }
function zoomToItems(list){
  const b = bounds(list.map(i=>i.w));
  const s = Math.max(baseFit*LOD_MID*1.25, Math.min(MAX_S, fitScaleFor(b, {x:60, top:110, bottom:110})));
  flyTo((b.x0+b.x1)/2, (b.y0+b.y1)/2, s);
}
function makeEl(cl){
  const el = document.createElement('div');
  if (cl.kind === 'dot'){ el.className = 'map-dot'; el.innerHTML = '<i></i>'; }
  else { el.className = 'stamp-anchor is-' + cl.kind; el.innerHTML = opts.renderStamp(cl); }
  el.addEventListener('click', e=>{
    e.stopPropagation();
    if (picking) return;
    const c = el._cl;
    if (c.kind === 'area') zoomToItems(c.items);
    else if (c.items.length === 1) opts.onStampTap && opts.onStampTap(c.items[0], e);
    else onClusterTap(c, e);
  });
  const ids = cl.items.map(i=>i.id);
  if (highlightId && ids.includes(highlightId)) el.classList.add('highlight');
  if (droppedId && cl.kind==='single' && ids[0]===droppedId){ el.classList.add('dropped'); droppedId = null; }
  if (selectedId && cl.kind==='single' && ids[0]===selectedId) el.classList.add('selected');
  return el;
}
function onClusterTap(cl, evt){
  const b = bounds(cl.items.map(i=>i.w));
  const spread = Math.max(b.x1-b.x0, b.y1-b.y0);
  const target = Math.min(MAX_S, fitScaleFor(b,{x:70,top:140,bottom:120}), 46/Math.max(0.01,spread)*2.2);
  // zoom in if that would actually split the cluster; otherwise hand the list to the app
  if (spread*MAX_S > 46 && target > cam.s*1.35) flyTo((b.x0+b.x1)/2, (b.y0+b.y1)/2 - 25/target, target);
  else opts.onClusterList && opts.onClusterList(cl.items, evt);
}

/* ---------- labels: one budget, collision checked, highest priority first ---------- */
const labelEls = [];
const escL = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const measure = (()=>{ const c=document.createElement('canvas').getContext('2d'), cache=new Map();
  return (text, font)=>{ const k=font+'|'+text; if (!cache.has(k)){ c.font=font; cache.set(k, c.measureText(text).width); } return cache.get(k); }; })();
function labelEl(n){
  let el = labelEls[n];
  if (!el){
    el = document.createElement('div'); el.className = 'map-label hidden';
    el.innerHTML = '<span role="button" tabindex="-1"></span>';
    el.firstChild.addEventListener('click', e=>{
      e.stopPropagation(); if (picking || !el._d) return;
      if (el._d.zone) opts.onAreaTap && opts.onAreaTap(el._d.zone);
      else if (el._d.item) opts.onStampTap && opts.onStampTap(el._d.item, e);
    });
    labelsLayer.appendChild(el); labelEls[n] = el;
  }
  return el;
}
function placeLabels(lod, vis, k){
  const taken = [], labelBoxes = [];
  const hit = b => taken.some(o=>b[0]<o[2] && b[2]>o[0] && b[1]<o[3] && b[3]>o[1]);
  vis.forEach(cl=>{ if (cl.kind!=='dot') taken.push([cl.sx-23*k, cl.sy-50*k, cl.sx+23*k, cl.sy+3]); });
  const cands = [];
  if (lod === 2){
    const singles = vis.filter(c=>c.kind==='single');
    const sel = singles.find(c=>c.items[0].id===selectedId);
    const fx = sel ? sel.sx : viewW/2, fy = sel ? sel.sy : viewH/2, now = Date.now();
    singles.map(c=>({ c, d:Math.hypot(c.sx-fx, c.sy-fy) })).sort((a,b)=>a.d-b.d).slice(0, LABEL_BUDGET+2).forEach(({c})=>{
      const it = c.items[0], recent = it.recent && now-it.recent < RECENT_MS;
      // selected first, then the most recent crew activity, then the highest rated
      const pri = it.id===selectedId ? 3e13 : recent ? 2e13 + it.recent/1e3 : 1e13 + (it.rating||0);
      cands.push({ kind:'name', text:it.label || '', sub:it.rating ? '★'+(+it.rating).toFixed(1).replace(/\.0$/,'') : '', item:it, pri, sx:c.sx, sy:c.sy });
    });
  }
  if (lod >= 1){
    Object.keys(areaCounts).forEach(zid=>{
      const n = areaCounts[zid], z = zoneById(zid); if (!n || !z) return;
      const w = aiToWorld(z.a, z.i), sx = w.x*cam.s+cam.x, sy = w.y*cam.s+cam.y;
      if (sx<-60 || sx>viewW+60 || sy<-20 || sy>viewH+20) return;
      cands.push({ kind:'area', text:z.label, zone:zid, pri:(lod===1 ? 5e13 : 0) + n, spots:[[sx, sy], [sx, sy+26], [sx, sy-26]] });
    });
  }
  cands.sort((a,b)=>b.pri-a.pri);
  let used = 0;
  for (const c of cands){
    if (used >= LABEL_BUDGET) break;
    const w = c.kind==='area' ? measure(c.text.toUpperCase(), '10px Silkscreen')*1.04 + 14
                              : measure(c.text, '700 11.5px "Plus Jakarta Sans"') + (c.sub ? measure(c.sub, '700 10px "Space Mono"') + 6 : 0) + 18;
    const mw = Math.min(w, 176), hgt = c.kind==='area' ? 17 : 22;
    // names try below the stamp, then above, then to either side
    const spots = c.kind==='area' ? c.spots : [[c.sx, c.sy+16], [c.sx, c.sy-50*k-15], [c.sx+23*k+mw/2+4, c.sy-25*k], [c.sx-23*k-mw/2-4, c.sy-25*k]];
    let at = null;
    for (const [x,y] of spots){
      const b = [x-mw/2-2, y-hgt/2-2, x+mw/2+2, y+hgt/2+2];
      // the selected place always gets its name, even over a neighbouring stamp
      const blocked = c.kind==='name' && c.item.id===selectedId ? labelBoxes.some(o=>b[0]<o[2] && b[2]>o[0] && b[1]<o[3] && b[3]>o[1]) : hit(b);
      if (x-mw/2 < 4 || x+mw/2 > viewW-4 || y < 4 || y > viewH-4 || blocked) continue;
      at = [x,y]; taken.push(b); labelBoxes.push(b); break;
    }
    if (!at) continue;
    const el = labelEl(used++);
    if (el._key !== c.kind+c.text+c.sub){
      el._key = c.kind+c.text+c.sub;
      el.className = 'map-label ' + (c.kind==='area' ? 'area' : 'name');
      el.firstChild.innerHTML = c.kind==='area' ? escL(c.text) : `<b>${escL(c.text)}</b>${c.sub?`<em>${c.sub}</em>`:''}`;
    }
    el._d = c;
    el.classList.toggle('sel', c.kind==='name' && c.item.id===selectedId);
    el.classList.remove('hidden');
    el.style.transform = `translate3d(${at[0].toFixed(1)}px,${at[1].toFixed(1)}px,0)`;
  }
  for (let n=used; n<labelEls.length; n++) labelEls[n].classList.add('hidden');
}

/* ---------- landmark effects over the canvas (night glow, light shows) ----------
   Small SVGs pinned to world points and scaled with the camera; their colour is
   animated by CSS, so they cost nothing per frame beyond a transform. */
function buildFx(){
  const baa = LANDMARKS.find(l=>l.k==='baa'), w = aiToWorld(baa.at[0], baa.at[1]);
  const d = baaGlowPath(), el = document.createElement('div');
  el.className = 'fx fx-baa';
  el.innerHTML = '<svg viewBox="-40 -120 60 124" width="60" height="124" aria-hidden="true"><path class="halo" d="'+d+'"/><path class="body" d="'+d+'"/></svg>';
  el._w = { x:w.x-40, y:w.y-120 };
  fxLayer.appendChild(el); fxEls.push(el);
  buildBurjShow();
}
// Burj Khalifa light show: a colour wash that runs up the tower, clipped to its silhouette
const BURJ_TIERS = [[0.62,30],[0.52,30],[0.43,28],[0.34,26],[0.26,24],[0.19,20],[0.13,18]];
function burjSilhouette(){
  const L = [], Rt = []; let z = 3;
  BURJ_TIERS.forEach(([sz,h],k)=>{ L.push([-16*sz, -z], [-16*sz, -(z+h)]); Rt.push([16*sz, -z], [16*sz, -(z+h)]); z += h + (k<BURJ_TIERS.length-1 ? 2.5 : 0); });
  const top = z, s0 = BURJ_TIERS[0][0];
  const pts = [...L, [-1.3,-top], [0,-top-46], [1.3,-top], ...Rt.reverse(), [0, 8*s0-3]];
  return 'M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L')+'Z';
}
let burjEl = null;
function buildBurjShow(){
  const b = LANDMARKS.find(l=>l.k==='burj'), w = aiToWorld(b.at[0], b.at[1]);
  burjEl = document.createElement('div');
  burjEl.className = 'fx fx-burj';
  const stops = (list)=>list.map((c,i)=>'<stop offset="'+(i/(list.length-1)).toFixed(2)+'" stop-color="'+c+'"/>').join('');
  burjEl.innerHTML = '<svg viewBox="-12 -250 24 262" width="24" height="262" aria-hidden="true"><defs>'
    + '<clipPath id="burjClip"><path d="'+burjSilhouette()+'"/></clipPath>'
    + '<linearGradient id="washBlue" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="130" spreadMethod="repeat">'+stops(['#0b3dff','#4fa3ff','#d9f1ff','#4fa3ff','#0b3dff'])+'</linearGradient>'
    + '<linearGradient id="washMulti" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="130" spreadMethod="repeat">'+stops(['#ff3b6b','#ffb13b','#fff05a','#3bff9d','#3bb4ff','#b35bff','#ff3b6b'])+'</linearGradient>'
    + '</defs><g clip-path="url(#burjClip)"><rect class="wash" x="-12" y="-250" width="24" height="520"/></g></svg>';
  burjEl._w = { x:w.x-12, y:w.y-250 };
  fxLayer.appendChild(burjEl); fxEls.push(burjEl);
}
// state from shows.js: { active, type, t, intensity }
let showOn = false;
function setShow(st){
  if (!burjEl) return;
  const on = !!(st && st.active);
  if (on){
    const rect = burjEl.querySelector('.wash');
    rect.setAttribute('fill', st.type==='multi' ? 'url(#washMulti)' : 'url(#washBlue)');
    if (!showOn) rect.style.animationDelay = (-(st.t % 6)).toFixed(2)+'s';   // opened mid-show: pick up where it is
  }
  burjEl.classList.toggle('on', on);
  burjEl.style.opacity = on ? (st.intensity * (NIGHT ? 0.82 : 0.55)).toFixed(3) : '0';
  if (on !== showOn){ showOn = on; requestRender(); }
}
function placeFx(){
  for (const el of fxEls){
    if (el === burjEl ? !showOn : !NIGHT) continue;
    const sx = el._w.x*cam.s+cam.x, sy = el._w.y*cam.s+cam.y;
    el.style.transform = 'translate3d('+sx.toFixed(1)+'px,'+sy.toFixed(1)+'px,0) scale('+cam.s.toFixed(4)+')';
  }
}
function updateOverlay(){
  placeFx();
  const z = cam.s/baseFit, lod = lodOf(z);
  if (clustersDirty || lod !== clusterLod || Math.abs(cam.s-clusterScale)/clusterScale > (interacting ? 0.2 : 0.04)){
    const rebuild = clustersDirty;          // data or selection changed: redraw stamp contents
    clusters = computeClusters(lod);
    const keep = new Set(clusters.map(cl=>(cl.key = clusterKey(cl))));
    pool.forEach((el,key)=>{ if (rebuild || !keep.has(key)){ el.remove(); pool.delete(key); } });
    clusterScale = cam.s; clusterLod = lod; clustersDirty = false;
    stampsLayer.dataset.lod = lod;
  }
  // stamps shrink a little when zoomed right out
  const k = Math.max(0.8, Math.min(1, 0.8 + (z-1)*0.2));
  stampsLayer.style.setProperty('--stamp-k', k.toFixed(3));
  const M = 70, vis = [];
  for (const cl of clusters){
    const sx = cl.x*cam.s+cam.x, sy = cl.y*cam.s+cam.y;
    let el = pool.get(cl.key);
    if (sx < -M || sx > viewW+M || sy < -M || sy > viewH+M*1.5){ if (el){ el.remove(); pool.delete(cl.key); } continue; }
    if (!el){ el = makeEl(cl); pool.set(cl.key, el); stampsLayer.appendChild(el); }
    el._cl = cl; cl.sx = sx; cl.sy = sy;
    el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
    el.style.zIndex = cl.kind==='dot' ? 1 : (cl.kind==='single' && cl.items[0].id===selectedId ? 9999 : 2 + Math.round(Math.max(0,sy)));
    vis.push(cl);
  }
  placeLabels(lod, vis, k);
  if (meWorld && watchId!==null){
    meEl.classList.remove('hidden');
    meEl.style.transform=`translate3d(${(meWorld.x*cam.s+cam.x).toFixed(1)}px,${(meWorld.y*cam.s+cam.y).toFixed(1)}px,0)`;
  }
  if (opts.onLod && lod !== lastLodReported){ lastLodReported = lod; opts.onLod(lod); }
}

/* ---------- you: live location ---------- */
const ME_PREF='bites-show-me';
let watchId=null, meWorld=null, meFirstFix=false, meFlyPending=false;
function flyToMe(){ if (meWorld){ const s=Math.max(cam.s, baseFit*4); flyTo(meWorld.x, meWorld.y-24/s, s); } }
function startTracking(fly){
  if (watchId!==null){ if (fly) meWorld ? flyToMe() : (meFlyPending=true); return; }
  if (!navigator.geolocation){ opts.onLocation && opts.onLocation('unsupported'); return; }
  opts.onLocation && opts.onLocation('busy');
  meFirstFix=true; meFlyPending=!!fly;
  watchId = navigator.geolocation.watchPosition(pos=>{
    const ai=toAI(pos.coords.latitude, pos.coords.longitude);
    if (!inMap(ai.a,ai.i)){
      if (meFirstFix) opts.onLocation && opts.onLocation('outside');
      meWorld=null; meEl.classList.add('hidden');
    } else {
      meWorld=aiToWorld(ai.a,ai.i);
      if (meFlyPending){ meFlyPending=false; flyToMe(); }
      opts.onLocation && opts.onLocation('on');
    }
    meFirstFix=false;
    try{ localStorage.setItem(ME_PREF,'1'); }catch(_){}
    requestRender();
  }, err=>{
    opts.onLocation && opts.onLocation(err && err.code===1 ? 'denied' : 'error');
    stopTracking();
  }, {enableHighAccuracy:true, maximumAge:10000, timeout:20000});
}
function stopTracking(){
  if (watchId!==null) navigator.geolocation.clearWatch(watchId);
  watchId=null; meWorld=null;
  if (meEl) meEl.classList.add('hidden');
  try{ localStorage.removeItem(ME_PREF); }catch(_){}
  opts.onLocation && opts.onLocation('off');
  requestRender();
}
function resumeTracking(){
  let on=false; try{ on=localStorage.getItem(ME_PREF)==='1'; }catch(_){}
  if (!on || !navigator.permissions) return;
  navigator.permissions.query({name:'geolocation'}).then(st=>{ if (st.state==='granted') startTracking(false); }).catch(()=>{});
}

/* ---------- public API ---------- */
function initMap(o){
  opts = o; wrap = o.wrap; canvas = o.canvas; ctx = canvas.getContext('2d');
  twinkles = ['a','b'].map(k=>{ const c=document.createElement('canvas'); c.className='map-twinkle '+k; c.setAttribute('aria-hidden','true'); canvas.after(c); return c; });
  carCanvas = document.createElement('canvas'); carCanvas.className='map-cars'; carCanvas.setAttribute('aria-hidden','true'); canvas.after(carCanvas); carCtx = carCanvas.getContext('2d');
  setInterval(kickCars, 1500);   // resume after a full screen closes or the battery recovers
  wrap.classList.toggle('night', NIGHT);
  stampsLayer = document.createElement('div'); stampsLayer.className='stamps-layer';
  labelsLayer = document.createElement('div'); labelsLayer.className='labels-layer';
  meEl = document.createElement('div'); meEl.className='me hidden';
  meEl.innerHTML = `<div class="me-ring"></div><button class="me-sprite" aria-label="You are here"></button>`;
  meEl.querySelector('.me-sprite').addEventListener('click', e=>{ e.stopPropagation(); if (!picking && opts.onMeTap) opts.onMeTap(); });
  fxLayer = document.createElement('div'); fxLayer.className='fx-layer';
  buildFx();
  o.overlay.append(fxLayer, stampsLayer, labelsLayer, meEl);
  initGestures();
  new ResizeObserver(()=>{
    if (!cache) return;
    if (!resizeCanvas()) return;
    if (needsCenter) { initialView(); }
    else if (Math.abs(viewW-lastW) > 40){ const c=viewCenter(); computeBaseFit(); setView(c.x,c.y,Math.max(cam.s,MIN_S)); lastW=viewW; }
    clampCam(); requestRender();
  }).observe(wrap);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) requestRender(); });
  // a timer, not rAF: rAF never fires in a background tab, and the city should be ready when you switch to it
  setTimeout(()=>{
    buildTerrain(); buildObjects(); prepRoads(); prepCarRoads();
    if (NIGHT) buildLights();
    buildCache();
    if (NIGHT) buildLightBitmaps();
    built = true;
    if (resizeCanvas()) initialView();
    readyCbs.splice(0).forEach(f=>f());
    requestRender();
  }, 0);
  resumeTracking();
}
function initialView(){
  computeBaseFit();
  if (opts.initialPoints){
    const pts = opts.initialPoints();
    if (pts && pts.length) fitPoints(pts, false); else fitCity(false);
  } else fitCity(false);
  if (viewW < 600 && cam.s < baseFit*1.9){
    const c = viewCenter();
    setView(c.x, c.y, baseFit*1.9);
  }
  needsCenter=false; lastW=viewW;
}
function whenReady(fn){ built ? fn() : readyCbs.push(fn); }
function placeWorld(p){
  // p: {id, lat, lng, zone} — exact spot if known, else a stable spread around the area
  let ai;
  if (typeof p.lat==='number' && typeof p.lng==='number') ai = toAI(p.lat,p.lng);
  else {
    // no exact spot: a stable point spread evenly over the area (uniform disc ~1 km), kept on land
    const z = zoneById(p.zone) || zoneById('downtown');
    const h = hashStr(String(p.id)), ang = (h%3600)/3600*Math.PI*2;
    let rad = Math.sqrt(((h>>>12)%1000)/1000)*1.0;
    for (let k=0;k<5;k++){
      ai = { a:z.a+Math.cos(ang)*rad, i:z.i+Math.sin(ang)*rad };
      if (palmAt(ai.a,ai.i) || ai.i > coastIn(ai.a)+0.2) break;
      rad *= 0.55;
    }
  }
  return aiToWorld(ai.a, ai.i);
}
function flyToWorld(w, minZoomMult){
  const s = Math.max(cam.s, baseFit*(minZoomMult||4));
  flyTo(w.x, w.y-30/s, Math.min(MAX_S, s));
}
// zoom that separates one stamp from its nearest neighbour
function flyToSeparate(w, others){
  let dmin=Infinity;
  others.forEach(v=>{ const d=Math.hypot(v.x-w.x, v.y-w.y); if (d>0.01) dmin=Math.min(dmin,d); });
  const s = Math.min(MAX_S, baseFit*6, Math.max(cam.s, baseFit*4, dmin<Infinity ? 50/dmin : 0));
  flyTo(w.x, w.y-30/s, s);
}
function centerLatLng(){ const c=viewCenter(), ai=worldToAI(c.x,c.y); return {...toLatLng(ai.a,ai.i), zone:nearestZone(ai.a,ai.i).id, inMap:inMap(ai.a,ai.i)}; }
function viewZone(){
  if (!viewW) return null;
  const c=viewCenter(), ai=worldToAI(c.x,c.y);
  return inMap(ai.a,ai.i) ? nearestZone(ai.a,ai.i) : null;
}
function zoomRatio(){ return cam.s/baseFit; }
function setPicking(on){ picking=!!on; wrap.classList.toggle('picking', picking); }
function highlight(id, ms){ highlightId=id; clustersDirty=true; requestRender(); setTimeout(()=>{ if (highlightId===id){ highlightId=null; clustersDirty=true; requestRender(); } }, ms||2600); }
function markDropped(id){ droppedId=id; clustersDirty=true; }
function setMeSprite(html){ meEl.querySelector('.me-sprite').innerHTML = html; }
function isTracking(){ return watchId!==null; }
function visible(){ return !!viewW; }
// draw a small static view of the city around a point (place sheet header)
function drawSnapshot(target, w, zoomMult){
  if (!built) return false;
  const W=target.clientWidth, H=target.clientHeight; if (!W||!H) return false;
  const r=Math.min(window.devicePixelRatio||1,2);
  target.width=Math.round(W*r); target.height=Math.round(H*r);
  const c=target.getContext('2d');
  const s=baseFit*(zoomMult||5);
  c.setTransform(r*s,0,0,r*s, r*(W/2-w.x*s), r*(H/2-w.y*s));
  const prevLW=LW; LW=Math.max(0.22, Math.min(0.8, 1.05/s));
  const view = { x0:w.x-W/2/s, y0:w.y-H/2/s, x1:w.x+W/2/s, y1:w.y+H/2/s };
  drawScene(c, view);
  if (NIGHT && LIGHTS) [0,1,2].forEach(tw=>drawLights(c, view, tw, s*r));
  LW=prevLW;
  return true;
}
function refresh(){ clustersDirty=true; requestRender(); }
// day or night: rebuild the city bitmap in the new palette (and the lights, the first time)
function setTheme(t){
  const n = t==='dark';
  if (n===NIGHT) return;
  NIGHT = n;
  if (wrap) wrap.classList.toggle('night', NIGHT);
  if (!built) return;
  if (NIGHT && !LIGHTS) buildLights();
  buildCache();
  if (NIGHT && !lightsBmp) buildLightBitmaps();
  requestRender();
}
function resize(){ if (cache && resizeCanvas()){ if (needsCenter) initialView(); requestRender(); } }

export {
  initMap, whenReady, setStamps, setAreaCounts, placeWorld, fitPoints, fitCity, flyToWorld, flyToSeparate,
  centerLatLng, viewZone, zoomRatio, setPicking, highlight, markDropped, setMeSprite, setSelected, startTracking,
  stopTracking, isTracking, drawSnapshot, refresh, resize, visible, setTheme, setShow,
  ZONES, zoneById, nearestZone, toAI, toLatLng, inMap, onLand,
};
