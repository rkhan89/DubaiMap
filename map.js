// The isometric Dubai map: a stylised but real projection of the city.
// This file holds the city's data (terrain, roads, buildings, landmarks), the camera, gestures, pins
// and labels. The city itself is drawn as pixel art by mapraster.js, in a Web Worker (mapworker.js),
// and composited here from overviews and chunks (see "the pixel city" below).
import { APP } from './config.js';
import { LANDMARKS as ART_LANDMARKS, PROPS, SPRITE_FILES, QUAY_SLOTS } from './landmarks.js';
import { NIGHT_FX } from './nightfx.js';
import { TERRAINS, isLandPx } from './terrains.js';
import { REGIONS } from './regions.js';

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
const A_MAX=36.0, I_MAX=21.6, T0=0.2;
// the frame grows to cover each region (regions.js): its coast, palms, zoning and roads, plus 1 km of margin
// along the coast and 1.2 km of sea out from it, rounded to whole tiles
// regions that are on the map: live ones, and fogged ones (there, under haze); locked ones aren't
const ACTIVE_REGIONS = REGIONS.filter(rg=>rg.status === 'live' || rg.status === 'fogged');
// a terrain sprite's land, as a/i km: the art is centred on its real point, each sprite pixel scale/2 world units
function terrainLandAI(t){
  const [ca, ci] = (()=>{ const p = toAI(t.centre[0], t.centre[1]); return [p.a, p.i]; })(), out = [];
  for (let sy=0; sy<t.h; sy+=2) for (let sx=0; sx<t.w; sx+=2){
    if (!isLandPx(t, sy*t.w + sx)) continue;
    const dx = (sx + 0.5 - t.w/2)*t.scale/2, dy = (sy + 0.5 - t.h/2)*t.scale/2, dgx = (dx/8 + dy/4)/2, dgy = (dy/4 - dx/8)/2;
    out.push({ a:ca - dgy*T0, i:ci + dgx*T0 });
  }
  return out;
}
const regionPts = rg=>[...(rg.coast||[]), ...(rg.roads||[]).flatMap(r=>r.pts), ...(rg.zoning||[]).flatMap(z=>[z.sw, z.ne]),
  ...(rg.palms||[]).flatMap(p=>[p.base, p.hub])].map(([lat,lng])=>toAI(lat,lng))
  .concat((rg.terrains||[]).flatMap(id=>{ const t = TERRAINS.find(t=>t.id===id); return t ? terrainLandAI(t) : []; }));
// the city's own terrains (the World Islands) and the active regions' content; 1.6 km of margin for the fog at the edge
const REGION_PTS = [...ACTIVE_REGIONS.flatMap(regionPts), ...TERRAINS.filter(t=>!REGIONS.some(rg=>(rg.terrains||[]).includes(t.id))).flatMap(terrainLandAI)];
const A_MIN = Math.min(-15.6, A_MAX - T0*Math.ceil((A_MAX - (Math.min(...REGION_PTS.map(p=>p.a)) - 1.6))/T0 - 1e-9));
const I_MIN = Math.min(-9.0, I_MAX - T0*Math.ceil((I_MAX - (Math.min(...REGION_PTS.map(p=>p.i)) - 1.6))/T0 - 1e-9));
// where the fogged regions begin (along the coast): past the city and every live region's content
const LIVE_PTS = ACTIVE_REGIONS.filter(rg=>rg.status === 'live').flatMap(regionPts);
const FOG_A = ACTIVE_REGIONS.some(rg=>rg.status === 'fogged') ? Math.min(-15.6, ...LIVE_PTS.map(p=>p.a)) - 0.3 : -Infinity;
const inFog = a=>a < FOG_A;
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
// which of the four sprite headings (the bow's direction on screen: ne, nw, sw, se) a travel direction
// (da, di in km) from a/i is closest to
function headingOf(a, i, [da, di]){
  const p=aiToWorld(a,i), q=aiToWorld(a+da*0.1, i+di*0.1), dx=q.x-p.x, dy=q.y-p.y;
  return (dy < 0 ? 'n' : 's') + (dx < 0 ? 'w' : 'e');
}

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
const COAST = [[-16,-2.5],[-14,-2.2],[-12,-1.9],[-10,-1.6],[-8,-1.3],[-6,-1.0],[-3.4,-0.55],[-2.87,-0.49],[-1,-0.15],[0,0],[1.2,0.1],[2.24,0.05],[3.41,0.35],[5.4,0.6],[9,0.5],
  [12,0.45],[15,0.45],[17.5,0.35],[19.6,0.25],[20.2,-0.2],[21.2,-0.25],[21.8,0.15],[23.5,0.05],[26.6,-0.2],
  [28,0.1],[30,0.35],[31.5,0.8],[32.6,1.9],[34,2.8],[36,3.3]];
ACTIVE_REGIONS.forEach(rg=>{ const pts = (rg.coast||[]).map(([lat,lng])=>G(lat,lng));
  const lo = COAST[0][0], hi = COAST[COAST.length-1][0];
  COAST.unshift(...pts.filter(p=>p[0] < lo - 0.5).sort((p,q)=>p[0]-q[0])); COAST.push(...pts.filter(p=>p[0] > hi + 0.5).sort((p,q)=>p[0]-q[0])); });
const coastIn = a => lerpPts(COAST,a) + 0.06*Math.sin(a*2.1);

const CREEK = [G(25.2715,55.2880),G(25.2640,55.2970),G(25.2555,55.3060),G(25.2485,55.3150),G(25.2400,55.3260),
  G(25.2300,55.3350),G(25.2160,55.3420),G(25.2030,55.3440),G(25.1930,55.3400)];
const LAGOON = { c:G(25.1930,55.3400), r:0.85 };
const CANAL = [G(25.2160,55.3420),G(25.1990,55.3120),G(25.1890,55.2920),G(25.1850,55.2780),G(25.1870,55.2640),
  G(25.1920,55.2500),G(25.1990,55.2400),G(25.2040,55.2330)];
const MARINA = [G(25.0660,55.1335),G(25.0760,55.1400),G(25.0840,55.1440),G(25.0900,55.1470),G(25.0935,55.1440)];
// The Burj Lake, bigger than life so the fountain sprite fits: its base is a diamond 4.25 tiles
// across, which is a square (half-side h km) in map terms. It sits on the line from the tower to the
// real fountain, ~1 km out, which leaves the tower its plaza.
const BURJ_LAKE = (()=>{ const b=G(25.1972,55.2744), f=G(25.19518,55.27506), da=f[0]-b[0], di=f[1]-b[1], L=Math.hypot(da,di);
  return { c:[b[0]+da/L*0.95, b[1]+di/L*0.95], h:0.425 }; })();
const inLake = (a,i)=>Math.abs(a-BURJ_LAKE.c[0]) <= BURJ_LAKE.h && Math.abs(i-BURJ_LAKE.c[1]) <= BURJ_LAKE.h;

// Palm Jumeirah: trunk off Al Sufouh, a fan of fronds, and the crescent with Atlantis at its apex
const PALM = { base:[3.43,0.45], hub:[3.56,-1.15], fr0:0.3, fr1:2.35, fronds:15, span:1.72, cr:3.3, crW:0.13, crSpan:1.84 };
function palmAt(a,i){ return palmShape(PALM, a, i); }
// a palm island: 2 on the trunk and hub, 1 on a frond or the crescent, 0 off it
function palmShape(P, a, i){
  const [ha,hi]=P.hub;
  if (distSeg(a,i, P.base[0],P.base[1], ha,hi) < 0.17) return 2;         // trunk
  const da=a-ha, di=i-hi, r=Math.hypot(da,di);
  if (r<0.42) return 2;
  const th=Math.atan2(da,-di);
  if (r>=P.fr0 && r<=P.fr1 && Math.abs(th)<=P.span+0.05){
    const step=(2*P.span)/(P.fronds-1);
    const thk=-P.span+Math.round((th+P.span)/step)*step;
    if (Math.abs(th-thk)*r < 0.15) return 1;
  }
  if (Math.abs(r-P.cr)<P.crW && Math.abs(th)<P.crSpan && Math.abs(Math.abs(th)-0.95)>0.07) return 1;
  return 0;
}
// the regions' palm islands (regions.js), in the same form as PALM
const REGION_PALMS = ACTIVE_REGIONS.flatMap(rg=>(rg.palms||[]).map(p=>({ name:p.name, base:G(...p.base), hub:G(...p.hub), fr0:p.frond[0], fr1:p.frond[1], fronds:p.fronds,
  span:p.span, cr:p.crescent.r, crW:p.crescent.w, crSpan:p.crescent.span, bare:!!p.bare })));
const ATLANTIS = [PALM.hub[0], PALM.hub[1]-PALM.cr];
// the QE2's mooring at Port Rashid: just off the quay's seaward edge (the quay is a 24.4..26.0, i -1.0..0.15)
const QE2_AT = [25.6, -1.05];
// roughly: is this lat/lng on dry land (used by the synthetic test data)
function onLand(lat,lng){ const {a,i}=toAI(lat,lng); if (!inMap(a,i)) return false; if (palmAt(a,i)) return true; return i > coastIn(a)+0.3 && distLine(a,i,CREEK) > 0.35 && distLine(a,i,MARINA) > 0.2; }

const ISLANDS = [
  {e:G(25.0806,55.1205), rx:0.42, ry:0.3, t:'urban'},     // Bluewaters
  {e:G(25.1412,55.1853), rx:0.14, ry:0.14, t:'beach'},    // Burj Al Arab
  {e:[18.6,-0.8], rx:0.3, ry:0.24, t:'beach'},            // Jumeirah Bay
  {r:[[2.35,3.05],[-0.6,0.12]], t:'urban'},               // Dubai Harbour
  {r:[[24.4,26.0],[-1.0,0.15]], t:'quay'},                // Port Rashid (Mina Rashid): an open concrete quay
  {r:[[27.2,28.4],[-1.9,-0.8]], t:'sand'},                // Deira Islands
  {r:[[28.7,31.2],[-2.6,-1.3]], t:'sand'},
  {r:[[29.6,32.2],[-3.9,-3.0]], t:'sand'},
];

const DISTRICTS = [
  {a:[-2.0,2.1],  i:[0.1,1.15], st:'glass', h:[24,70],  p:0.42, towers:true},   // Marina + JBR
  {a:[-1.4,1.5],  i:[1.5,2.7],  st:'glass', h:[22,60],  p:0.38, towers:true},   // JLT
  {a:[2.1,6.2],   i:[0.6,1.9],  st:'mid',   h:[10,22],  p:0.36},   // Media City / Al Sufouh
  {a:[4.6,9.6],   i:[2.3,4.6],  st:'mid',   h:[9,18],   p:0.34},   // Al Barsha
  {a:[6.3,17.6],  i:[0.75,2.5], st:'villa', h:[5,7],    p:0.55},   // Umm Suqeim
  {a:[9.8,16.6],  i:[3.2,6.3],  st:'ind',   h:[6,10],   p:0.5},    // Al Quoz
  {a:[17.6,23.9], i:[0.6,2.35], st:'low',   h:[7,16],   p:0.45},   // Jumeirah / Satwa / City Walk
  {a:[19.4,23.8], i:[2.35,3.5], st:'glass', h:[26,68],  p:0.45, corridor:true},   // SZR / DIFC
  {a:[17.9,20.6], i:[3.1,4.5],  st:'glass', h:[20,54],  p:0.3, towers:true, corridor:true},    // Downtown
  {a:[16.8,20.6], i:[4.5,6.4],  st:'glass', h:[20,56],  p:0.38, towers:true, corridor:true},   // Business Bay
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
  {k:0, pts:[G(25.200,55.320),G(25.160,55.370),G(25.120,55.420),G(25.080,55.470),G(25.040,55.520)]}, // Dubai–Al Ain Rd (E66)
  {k:1, pts:[G(25.205,55.350),G(25.180,55.420),G(25.160,55.480),G(25.150,55.520)]},                   // Hatta Rd (E44)
  {k:1, pts:[G(25.258,55.365),G(25.245,55.420),G(25.235,55.480),G(25.230,55.520)]},                   // Al Khawaneej Rd
  {k:1, pts:[G(25.285,55.375),G(25.265,55.395),G(25.215,55.405),G(25.170,55.395)]},                   // Tripoli St / Mirdif
  {k:1, pts:[G(25.100,55.180),G(25.060,55.220),G(25.030,55.255)]},                                    // Hessa St
  {k:1, pts:[G(25.035,55.110),G(25.020,55.150),G(25.010,55.200)]},                                    // Furjan / Discovery Gardens
  {k:1, palms:true, pts:[[-3.4,-0.1],[0,0.42],[2.2,0.55],[3.4,0.8],[5.4,1.0],[9,0.95],[15,0.9],[17.5,0.8],[19.6,0.7],[21.2,0.62],[23.5,0.5],[26.2,0.45]]}, // Jumeirah Beach Rd
  {k:1, pts:[[26.9,0.3],[28,0.55],[30,0.8],[31.6,1.25],[32.6,2.35],[34.5,3.3],[36,3.8]]},                                             // Deira corniche
  {k:1, pts:[[0.6,0.45],[0.6,9.7]]}, {k:1, pts:[[4.15,0.8],[4.15,9.7]]}, {k:1, pts:[[7.9,0.95],[7.9,9.7]]},
  {k:1, pts:[[11.4,0.92],[11.4,9.7]]}, {k:1, pts:[[14.9,0.9],[14.9,6.5]]}, {k:1, pts:[[21.3,0.62],[21.3,6.6]]},
  {k:1, pts:[[23.5,0.5],[23.5,5.5]]}, {k:1, pts:[[25.2,0.45],[25.2,6.0]]}, {k:1, pts:[[28.4,0.6],[28.4,5.4]]},
  {k:1, pts:[[30.6,0.8],[30.6,5.4]]},
  {k:1, palms:true, pts:[G(25.2335,55.2725),G(25.2180,55.2580),G(25.2000,55.2450),G(25.1850,55.2350),G(25.1700,55.2230),G(25.1550,55.2120),G(25.1400,55.2000)]}, // Al Wasl Rd
  {k:1, pts:[G(25.1530,55.2080),G(25.1350,55.2200),G(25.1180,55.2320),G(25.1000,55.2450),G(25.0800,55.2580),G(25.0600,55.2700)]}, // Umm Suqeim St
  {k:1, pts:[G(25.2620,55.3240),G(25.2730,55.3420),G(25.2850,55.3580),G(25.2990,55.3720),G(25.3150,55.3850)]},                   // Al Ittihad Rd
  {k:1, pts:[G(25.2520,55.3270),G(25.2480,55.3400),G(25.2440,55.3560),G(25.2380,55.3750),G(25.2300,55.3920)]},                   // Airport Rd
  {k:0, pts:[G(25.035,55.085),G(25.000,55.040),G(24.960,54.990)]},                                                                   // SZR on to Jebel Ali
  {k:0, pts:[G(25.005,55.150),G(24.960,55.090),G(24.930,55.060)]},                                                                   // E311 south
  {k:0, pts:[G(24.990,55.230),G(24.950,55.170),G(24.910,55.130)]},                                                                   // E611 south
  {k:1, pts:[G(25.000,55.110),G(24.970,55.150),G(24.930,55.170),G(24.890,55.175)]},                                                  // Expo Rd / Al Maktoum airport
  {k:1, pts:[G(25.050,55.110),G(25.000,55.170),G(24.960,55.230)]},                                                                   // Jebel Ali–Lehbab Rd
  {k:2, pts:[[3.5,0.85],[3.56,-1.05]]},                                                                // Palm trunk
  {k:2, causeway:true, pts:(()=>{ const [a0,i0]=G(25.1412,55.1853), o=[]; for (let t=0;t<=1.001;t+=0.125){ const u=1-t; o.push([u*u*(a0+0.1)+2*u*t*(a0+0.5)+t*t*9.25, u*u*(i0+0.11)+2*u*t*(i0+0.24)+t*t*0.95]); } return o; })()}, // Burj Al Arab: curved causeway
  {k:2, causeway:true, pts:[G(25.0806,55.1205),[-0.1,0.2]]},                                                         // Bluewaters bridge
  {k:2, causeway:true, pts:[[18.6,-0.6],[18.6,0.8]]},                                                                 // Jumeirah Bay bridge
];

ACTIVE_REGIONS.forEach(rg=>(rg.roads||[]).forEach(r=>ROADS.push({ k:r.k, pts:r.pts.map(([lat,lng])=>G(lat,lng)) })));
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
  {k:'gv',       at:G(25.0700,55.3089), name:'Global Village'},
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
  {id:'globalvillage',label:'Global Village', lat:25.0700, lng:55.3089},
  {id:'furjan',      label:'Al Furjan',     lat:25.0300, lng:55.1500},
  {id:'discovery',   label:'Discovery Gardens', lat:25.0400, lng:55.1400},
  {id:'ibnbattuta',  label:'Ibn Battuta',   lat:25.0450, lng:55.1180},
];
ACTIVE_REGIONS.forEach(rg=>(rg.zones||[]).forEach(z=>ZONES.push({ ...z })));
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
const W_SEA=0, W_SHALLOW=1, L_BEACH=2, L_SAND=3, L_DUNE=4, L_URBAN=5, L_PARK=6, W_CANAL=7, L_TARMAC=8, L_PALM=9, L_LOT=10, L_GOLF=11, W_DEEP=12, L_FARM=13, L_CREST=14;
const TILE_COLORS = ['#58C8BF','#78D7CC','#F6DDA8','#EDC586','#E0AE6C','#EBD3A7','#8CC46B','#4DB6B3','#CEC7BD','#F3D89F','#E2D2B4','#A4D47E','#46B3B2','#ACC877','#F3CF94'];
const isWaterT = t => t===W_SEA || t===W_SHALLOW || t===W_CANAL || t===W_DEEP;
const tType = new Uint8Array(ROWS*COLS);
const roadMask = new Uint8Array(ROWS*COLS);
const reserved = new Uint8Array(ROWS*COLS);
const worldTile = new Uint8Array(ROWS*COLS), worldUnder = new Uint8Array(ROWS*COLS);   // the World Islands' tiles
const inRect = (a,i,R)=> a>=R.a[0] && a<=R.a[1] && i>=R.i[0] && i<=R.i[1];
// the terrain type under a/i, or -1 off the map
function tileAt(a,i){ if (!inMap(a,i)) return -1; const g=aiToGrid(a,i), c=Math.floor(g.gx), r=Math.floor(g.gy); return (r>=0&&c>=0&&r<ROWS&&c<COLS) ? tType[r*COLS+c] : -1; }

/* =========================================================
   NEIGHBOURHOODS: the finer city fabric
   Each has its own character: height, colours and how tightly it's packed. They fill
   every gap the districts above leave; where a district is marked regen (Deira, Bur Dubai,
   Karama, Jumeirah/Satwa) these neighbourhoods replace its buildings, and the district's
   own style fills whatever they don't cover. Positions are real lat/lng (see the comments)
   converted with toAI, so pins still land on the right blocks.
   st: old (low, tight, cream and coral, some wind towers), busy (tight mid-rise), mid, glass,
       low, villa (white, gaps, trees, pools), shed (wide flat warehouses), campus, resort,
       golf, farm, marsh, port.   ground: what the land is (default city paving).
   ========================================================= */
const HOODS = [
  // ---- Deira: souks, Naif, Al Ras, Rigga, Muraqqabat, Hor Al Anz, Abu Hail ----
  {n:'Gold & Spice Souk, Naif', a:[26.8,28.3], i:[0.35,1.8], st:'old',  h:[5,10],  p:0.78},
  {n:'Al Ras, Baniyas',         a:[28.3,29.6], i:[0.6,2.0],  st:'busy', h:[8,16],  p:0.66},
  {n:'Al Rigga',                a:[27.0,28.4], i:[1.8,3.25], st:'busy', h:[10,24], p:0.66},
  {n:'Al Murar',                a:[28.4,29.6], i:[2.0,3.3],  st:'busy', h:[7,15],  p:0.62},
  {n:'Muraqqabat',              a:[27.9,29.3], i:[3.25,4.7], st:'busy', h:[8,18],  p:0.62},
  {n:'Port Saeed, Clock Tower', a:[26.8,27.9], i:[3.25,5.3], st:'mid',  h:[9,20],  p:0.46},
  {n:'Abu Hail',                a:[29.6,31.0], i:[1.8,3.0],  st:'low',  h:[6,12],  p:0.58},
  {n:'Hor Al Anz',              a:[29.3,31.6], i:[3.0,5.3],  st:'busy', h:[6,14],  p:0.62},
  {n:'Al Waheda, Waterfront',   a:[29.6,32.2], i:[0.4,1.8],  st:'mid',  h:[8,18],  p:0.42},
  // ---- Bur Dubai, the creek's old side ----
  {n:'Al Fahidi, Meena Bazaar', a:[25.6,26.5], i:[0.3,1.75], st:'old',  h:[5,10],  p:0.76},
  {n:'Al Seef',                 a:[25.9,26.6], i:[1.75,2.7], st:'old',  h:[5,9],   p:0.62},
  {n:'Mankhool',                a:[23.9,25.6], i:[0.9,1.7],  st:'busy', h:[8,18],  p:0.62},
  {n:'Al Raffa, Al Hamriya',    a:[23.9,25.6], i:[0.3,0.9],  st:'old',  h:[6,12],  p:0.66},
  // ---- Karama, Oud Metha ----
  {n:'Karama',                  a:[24.4,25.9], i:[1.7,3.3],  st:'busy', h:[6,13],  p:0.72},
  {n:'Oud Metha',               a:[24.7,26.0], i:[3.3,4.7],  st:'mid',  h:[8,18],  p:0.5},
  // ---- Jumeirah, Satwa, City Walk ----
  {n:'Satwa',                   a:[20.6,22.4], i:[1.1,2.35], st:'old',  h:[5,11],  p:0.74},
  {n:'Al Bada’a, Jafiliya',a:[22.4,23.9], i:[1.1,2.35], st:'busy', h:[7,15],  p:0.62},
  {n:'Jumeirah 1',              a:[21.2,23.9], i:[0.6,1.1],  st:'low',  h:[6,11],  p:0.5},
  {n:'City Walk',               a:[18.8,19.9], i:[1.45,2.35],st:'mid',  h:[8,16],  p:0.5},
  {n:'Jumeirah 2 and 3',        a:[16.8,21.2], i:[0.6,1.25], st:'villa',h:[5,7],   p:0.5},
  {n:'Al Wasl',                 a:[17.6,20.6], i:[1.25,2.35],st:'villa',h:[5,8],   p:0.48},
  // ---- north and the airport side ----
  {n:'Al Mamzar',               a:[31.6,32.6], i:[3.0,3.6],  st:'low',  h:[6,11],  p:0.5},
  {n:'Al Twar',                 a:[30.4,32.4], i:[6.6,9.0],  st:'villa',h:[5,7],   p:0.5},
  {n:'Muhaisnah',               a:[32.4,35.8], i:[8.4,11.0], st:'busy', h:[5,10],  p:0.55},
  {n:'Al Qusais industrial',    a:[33.6,35.8], i:[11.0,12.6],st:'shed', h:[4,8],   p:0.5},
  {n:'Rashidiya',               a:[28.0,30.4], i:[9.8,11.6], st:'villa',h:[5,7],   p:0.5},
  {n:'Nad Al Hamar',            a:[25.6,27.4], i:[11.6,13.4],st:'villa',h:[5,7],   p:0.46},
  {n:'Ras Al Khor industrial',  a:[23.6,26.0], i:[10.4,12.0],st:'shed', h:[4,8],   p:0.5},
  // ---- Dubai Islands (reclaimed, now resorts) ----
  {n:'Dubai Islands',           a:[27.2,31.2], i:[-2.6,-0.8],st:'resort',h:[6,14], p:0.34},
  // ---- the SZR side, Business Bay, D3 ----
  {n:'Dubai Design District',   a:[19.4,20.6], i:[6.0,6.9],  st:'campus',h:[8,16], p:0.5},
  {n:'Ras Al Khor wetlands',    a:[21.4,23.8], i:[8.4,10.6], st:'marsh', ground:L_PARK},
  {n:'Al Quoz 4',               a:[12.6,16.6], i:[6.3,7.4],  st:'mid',  h:[6,12],  p:0.42},
  // ---- the middle: Barsha South, Greens, Emirates Hills, Springs, Meadows ----
  {n:'Al Barsha South',         a:[4.6,9.6],   i:[4.6,6.2],  st:'mid',  h:[6,14],  p:0.42},
  {n:'The Greens',              a:[2.7,4.2],   i:[1.9,2.3],  st:'mid',  h:[8,16],  p:0.45},
  {n:'Emirates Golf Club',      a:[2.0,3.2],   i:[2.3,3.4],  st:'golf', ground:L_GOLF},
  {n:'Montgomerie',             a:[-0.4,0.6],  i:[3.6,4.8],  st:'golf', ground:L_GOLF},
  {n:'Emirates Hills',          a:[0.6,3.0],   i:[3.4,4.6],  st:'villa',h:[6,8],   p:0.34, lush:true},
  {n:'Jumeirah Islands, Park',  a:[-1.4,0.6],  i:[2.7,3.6],  st:'villa',h:[5,7],   p:0.42},
  {n:'The Meadows',             a:[0.4,2.6],   i:[4.6,5.5],  st:'villa',h:[5,7],   p:0.45},
  {n:'The Springs',             a:[1.2,3.6],   i:[5.5,6.1],  st:'villa',h:[5,7],   p:0.5},
  {n:'Al Barsha 3',             a:[5.0,6.8],   i:[3.2,4.6],  st:'mid',  h:[6,12],  p:0.45},
  // ---- south-west: Jebel Ali, the Gardens, DIP, Expo, Dubai South ----
  {n:'The Gardens',             a:[-4.6,-2.6], i:[1.6,2.8],  st:'low',  h:[6,12],  p:0.5},
  {n:'Jebel Ali Village',       a:[-7.6,-4.6], i:[0.0,1.8],  st:'villa',h:[5,7],   p:0.38},
  {n:'Jebel Ali Free Zone',     a:[-12.4,-6.2],i:[0.6,6.6],  st:'shed', h:[5,10],  p:0.52},
  {n:'Jebel Ali Port',          a:[-12.4,-7.6],i:[-3.6,0.4], st:'port', ground:L_TARMAC},
  {n:'Dubai Investments Park',  a:[-6.2,-2.8], i:[7.0,10.4], st:'shed', h:[5,9],   p:0.46},
  {n:'DIP homes',               a:[-6.2,-3.6], i:[6.2,7.0],  st:'mid',  h:[6,12],  p:0.45},
  {n:'Expo City',               a:[-10.4,-7.8],i:[7.8,10.4], st:'campus',h:[8,16], p:0.42},
  {n:'Dubai South',             a:[-12.6,-9.8],i:[10.6,13.0],st:'mid',  h:[6,14],  p:0.42},
  {n:'Al Maktoum Airport',      a:[-15.4,-12.8],i:[12.6,17.4],st:'apron',ground:L_TARMAC},
  {n:'Studio City',             a:[2.8,5.2],   i:[11.8,12.8],st:'campus',h:[8,14], p:0.45},
  {n:'Al Barari',               a:[12.6,14.4], i:[13.0,14.6],st:'villa',h:[6,8],   p:0.32, lush:true},
  // ---- farms out east and in the desert ----
  {n:'Al Awir farms',           a:[30.0,32.0], i:[19.4,21.2],st:'farm', ground:L_FARM},
  {n:'Lisaili farms',           a:[6.0,8.0],   i:[17.0,18.6],st:'farm', ground:L_FARM},
  {n:'Margham farms',           a:[14.0,15.8], i:[19.2,20.8],st:'farm', ground:L_FARM},
  {n:'Ghadeer farms',           a:[-6.0,-4.2], i:[15.0,16.6],st:'farm', ground:L_FARM},
];
// districts whose buildings the neighbourhoods above replace (their style fills any gaps)
const REGEN = [10, 11, 12, 6];   // Karama/Oud Metha, Bur Dubai, Deira, Jumeirah/Satwa (indices in DISTRICTS)
// lakes and ponds (km half-axes)
const LAKES = [
  {a:-0.6, i:2.05, rx:0.45, ry:0.22}, {a:0.45, i:2.1, rx:0.35, ry:0.2},  {a:1.2, i:1.95, rx:0.25, ry:0.16},   // JLT lakes
  {a:-0.4, i:3.15, rx:0.32, ry:0.32},                                                                        // Jumeirah Islands
  {a:1.4,  i:5.05, rx:0.3,  ry:0.14}, {a:2.4, i:5.8, rx:0.28, ry:0.12},                                      // Meadows, Springs
  {a:1.8,  i:3.95, rx:0.22, ry:0.14}, {a:3.4, i:2.1, rx:0.16, ry:0.1},                                       // Emirates Hills, Greens
  {a:13.6, i:13.7, rx:0.2,  ry:0.14},                                                                        // Al Barari
  {a:-5.4, i:8.6, rx:0.18,  ry:0.12},                                                                        // DIP
];
// the land the port is built on, and its two basins
const PORT_LAND = {a:[-12.4,-7.6], i:[-3.6,-0.8]};
const PORT_BASINS = [{a:[-11.7,-10.7], i:[-3.0,-1.5]}, {a:[-9.8,-8.6], i:[-3.0,-1.5]}];
const MAKTOUM_RUNWAYS = [{a:-14.6, i:[13.0,17.0]}, {a:-13.6, i:[13.0,17.0]}];
// the city envelope: bare land this close to a neighbourhood becomes paved lots, not desert
const LOT_KM = 0.8;

// the Metro (elevated) and the Marina tram, through their real stations
const METRO = [
  { line:'red', col:'#D9443A', stations:[
    [25.2300,55.3920,'Centrepoint'],[25.2415,55.3655,'Emirates'],[25.2485,55.3523,'Airport T3'],[25.2486,55.3455,'Airport T1'],
    [25.2525,55.3390,'GGICO'],[25.2549,55.3299,'Deira City Centre'],[25.2662,55.3141,'Union'],[25.2546,55.3036,'BurJuman'],
    [25.2445,55.2983,'ADCB'],[25.2337,55.2919,'Max'],[25.2253,55.2856,'World Trade Centre'],[25.2177,55.2799,'Emirates Towers'],
    [25.2112,55.2763,'Financial Centre'],[25.2016,55.2694,'Burj Khalifa'],[25.1914,55.2604,'Business Bay'],[25.1815,55.2522,'Onpassive'],
    [25.1580,55.2280,'Al Safa'],[25.1213,55.2003,'Mall of the Emirates'],[25.1099,55.1903,'Mashreq'],[25.1015,55.1734,'Internet City'],
    [25.0889,55.1555,'Nakheel'],[25.0710,55.1386,'DMCC'],[25.0577,55.1267,'Jabal Ali'],[25.0446,55.1151,'Ibn Battuta'],
    [25.0263,55.1015,'Energy'],[25.0080,55.0850,'Danube'],[24.9860,55.0650,'UAE Exchange'] ]},
  { line:'red', col:'#D9443A', stations:[
    [25.0577,55.1267,null],[25.0438,55.1452,'Discovery Gardens'],[25.0313,55.1536,'Al Furjan'],[25.0177,55.1611,'Jumeirah Golf Estates'],
    [24.9894,55.1595,'Dubai Investment Park'],[24.9632,55.1475,'Expo 2020'] ]},
  { line:'green', col:'#3FA34D', stations:[
    [25.2944,55.3921,'E& by Etisalat'],[25.2879,55.3825,'Al Qusais'],[25.2780,55.3698,'Dubai Airport Free Zone'],[25.2732,55.3657,'Al Nahda'],
    [25.2706,55.3590,'Stadium'],[25.2694,55.3514,'Al Qiyadah'],[25.2752,55.3471,'Abu Hail'],[25.2737,55.3375,'Abu Baker Al Siddique'],
    [25.2702,55.3253,'Salah Al Din'],[25.2662,55.3141,null],[25.2697,55.3089,'Baniyas Square'],[25.2756,55.3006,'Gold Souk'],
    [25.2690,55.2934,'Al Ras'],[25.2650,55.2900,'Al Ghubaiba'],[25.2585,55.2975,'Sharaf DG'],[25.2546,55.3036,null],
    [25.2425,55.3164,'Oud Metha'],[25.2297,55.3226,'Dubai Healthcare City'],[25.2250,55.3330,'Al Jadaf'],[25.2190,55.3380,'Creek'] ]},
];
const TRAM = [G(25.0897,55.1495),G(25.0860,55.1470),G(25.0806,55.1446),G(25.0762,55.1412),G(25.0715,55.1360),G(25.0680,55.1300),G(25.0700,55.1250),G(25.0760,55.1290),G(25.0820,55.1350)];
// new landmarks, at their real spots
const LANDMARKS2 = [
  {k:'goldsouk',  at:G(25.2700,55.2972)}, {k:'clocktower', at:G(25.2600,55.3200)}, {k:'dcc', at:G(25.2525,55.3300)},
  {k:'waterfront',at:G(25.2890,55.3230)}, {k:'etihad', at:G(25.2390,55.2740)},    {k:'jmosque', at:[22.0,0.75]},
  {k:'emtowers',  at:G(25.2170,55.2820)}, {k:'difcgate', at:G(25.2135,55.2795)},  {k:'wtc', at:G(25.2260,55.2865)},
  {k:'opera',     at:G(25.1955,55.2720)}, {k:'cocacola', at:G(25.2040,55.2620)},  {k:'madinat', at:G(25.1325,55.1845)},
  {k:'wildwadi',  at:G(25.1395,55.1890)},
  {k:'dhmall',    at:[8.4,6.6]},          {k:'cricket', at:[2.6,9.6]},             {k:'autodrome', at:G(25.0520,55.2390)},
  {k:'dragonmart',at:G(25.1750,55.4200)}, {k:'miracle', at:G(25.0600,55.2440)},
  {k:'expo',      at:G(24.9630,55.1490)}, {k:'maktoum', at:[-13.0,15.0]},          {k:'sohq', at:G(25.1200,55.3820)},
  {k:'mirdifcc',  at:G(25.2160,55.4070)}, {k:'theview', at:[3.5,-0.6]},
  {k:'pointe',    at:[ATLANTIS[0]+0.55, ATLANTIS[1]+0.5]},                        {k:'lamer', at:[20.9,-0.05]},
  {k:'festival', at:G(25.2220,55.3570)},   {k:'alserkal', at:G(25.1430,55.2250)},
];

RUNWAYS.push(...MAKTOUM_RUNWAYS);
ACTIVE_REGIONS.forEach(rg=>(rg.zoning||[]).forEach(z=>{ const p=toAI(...z.sw), q=toAI(...z.ne), r=toAI(z.sw[0], z.ne[1]), u=toAI(z.ne[0], z.sw[1]);
  HOODS.push({ n:z.name, a:[Math.min(p.a,q.a,r.a,u.a), Math.max(p.a,q.a,r.a,u.a)], i:[Math.min(p.i,q.i,r.i,u.i), Math.max(p.i,q.i,r.i,u.i)], st:z.st, h:z.h, p:z.p, ...(z.ground!=null ? { ground:z.ground } : {}) }); }));
const HOODS_ALL = [...HOODS, ...REGEN.map(di=>({ ...DISTRICTS[di], n:'rest of the district' }))];
const METRO_AI = METRO.map(l=>l.stations.map(([lat,lng])=>G(lat,lng)));
// every tile of a rectangle (in km), with its centre: fn(r, c, a, i)
function forRect(R, fn){
  const gs = [aiToGrid(R.a[0],R.i[0]), aiToGrid(R.a[0],R.i[1]), aiToGrid(R.a[1],R.i[0]), aiToGrid(R.a[1],R.i[1])];
  const c0 = Math.max(0, Math.floor(Math.min(...gs.map(g=>g.gx)))), c1 = Math.min(COLS-1, Math.ceil(Math.max(...gs.map(g=>g.gx))));
  const r0 = Math.max(0, Math.floor(Math.min(...gs.map(g=>g.gy)))), r1 = Math.min(ROWS-1, Math.ceil(Math.max(...gs.map(g=>g.gy))));
  for (let r=r0;r<=r1;r++) for (let c=c0;c<=c1;c++){ const {a,i} = gridToAI(c+0.5, r+0.5); if (inRect(a,i,R)) fn(r,c,a,i); }
}


function buildTerrain(){
  // each road's bounding box (km), so the mask only measures roads nearby
  ROADS.forEach(rd=>{ const pad=RD[rd.k].km+0.1, as=rd.pts.map(p=>p[0]), is=rd.pts.map(p=>p[1]); rd.bb=[Math.min(...as)-pad, Math.max(...as)+pad, Math.min(...is)-pad, Math.max(...is)+pad]; });
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const {a,i} = gridToAI(c+0.5, r+0.5);
    const ci = coastIn(a);
    let t = i < ci ? W_SEA : L_SAND;
    if (t===W_SEA){
      const pm = palmAt(a,i), rp = !pm && REGION_PALMS.find(P=>palmShape(P, a, i));
      if (pm) t = L_PALM;
      else if (rp) t = rp.bare ? L_BEACH : L_PALM;      // a palm still being built is bare sand
      else {
        for (const is of ISLANDS){
          const hit = is.e ? (((a-is.e[0])/is.rx)**2 + ((i-is.e[1])/is.ry)**2 < 1)
                           : (a>=is.r[0][0] && a<=is.r[0][1] && i>=is.r[1][0] && i<=is.r[1][1]);
          if (hit){ t = is.t==='urban' ? L_URBAN : is.t==='quay' ? L_TARMAC : is.t==='sand' ? L_SAND : L_BEACH; break; }
        }
      }
    } else {
      if (i-ci < 0.28) t = L_BEACH;
      else { const dn = vnoise(a*0.55+3, i*0.55+7)*0.65 + vnoise(a*1.3, i*1.3)*0.35;
        if (dn > 0.62) t = L_DUNE;
        // dune crests: light ridges along the dunes' edges and in long wind-blown lines out in the desert
        else if (dn > 0.585 || (i > 9 && Math.sin(a*1.9 + i*0.7 + vnoise(a*0.8,i*0.8)*4) > 0.94)) t = L_CREST; }
      if (t!==L_BEACH){
        if (DISTRICTS.some(d=>inRect(a,i,d))) t = L_URBAN;
        if (PARKS.some(p=>inRect(a,i,p))) t = L_PARK;
        if (inRect(a,i,AIRPORT)) t = L_TARMAC;
      }
      if (distLine(a,i,CREEK) < 0.21 || Math.hypot(a-LAGOON.c[0], i-LAGOON.c[1]) < LAGOON.r
          || distLine(a,i,CANAL) < 0.12 || distLine(a,i,MARINA) < 0.14
          || inLake(a,i)) t = W_CANAL;
    }
    tType[r*COLS+c] = t;
    if (!isWaterT(t)){
      for (const rd of ROADS){ const bb=rd.bb; if (a<bb[0] || a>bb[1] || i<bb[2] || i>bb[3]) continue; if (distLine(a,i,rd.pts) < RD[rd.k].km+0.06){ roadMask[r*COLS+c]=1; break; } }
    }
  }
  // ---- the finer fabric: neighbourhood ground, the port, lakes, paved lots, deep water ----
  HOODS_ALL.forEach(hd=>forRect(hd, (r,c)=>{ const k=r*COLS+c, t=tType[k]; if (t===L_SAND || t===L_DUNE || t===L_CREST) tType[k] = hd.ground!=null ? hd.ground : L_URBAN; }));
  // Jebel Ali port: land built out into the sea around its two basins
  forRect(PORT_LAND, (r,c)=>{ const k=r*COLS+c; if (isWaterT(tType[k])) tType[k] = L_TARMAC; });
  PORT_BASINS.forEach(b=>forRect(b, (r,c)=>{ tType[r*COLS+c] = W_SHALLOW; roadMask[r*COLS+c] = 0; }));
  // lakes and ponds
  LAKES.forEach(l=>forRect({a:[l.a-l.rx,l.a+l.rx], i:[l.i-l.ry,l.i+l.ry]}, (r,c,a,i)=>{
    if (((a-l.a)/l.rx)**2 + ((i-l.i)/l.ry)**2 < 1){ tType[r*COLS+c] = W_CANAL; roadMask[r*COLS+c] = 0; } }));
  // bare land close to the city is paved lots and yards, not open desert
  const near = [...DISTRICTS, ...HOODS.filter(h=>h.st!=='farm'), ...PARKS, AIRPORT].map(d=>({a0:d.a[0]-LOT_KM, a1:d.a[1]+LOT_KM, i0:d.i[0]-LOT_KM, i1:d.i[1]+LOT_KM}));
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const k=r*COLS+c, t=tType[k]; if (t!==L_SAND && t!==L_DUNE && t!==L_CREST) continue;
    const {a,i} = gridToAI(c+0.5, r+0.5);
    if (near.some(d=>a>d.a0 && a<d.a1 && i>d.i0 && i<d.i1)) tType[k] = L_LOT;
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
  // deep water: open sea more than ~1.6 km from land is darker
  const dist = new Int16Array(ROWS*COLS).fill(-1), q = [];
  for (let k=0;k<ROWS*COLS;k++) if (!isWaterT(tType[k])){ dist[k]=0; q.push(k); }
  for (let h=0; h<q.length; h++){ const k=q[h], d=dist[k]; if (d>=9) continue; const r=Math.floor(k/COLS), c=k%COLS;
    for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){ const rr=r+dr, cc=c+dc; if (rr<0||cc<0||rr>=ROWS||cc>=COLS) continue; const kk=rr*COLS+cc; if (dist[kk]!==-1) continue; dist[kk]=d+1; q.push(kk); } }
  for (let k=0;k<ROWS*COLS;k++) if (tType[k]===W_SEA && (dist[k]===-1 || dist[k]>8)) tType[k]=W_DEEP;
  // terrain sprites out at sea (terrains.js: the World Islands): the tiles under the art are drawn as the sea
  // they cover (worldUnder) with the art on top, and the ones whose middle is on the art's land are sand in the
  // data, so pins and areas there work as on any island
  for (const t of TERRAINS){
    const [ca, ci] = G(t.centre[0], t.centre[1]), cw = aiToWorld(ca, ci);
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
      const k = r*COLS+c; if (!isWaterT(tType[k])) continue;
      const p = proj(c+0.5, r+0.5), sx = Math.floor((p.x - cw.x)*2/t.scale + t.w/2), sy = Math.floor((p.y - cw.y)*2/t.scale + t.h/2);
      if (sx < 0 || sy < 0 || sx >= t.w || sy >= t.h) continue;
      worldTile[k] = 1; worldUnder[k] = tType[k];
      if (isLandPx(t, sy*t.w + sx)) tType[k] = L_BEACH;
    }
  }
}

/* =========================================================
   OBJECTS  (buildings, trees, boats, landmarks) — depth sorted
   ========================================================= */
const OBJECTS = [];
// what each landmark stands on (a/i km, half-extents ha along the coast and hi inland): no cars drive
// within a tile of it and the Metro passes under its sprite
const FOOTPRINTS = [];
const inFootprint = (a, i, m=T)=>FOOTPRINTS.find(f=>Math.abs(a-f.a) <= f.ha + m && Math.abs(i-f.i) <= f.hi + m);
const PAL = {
  glass: ['#8FC3DB','#6FAACB','#A7D0E2','#7FB0C8','#9DBFD0','#B7C9D6','#E3CFA8'],
  mid:   ['#EAD7B7','#E3C9A0','#F0E2C8','#D9BF96','#E8CDB0','#F2D9B5'],
  low:   ['#F1E3C9','#E9D3AE','#F4E8D4','#E2C8A2'],
  villa: ['#F7EEDC','#F2E4CB','#EFE0C6'],
  ind:   ['#D8CFC2','#CFC3B1','#E0D8CC','#C8BCA8'],
  old:   ['#F4E6CC','#EFD6B4','#E9B496','#F1DCC0','#E6A88C','#F6EBD8'],   // cream and coral
  busy:  ['#EAD7B7','#E7C3A4','#F0E2C8','#D9C3A6','#E3B49A','#CFC6B8'],
  shed:  ['#D5D0C7','#C9C4BA','#DCD7CE','#BFC6CC'],
  campus:['#F2EEE6','#E6EDF0','#A7D0E2','#F0E2C8'],
  resort:['#F6E7CF','#F2D6BC','#FFFFFF','#EDE0C8'],
};
const ROOFS = ['#D98C5F','#C9764E','#E3A071','#F7EEDC','#F7EEDC'];

function tileWorld(c,r){ return proj(c+0.5, r+0.5); }
function reserveAround(a,i,rad){
  const g=aiToGrid(a,i), c0=Math.floor(g.gx), r0=Math.floor(g.gy);
  for (let dr=-rad;dr<=rad;dr++) for (let dc=-rad;dc<=rad;dc++){
    const r=r0+dr, c=c0+dc; if (r>=0&&c>=0&&r<ROWS&&c<COLS) reserved[r*COLS+c]=1;
  }
}

// old landmark drawings now done by the art pack's sprites (landmarks.js)
const ART_KEYS = new Set(['burj','baa','frame','motf','atlantis','jmosque','emtowers','wildwadi','gv','mall','moe','ibn','festival','dcc','mirdifcc','dhmall','dragonmart']);
function landmarkPoint(l){ return l.at==='palm-crescent' ? ATLANTIS : l.plot==='lake' ? BURJ_LAKE.c : G(l.lat, l.lng); }
function buildObjects(){
  OBJECTS.length = 0; FOOTPRINTS.length = 0;
  // the art-pack landmarks: the point is the middle of the sprite's footprint (its anchor sits half the
  // footprint lower), the ground round it is cleared, and it gets a paved plaza where it has one
  // a landmark on a plaza that lands in the water on this stylised coast moves to the nearest land
  const onLandTile = (a,i)=>{ const g=aiToGrid(a,i), c=Math.floor(g.gx), r=Math.floor(g.gy); return r>=0&&c>=0&&r<ROWS&&c<COLS && !isWaterT(tType[r*COLS+c]); };
  const plotOnLand = (a, i, R)=>{ for (let x=-R; x<=R; x++) for (let y=-R; y<=R; y++) if (!onLandTile(a + x*T, i + y*T)) return false; return true; };
  const nearestLand = (at, R)=>{
    if (plotOnLand(at[0], at[1], R)) return at;
    for (let d=T; d<=1.2; d+=T/2) for (let k=0; k<24; k++){ const th=k/24*Math.PI*2, a=at[0]+Math.cos(th)*d, i=at[1]+Math.sin(th)*d;
      // the whole plot has to be on land, not just its middle
      if (plotOnLand(a, i, R)) return [a, i]; }
    return at;
  };
  ART_LANDMARKS.forEach(l=>{
    const at = (l.plot==='plaza' || l.plot==='parking') ? nearestLand(landmarkPoint(l), Math.max(1, l.clear||1)) : landmarkPoint(l);
    // a mall clears its footprint plus a margin, and more on the two sides facing the camera (lower a, higher i),
    // where anything standing would hide its low front
    if (l.fp){ const ha = l.fp[0]/2000 + 0.12, hi = l.fp[1]/2000 + 0.12, fr = l.kind==='mall' ? 0.35 : 0; forRect({ a:[at[0]-ha-fr, at[0]+ha], i:[at[1]-hi, at[1]+hi+fr] }, (r,c)=>{ reserved[r*COLS+c] = 1; }); }
    else if (l.clear) reserveAround(at[0], at[1], l.clear);
    // its footprint (half-extents in km), for the cars and the Metro: from the metres, the art pixels
    // (a 200 m tile edge is 16 art px across), or failing those its cleared radius
    const fha = l.fp ? l.fp[0]/2000 : l.fpx ? l.fpx[0]/16*T/2 : (l.clear||1)*T, fhi = l.fp ? l.fp[1]/2000 : l.fpx ? l.fpx[1]/16*T/2 : (l.clear||1)*T;
    const g = aiToGrid(at[0], at[1]), p = proj(g.gx, g.gy), W = l.size[0];
    // the sprite's anchor is the bottom centre of its canvas, the row of the footprint's front corner: that sits
    // (coast + inland)/4 art px (= /8 world units) below the footprint's middle, which is the landmark's point
    const dy = l.billboard ? 0 : l.fpx ? (l.fpx[0] + l.fpx[1])/8 : W/8;
    OBJECTS.push({ k:'sprite', id:l.id, sprite:l.sprite, x:p.x, y:p.y + dy, px:p.x, py:p.y, w:l.size[0]/2, h:l.size[1]/2,
      d:g.gx + g.gy + (l.billboard ? 0.9 : W/32 + 0.4), plot:l.plot, plotL:2*(l.clear||0)+1,
      // a car park: the building's footprint plus ~120 m round it, in tiles (hx along gx = inland, hy along gy = the coast)
      plotHx: l.fp ? l.fp[1]/400 + 0.6 : 0, plotHy: l.fp ? l.fp[0]/400 + 0.6 : 0 });
    FOOTPRINTS.push({ a:at[0], i:at[1], ha:fha, hi:fhi, o:OBJECTS[OBJECTS.length-1] });
  });
  // nothing tall in front of the lake, so the fountain's show is never hidden
  { const [ca, ci] = BURJ_LAKE.c, h = BURJ_LAKE.h + 0.5;
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){ const {a,i} = gridToAI(c+0.5,r+0.5); if (Math.abs(a-ca) <= h && Math.abs(i-ci) <= h && (i-ci) - (a-ca) > -0.3) reserved[r*COLS+c] = 1; } }
  LANDMARKS.forEach(l=>{
    if (ART_KEYS.has(l.k)) return;
    const rad = l.k==='gv' ? 5 : l.k==='meydan' ? 4 : l.k==='mall'||l.k==='terminal'||l.k==='atlantis'||l.k==='burj'||l.k==='ibn' ? 2 : 1;
    reserveAround(l.at[0], l.at[1], rad);
    const g=aiToGrid(l.at[0], l.at[1]), p=proj(g.gx,g.gy);
    OBJECTS.push({k:'lm', lm:l.k, x:p.x, y:p.y, d:g.gx+g.gy+0.9});
    FOOTPRINTS.push({ a:l.at[0], i:l.at[1], ha:rad*T, hi:rad*T });
  });

  const addBox = (c,r,st,h,rng)=>{
    const p = tileWorld(c,r), pal = PAL[st], base = pal[Math.floor(rng()*pal.length)];
    const s = st==='villa' ? 0.28 : st==='ind' ? 0.4 : st==='glass' ? 0.3 : st==='old' ? 0.37 : st==='busy' ? 0.35 : st==='shed' ? 0.46 : st==='resort' ? 0.32 : 0.34;
    const sx = st==='ind'||st==='shed' ? s : s - rng()*0.05, sy = st==='ind' ? s*0.8 : st==='shed' ? s*0.86 : s - rng()*0.05;
    const roof = st==='villa' ? ROOFS[Math.floor(rng()*ROOFS.length)] : null;
    OBJECTS.push({k:'box', x:p.x, y:p.y, hx:sx, hy:sy, h, st, d:c+r+1,
      opts:{ top:roof||shade(base,1.07), left:shade(base,0.9), right:shade(base,0.72),
             floors: st==='glass'?5 : st==='villa'||st==='shed'?0 : st==='old'?3 : 4, mullion: st==='glass',
             floorColor: st==='glass'?'rgba(255,255,255,0.3)':undefined }});
  };
  const addTree = (c,r,rng)=>{
    const p = tileWorld(c,r);
    OBJECTS.push({k:'tree', x:p.x+(rng()-0.5)*8, y:p.y+(rng()-0.5)*4, d:c+r+1.05, ts:[0.75,1,1,1.3][Math.floor(rng()*4)]});
  };
  const free = (c,r)=>{ const k=r*COLS+c; return !roadMask[k] && !reserved[k]; };

  DISTRICTS.forEach((d,di)=>{
    if (REGEN.includes(di)) return;      // rebuilt as finer neighbourhoods below
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
    else if (t===L_URBAN && free(c,r) && !DISTRICTS.some(d=>inRect(a,i,d)) && !HOODS.some(h=>inRect(a,i,h))){
      // islands (Bluewaters, Dubai Harbour, Port Rashid)
      const roll=rng(); if (roll<0.45) addBox(c,r, a>20?'ind':'mid', 8+rng()*16, rng);
    } else if (t===L_BEACH && i>0 && rng()<0.07 && !roadMask[k]) addTree(c,r,rng);
  }

  // boats on the creek, the marina and off the Palm. A boat only goes on open water: its tile and the
  // eight round it are all water (so never on a pier, a beach or between buildings), and no other boat in those nine.
  // A spot that fails moves to the nearest one that passes within 800 m, else the boat isn't drawn.
  // dir = the way it's going (a/i): its bow points that way on screen, one of the four sprite headings
  const boatTile = new Set();
  // the QE2, moored at Port Rashid parallel to the quay's seaward edge (i = -1.0): bow along the quay, so ne
  { const [a, i] = QE2_AT, g = aiToGrid(a, i), p = proj(g.gx, g.gy);
    OBJECTS.push({ k:'ship', kind:'qe2', head:headingOf(a, i, [1, 0]), x:p.x, y:p.y, d:g.gx+g.gy+0.5 });
    for (let da=-0.8; da<=0.8; da+=T/2) for (let di=-0.3; di<=0.3; di+=T/2){ const q=aiToGrid(a+da, i+di); boatTile.add(Math.floor(q.gy)*COLS + Math.floor(q.gx)); } }
  // bollards along Port Rashid's quay edge, so it reads as a quay
  for (let a=24.5; a<=25.95; a+=0.18){ if (QUAY_SLOTS.some(sl=>sl.sprite.startsWith('quay_crane') && Math.abs(sl.at[0]-a) < 0.1)) continue; const g = aiToGrid(a, -0.97), p = proj(g.gx, g.gy); OBJECTS.push({k:'box', x:p.x, y:p.y, hx:0.025, hy:0.025, h:1.2, st:'shed', d:g.gx+g.gy+0.9, keep:true, opts:{ top:'#5E5A55', left:'#6E6964', right:'#4F4B47' }}); }
  // slots on the quay for the quay crane and container stacks (drawn once their sprites are in map-art/)
  QUAY_SLOTS.forEach(sl=>{ if (sl.terrain) return; const g = aiToGrid(sl.at[0], sl.at[1]), p = proj(g.gx, g.gy); OBJECTS.push({ k:'slot', sprite:sl.sprite, x:p.x, y:p.y, d:g.gx+g.gy+0.6 }); });
  const openWater = (c,r)=>{ for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++){ const rr=r+dr, cc=c+dc; if (rr<0||cc<0||rr>=ROWS||cc>=COLS || !isWaterT(tType[rr*COLS+cc])) return false; } return true; };
  const boatAt = (a,i,kind,dir)=>{
    const g=aiToGrid(a,i), c0=Math.floor(g.gx), r0=Math.floor(g.gy); let best=null, bd=Infinity;
    for (let dr=-4;dr<=4;dr++) for (let dc=-4;dc<=4;dc++){ const c=c0+dc, r=r0+dr, d=Math.hypot(c+0.5-g.gx, r+0.5-g.gy);
      if (d < bd && openWater(c,r) && !boatTile.has(r*COLS+c)){ bd=d; best=[c,r]; } }
    if (!best) return;
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) boatTile.add((best[1]+dr)*COLS+best[0]+dc);
    const gx = best[0]===c0 && best[1]===r0 ? g.gx : best[0]+0.5, gy = best[0]===c0 && best[1]===r0 ? g.gy : best[1]+0.5, p=proj(gx,gy);
    OBJECTS.push({k:'boat', kind, head:headingOf(a, i, dir), x:p.x, y:p.y, d:gx+gy+0.5});
  };
  // along a waterway (a polyline) at fraction f, going with it (+1) or against it (-1)
  const along = (L, f, sgn)=>{ const n=L.length-1, s=Math.min(n-1, Math.floor(f*n)), u=f*n-s, A=L[s], B=L[s+1];
    return [A[0]+(B[0]-A[0])*u, A[1]+(B[1]-A[1])*u, [(B[0]-A[0])*sgn, (B[1]-A[1])*sgn]]; };
  [[0.18,'dhow'],[0.32,'abra'],[0.45,'dhow'],[0.6,'abra']].forEach(([f,kind],q)=>{ const [a,i,dir]=along(CREEK, f+0.07, q%2?1:-1); boatAt(a, i, kind, dir); });
  [[0.25,1],[0.75,-1]].forEach(([f,sg])=>{ const [a,i,dir]=along(MARINA, f, sg); boatAt(a, i, 'yacht', dir); });
  boatAt(6.2,-1.8,'yacht',[1,0]); boatAt(13.2,-2.0,'dhow',[-1,0]); boatAt(21.5,-2.2,'yacht',[1,0]); boatAt(26.4,-1.6,'dhow',[-1,0]);


  // ===== the finer fabric (neighbourhoods), then small life, transit and the new landmarks =====
  // the new landmarks: their ground is cleared of whatever the districts put there (nothing else moves)
  { const before = new Uint8Array(reserved);
    LANDMARKS2.forEach(l=>{
      if (ART_KEYS.has(l.k)) return;
      const rad = ['dcc','mirdifcc','festival','dhmall','expo','cricket','autodrome','dragonmart','maktoum','miracle'].includes(l.k) ? 2 : 1;
      reserveAround(l.at[0], l.at[1], rad);
      const g=aiToGrid(l.at[0], l.at[1]), p=proj(g.gx,g.gy);
      OBJECTS.push({k:'lm2', lm:l.k, x:p.x, y:p.y, d:g.gx+g.gy+0.9});
      FOOTPRINTS.push({ a:l.at[0], i:l.at[1], ha:rad*T, hi:rad*T });
    });
    const tileOf = o=>{ const ai=worldToAI(o.x,o.y), g=aiToGrid(ai.a,ai.i), c=Math.floor(g.gx), r=Math.floor(g.gy); return (r>=0&&c>=0&&r<ROWS&&c<COLS) ? r*COLS+c : -1; };
    for (let k=OBJECTS.length-1;k>=0;k--){ const o=OBJECTS[k]; if ((o.k!=='box' && o.k!=='tree') || o.keep) continue; const t=tileOf(o); if (t>=0 && reserved[t] && !before[t]) OBJECTS.splice(k,1); }
  }
  // everything below uses its own random streams, so the districts above come out exactly as before
  const occ = new Uint8Array(ROWS*COLS);
  const markOcc = (a,i)=>{ const g=aiToGrid(a,i), c=Math.floor(g.gx), r=Math.floor(g.gy); if (r>=0&&c>=0&&r<ROWS&&c<COLS) occ[r*COLS+c]=1; };
  // keep the elevated Metro's footprint clear of new buildings
  METRO_AI.forEach(line=>{ for (let k=1;k<line.length;k++){ const [a0,i0]=line[k-1], [a1,i1]=line[k], n=Math.ceil(Math.hypot(a1-a0,i1-i0)/0.1);
    for (let s=0;s<=n;s++) markOcc(a0+(a1-a0)*s/n, i0+(i1-i0)*s/n); } });
  const addPalm = (c,r,rng)=>{ const p=tileWorld(c,r); OBJECTS.push({k:'palm', x:p.x+(rng()-0.5)*6, y:p.y+(rng()-0.5)*3, d:c+r+1.05, s:0.85+rng()*0.35}); };
  const addPool = (c,r,rng)=>{ const p=tileWorld(c,r); OBJECTS.push({k:'pool', x:p.x+(rng()-0.5)*3, y:p.y+(rng()-0.5)*1.5, d:c+r+0.6}); };
  const tileD = (c,r)=>c+r+1;
  const claimed = new Uint8Array(ROWS*COLS);
  HOODS_ALL.forEach((hd, hi)=>{
    const rng = mulberry32(500+hi);
    forRect(hd, (r,c,a,i)=>{
      const k=r*COLS+c; if (claimed[k]) return; claimed[k]=1;
      // tiles inside a district that keeps its own buildings are left alone
      if (DISTRICTS.some((d,di)=>!REGEN.includes(di) && inRect(a,i,d))) return;
      const t=tType[k];
      if (roadMask[k] || reserved[k] || occ[k]) return;
      const p = tileWorld(c,r);
      if (hd.st==='golf'){ if (t===L_GOLF && rng()<0.12) addTree(c,r,rng); return; }
      if (hd.st==='farm'){ if (t===L_FARM && (r%2===0) && rng()<0.85){ const o={k:'palm', x:p.x, y:p.y, d:tileD(c,r), s:0.8}; OBJECTS.push(o); } return; }
      if (hd.st==='marsh'){ if (t===L_PARK && rng()<0.14) OBJECTS.push({k:'reed', x:p.x+(rng()-0.5)*6, y:p.y, d:tileD(c,r), near:true}); return; }
      if (hd.st==='apron') return;
      if (hd.st==='port'){
        if (t!==L_TARMAC) return;
        const roll=rng();
        if (roll<0.34){ // container stacks
          const cols=['#C9503A','#3F78B5','#E0A23B','#4E9A5E','#B9B4AC','#8F4FA0'];
          const base=cols[Math.floor(rng()*cols.length)];
          OBJECTS.push({k:'box', x:p.x, y:p.y, hx:0.36, hy:0.2, h:3+Math.floor(rng()*3)*1.6, st:'cont', d:tileD(c,r), opts:{ top:shade(base,1.1), left:shade(base,0.9), right:shade(base,0.72), floors:1.6, floorColor:'rgba(0,0,0,0.18)' }});
        } else if (roll<0.4) OBJECTS.push({k:'box', x:p.x, y:p.y, hx:0.46, hy:0.4, h:5, st:'shed', d:tileD(c,r), opts:{ top:'#C3CBD2', left:'#D8D3CA', right:'#B6AFA4' }});
        occ[k]=1; return;
      }
      if (t!==L_URBAN) return;
      const roll = rng();
      if (roll < hd.p){
        const h = hd.h[0] + Math.pow(rng(),1.6)*(hd.h[1]-hd.h[0]);
        addBox(c,r,hd.st,h,rng); occ[k]=1;
        // wind towers on some of the old town's roofs
        if (hd.st==='old' && rng()<0.16){ const o=OBJECTS[OBJECTS.length-1]; OBJECTS.push({k:'box', x:o.x, y:o.y, hx:0.1, hy:0.1, z0:h, h:4.5, st:'old', d:o.d+0.01, opts:{ top:'#E8D2AE', left:'#EEDCBC', right:'#D3B88E', floors:1.5, floorColor:'rgba(74,59,48,0.35)' }}); }
      } else if (hd.st==='villa'){
        const lush = hd.lush ? 0.5 : 0.3;
        if (roll < hd.p+0.12) addPool(c,r,rng); else if (roll < hd.p+0.12+lush) addTree(c,r,rng);
      } else if (hd.st==='campus' || hd.st==='low'){ if (roll < hd.p+0.22) addTree(c,r,rng); }
      else if (hd.st==='resort'){ if (roll < hd.p+0.3) addPalm(c,r,rng); }
      else if (hd.st==='old' || hd.st==='busy'){ if (roll < hd.p+0.05) addTree(c,r,rng); }
    });
  });
  // pools in the gardens of the villa districts too (only on their empty plots)
  { const rng = mulberry32(777), filled = new Uint8Array(ROWS*COLS);
    OBJECTS.forEach(o=>{ if (o.k==='box' || o.k==='tree'){ const ai=worldToAI(o.x,o.y), g=aiToGrid(ai.a,ai.i), c=Math.floor(g.gx), r=Math.floor(g.gy); if (r>=0&&c>=0&&r<ROWS&&c<COLS) filled[r*COLS+c]=1; } });
    DISTRICTS.forEach(d=>{ if (d.st!=='villa') return; forRect(d, (r,c)=>{ const k=r*COLS+c; if (tType[k]===L_URBAN && !filled[k] && !roadMask[k] && !reserved[k] && rng()<0.22) addPool(c,r,rng); }); }); }

  // small life: palms and parasols on the beaches, shrubs, ghaf trees, camels and farms in the desert
  { const rng = mulberry32(31337);
    const PUBLIC_BEACH = [[-1.2,1.0],[11.0,12.6],[20.2,21.4],[32.0,33.2],[16.5,18.5],[8.4,9.4]];   // JBR, Kite Beach, La Mer, Mamzar, Jumeirah, Sunset
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
      const k=r*COLS+c, t=tType[k]; if (roadMask[k] || reserved[k]) continue;
      const {a,i} = gridToAI(c+0.5,r+0.5), p = tileWorld(c,r);
      if (t===L_BEACH){
        if (i>-0.5 && rng()<0.1) OBJECTS.push({k:'palm', x:p.x+(rng()-0.5)*6, y:p.y, d:c+r+1, s:0.8+rng()*0.3});
        if (i>-0.5 && PUBLIC_BEACH.some(([x0,x1])=>a>x0 && a<x1) && rng()<0.3) OBJECTS.push({k:'parasol', x:p.x+(rng()-0.5)*8, y:p.y+(rng()-0.5)*3, d:c+r+0.9, near:true, col:['#E86A5C','#F2B84B','#5FA8D3','#FFFFFF','#8BC34A'][Math.floor(rng()*5)]});
      } else if (t===L_SAND || t===L_DUNE || t===L_CREST){
        const roll = rng();
        if (roll<0.045) OBJECTS.push({k:'shrub', x:p.x+(rng()-0.5)*8, y:p.y+(rng()-0.5)*4, d:c+r+1, near:true});
        else if (roll<0.056) OBJECTS.push({k:'ghaf', x:p.x+(rng()-0.5)*6, y:p.y+(rng()-0.5)*3, d:c+r+1, near:roll>0.052});
        else if (roll<0.0575 && i>10) for (let q=0;q<2+Math.floor(rng()*2);q++) OBJECTS.push({k:'camel', x:p.x+q*5-4, y:p.y+q*1.5, d:c+r+1+q*0.01, near:true, f:rng()<0.5});
      } else if (t===L_LOT && rng()<0.24){
        // yards and plots round the edges of the city: low houses, sheds, a tree, a bit of scrub
        const q = rng();
        if (q<0.3) OBJECTS.push({k:'shrub', x:p.x+(rng()-0.5)*8, y:p.y+(rng()-0.5)*4, d:c+r+1, near:true});
        else if (q<0.5) addTree(c,r,rng);
        else if (q<0.75) addBox(c,r,'low',5+rng()*4,rng);
        else OBJECTS.push({k:'box', x:p.x, y:p.y, hx:0.4, hy:0.32, h:3+rng()*3, st:'shed', d:c+r+1, opts:{ top:'#CBC3B5', left:'#DAD2C4', right:'#B9AE9C' }});
      }
    }
    // flamingos at Ras Al Khor: pink flocks along the lagoon's edge
    for (let q=0;q<9;q++){ const th=0.6+q*0.35, a=LAGOON.c[0]+Math.cos(th)*(LAGOON.r-0.12), i=LAGOON.c[1]+Math.sin(th)*(LAGOON.r-0.12), w=aiToWorld(a,i);
      OBJECTS.push({k:'flamingo', x:w.x, y:w.y, d:aiToGrid(a,i).gx+aiToGrid(a,i).gy+0.5, near:true, n:3+q%3}); }
  }

  // the Metro: elevated track segments (depth-sorted so buildings in front cover it) and stations
  const onTrack = (a,i)=>{ const t = tileAt(a,i); return t >= 0 && (!isWaterT(t) || t===W_CANAL); };
  const underSprite = (a, i, d)=>{ const f = FOOTPRINTS.find(f=>f.o && Math.abs(a-f.a) <= f.ha + T && Math.abs(i-f.i) <= f.hi + T); return f ? Math.min(d, f.o.d - 0.05) : d; };
  METRO_AI.forEach((line, li)=>{
    const col = METRO[li].col;
    for (let k=1;k<line.length;k++){
      const [a0,i0]=line[k-1], [a1,i1]=line[k], n=Math.max(1, Math.ceil(Math.hypot(a1-a0,i1-i0)/0.25));
      for (let s=0;s<n;s++){
        const pa=a0+(a1-a0)*s/n, pi=i0+(i1-i0)*s/n, qa=a0+(a1-a0)*(s+1)/n, qi=i0+(i1-i0)*(s+1)/n;
        const P=aiToWorld(pa,pi), Q=aiToWorld(qa,qi), ma=(pa+qa)/2, mi=(pi+qi)/2, g=aiToGrid(ma,mi);
        // only over land and its bridges (never off the map or out over the sea), and under a landmark's sprite
        if (!onTrack(ma, mi)) continue;
        OBJECTS.push({k:'rail', x:(P.x+Q.x)/2, y:(P.y+Q.y)/2, x0:P.x, y0:P.y, x1:Q.x, y1:Q.y, col, d:underSprite(ma, mi, g.gx+g.gy+0.7)});
      }
    }
    METRO[li].stations.forEach(([lat,lng,name])=>{ if (!name) return; const [a,i]=G(lat,lng); if (!onTrack(a,i)) return; const g=aiToGrid(a,i), p=proj(g.gx,g.gy);
      OBJECTS.push({k:'station', x:p.x, y:p.y, col, d:underSprite(a, i, g.gx+g.gy+0.75)}); });
  });

  // boats: more abras and dhows on the creek, yachts in the marina and at Dubai Harbour
  { const rng = mulberry32(2024);
    for (let q=0;q<14;q++){ const [a,i,dir]=along(CREEK, 0.04+q*0.05, rng()<0.5?1:-1);
      // abras cross the creek, dhows go up and down it
      boatAt(a+(rng()-0.5)*0.08, i+(rng()-0.5)*0.08, q%3===0?'dhow':'abra', q%3===0 ? dir : [-dir[1], dir[0]]); }
    [[0.15,'yacht'],[0.4,'yacht'],[0.55,'yacht'],[0.75,'yacht'],[0.9,'yacht']].forEach(([f],q)=>{ const [a,i,dir]=along(MARINA, f, q%2?1:-1); boatAt(a+0.03, i, 'yacht', dir); });
    [[2.4,-0.75],[2.75,-0.8],[3.1,-0.7],[24.9,-1.15],[26.9,0.1],[27.3,0.12],[-9.2,-2.4],[-10.9,-2.5]].forEach(([a,i],q)=>boatAt(a,i, q<3?'yacht':'dhow', [q%2?1:-1, 0]));
  }
  // planes at DXB and Al Maktoum; cranes at the ports
  // planes sit on a runway's centre line, nose along it: the heading comes from the runway's own direction
  // (index into RUNWAYS: DXB's two, then Al Maktoum's two; i along the runway; +1/-1 which way it faces)
  [[0,6.4,1],[0,8.7,-1],[1,7.3,1],[1,9.0,-1],[2,14.0,1],[3,15.4,-1],[3,16.4,1]].forEach(([n,i,sg])=>{ const rw=RUNWAYS[n], w=aiToWorld(rw.a,i), g=aiToGrid(rw.a,i);
    OBJECTS.push({k:'plane', head:headingOf(rw.a, i, [0, sg]), x:w.x, y:w.y, d:g.gx+g.gy+0.8}); });
  // (Jebel Ali's; Port Rashid's quay crane is a slot for its own sprite, see QUAY_SLOTS in landmarks.js)
  [[-11.75,-2.0],[-11.75,-2.5],[-10.65,-2.2],[-9.85,-2.0],[-9.85,-2.6],[-8.55,-2.3],[-11.2,-1.4],[-9.2,-1.4]].forEach(([a,i],q)=>{
    const w=aiToWorld(a,i), g=aiToGrid(a,i); OBJECTS.push({k:'crane', x:w.x, y:w.y, d:g.gx+g.gy+0.9, col:q%2?'#3F78B5':'#D9443A'}); });

  // palms down both sides of the palm-lined roads, every ~150 m, where there's free land
  { const rng = mulberry32(4242);
    ROADS.filter(r=>r.palms).forEach(rd=>{
      const off = RD[rd.k].km + 0.05;
      for (let k=0; k<rd.pts.length-1; k++){
        const [a0,i0]=rd.pts[k], [a1,i1]=rd.pts[k+1], L=Math.hypot(a1-a0,i1-i0), na=-(i1-i0)/L, ni=(a1-a0)/L;
        for (let d=0.075; d<L; d+=0.15) for (const side of [-1,1]){
          const a=a0+(a1-a0)*d/L+na*off*side, i=i0+(i1-i0)*d/L+ni*off*side, g=aiToGrid(a,i), c=Math.floor(g.gx), r=Math.floor(g.gy);
          if (r<0||c<0||r>=ROWS||c>=COLS) continue;
          const t=tType[r*COLS+c]; if (isWaterT(t) || reserved[r*COLS+c] || t===L_BEACH && side<0) continue;
          const p=proj(g.gx,g.gy); OBJECTS.push({k:'palm', x:p.x, y:p.y, d:g.gx+g.gy+0.3, s:0.85+rng()*0.25});
        }
      }
    });
  }
  assignHeights();
  landmarkTowers();
  // nothing stands in a fogged region
  if (FOG_A > -Infinity) for (let k=OBJECTS.length-1; k>=0; k--) if (inFog(worldToAI(OBJECTS[k].x, OBJECTS[k].y).a)) OBJECTS.splice(k, 1);
  OBJECTS.sort((p,q)=>p.d-q.d);
}
// Building heights, by zone and smooth noise (the buildings themselves, and how many, stay as placed). In the
// tower districts (Downtown, the Marina, JLT, Business Bay): a few low blocks, some mid rise, mostly towers
// (12 floors and up, with a setback top). Everywhere else: low rise (1 to 3 floors), mid rise (4 to 8) and a few
// of 9 to 11. Neighbouring blocks get similar heights (smooth noise); each its own floor count (by its spot).
// The landmark towers stay the tallest and nothing generated covers them (budget in art px, the map's full scale):
//  - within 8 tiles of the Burj Khalifa no generated building is taller than 45 % of the Burj as drawn
//  - elsewhere in Downtown, Business Bay and on Sheikh Zayed Road (DIFC), no taller than 60 % of it
//  - anywhere, no taller than 130 px
// and a generated building standing in front of a landmark tower (whose top would cover its spire or wing) is
// drawn just before it instead.
const HEIGHT_BUDGET = { nearBurj:0.45, nearTiles:8, corridor:0.6, globalPx:130 };
const BURJ_PX = 332;   // the Burj Khalifa sprite's drawn height (its opaque rows)
const budgetStats = { capped:0, near:0, corridor:0, global:0, reordered:0 };
function landmarkTowers(){
  const burj = OBJECTS.find(o=>o.k==='sprite' && o.id==='burj_khalifa');
  const bAI = burj ? worldToAI(burj.px, burj.py) : null, corridor = DISTRICTS.filter(d=>d.corridor);
  for (const o of OBJECTS){
    if (o.k !== 'box' || (o.z0||0) > 0) continue;
    const ai = worldToAI(o.x, o.y), near = bAI && Math.hypot(ai.a - bAI.a, ai.i - bAI.i) <= HEIGHT_BUDGET.nearTiles*T;
    const inCorr = corridor.some(d=>inRect(ai.a, ai.i, d));
    let cap = HEIGHT_BUDGET.globalPx, why = 'global';
    if (near && BURJ_PX*HEIGHT_BUDGET.nearBurj < cap){ cap = BURJ_PX*HEIGHT_BUDGET.nearBurj; why = 'near'; }
    else if (inCorr && BURJ_PX*HEIGHT_BUDGET.corridor < cap){ cap = BURJ_PX*HEIGHT_BUDGET.corridor; why = 'corridor'; }
    const capH = cap/2 - (o.tower ? 8 : 0);   // world units; a tower keeps room for its rooftop kit
    if (o.h > capH){ o.h = Math.floor(capH/FLOOR)*FLOOR; budgetStats.capped++; budgetStats[why]++; if (o.h < 12*FLOOR) o.tower = false; }
  }
  // generated buildings in front of a landmark tower that reach into its sprite draw just before it
  for (const L of OBJECTS.filter(o=>o.k==='sprite' && o.h >= 75)){
    const lx0 = L.x - L.w/2, lx1 = L.x + L.w/2, ly0 = L.y - L.h;
    for (const o of OBJECTS){
      if (o.k !== 'box' || o.d <= L.d || o.d > L.d + 10) continue;
      const hw = TW/2*(o.hx + o.hy), top = o.y - (o.z0||0) - o.h - TH/2*(o.hx + o.hy);
      if (o.x + hw > lx0 && o.x - hw < lx1 && top < L.y && o.y > ly0){ o.d = L.d - 0.01; budgetStats.reordered++; }
    }
  }
}
const FLOOR = 3;   // world units a floor
const HEIGHT_MIX = { towers:[0.15, 0.40], other:[0.42, 0.74] };   // the shares below which a block is low, then mid
function assignHeights(){
  const zones = DISTRICTS.filter(d=>d.towers), styles = new Set(['glass','mid','busy','low','campus','resort']);
  const groups = { towers:[], other:[] };
  for (const o of OBJECTS){
    if (o.k !== 'box' || o.keep || (o.z0||0) > 0 || !styles.has(o.st)) continue;
    const ai = worldToAI(o.x, o.y), n = vnoise(ai.a*0.9 + 11, ai.i*0.9 + 5)*0.8 + hash2(Math.round(o.x*4), Math.round(o.y*4))*0.2;
    groups[zones.some(z=>inRect(ai.a, ai.i, z)) ? 'towers' : 'other'].push({ o, n });
  }
  for (const [g, list] of Object.entries(groups)){
    list.sort((p,q)=>p.n - q.n);
    const [lo, mid] = HEIGHT_MIX[g];
    list.forEach(({o}, k)=>{
      const f = k/list.length, r = hash2(Math.round(o.x*8)+3, Math.round(o.y*8)+7);
      let floors;
      if (f < lo) floors = 1 + Math.floor(r*3);                                  // 1-3
      else if (f < mid) floors = 4 + Math.floor(r*5);                            // 4-8
      else if (g === 'towers') floors = 12 + Math.floor(Math.pow(r, 1.6)*18);    // 12-29
      else floors = 9 + Math.floor(r*3);                                         // 9-11
      o.h = floors*FLOOR; o.tower = floors >= 12;
    });
  }
}

/* =========================================================
   RENDERING
   ========================================================= */
const OUT = '#4A3B30';
let LW = 0.8;   // outline width in world px (set per render)
const up = (p,h)=>[p[0], p[1]-h];

/* ---------- night palette: deep navy sea, dusky blue-grey land and roads ---------- */
let NIGHT = false;
const TILE_NIGHT = ['#0B1830','#112442','#394052','#333A4B','#2E3446','#2A3041','#1E322D','#0F223D','#252A36','#394052','#2B3142','#1F3530','#081428','#1F3328','#383E52'];
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


let ROADS_W=null, MAP_CLIP=null, RUNWAYS_W=null;
// A road is drawn and driven only over land and its bridges: a stretch over the creek, the canal or a lake
// up to BRIDGE_KM long with land at both ends, or the whole of a causeway. It stops at the map's edge and at
// the sea, so one road can come out as several pieces (ROADS_W). main = Sheikh Zayed Road (the busiest).
const BRIDGE_KM = 1.0;
function landPieces(rd){
  const smp = [], out = [];
  for (let k=1;k<rd.pts.length;k++){ const [a0,i0]=rd.pts[k-1], [a1,i1]=rd.pts[k], n=Math.max(1, Math.ceil(Math.hypot(a1-a0,i1-i0)/0.05));
    for (let q=(k===1?0:1); q<=n; q++){ const a=a0+(a1-a0)*q/n, i=i0+(i1-i0)*q/n, t=tileAt(a,i);
      // 2 land (or a causeway), 1 creek, canal or lake, 0 off the map or the sea
      smp.push({ a, i, vtx:q===n, st: t<0 || inFog(a) ? 0 : (!isWaterT(t) || rd.causeway) ? 2 : t===W_CANAL ? 1 : 0 }); } }
  // a run over the creek is a bridge if it's short and has land at both ends
  for (let s=0; s<smp.length; ){ if (smp[s].st!==1){ s++; continue; } let e=s; while (e<smp.length && smp[e].st===1) e++;
    const ok = s>0 && e<smp.length && smp[s-1].st===2 && smp[e].st===2 && (e-s)*0.05 <= BRIDGE_KM;
    for (let q=s;q<e;q++) smp[q].st = ok ? 2 : 0;
    s=e; }
  // pieces: the runs that stay, with just the road's own corners and the two ends
  let cur = null;
  smp.forEach((p,q)=>{
    if (p.st!==2){ if (cur && cur.length>1) out.push(cur); cur=null; return; }
    if (!cur) cur=[];
    if (!cur.length || p.vtx || q===smp.length-1 || smp[q+1].st!==2) cur.push([p.a,p.i]);
  });
  if (cur && cur.length>1) out.push(cur);
  return out;
}
function prepRoads(){
  ROADS_W = ROADS.flatMap((r,idx)=>landPieces(r).map(pts=>({k:r.k, main:idx===0, causeway:!!r.causeway, pts:pts.map(([a,i])=>{ const p=aiToWorld(a,i); return [p.x,p.y]; })})));
  const c=[proj(0,0),proj(COLS,0),proj(COLS,ROWS),proj(0,ROWS)];
  if (typeof Path2D !== 'undefined'){ MAP_CLIP = new Path2D(); MAP_CLIP.moveTo(c[0].x,c[0].y); c.slice(1).forEach(p=>MAP_CLIP.lineTo(p.x,p.y)); MAP_CLIP.closePath(); }
  RUNWAYS_W = RUNWAYS.map(rw=>{
    const q=(a,i)=>{ const p=aiToWorld(a,i); return [p.x,p.y]; };
    return { poly:[q(rw.a-0.09,rw.i[0]),q(rw.a+0.09,rw.i[0]),q(rw.a+0.09,rw.i[1]),q(rw.a-0.09,rw.i[1])], line:[q(rw.a,rw.i[0]+0.1),q(rw.a,rw.i[1]-0.1)] };
  });
}
function strokeLine(ctx, pts){ ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let k=1;k<pts.length;k++) ctx.lineTo(pts[k][0],pts[k][1]); ctx.stroke(); }


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
    case 'gv': {
      // Global Village: a paved festival ground ringed by country pavilions with domes in every
      // colour, the big Ferris wheel at the back and the arched gate facing you at the front
      const at = (gx,gy)=>[x+(gx-gy)*TW/2, y+(gx+gy)*TH/2];
      const oval = (r,col)=>{ ctx.beginPath(); for (let t=0;t<=72;t++){ const q=t/72*Math.PI*2, [px,py]=at(Math.cos(q)*r, Math.sin(q)*r); t?ctx.lineTo(px,py):ctx.moveTo(px,py); } ctx.closePath(); ctx.fillStyle=C(col); ctx.fill(); ctx.stroke(); };
      const cols=['#E86A5C','#F2B84B','#5FA8D3','#8BC34A','#B57EDC','#F28CB1','#4DB6AC','#FF9E5E','#7C8CE0','#E0C35A','#D45D79','#57B894'];
      ctx.lineWidth=LW; ctx.strokeStyle=C(OUT);
      oval(3.4,'#E4BE93'); oval(2.9,'#F1D9B8'); oval(1.1,'#8CC46B');
      // fountain in the middle
      { const [fx,fy]=at(0,0); ctx.fillStyle=C('#78D7CC'); ctx.beginPath(); ctx.ellipse(fx,fy,7,3.5,0,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
      // the Ferris wheel, at the back
      { const [wx,wy]=at(-2.9,-0.6), Rw=30, cy=wy-Rw-6;
        ctx.save(); ctx.lineCap='round';
        ctx.strokeStyle=C(OUT); ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(wx-10,wy); ctx.lineTo(wx,cy); ctx.lineTo(wx+10,wy); ctx.stroke();
        ctx.strokeStyle=C('#E9EDF0'); ctx.lineWidth=1.6; ctx.stroke();
        ctx.strokeStyle=C('rgba(74,59,48,0.5)'); ctx.lineWidth=0.6; ctx.beginPath();
        for (let k=0;k<16;k++){ const t=k/16*Math.PI*2; ctx.moveTo(wx,cy); ctx.lineTo(wx+Math.cos(t)*Rw*0.42, cy+Math.sin(t)*Rw); } ctx.stroke();
        ctx.strokeStyle=C(OUT); ctx.lineWidth=4; ctx.beginPath(); ctx.ellipse(wx,cy,Rw*0.42,Rw,0,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle=C('#F28CB1'); ctx.lineWidth=2.4; ctx.stroke();
        for (let k=0;k<16;k++){ const t=k/16*Math.PI*2, cx2=wx+Math.cos(t)*Rw*0.42, cy2=cy+Math.sin(t)*Rw;
          ctx.fillStyle=C(cols[k%cols.length]); ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*0.8; ctx.beginPath(); ctx.rect(cx2-1.8,cy2-1.2,3.6,3.2); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle=C('#E2B544'); ctx.beginPath(); ctx.arc(wx,cy,2.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.restore(); }
      // pavilions round the ground, back to front so nearer ones overlap (a gap at the front for the gate)
      const pav=[]; for (let k=0;k<14;k++){ const q=k/14*Math.PI*2; pav.push({ gx:Math.cos(q)*2.25, gy:Math.sin(q)*2.25, c:cols[k%cols.length], w:k%3===0?0.5:0.4, h:k%2?9:12 }); }
      pav.filter(q=>q.gx+q.gy < 2.6).sort((p,q)=>(p.gx+p.gy)-(q.gx+q.gy)).forEach(q=>{
        const [px,py]=at(q.gx,q.gy);
        isoBox(ctx,px,py,q.w,q.w,0,q.h,q.c,{floors:2});
        ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
        ctx.fillStyle=C(q.c===cols[1]?'#5FA8D3':'#F2CF6B'); ctx.beginPath(); ctx.ellipse(px,py-q.h-TH*q.w*0.5,TW*q.w*0.42,TW*q.w*0.4,0,Math.PI,0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px,py-q.h-TH*q.w*0.5-TW*q.w*0.4); ctx.lineTo(px,py-q.h-TH*q.w*0.5-TW*q.w*0.4-3); ctx.stroke();
      });
      // the gate, facing you: twin domed towers and a big coloured arch with the sign
      { const [gx0,gy0]=at(3.05,3.05), sp=10, th=19, red='#C9603E', gold='#E2B544';
        isoBox(ctx,gx0-sp,gy0,0.24,0.24,0,th,red,{floors:3});
        isoBox(ctx,gx0+sp,gy0,0.24,0.24,0,th,red,{floors:3});
        ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
        [gx0-sp, gx0+sp].forEach(tx=>{ ctx.fillStyle=C(gold); ctx.beginPath(); ctx.ellipse(tx,gy0-th-1.5,4.2,4.6,0,Math.PI,0); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tx,gy0-th-6); ctx.lineTo(tx,gy0-th-9); ctx.stroke(); });
        // arch: a thick band in rainbow stripes
        const arch = (r, col, w)=>{ ctx.strokeStyle=C(col); ctx.lineWidth=w; ctx.beginPath(); ctx.ellipse(gx0, gy0-th+5, sp-1, r, 0, Math.PI, 0); ctx.stroke(); };
        ctx.save(); ctx.lineCap='butt';
        arch(12, OUT, 6); ['#E86A5C','#F2B84B','#5FA8D3','#8BC34A'].forEach((c,i)=>arch(12-1.8+i*1.2, c, 1.3));
        ctx.restore();
        // sign board over the arch
        ctx.fillStyle=C('#3A2A1E'); ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
        ctx.beginPath(); ctx.rect(gx0-7.5,gy0-th-11,15,4.5); ctx.fill(); ctx.stroke();
        ctx.fillStyle=C(gold); for (let k=0;k<7;k++){ ctx.beginPath(); ctx.arc(gx0-5.4+k*1.8, gy0-th-8.75, 0.6, 0, Math.PI*2); ctx.fill(); } }
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
  const k = o.ts || 1;   // three sizes: young, grown, old
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
  ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x,o.y-3*k); ctx.stroke();
  ctx.fillStyle=C(k > 1.1 ? '#5FA34F' : '#6DB35A'); ctx.beginPath(); ctx.arc(o.x,o.y-3*k-2.2*k,2.7*k,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle=C('rgba(255,255,255,0.28)'); ctx.beginPath(); ctx.arc(o.x-0.9*k,o.y-3*k-3.2*k,1*k,0,Math.PI*2); ctx.fill();
}
/* ---------- small life (palms, pools, shrubs, ghaf, camels, parasols, reeds, flamingos) ---------- */
function drawPalm(ctx,o){
  const s=o.s||1, x=o.x, y=o.y, top=[x+1.2*s, y-9*s];
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*1.6; ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+0.2*s,y-5*s,top[0],top[1]); ctx.stroke();
  ctx.strokeStyle=C('#9A6B3F'); ctx.lineWidth=LW*0.8; ctx.stroke();
  ctx.lineCap='round';
  [[-5,1.5],[-3.5,-2.5],[0.5,-3.2],[4,-2],[5,1.8]].forEach(([dx,dy])=>{
    ctx.beginPath(); ctx.moveTo(top[0],top[1]); ctx.quadraticCurveTo(top[0]+dx*0.6*s, top[1]+dy*s-1.5*s, top[0]+dx*s, top[1]+dy*s+1.2*s);
    ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*2.2; ctx.stroke(); ctx.strokeStyle=C('#5FA84F'); ctx.lineWidth=LW*1.2; ctx.stroke();
  });
  ctx.lineCap='butt';
}
function drawPool(ctx,o){
  const x=o.x, y=o.y, w=4.2, h=2.1;
  ctx.lineWidth=LW*0.8; ctx.strokeStyle=C('#FFFFFF');
  ctx.beginPath(); ctx.moveTo(x,y-h); ctx.lineTo(x+w,y); ctx.lineTo(x,y+h); ctx.lineTo(x-w,y); ctx.closePath();
  ctx.fillStyle=C('#5CC6E0'); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=C('rgba(255,255,255,0.45)'); ctx.beginPath(); ctx.moveTo(x-1.5,y-0.3); ctx.lineTo(x+1.2,y+0.6); ctx.stroke();
}
function drawShrub(ctx,o){ ctx.fillStyle=C('#9DA65A'); ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*0.6; ctx.beginPath(); ctx.ellipse(o.x,o.y-1,2,1.2,0,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
function drawGhaf(ctx,o){
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW; ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x,o.y-3.5); ctx.stroke();
  ctx.fillStyle=C('#7FA05A'); ctx.beginPath(); ctx.ellipse(o.x,o.y-5.2,4.6,2.6,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle=C('rgba(255,255,255,0.28)'); ctx.beginPath(); ctx.ellipse(o.x-1.5,o.y-6,1.6,0.8,0,0,Math.PI*2); ctx.fill();
}
function drawCamel(ctx,o){
  const x=o.x, y=o.y, f=o.f?-1:1;
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*0.8; ctx.fillStyle=C('#C99A5B');
  ctx.beginPath(); ctx.moveTo(x-1.8*f,y); ctx.lineTo(x-1.8*f,y-2.5); ctx.moveTo(x+1.6*f,y); ctx.lineTo(x+1.6*f,y-2.5); ctx.stroke();   // legs
  ctx.beginPath(); ctx.ellipse(x,y-3.2,2.6,1.3,0,0,Math.PI*2); ctx.fill(); ctx.stroke();                                              // body
  ctx.beginPath(); ctx.ellipse(x-0.3*f,y-4.2,1.2,0.9,0,0,Math.PI*2); ctx.fill(); ctx.stroke();                                         // hump
  ctx.beginPath(); ctx.moveTo(x+2.2*f,y-3.4); ctx.lineTo(x+3.6*f,y-5.6); ctx.lineWidth=LW*1.4; ctx.stroke();                          // neck
  ctx.beginPath(); ctx.ellipse(x+3.9*f,y-5.8,0.9,0.55,0,0,Math.PI*2); ctx.lineWidth=LW*0.8; ctx.fill(); ctx.stroke();                 // head
}
function drawParasol(ctx,o){
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*0.7; ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x,o.y-4); ctx.stroke();
  ctx.fillStyle=C(o.col); ctx.beginPath(); ctx.moveTo(o.x-3.2,o.y-3.6); ctx.quadraticCurveTo(o.x,o.y-6.6,o.x+3.2,o.y-3.6); ctx.closePath(); ctx.fill(); ctx.stroke();
}
function drawReed(ctx,o){ ctx.strokeStyle=C('#7D9A4E'); ctx.lineWidth=LW*0.8; ctx.beginPath(); for (let q=-2;q<=2;q++){ ctx.moveTo(o.x+q,o.y); ctx.lineTo(o.x+q*1.6,o.y-3-Math.abs(q)*0.3); } ctx.stroke(); }
function drawFlamingo(ctx,o){
  for (let q=0;q<o.n;q++){ const x=o.x+q*2.4-o.n, y=o.y+(q%2)*0.8;
    ctx.strokeStyle=C('#B9576B'); ctx.lineWidth=LW*0.6; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-2.2); ctx.stroke();
    ctx.fillStyle=C('#F28CA0'); ctx.beginPath(); ctx.ellipse(x,y-2.8,1.1,0.7,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+0.8,y-3); ctx.quadraticCurveTo(x+1.6,y-4.6,x+0.9,y-5); ctx.stroke(); }
}
/* ---------- the Metro: track on pillars, and stations ---------- */
const RAIL_Z = 7;
function drawRail(ctx,o){
  ctx.strokeStyle=C('#B8B1A7'); ctx.lineWidth=LW*1.4; ctx.beginPath(); ctx.moveTo(o.x0,o.y0); ctx.lineTo(o.x0,o.y0-RAIL_Z); ctx.stroke();   // pillar
  ctx.lineCap='round';
  ctx.strokeStyle=C(OUT); ctx.lineWidth=3.4; ctx.beginPath(); ctx.moveTo(o.x0,o.y0-RAIL_Z); ctx.lineTo(o.x1,o.y1-RAIL_Z); ctx.stroke();
  ctx.strokeStyle=C('#E8E4DD'); ctx.lineWidth=2.2; ctx.stroke();
  ctx.strokeStyle=C(o.col); ctx.lineWidth=0.9; ctx.stroke();
  ctx.lineCap='butt';
}
function drawStation(ctx,o){
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
  isoBox(ctx, o.x, o.y, 0.42, 0.24, RAIL_Z-2, 3.4, '#E8E4DD', {top:'#F2F0EB'});
  // the shell-shaped roof in the line's colour
  ctx.fillStyle=C(o.col); ctx.beginPath(); ctx.ellipse(o.x, o.y-RAIL_Z-2.2, 4.8, 2.2, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
}
/* ---------- cranes (the planes and boats are sprites: landmarks.js PROPS) ---------- */
function drawCrane(ctx,o){
  const x=o.x, y=o.y, h=26;
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*2.2; ctx.beginPath(); ctx.moveTo(x-3,y+1); ctx.lineTo(x-3,y-h); ctx.moveTo(x+3,y-1); ctx.lineTo(x+3,y-h-2); ctx.stroke();
  ctx.strokeStyle=C(o.col); ctx.lineWidth=LW*1.2; ctx.stroke();
  // the boom out over the water and the back stay
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*2; ctx.beginPath(); ctx.moveTo(x-10,y-h+4); ctx.lineTo(x+8,y-h-5); ctx.stroke();
  ctx.strokeStyle=C(o.col); ctx.lineWidth=LW*1.1; ctx.stroke();
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*0.6; ctx.beginPath(); ctx.moveTo(x-8,y-h+3); ctx.lineTo(x-8,y-h+9); ctx.stroke();
  isoBox(ctx, x+4, y-2, 0.18, 0.14, h-1, 3, '#E9E4DA');
}

/* ---------- the new landmarks (simple, in the same style) ---------- */
const at2 = (x,y,gx,gy)=>[x+(gx-gy)*TW/2, y+(gx+gy)*TH/2];
function flag(ctx, x, y, h){
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW*1.4; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-h); ctx.stroke();
  const fx=x+0.5, fy=y-h;
  ctx.lineWidth=LW*0.6;
  [['#2E8B57',0],['#FFFFFF',1.8],['#1F1F1F',3.6]].forEach(([c,o])=>{ ctx.fillStyle=C(c); ctx.fillRect(fx+2.2, fy+o, 8, 1.8); });
  ctx.fillStyle=C('#D9443A'); ctx.fillRect(fx, fy, 2.2, 5.4); ctx.strokeRect(fx, fy, 10.2, 5.4);
}
function dome(ctx, x, y, r, col){ ctx.fillStyle=C(col); ctx.beginPath(); ctx.ellipse(x, y, r, r*0.9, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
function drawLandmark2(ctx, o){
  const x=o.x, y=o.y; ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
  switch(o.lm){
    case 'goldsouk':   // the covered souk: a long arcade under a timber roof
      isoBox(ctx,x,y,1.4,0.32,0,7,'#E9D2A8',{floors:3});
      isoBox(ctx,x,y,1.45,0.36,7,2.5,'#9A6B3F',{top:'#B98450'}); break;
    case 'clocktower': // Deira Clock Tower: four legs and the clock on top, on its roundabout
      isoDisc(ctx,x,y,12,6,1.5,'#8CC46B');
      [[-0.15,-0.15],[0.15,-0.15],[0.15,0.15],[-0.15,0.15]].forEach(([gx,gy])=>{ const [px,py]=at2(x,y,gx,gy); isoBox(ctx,px,py,0.06,0.06,1.5,12,'#E9E4DA'); });
      isoBox(ctx,x,y,0.26,0.26,13.5,7,'#F2EEE6',{top:'#D9C9A8'});
      ctx.fillStyle=C('#FFFFFF'); ctx.beginPath(); ctx.arc(x-2,y-17,1.6,0,Math.PI*2); ctx.fill(); ctx.stroke(); break;
    case 'dcc': case 'mirdifcc': case 'festival': case 'dhmall':   // malls: big low boxes with a skylight band
      isoBox(ctx,x,y,1.5,0.9,0,8,o.lm==='mirdifcc'?'#EBDCC4':o.lm==='dhmall'?'#EFE6D6':'#E6D5BC',{floors:4});
      isoBox(ctx,x,y,1.0,0.25,8,1.6,'#A7D0E2',{top:'#C8E4F0'}); break;
    case 'waterfront': isoBox(ctx,x,y,1.2,0.5,0,5,'#E9DCC6',{top:'#5FA8D3'}); break;
    case 'etihad':     // Etihad Museum: a low white pavilion like an open manuscript, and the Union flag
      isoBox(ctx,x,y,0.9,0.6,0,3,'#9BC98A');
      isoBox(ctx,x,y,0.7,0.45,3,5,'#F4F2EE',{top:'#E6ECEF'});
      flag(ctx, x+12, y+4, 34); break;
    case 'jmosque':    // Jumeirah Mosque: cream, a central dome, twin minarets
      isoBox(ctx,x,y,0.6,0.5,0,7,'#F1E3C9');
      dome(ctx,x,y-8,4.2,'#F7EEDC');
      [-1,1].forEach(s=>{ const [px,py]=at2(x,y,0.45*s,-0.4*s); isoBox(ctx,px,py,0.07,0.07,0,19,'#F1E3C9'); dome(ctx,px,py-19,1.4,'#F7EEDC'); }); break;
    case 'emtowers':   // Emirates Towers: two tall steel-grey towers with sloped tops
      [[0,0,62],[0.55,0.45,48]].forEach(([gx,gy,h])=>{ const [px,py]=at2(x,y,gx,gy);
        isoBox(ctx,px,py,0.24,0.24,0,h,'#9AA9B5',{mullion:true,floors:5,floorColor:'rgba(255,255,255,0.25)'});
        ctx.fillStyle=C('#C7D2DA'); ctx.beginPath(); ctx.moveTo(px-3.6,py-h-0.5); ctx.lineTo(px+0.2,py-h-9); ctx.lineTo(px+3.6,py-h-0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }); break;
    case 'difcgate':   // The Gate: a square arch
      isoBox(ctx,x-5,y,0.25,0.4,0,22,'#E6E1D6',{floors:4}); isoBox(ctx,x+5,y+2,0.25,0.4,0,22,'#E6E1D6',{floors:4});
      isoBox(ctx,x,y+1,0.95,0.42,22,9,'#E6E1D6',{floors:3}); break;
    case 'wtc':        // the World Trade Centre: the old honeycomb tower
      isoBox(ctx,x,y,0.34,0.34,0,40,'#E9E1CF',{floors:2.6,floorColor:'rgba(74,59,48,0.35)'}); break;
    case 'opera':      // Dubai Opera: a glass dhow
      isoBox(ctx,x,y,0.8,0.45,0,8,'#9FC8DD',{mullion:true});
      ctx.fillStyle=C('#B9D9E8'); ctx.beginPath(); ctx.moveTo(x+6,y-8); ctx.lineTo(x+14,y-14); ctx.lineTo(x+11,y-2); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'cocacola':   // Coca-Cola Arena: a box with a red stripe
      isoBox(ctx,x,y,0.9,0.8,0,10,'#E5E2DC',{floors:5}); isoBox(ctx,x,y,0.92,0.82,10,1.6,'#D9443A'); break;
    case 'madinat':    // Madinat Jumeirah: sand-coloured, with wind towers
      [[0,0],[0.6,0.3],[-0.5,0.4]].forEach(([gx,gy])=>{ const [px,py]=at2(x,y,gx,gy); isoBox(ctx,px,py,0.35,0.3,0,7,'#E3C496'); isoBox(ctx,px,py,0.08,0.08,7,5,'#E9D2A8'); });
      break;
    case 'wildwadi':   // Wild Wadi: twisty slides
      isoBox(ctx,x,y,0.6,0.5,0,4,'#7FD0D8',{top:'#9FE3E8'});
      ctx.save(); ctx.lineWidth=2; [['#F2B84B',0],['#E86A5C',3]].forEach(([c,o])=>{ ctx.strokeStyle=C(c); ctx.beginPath(); ctx.moveTo(x-6+o,y-4); ctx.bezierCurveTo(x+4+o,y-16,x-8+o,y-20,x+2+o,y-26); ctx.stroke(); }); ctx.restore(); break;
    case 'cricket':    // the cricket stadium: an oval bowl round a green pitch
      isoDisc(ctx,x,y,22,11,6,'#E5E1D8'); ctx.fillStyle=C('#8CC46B'); ctx.beginPath(); ctx.ellipse(x,y-6,16,8,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle=C('#E2C79A'); ctx.fillRect(x-1.2,y-8,2.4,4); break;
    case 'autodrome':  // the Autodrome: a grey ribbon of track with a pit building
      ctx.save(); ctx.lineJoin='round'; ctx.strokeStyle=C(OUT); ctx.lineWidth=4.2; const tr=[[-30,4],[-12,-8],[10,-6],[26,2],[14,10],[-4,6],[-16,12],[-30,4]];
      ctx.beginPath(); tr.forEach(([dx,dy],k)=>k?ctx.lineTo(x+dx,y+dy):ctx.moveTo(x+dx,y+dy)); ctx.stroke(); ctx.strokeStyle=C('#8E8A86'); ctx.lineWidth=2.8; ctx.stroke(); ctx.restore();
      isoBox(ctx,x-6,y+1,0.9,0.2,0,5,'#E9E4DA'); break;
    case 'dragonmart': // Dragon Mart: a long, long curving shed
      for (let q=0;q<7;q++){ const [px,py]=at2(x,y,q*0.5-1.5, Math.sin(q*0.9)*0.4); isoBox(ctx,px,py,0.32,0.36,0,5,'#E4D9C8',{top:q%2?'#C9503A':'#E0A23B'}); } break;
    case 'miracle':    // Miracle Garden: beds of flowers and a heart arch; the Butterfly Garden's domes beside
      [[0,0,'#E86A5C'],[0.6,0,'#F2B84B'],[0,0.6,'#F28CB1'],[0.6,0.6,'#B57EDC'],[-0.6,0.3,'#FF9E5E']].forEach(([gx,gy,c])=>{ const [px,py]=at2(x,y,gx,gy); isoBox(ctx,px,py,0.28,0.28,0,1.5,c); });
      ctx.save(); ctx.lineWidth=2.2; ctx.strokeStyle=C('#E86A5C'); ctx.beginPath(); ctx.moveTo(x,y-2); ctx.bezierCurveTo(x-10,y-12,x-4,y-18,x,y-12); ctx.bezierCurveTo(x+4,y-18,x+10,y-12,x,y-2); ctx.stroke(); ctx.restore();
      { const [bx,by]=at2(x,y,1.3,-0.4); [0,6].forEach(o=>dome(ctx,bx+o,by,3.2,'#BFE3EE')); } break;
    case 'expo':       // Expo City: the Al Wasl dome, a trellis hemisphere
      isoBox(ctx,x,y,1.3,1.3,0,1.5,'#E9E4DA');
      ctx.fillStyle=C('rgba(255,255,255,0.45)'); ctx.beginPath(); ctx.ellipse(x,y-1.5,18,18,0,Math.PI,0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.strokeStyle=C('#A7A099'); ctx.lineWidth=LW*0.6; ctx.beginPath();
      for (let q=1;q<6;q++){ ctx.moveTo(x-18,y-1.5); ctx.ellipse(x,y-1.5,18,18*q/6,0,Math.PI,0); }
      for (let q=-3;q<=3;q++){ ctx.moveTo(x+q*5,y-1.5); ctx.lineTo(x+q*2.2,y-17); } ctx.stroke(); ctx.restore(); break;
    case 'maktoum':    // Al Maktoum airport's terminal and tower
      isoBox(ctx,x,y,1.4,0.35,0,7,'#E5EBEE',{floors:4}); isoBox(ctx,x+26,y+8,0.12,0.12,0,24,'#E5EBEE'); isoBox(ctx,x+26,y+8,0.22,0.22,24,4,'#9FC0D6'); break;
    case 'sohq':       // Silicon Oasis headquarters: a tall blue tower with a crown
      isoBox(ctx,x,y,0.3,0.3,0,46,'#6FAACB',{mullion:true,floors:5,floorColor:'rgba(255,255,255,0.25)'});
      ctx.fillStyle=C('#B7C9D6'); ctx.beginPath(); ctx.moveTo(x-4,y-46); ctx.lineTo(x,y-54); ctx.lineTo(x+4,y-46); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'theview':    // the Palm Tower (The View at the Palm) over Nakheel Mall
      isoBox(ctx,x,y,1.0,0.6,0,7,'#E9DCC6',{floors:4}); isoBox(ctx,x,y,0.34,0.3,7,50,'#A7D0E2',{mullion:true,floors:5,floorColor:'rgba(255,255,255,0.25)'}); break;
    case 'pointe':     // The Pointe: a curved row of low shops facing Atlantis
      for (let q=0;q<5;q++){ const [px,py]=at2(x,y,q*0.35-0.7,Math.abs(q-2)*0.18); isoBox(ctx,px,py,0.2,0.22,0,5,'#F1E3C9',{top:'#E3A071'}); } break;
    case 'lamer':      // La Mer: low beach-shack blocks in bright colours
      ['#5FA8D3','#F2B84B','#E86A5C','#8BC34A'].forEach((c,k)=>{ const [px,py]=at2(x,y,k*0.45-0.6,(k%2)*0.3); isoBox(ctx,px,py,0.2,0.2,0,4,'#F4E8D4',{top:c}); }); break;
    case 'alserkal':   // Alserkal Avenue: warehouses painted as galleries
      ['#E86A5C','#5FA8D3','#F2B84B','#2B2B2F'].forEach((c,k)=>{ const [px,py]=at2(x,y,(k%2)*0.9-0.45,Math.floor(k/2)*0.8-0.4); isoBox(ctx,px,py,0.4,0.34,0,5,'#D8D3CA',{left:c}); }); break;
  }
}

function drawObjectVector(ctx, o){
  if (o.k==='sprite' || o.k==='boat' || o.k==='plane' || o.k==='ship' || o.k==='slot') return;   // sprites only (no old vector boats or planes)
  ctx.strokeStyle=C(OUT); ctx.lineWidth=LW;
  if (o.k==='box') isoBox(ctx,o.x,o.y,o.hx,o.hy,o.z0||0,o.h,null,o.opts);
  else if (o.k==='lm2') drawLandmark2(ctx,o);
  else if (o.k==='palm') drawPalm(ctx,o);
  else if (o.k==='pool') drawPool(ctx,o);
  else if (o.k==='rail') drawRail(ctx,o);
  else if (o.k==='station') drawStation(ctx,o);
  else if (o.k==='shrub') drawShrub(ctx,o);
  else if (o.k==='ghaf') drawGhaf(ctx,o);
  else if (o.k==='camel') drawCamel(ctx,o);
  else if (o.k==='parasol') drawParasol(ctx,o);
  else if (o.k==='reed') drawReed(ctx,o);
  else if (o.k==='flamingo') drawFlamingo(ctx,o);
  else if (o.k==='crane') drawCrane(ctx,o);
  else if (o.k==='tree') drawTree(ctx,o);
  else drawLandmark(ctx,o);
}



// a soft round glow (car headlights at night)
const glowCache = new Map();
function glowSprite(col){
  let g = glowCache.get(col); if (g) return g;
  g = document.createElement('canvas'); g.width = g.height = 32;
  const c = g.getContext('2d'), grd = c.createRadialGradient(16,16,0,16,16,16);
  grd.addColorStop(0, col); grd.addColorStop(0.18, col); grd.addColorStop(0.35, col+'66'); grd.addColorStop(1, col+'00');
  c.fillStyle = grd; c.fillRect(0,0,32,32);
  glowCache.set(col, g); return g;
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
    r.busy = r.main ? 7 : r.k===0 ? 3 : r.k===1 ? 1 : 0.35;          // Sheikh Zayed Road is busiest
    r.speed = r.k===0 ? 20 : r.k===1 ? 13 : 8;                     // world px per second
  });
  markHiddenRoad();
}
// Cars live on a layer above the city, so stretches of road that pass behind a building
// (one standing in front of them), or across a landmark's footprint, are worked out once here and
// cars aren't drawn there.
const OCC_STEP = 1.5, LM_BOX = { burj:[20,240], baa:[30,115], frame:[16,56], ain:[24,70], atlantis:[30,40], motf:[12,34], terminal:[36,34], moe:[20,14], mall:[22,14], ibn:[16,12], meydan:[40,14] };
function markHiddenRoad(){
  const CELL = 32, grid = new Map(), key = (x,y)=>x+','+y;
  for (const o of OBJECTS){
    let hw, top, bot;
    if (o.k==='box'){ hw = TW/2*(o.hx+o.hy); top = o.y - o.h - TH/2*(o.hx+o.hy); bot = o.y + TH/2*(o.hx+o.hy); }
    else if (o.k==='sprite'){ hw = o.w/2; top = o.y - o.h; bot = o.y + 2; }
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
      // no cars on a landmark or mall, or within a tile of one
      if (inFootprint(ai.a, ai.i)){ r.occ[i] = 1; continue; }
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
let carsEnabled = true;
function setCars(on){ carsEnabled = !!on; if (!on) cars = []; kickCars(); drawCars(); }
function carsWanted(){
  const z = cam.s/baseFit;
  return carsEnabled && z >= LOD_MID && viewW > 0 && !document.hidden && !picking;
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
      carCtx.globalAlpha = NIGHT_FX.headlightAlpha; carCtx.drawImage(glowSprite('#FFF1C9'), x+dx*(L+1.2)-1.6, y+dy*(L+1.2)-1.6, 3.2, 3.2); carCtx.globalAlpha = 1;
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
   EXPLORED AREAS: land tinted gold by how much of each area you (or your crew) have
   eaten in. Each land tile belongs to its nearest area; the tint is one bitmap, redrawn
   only when the numbers change.
   ========================================================= */
let zoneOfTile = null, tintBmp = null, tintKey = '', pendingTint = null;
function buildZoneTiles(){
  zoneOfTile = new Int16Array(ROWS*COLS).fill(-1);
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
    const t = tType[r*COLS+c]; if (isWaterT(t) || t===L_TARMAC) continue;
    const {a,i} = gridToAI(c+0.5, r+0.5);
    let best = -1, bd = 1.7;
    for (let k=0;k<ZONES.length;k++){ const d = Math.hypot(ZONES[k].a-a, ZONES[k].i-i); if (d < bd){ bd = d; best = k; } }
    zoneOfTile[r*COLS+c] = best;
  }
}
// values: { zoneId: 0..1 } or null to switch off
function setZoneTint(values){
  const key = values ? JSON.stringify(values) : '';
  if (key === tintKey) return;
  tintKey = key;
  if (!built){ pendingTint = values; return; }
  if (!values){ tintBmp = null; requestRender(); return; }
  if (!zoneOfTile) buildZoneTiles();
  const sc = Math.min(0.6, cacheScale*0.5);
  const cv = tintBmp || document.createElement('canvas');
  cv.width = Math.round(WORLD.w*sc); cv.height = Math.round(WORLD.h*sc);
  const c = cv.getContext('2d'); c.setTransform(sc,0,0,sc,0,0); c.clearRect(0,0,WORLD.w,WORLD.h);
  const paths = new Map(), hw = TW/2, hh = TH/2;
  for (let r=0;r<ROWS;r++) for (let col=0;col<COLS;col++){
    const k = zoneOfTile[r*COLS+col]; if (k<0) continue;
    const v = values[ZONES[k].id]; if (!v) continue;
    if (!paths.has(k)) paths.set(k, new Path2D());
    const p = paths.get(k), x = (col-r)*hw+WORLD.ox, y = (col+r)*hh+WORLD.oy;
    p.moveTo(x,y); p.lineTo(x+hw+0.3,y+hh); p.lineTo(x,y+TH+0.3); p.lineTo(x-hw-0.3,y+hh); p.closePath();
  }
  paths.forEach((p,k)=>{ const v = Math.min(1, values[ZONES[k].id]); c.fillStyle = 'rgba(236,150,40,'+(0.3+0.5*v).toFixed(3)+')'; c.fill(p); });
  tintBmp = cv; tintBmp._sc = sc;
  requestRender();
}
function drawTint(view){
  if (!tintBmp) return;
  const sc = tintBmp._sc, x0 = Math.max(0, view.x0), y0 = Math.max(0, view.y0), x1 = Math.min(WORLD.w, view.x1), y1 = Math.min(WORLD.h, view.y1);
  if (x1<=x0 || y1<=y0) return;
  // multiply by day so it colours the ground and keeps the buildings' detail; screen at night
  ctx.globalCompositeOperation = NIGHT ? 'screen' : 'multiply'; ctx.globalAlpha = NIGHT ? 0.45 : 0.8;
  ctx.drawImage(tintBmp, x0*sc, y0*sc, (x1-x0)*sc, (y1-y0)*sc, x0, y0, x1-x0, y1-y0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

/* =========================================================
   ENGINE: canvas, camera, gestures, overlay (stamps, area chips, you)
   The app hands the map a list of stamp items and a renderer; the map
   clusters them in screen space, positions them and reports taps back.
   ========================================================= */
const cam = { x:0, y:0, s:1 };
let baseFit = 0.2, MIN_S = 0.15;
const MAX_S = 7;
const HAS_DOM = typeof window !== 'undefined';   // false inside the map's Web Worker (mapworker.js)
const reduceMotion = HAS_DOM && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

let wrap, canvas, ctx, stampsLayer, labelsLayer, fxLayer, meEl, fxEls = [];
let opts = {};
let dpr = HAS_DOM ? Math.min(window.devicePixelRatio||1, 3) : 1;
let cacheScale = 1, dataBuilt = false;
let viewW = 0, viewH = 0, interacting = false, rafPending = false, built = false;
let picking = false, needsCenter = true, lastW = 0;
const readyCbs = [];

/* ---------- the pixel city ----------
   mapraster.js draws the city as pixel art at RS.S art pixels per world unit, in mapworker.js.
   Three sources, picked by k = device pixels per art pixel:
     lo   whole city at 0.5 px/unit  (wide view; first thing on screen)
     mid  whole city at 1 px/unit    (mid zoom)
     chunks of 256x256 art px at full scale (close up; whole-pixel steps once you let go)
   Each chunk that arrives is also averaged down into lo and mid, so the wide views converge on
   the real art. Chunks are kept in a small least-recently-used set. */
const RS = { worker:null, inline:null, S:2, CH:256, grid:null, art:null, stores:{}, tick:0, cap:72, wantTimer:0, snaps:new Set(), t0:0, firstMs:0, errors:0 };
const rstore = th=>RS.stores[th] || (RS.stores[th] = { lo:null, mid:null, chunks:new Map(), asked:new Set(), refined:new Set() });
const themeKey = ()=>NIGHT ? 'night' : 'day';
// what's on screen: this theme once it has its overview, else the other one (no flash while switching)
function shownStore(){
  const cur = RS.stores[themeKey()];
  if (cur && cur.lo) return cur;
  for (const k in RS.stores) if (RS.stores[k].lo) return RS.stores[k];
  return null;
}
/* ---------- finished overviews are kept in the browser's cache (per app version and theme), so the
   next launch shows the whole city at once and the worker only renders close-ups ---------- */
// bump ART_REV whenever mapraster.js draws anything differently, so nobody keeps old art
const ART_REV = 21, ART_CACHE = 'koko-map-art', ART_VER = `${APP.version}-r${ART_REV}`;
const artURL = (th, s)=>`/__map-art/${ART_VER}/${th}/${s}.png`;
// The finished overviews ship with the app (map-art/overview, made by tools/build-overviews.mjs), so a
// phone never shows half-finished ones. Wide first (small), then mid. If they can't be had, the worker
// renders overviews and sharpens them chunk by chunk, as before.
function loadImage(src){ return new Promise((res, rej)=>{ const img = new Image(); img.onload = ()=>res(img); img.onerror = rej; img.src = src; }); }
async function loadShipped(th){
  if (!HAS_DOM) return false;
  const st = rstore(th);
  st.shippedPending = true;
  setTimeout(()=>{ st.shippedPending = false; RS.lastWant = ''; rasterWant(); }, 2500);   // slow network: let the worker start anyway
  try {
    const lo = await loadImage(`map-art/overview/r${ART_REV}-${th}-lo.webp`);
    if (!st.lo){ st.lo = newCanvas(lo.width, lo.height); st.lo.getContext('2d').drawImage(lo, 0, 0); }
    st.shipped = true; st.saved = true; st.shippedPending = false;
    if (!built && th === themeKey()) rasterReady();
    requestRender();
    const mid = await loadImage(`map-art/overview/r${ART_REV}-${th}-mid.webp`);
    if (!st.mid){ st.mid = newCanvas(mid.width, mid.height); st.mid.getContext('2d').drawImage(mid, 0, 0); }
    if (RS.grid) for (let y=0; y<RS.grid.rows; y++) for (let x=0; x<RS.grid.cols; x++) st.refined.add(x+','+y);
    else st.allRefined = true;
    RS.lastWant = ''; rasterWant(); requestRender();
    return true;
  } catch(e){ st.shipped = false; st.saved = false; st.shippedPending = false; RS.lastWant = ''; rasterWant(); return false; }
}
async function loadSaved(th){
  if (await loadShipped(th)) return true;
  if (!HAS_DOM || !('caches' in window)) return false;
  try {
    const c = await caches.open(ART_CACHE);
    const [lo, mid] = await Promise.all([c.match(artURL(th, 'lo')), c.match(artURL(th, 'mid'))]);
    if (!lo || !mid) return false;
    const [a, b] = await Promise.all([lo.blob().then(createImageBitmap), mid.blob().then(createImageBitmap)]);
    const st = rstore(th);
    if (st.lo) return true;
    st.lo = newCanvas(a.width, a.height); st.lo.getContext('2d').drawImage(a, 0, 0); a.close();
    st.mid = newCanvas(b.width, b.height); st.mid.getContext('2d').drawImage(b, 0, 0); b.close();
    st.saved = true;
    if (RS.grid) for (let y=0; y<RS.grid.rows; y++) for (let x=0; x<RS.grid.cols; x++) st.refined.add(x+','+y);
    else st.allRefined = true;
    if (!built && th === themeKey()) rasterReady();
    requestRender();
    return true;
  } catch(e){ return false; }
}
function saveWhenDone(st, th){
  if (st.saved || !st.lo || !st.mid || !RS.grid || st.refined.size < RS.grid.rows*RS.grid.cols || !HAS_DOM || !('caches' in window)) return;
  st.saved = true;
  const put = (cv, s)=>new Promise(res=>cv.toBlob(b=>res(b), 'image/png')).then(b=>b && caches.open(ART_CACHE).then(c=>c.put(artURL(th, s), new Response(b, { headers:{ 'Content-Type':'image/png' } }))));
  Promise.all([put(st.lo, 'lo'), put(st.mid, 'mid')]).then(()=>caches.open(ART_CACHE)).then(c=>c.keys()).then(keys=>{
    // only this version's art is kept
    keys.forEach(r=>{ if (!new URL(r.url).pathname.startsWith(`/__map-art/${ART_VER}/`)) caches.open(ART_CACHE).then(c=>c.delete(r)); });
  }).catch(()=>{});
}
// map-art/*.png -> { w, h, data:Uint32Array, ax, ay } (anchor = bottom centre of the canvas)
const SPR = {};
function loadSprites(){
  const one = name=>new Promise(res=>{
    const img = new Image();
    img.onload = ()=>{
      const cv = newCanvas(img.width, img.height), c = cv.getContext('2d'); c.drawImage(img, 0, 0);
      const data = new Uint32Array(c.getImageData(0, 0, img.width, img.height).data.buffer);
      SPR[name] = { w:img.width, h:img.height, data, ax:img.width/2, ay:img.height, img:cv };
      res();
    };
    img.onerror = ()=>res();
    img.src = 'map-art/' + name + '.png';
  });
  return Promise.race([Promise.all(SPRITE_FILES.map(one)), new Promise(r=>setTimeout(r, 4000))]);
}
const spritePayload = ()=>Object.fromEntries(Object.entries(SPR).map(([k,v])=>[k, { w:v.w, h:v.h, data:v.data, ax:v.ax, ay:v.ay }]));
async function rasterStart(){
  RS.t0 = performance.now();
  loadSaved(themeKey());
  await loadSprites();
  try {
    RS.worker = new Worker(new URL('./mapworker.js', import.meta.url), { type:'module' });
    RS.worker.onmessage = e=>rasterMsg(e.data);
    RS.worker.onerror = ()=>rasterInline();
    RS.worker.postMessage({ type:'init', night:themeKey(), sprites:spritePayload(), props:PROPS });
  } catch(e){ rasterInline(); }
}
// no module workers here: the same renderer on the main thread, one job per task
function rasterInline(){
  if (RS.inline) return;
  if (RS.worker){ try { RS.worker.terminate(); } catch(e){} RS.worker = null; }
  RS.inline = { queue:[], busy:false };
  import('./mapraster.js').then(R=>{
    const I = RS.inline;
    I.R = R; I.theme = themeKey(); R.setNight(NIGHT); R.setSprites(spritePayload()); R.setPropLimits(PROPS); R.prepare();
    rasterMsg({ kind:'ready', theme:I.theme, grid:R.chunkGrid(), art:R.artSize(), CH:R.CH, S:R.S });
    I.pump = ()=>{
      if (I.busy) return; const job = I.queue.shift(); if (!job) return; I.busy = true;
      setTimeout(()=>{
        try {
          if (I.theme !== themeKey()){ I.theme = themeKey(); R.setNight(NIGHT); }
          if (job.kind === 'overview'){ const a = R.artSize(job.s), b = R.renderRect(0, 0, a.w, a.h, job.s); rasterMsg({ kind:'overview', theme:I.theme, s:job.s, w:a.w, h:a.h, px:new Uint8ClampedArray(b.data.buffer) }); }
          else { const b = R.renderChunk(job.cx, job.cy), fx = R.fxMasks(b); rasterMsg({ kind:'chunk', theme:I.theme, cx:job.cx, cy:job.cy, w:R.CH, h:R.CH, fx, water:b.water, px:new Uint8ClampedArray(b.data.buffer) }); }
        } catch(e){ console.error(e); }
        I.busy = false; I.pump();
      }, 0);
    };
    I.pump();
  });
}
function rasterPost(msg){
  if (RS.worker) RS.worker.postMessage(msg);
  else if (RS.inline && RS.inline.R && msg.type === 'want'){ RS.inline.queue = msg.list.slice(); RS.inline.pump(); }
}
function toImage(m){
  if (m.bmp) return m.bmp;
  const cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h;
  cv.getContext('2d').putImageData(new ImageData(m.px, m.w, m.h), 0, 0);
  return cv;
}
function newCanvas(w, h){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
function rasterMsg(m){
  if (m.kind === 'error'){ if (++RS.errors < 4) console.error('map renderer:', m.message); return; }
  if (m.kind === 'ready'){
    RS.grid = m.grid; RS.art = m.art; RS.CH = m.CH; RS.S = m.S;
    for (const k in RS.stores){ const st = RS.stores[k]; if (st.allRefined){ for (let y=0; y<m.grid.rows; y++) for (let x=0; x<m.grid.cols; x++) st.refined.add(x+','+y); st.allRefined = false; } }
    rasterWant(); return;
  }
  const st = rstore(m.theme), img = toImage(m);
  if (m.kind === 'overview'){
    if (st.shipped){ if (img.close) img.close(); return; }   // the shipped overview is better than a quick one
    const cv = newCanvas(Math.ceil(WORLD.w*m.s), Math.ceil(WORLD.h*m.s)), c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    if (img.close) img.close();
    if (m.s === 0.5) st.lo = cv; else st.mid = cv;
    // chunks that already came in sharpen the new overview too
    st.chunks.forEach((ch, key)=>refine(st, ch.cx, ch.cy, ch.img, m.s === 0.5 ? 'lo' : 'mid'));
    if (m.s === 0.5 && !built && m.theme === themeKey()) rasterReady();
  } else {
    const key = m.cx + ',' + m.cy;
    st.asked.delete(key);
    if (m.fx) m.fx.forEach(f=>fxMaskPart(st, f));
    const old = st.chunks.get(key); if (old && old.img.close) old.img.close();
    st.chunks.set(key, { img, cx:m.cx, cy:m.cy, used:++RS.tick, water:m.waterBmp || (m.water ? waterCanvas(m.water) : null) });
    if (!st.saved && !st.shipped) refine(st, m.cx, m.cy, img);
    st.refined.add(key);
    evict(st);
    saveWhenDone(st, m.theme);
  }
  // drop a store that's no longer shown (the theme changed and the new one is up)
  for (const k in RS.stores) if (k !== themeKey() && RS.stores[themeKey()] && RS.stores[themeKey()].lo){ dropStore(k); }
  repaintSnaps(); requestRender();
}
// the visible pixels of an overlay sprite (Burj, fountain), pieced together from the chunks
function fxMaskPart(st, f){
  st.fx = st.fx || {};
  let cv = st.fx[f.id];
  if (!cv){ cv = st.fx[f.id] = newCanvas(f.sw, f.sh); }
  if (f.bmp){ const c = cv.getContext('2d'); c.clearRect(f.x, f.y, f.w, f.h); c.drawImage(f.bmp, f.x, f.y); f.bmp.close(); return; }
  const id = new ImageData(f.w, f.h);
  for (let q=0; q<f.w*f.h; q++){ id.data[q*4] = id.data[q*4+1] = id.data[q*4+2] = 255; id.data[q*4+3] = f.mask[q]; }
  cv.getContext('2d').putImageData(id, f.x, f.y);
}
// the water you can see in a chunk, as an alpha mask (for the shimmer)
function waterCanvas(w){
  const cv = newCanvas(RS.CH, RS.CH), id = new ImageData(RS.CH, RS.CH);
  for (let q=0; q<w.length; q++) if (w[q]){ id.data[q*4] = id.data[q*4+1] = id.data[q*4+2] = 255; id.data[q*4+3] = 255; }
  cv.getContext('2d').putImageData(id, 0, 0);
  return cv;
}
function dropStore(k){ const st = RS.stores[k]; if (!st) return; st.chunks.forEach(c=>{ if (c.img.close) c.img.close(); }); delete RS.stores[k]; }
// average a full-scale chunk down into the overviews
function refine(st, cx, cy, img, only){
  const CH = RS.CH;
  for (const [cv, f] of [[only !== 'lo' && st.mid, 0.5], [only !== 'mid' && st.lo, 0.25]]){
    if (!cv) continue;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(img, cx*CH*f, cy*CH*f, CH*f, CH*f);
  }
}
function evict(st){
  if (st.chunks.size <= RS.cap) return;
  // never what's on screen now (or on a snapshot)
  const keep = new Set();
  const k = cam.s*dpr/RS.S;
  if (k >= CHUNK_K && viewW) chunksFor(k, Math.round(dpr*cam.x), Math.round(dpr*cam.y), viewW*dpr, viewH*dpr).forEach(([x,y])=>keep.add(x+','+y));
  RS.snaps.forEach(sn=>{ if (sn.k >= CHUNK_K) chunksFor(sn.k, sn.ox, sn.oy, sn.w, sn.h).forEach(([x,y])=>keep.add(x+','+y)); });
  const list = [...st.chunks.entries()].filter(([key])=>!keep.has(key)).sort((a,b)=>a[1].used-b[1].used);
  for (let k=0; k<Math.min(list.length, st.chunks.size - RS.cap); k++){ const [key, c] = list[k]; if (c.img.close) c.img.close(); if (c.water && c.water.close) c.water.close(); st.chunks.delete(key); }
}
function rasterReady(){
  RS.firstMs = Math.round(performance.now() - RS.t0);
  if (BUILD_STATS){ BUILD_STATS.cacheMs = RS.firstMs; BUILD_STATS.cachePx = RS.art ? RS.art.w + 'x' + RS.art.h : ''; }
  built = true;
  if (resizeCanvas()) initialView();
  if (pendingTint){ const v = pendingTint; pendingTint = null; tintKey = ""; setZoneTint(v); }
  readyCbs.splice(0).forEach(f=>f());
  requestRender();
}
// chunks covering a device-pixel rectangle at k device px per art px, origin (ox, oy)
function chunksFor(k, ox, oy, w, h){
  const CH = RS.CH, g = RS.grid; if (!g) return [];
  const c0 = Math.max(0, Math.floor(-ox/k/CH)), c1 = Math.min(g.cols-1, Math.floor((w-ox)/k/CH));
  const r0 = Math.max(0, Math.floor(-oy/k/CH)), r1 = Math.min(g.rows-1, Math.floor((h-oy)/k/CH));
  const out = []; for (let r=r0; r<=r1; r++) for (let c=c0; c<=c1; c++) out.push([c, r]);
  return out;
}
const CHUNK_K = 0.75;   // below this many device px per art px the overviews take over
// draw the city into a 2D context: k device px per art px, art origin at device (ox, oy)
function paintCity(c, k, ox, oy, w, h){
  const st = shownStore(); if (!st) return;
  c.setTransform(1,0,0,1,0,0);
  const S = RS.S, CH = RS.CH;
  const overview = (src, sl, x, y, ww, hh)=>{   // part of an overview (sl px per world unit) into device rect
    const f = sl/S; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(src, x*f, y*f, ww*f, hh*f, ox + x*k, oy + y*k, ww*k, hh*k);
  };
  if (k >= CHUNK_K && RS.grid){
    for (const [cx, cy] of chunksFor(k, ox, oy, w, h)){
      const ch = st.chunks.get(cx + ',' + cy);
      const dx = Math.round(ox + cx*CH*k), dy = Math.round(oy + cy*CH*k), dw = Math.round(ox + (cx+1)*CH*k) - dx, dh = Math.round(oy + (cy+1)*CH*k) - dy;
      if (ch){ ch.used = ++RS.tick; c.imageSmoothingEnabled = k < 1; c.imageSmoothingQuality = 'high'; c.drawImage(ch.img, dx, dy, dw, dh); }
      else { const src = st.mid || st.lo, sl = st.mid ? 1 : 0.5; overview(src, sl, cx*CH, cy*CH, CH, CH); }
    }
  } else {
    const src = (k >= 0.3 && st.mid) ? st.mid : st.lo, sl = src === st.mid ? 1 : 0.5;
    const x0 = Math.max(0, Math.floor(-ox/k)), y0 = Math.max(0, Math.floor(-oy/k));
    const x1 = Math.min(RS.art ? RS.art.w : WORLD.w*S, Math.ceil((w-ox)/k)), y1 = Math.min(RS.art ? RS.art.h : WORLD.h*S, Math.ceil((h-oy)/k));
    if (x1 > x0 && y1 > y0) overview(src, sl, x0, y0, x1-x0, y1-y0);
  }
}
// ask the renderer for what's missing: the overviews, the chunks on screen (and on any snapshot),
// then a ring round the view, then the rest of the city a little at a time
function rasterWant(){
  if (!RS.grid) return;
  const st = rstore(themeKey()), list = [], seen = new Set();
  const want = (cx, cy)=>{ const key = cx + ',' + cy; if (seen.has(key)) return; seen.add(key); if (!st.chunks.has(key)) list.push({ kind:'chunk', cx, cy }); };
  if (!st.lo && st.shipped !== true && !st.shippedPending) list.push({ kind:'overview', s:0.5 });
  // 1. what's on screen (and on any snapshot), nearest the middle first
  const k = cam.s*dpr/RS.S, ox = dpr*cam.x, oy = dpr*cam.y, w = viewW*dpr, h = viewH*dpr;
  RS.snaps.forEach(sn=>{ if (!sn.target.isConnected){ RS.snaps.delete(sn); return; } if (sn.k >= CHUNK_K) chunksFor(sn.k, sn.ox, sn.oy, sn.w, sn.h).forEach(([x,y])=>want(x,y)); });
  let vis = [];
  if (k >= CHUNK_K && viewW){
    vis = chunksFor(k, ox, oy, w, h);
    const mx = (-ox + w/2)/k/RS.CH, my = (-oy + h/2)/k/RS.CH;
    vis.sort((a,b)=>Math.hypot(a[0]+0.5-mx, a[1]+0.5-my) - Math.hypot(b[0]+0.5-mx, b[1]+0.5-my)).forEach(([x,y])=>want(x,y));
  }
  const missingOnScreen = list.filter(j=>j.kind==='chunk').length;
  if (!st.mid && !st.shipped && !st.shippedPending) list.push({ kind:'overview', s:1 });
  // 2. a ring round the view, only as far as the chunk memory allows (so nothing is thrown out and asked for again)
  if (k >= CHUNK_K && viewW){
    let room = RS.cap - 8 - seen.size;
    for (const [x,y] of chunksFor(k, ox - w*0.5, oy - h*0.5, w*2, h*2)){ if (room <= 0) break; if (!seen.has(x+','+y)){ want(x,y); room--; } }
  }
  // 3. nothing on screen missing and you're not moving: sharpen the rest of the overviews a little at a time
  if (!interacting && st.mid && !st.saved && !missingOnScreen){
    const g = RS.grid, kk = Math.max(k, 1e-3), mx = (-ox + w/2)/kk/RS.CH, my = (-oy + h/2)/kk/RS.CH, rest = [];
    for (let y=0; y<g.rows; y++) for (let x=0; x<g.cols; x++){ const key = x+','+y; if (!st.refined.has(key) && !seen.has(key)) rest.push([x, y, Math.hypot(x+0.5-mx, y+0.5-my)]); }
    rest.sort((a,b)=>a[2]-b[2]).slice(0, 12).forEach(([x,y])=>list.push({ kind:'chunk', cx:x, cy:y }));
  }
  const key = JSON.stringify(list.map(j=>j.kind==='chunk' ? j.cx+','+j.cy : 'o'+j.s));
  if (key === RS.lastWant) return;
  RS.lastWant = key;
  rasterPost({ type:'want', list });
}
function rasterPending(){
  const st = RS.stores[themeKey()]; if (!st || !st.lo) return 1;
  const k = cam.s*dpr/RS.S; if (k < CHUNK_K) return st.mid ? 0 : 1;
  return chunksFor(k, Math.round(dpr*cam.x), Math.round(dpr*cam.y), viewW*dpr, viewH*dpr).filter(([x,y])=>!st.chunks.has(x+','+y)).length;
}
function rasterStats(){
  const st = RS.stores[themeKey()] || {};
  return { theme:themeKey(), lo:!!st.lo, mid:!!st.mid, chunks:st.chunks ? st.chunks.size : 0, refined:st.refined ? st.refined.size : 0,
    total:RS.grid ? RS.grid.rows*RS.grid.cols : 0, saved:!!st.saved, worker:!!RS.worker, inline:!!RS.inline, lastWant:(RS.lastWant||'').slice(0,80), liveMs:RS.liveMs, frameMs:RS.frameMs };
}
function rasterWantSoon(){ clearTimeout(RS.wantTimer); RS.wantTimer = setTimeout(rasterWant, interacting ? 120 : 30); }
// snapshots (place header, welcome screen) repaint as sharper pieces arrive
function repaintSnaps(){ RS.snaps.forEach(sn=>{ if (!sn.target.isConnected){ RS.snaps.delete(sn); return; } paintSnap(sn); }); }
function paintSnap(sn){
  const c = sn.target.getContext('2d');
  c.setTransform(1,0,0,1,0,0); c.clearRect(0, 0, sn.target.width, sn.target.height);
  paintCity(c, sn.k, sn.ox, sn.oy, sn.w, sn.h);
}
/* ---------- whole-pixel zoom: settle on k = 1, 2, 3 … device px per art px once you let go ---------- */
// up: never less zoom than asked for (fly-tos pick their zoom to pull pins apart); else the nearest step
function snappedScale(sc, up){
  const k = sc*dpr/RS.S;
  if (k < 1) return sc;
  const kmax = Math.max(1, Math.floor(MAX_S*dpr/RS.S));
  return Math.min(kmax, Math.max(1, up ? Math.ceil(k - 1e-6) : Math.round(k)))*RS.S/dpr;
}
let snapAnim = 0;
function snapZoom(sx, sy){
  const target = snappedScale(cam.s);
  if (Math.abs(target - cam.s) < 1e-6) return;
  if (sx == null){ sx = viewW/2; sy = viewH/2; }
  if (reduceMotion){ zoomAt(sx, sy, target); return; }
  const s0 = cam.s, t0 = performance.now();
  cancelAnimationFrame(snapAnim);
  const step = now=>{
    const t = Math.min(1, (now-t0)/150), e = 1-Math.pow(1-t, 3);
    zoomAt(sx, sy, s0 + (target-s0)*e);
    if (t < 1) snapAnim = requestAnimationFrame(step);
  };
  snapAnim = requestAnimationFrame(step);
}
function resizeCanvas(){
  const r = wrap.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  viewW = r.width; viewH = r.height;
  dpr = Math.min(window.devicePixelRatio||1, 3);
  [canvas, carCanvas].forEach(cv=>{ cv.width = Math.round(viewW*dpr); cv.height = Math.round(viewH*dpr); cv.style.width = viewW+'px'; cv.style.height = viewH+'px'; });
  return true;
}
function requestRender(){ if (!rafPending){ rafPending=true; requestAnimationFrame(render); } }
function render(){
  rafPending = false;
  const tF = performance.now();
  if (!viewW || !built) return;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // the city, on whole device pixels so the pixel art stays crisp
  paintCity(ctx, cam.s*dpr/RS.S, Math.round(dpr*cam.x), Math.round(dpr*cam.y), canvas.width, canvas.height);
  { const t0 = performance.now(); drawLive(); const dt = performance.now() - t0; RS.liveMs = RS.liveMs == null ? dt : RS.liveMs*0.9 + dt*0.1; }   // the live layer's cost (tests)
  drawShows();
  drawTapFx();
  ctx.setTransform(dpr*cam.s,0,0,dpr*cam.s,dpr*cam.x,dpr*cam.y);
  const view = { x0:-cam.x/cam.s, y0:-cam.y/cam.s, x1:(viewW-cam.x)/cam.s, y1:(viewH-cam.y)/cam.s };
  drawTint(view);
  rasterWantSoon();
  liveKick();
  drawCars(); kickCars();
  updateOverlay();
  if (opts.onViewChange) opts.onViewChange();
  const dF = performance.now() - tF; RS.frameMs = RS.frameMs == null ? dF : RS.frameMs*0.9 + dF*0.1;   // a frame's cost (tests)
}

/* ---------- camera ---------- */
function aiBounds(pts){
  const w=pts.map(([a,i])=>aiToWorld(a,i)), xs=w.map(p=>p.x), ys=w.map(p=>p.y);
  return { x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys)-60, y1:Math.max(...ys) };
}
// how far the camera may roam (all the land), and what "fit city" frames (palm crescent to the airport)
const FRAME_A0 = Math.max(A_MIN+0.4, FOG_A-1.5), FRAME = aiBounds([[FRAME_A0,Math.min(-4.8, I_MIN+1.0)],[35.8,Math.min(-4.8, I_MIN+1.0)],[35.8,21.2],[FRAME_A0,21.2]]);
const CORE  = aiBounds([[-2.4,-4.8],[31.8,-4.8],[31.8,9.9],[-2.4,9.9]]);
function clampCam(){
  cam.s = Math.max(MIN_S, Math.min(MAX_S, cam.s));
  const cx=(viewW/2-cam.x)/cam.s, cy=(viewH/2-cam.y)/cam.s;
  const ccx=Math.max(FRAME.x0, Math.min(FRAME.x1, cx)), ccy=Math.max(FRAME.y0, Math.min(FRAME.y1, cy));
  cam.x = viewW/2 - ccx*cam.s; cam.y = viewH/2 - ccy*cam.s;
}
function setView(cx, cy, s){ s=snappedScale(s, true); cam.s=s; cam.x=viewW/2-cx*s; cam.y=viewH/2-cy*s; clampCam(); requestRender(); }
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
  s = snappedScale(Math.max(MIN_S, Math.min(MAX_S, s)), true);
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
  let downAt=null, dragged=false, lastDist=null, lastMid=null, vel={x:0,y:0}, lastMove=0, lastTap={t:0,x:0,y:0}, pinched=false, lastPinch={x:0,y:0};
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
        pinched=true; lastPinch={x:m.x-r.left, y:m.y-r.top};
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
      if (pinched){ pinched=false; snapZoom(lastPinch.x, lastPinch.y); }
      if (!dragged && e.type==='pointerup' && !e.target.closest('.stamp-anchor, .map-dot, .map-label, .me')){
        const now=performance.now();
        if (now-lastTap.t < 300 && Math.hypot(e.clientX-lastTap.x, e.clientY-lastTap.y) < 30){
          const r=wrap.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
          const wx=(sx-cam.x)/cam.s, wy=(sy-cam.y)/cam.s, ns=Math.min(MAX_S, cam.s*2);
          flyTo(wx - (sx-viewW/2)/ns, wy - (sy-viewH/2)/ns, ns, 320);
          lastTap={t:0,x:0,y:0};
        } else {
          lastTap={t:now, x:e.clientX, y:e.clientY};
          const r=wrap.getBoundingClientRect(), lm = landmarkAt(e.clientX-r.left, e.clientY-r.top);
          if (lm && opts.onLandmarkTap && !picking){ focusLandmark(lm); opts.onLandmarkTap(lm); }
          else if (opts.onEmptyTap) opts.onEmptyTap();
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
    const r=wrap.getBoundingClientRect(), wx=e.clientX-r.left, wy=e.clientY-r.top;
    interacting=true; clearTimeout(wheelTimer); wheelTimer=setTimeout(()=>{ interacting=false; requestRender(); snapZoom(wx, wy); }, 160);
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
const measure = (()=>{ const c=HAS_DOM ? document.createElement('canvas').getContext('2d') : null, cache=new Map();
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
function buildFx(){}
// Burj Khalifa light show: a colour wash that runs up the tower, clipped to its silhouette
// Burj Khalifa light show: a colour wash running up the tower, over its visible pixels only.
// The Dubai Fountain plays with the blue shows (:00 and :30, 19:00 to 23:00), its last seconds the gold finale.
// state from shows.js: { active, type, t, intensity }
let showOn = false, showSt = null, fxLoop = 0;
const WASH = { blue:['#0b3dff','#4fa3ff','#d9f1ff','#4fa3ff','#0b3dff'], multi:['#ff3b6b','#ffb13b','#fff05a','#3bff9d','#3bb4ff','#b35bff','#ff3b6b'] };
const FOUNTAIN_LOOP = [1,2,3,3,4], FOUNTAIN_STEP = 0.5, FINALE_SEC = 6;
function setShow(st){
  const on = !!(st && st.active);
  showSt = on ? st : null;
  if (on !== showOn){ showOn = on; requestRender(); }
  liveKick();
}
// the live layer's clock: ~12 frames a second while a show is on screen, 4 for the water and camels,
// nothing in the wide view, while the map moves, behind a full screen, in a background tab or with reduced motion
function liveWanted(){
  if (reduceMotion || !built || !viewW || (HAS_DOM && document.hidden)) return 0;
  if (showOn && fxVisible()) return 83;
  if (cam.s*dpr/RS.S >= 1 && !coveredByScreen()) return LIVE_MS;
  return 0;
}
let liveFrame = 0;
const LIVE_MS = 250;   // the water and the camels' clock
function liveKick(){ if (!fxLoop && liveWanted()) fxLoop = setTimeout(liveTick, liveWanted()); }
function liveTick(){
  fxLoop = 0;
  const ms = liveWanted(); if (!ms) return;
  liveFrame++;
  if (!interacting) requestRender();
  fxLoop = setTimeout(liveTick, ms);
}
// the water's glints (NIGHT_FX): a fixed set of short pale dashes, each with its own slow blink (on for
// 2 steps in every 6, 8, 12 or 24, at its own phase), so only a few change from one step to the next.
// One pattern per step of the loop; each chunk starts at its own step.
let shimmer = null;
function shimmerFrames(){
  if (shimmer && shimmer.night === NIGHT) return shimmer.list;
  const F = NIGHT_FX.glintLoop, n = NIGHT ? NIGHT_FX.glintsNight : NIGHT_FX.glintsDay, periods = [6, 8, 12, 24];
  const glints = Array.from({length:n}, (_, k)=>({ x:Math.floor(hash2(k, 97)*RS.CH), y:Math.floor(hash2(31, k)*RS.CH), len:2 + (k % 3),
    p:periods[Math.floor(hash2(k, 7)*periods.length)], ph:Math.floor(hash2(k, 11)*F) }));
  const list = Array.from({length:F}, (_, f)=>{
    const cv = newCanvas(RS.CH, RS.CH), c = cv.getContext('2d');
    c.fillStyle = NIGHT ? `rgba(150,185,255,${NIGHT_FX.glintAlphaNight})` : `rgba(255,255,255,${NIGHT_FX.glintAlphaDay})`;
    for (const g of glints) if ((f + g.ph) % g.p < 2) c.fillRect(g.x, g.y, g.len, 1);
    return cv;
  });
  shimmer = { night:NIGHT, list };
  return list;
}
// a live sprite in tonight's colours (the same dusk mapping the renderer gives every sprite)
const nightCv = new Map();
function nightSprite(sp){
  if (!NIGHT) return sp;
  let n = nightCv.get(sp); if (n) return n;
  const cv = newCanvas(sp.w, sp.h), c = cv.getContext('2d'), id = c.createImageData(sp.w, sp.h), d = new Uint32Array(id.data.buffer);
  for (let q=0; q<sp.data.length; q++){
    const p = sp.data[q], al = p>>>24; if (!al) continue;
    const r = p&255, g = p>>8&255, bl = p>>16&255, l = (0.299*r + 0.587*g + 0.114*bl)/255, k = v=>Math.max(0, Math.min(255, Math.round(v)));
    d[q] = ((al<<24) | (k(bl*0.24 + 46 + l*52)<<16) | (k(g*0.18 + 28 + l*46)<<8) | k(r*0.16 + 22 + l*44)) >>> 0;
  }
  c.putImageData(id, 0, 0);
  n = { ...sp, img:cv }; nightCv.set(sp, n); return n;
}
let shimTmp = null;
function drawLive(){
  // paused while the map moves (and in the wide view, and with reduced motion)
  const k = cam.s*dpr/RS.S; if (k < 1 || reduceMotion || interacting) return;
  const st = shownStore(); if (!st) return;
  const ox = Math.round(dpr*cam.x), oy = Math.round(dpr*cam.y), CH = RS.CH, frames = shimmerFrames();
  ctx.setTransform(1,0,0,1,0,0); ctx.imageSmoothingEnabled = false;
  if (!shimTmp) shimTmp = newCanvas(CH, CH);
  const tc = shimTmp.getContext('2d');
  for (const [cx, cy] of chunksFor(k, ox, oy, canvas.width, canvas.height)){
    const ch = st.chunks.get(cx + ',' + cy); if (!ch || !ch.water) continue;
    tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, CH, CH);
    const step = Math.floor(liveFrame*LIVE_MS/NIGHT_FX.glintStepMs), F = NIGHT_FX.glintLoop;
    tc.drawImage(frames[(step + Math.floor(hash2(cx, cy)*F)) % F], 0, 0);
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(ch.water, 0, 0);
    tc.globalCompositeOperation = 'source-over';
    const dx = Math.round(ox + cx*CH*k), dy = Math.round(oy + cy*CH*k);
    ctx.drawImage(shimTmp, dx, dy, Math.round(ox + (cx+1)*CH*k) - dx, Math.round(oy + (cy+1)*CH*k) - dy);
  }
  // camels, once the half-size art is in: a slow walk to and fro and a two-frame gait
  const ca = SPR.camel_a, cb = SPR.camel_b;
  if (ca && cb && PROPS.camel_a && ca.w <= PROPS.camel_a[0] && ca.h <= PROPS.camel_a[1]){
    for (const o of OBJECTS){
      if (o.k !== 'camel') continue;
      const sx = o.x*cam.s+cam.x, sy = o.y*cam.s+cam.y; if (sx < -40 || sx > viewW+40 || sy < -40 || sy > viewH+40) continue;
      const ph = hash2(Math.round(o.x), Math.round(o.y))*20, t = liveFrame*0.25 + ph, walk = Math.round(Math.sin(t/6)*6), dir = Math.cos(t/6) >= 0 ? 1 : -1;
      const sp = nightSprite((liveFrame & 1) ? cb : ca), bob = (liveFrame >> 1) & 1;
      const x0 = Math.round((o.x*RS.S + walk)) - Math.round(sp.ax), y0 = Math.round(o.y*RS.S) - Math.round(sp.ay) - bob;
      ctx.save();
      if (dir < 0){ ctx.translate(Math.round(ox + (x0 + sp.w)*k), 0); ctx.scale(-1, 1); ctx.drawImage(sp.img, 0, Math.round(oy + y0*k), Math.round(sp.w*k), Math.round(sp.h*k)); }
      else ctx.drawImage(sp.img, Math.round(ox + x0*k), Math.round(oy + y0*k), Math.round(sp.w*k), Math.round(sp.h*k));
      ctx.restore();
    }
  }
}
// what the shows are doing (tests): the Burj wash, and the fountain's frame (0 = still)
function fountainFrame(){
  if (!showOn || !showSt || showSt.type !== 'blue') return 0;
  const t = reduceMotion ? 1 : (showSt.t || 0), dur = showSt.durationSec || 60;
  return t >= dur - FINALE_SEC ? 5 : FOUNTAIN_LOOP[Math.floor(t/FOUNTAIN_STEP) % FOUNTAIN_LOOP.length];
}
function showInfo(){ return { on:showOn, type:showSt ? showSt.type : null, fountain:fountainFrame(), drawn:showOn && fxVisible(), live:liveWanted(), frame:liveFrame }; }
function spriteObj(id){ return OBJECTS.find(o=>o.k==='sprite' && o.id===id); }
function fxVisible(){
  if (!viewW || cam.s*dpr/RS.S < CHUNK_K) return false;     // not in the wide view
  return ['burj_khalifa','dubai_fountain'].some(id=>{ const o = spriteObj(id); if (!o) return false;
    const sx = o.x*cam.s+cam.x, sy = o.y*cam.s+cam.y; return sx > -o.w*cam.s && sx < viewW + o.w*cam.s && sy > -20 && sy - o.h*cam.s < viewH; });
}
let washCv = null;
function drawShows(){
  if (!showOn || !showSt || !fxVisible()) return;
  const st = shownStore(); if (!st || !st.fx) return;
  const k = cam.s*dpr/RS.S, ox = Math.round(dpr*cam.x), oy = Math.round(dpr*cam.y), t = reduceMotion ? 1 : (showSt.t || 0);   // reduced motion: a still frame
  ctx.setTransform(1,0,0,1,0,0); ctx.imageSmoothingEnabled = false;
  // the wash on the Burj
  const burj = spriteObj('burj_khalifa'), bs = SPR.burj_khalifa, bm = st.fx.burj_khalifa;
  if (burj && bs && bm){
    if (!washCv) washCv = newCanvas(bs.w, bs.h);
    const c = washCv.getContext('2d'), cols = WASH[showSt.type==='multi' ? 'multi' : 'blue'], band = 64, off = Math.floor((t*24) % band);
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, bs.w, bs.h);
    for (let y=-band; y<bs.h+band; y+=2){ const f = (((y + off) % band) + band) % band / band; c.fillStyle = cols[Math.min(cols.length-1, Math.floor(f*cols.length))]; c.fillRect(0, bs.h - y, bs.w, 2); }
    c.globalCompositeOperation = 'destination-in'; c.drawImage(bm, 0, 0);
    // the tower only: not the plaza it stands on (the footprint is the sprite's bottom quarter-width rows)
    c.clearRect(0, Math.round(bs.ay - bs.w/4), bs.w, bs.h);
    c.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = (showSt.intensity||1) * (NIGHT ? 0.78 : 0.5);
    const x0 = Math.round(burj.x*RS.S) - Math.round(bs.ax), y0 = Math.round(burj.y*RS.S) - Math.round(bs.ay);
    ctx.drawImage(washCv, Math.round(ox + x0*k), Math.round(oy + y0*k), Math.round(bs.w*k), Math.round(bs.h*k));
    ctx.globalAlpha = 1;
  }
  // the fountain: only with the blue shows
  const ft = spriteObj('dubai_fountain'), f0 = SPR.dubai_fountain_0, fm = st.fx.dubai_fountain;
  if (ft && f0 && showSt.type === 'blue'){
    const frame = fountainFrame();
    const fs = SPR['dubai_fountain_' + frame]; if (!fs) return;
    const x0 = Math.round(ft.x*RS.S) - Math.round(f0.ax), y0 = Math.round(ft.y*RS.S) - Math.round(f0.ay);
    // the water and jets go over the lake; anything standing in front of the lake keeps its pixels
    if (!RS.fcv) RS.fcv = newCanvas(f0.w, f0.h);
    const c = RS.fcv.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, f0.w, f0.h); c.drawImage(fs.img, 0, 0);
    if (fm){
      // keep = (not frame 0: the jets in the air) + (the lake pixels nothing stands in front of)
      c.globalCompositeOperation = 'destination-in';
      const keep = RS.fkeep || (RS.fkeep = newCanvas(f0.w, f0.h)), kc = keep.getContext('2d');
      kc.globalCompositeOperation = 'source-over'; kc.clearRect(0, 0, f0.w, f0.h); kc.fillStyle = '#fff'; kc.fillRect(0, 0, f0.w, f0.h);
      kc.globalCompositeOperation = 'destination-out'; kc.drawImage(f0.img, 0, 0);
      kc.globalCompositeOperation = 'source-over'; kc.drawImage(fm, 0, 0);
      c.drawImage(keep, 0, 0);
      c.globalCompositeOperation = 'source-over';
    }
    if (NIGHT){ c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(20,30,70,0.35)'; c.fillRect(0, 0, f0.w, f0.h); c.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(RS.fcv, Math.round(ox + x0*k), Math.round(oy + y0*k), Math.round(f0.w*k), Math.round(f0.h*k));
  }
}
function placeFx(){
  for (const el of fxEls){
    if (!NIGHT) continue;
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
// how long the city took to build, for performance checks (tests/e2e/mapperf.mjs)
let BUILD_STATS = null;
function buildStats(){ return BUILD_STATS; }
function initMap(o){
  opts = o; wrap = o.wrap; canvas = o.canvas; ctx = canvas.getContext('2d');
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
    if (!built) return;
    if (!resizeCanvas()) return;
    if (needsCenter) { initialView(); }
    else if (Math.abs(viewW-lastW) > 40){ const c=viewCenter(); computeBaseFit(); setView(c.x,c.y,Math.max(cam.s,MIN_S)); lastW=viewW; }
    clampCam(); requestRender();
  }).observe(wrap);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) requestRender(); });
  // a timer, not rAF: rAF never fires in a background tab, and the city should be ready when you switch to it
  setTimeout(()=>{
    const t0 = performance.now();
    buildTerrain(); const t1 = performance.now(); buildObjects(); prepRoads(); prepCarRoads(); const t2 = performance.now();
    dataBuilt = true;
    // the pixel city renders in a worker; the map shows once its overview is in (rasterReady)
    BUILD_STATS = { terrainMs:Math.round(t1-t0), objectsMs:Math.round(t2-t1), cacheMs:null, objects:OBJECTS.length, lights:0, tiles:ROWS*COLS, cachePx:'' };
    resizeCanvas();
    rasterStart();
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
/* ---------- tapping a landmark (TAP_BEHAVIOUR.md) ---------- */
// what's under a point on screen: a landmark sprite's opaque pixels plus TAP_PAD CSS px, and always a box of at least
// TAP_MIN CSS px round its middle; where they overlap the one drawn on top (by depth) wins. The QE2 the same way.
// Terrains (the World, Palm Jebel Ali) on their land only, under everything else. (Pins sit above the map in the
// page, so a tap on a pin never reaches here: the pin wins.)
const TAP_PAD = 6, TAP_MIN = 44;
const spriteOf = o=>o.k==='ship' ? o.kind + '_' + o.head : o.sprite;
const tapId = o=>o.k==='ship' ? o.kind : o.id;
// a sprite's opaque bounding box (sprite px), worked out once
function opaqueBox(sp){
  if (sp.box) return sp.box;
  let x0 = sp.w, y0 = sp.h, x1 = -1, y1 = -1;
  for (let y=0; y<sp.h; y++) for (let x=0; x<sp.w; x++) if (sp.data[y*sp.w + x] >>> 24){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return (sp.box = { x0, y0, x1:x1+1, y1:y1+1 });
}
function nearOpaque(sp, lx, ly, pad){
  const st = Math.max(1, Math.floor(pad/6)), r = Math.ceil(pad);
  for (let dy=-r; dy<=r; dy+=st) for (let dx=-r; dx<=r; dx+=st){
    if (dx*dx + dy*dy > pad*pad) continue;
    const X = Math.floor(lx+dx), Y = Math.floor(ly+dy); if (X<0 || Y<0 || X>=sp.w || Y>=sp.h) continue;
    if (sp.data[Y*sp.w + X] >>> 24) return true;
  }
  return false;
}
function landmarkAt(sx, sy){
  if (!built) return null;
  const ax = (sx - cam.x)/cam.s*RS.S, ay = (sy - cam.y)/cam.s*RS.S, perCss = RS.S/cam.s, pad = TAP_PAD*perCss, half = TAP_MIN/2*perCss;
  const list = OBJECTS.filter(o=>(o.k==='sprite' || (o.k==='ship' && o.kind==='qe2')) && SPR[spriteOf(o)]).sort((p,q)=>q.d-p.d);   // front first
  for (const o of list){
    const sp = SPR[spriteOf(o)], x0 = Math.round(o.x*RS.S) - Math.round(sp.ax), y0 = Math.round(o.y*RS.S) - Math.round(sp.ay);
    const lx = ax - x0, ly = ay - y0, b = opaqueBox(sp), cx = (b.x0 + b.x1)/2, cy = (b.y0 + b.y1)/2;
    const hit = { id:tapId(o), x:o.x, y:o.y, sprite:spriteOf(o), x0, y0 };
    // the 44 px minimum: a sprite smaller than that on screen hits anywhere in a 44 px box round its middle
    if ((b.x1 - b.x0 < 2*half || b.y1 - b.y0 < 2*half) && Math.abs(lx - cx) <= Math.max(half, (b.x1-b.x0)/2) && Math.abs(ly - cy) <= Math.max(half, (b.y1-b.y0)/2)) return hit;
    if (lx < b.x0 - pad || ly < b.y0 - pad || lx >= b.x1 + pad || ly >= b.y1 + pad) continue;
    if (nearOpaque(sp, lx, ly, pad)) return hit;
  }
  for (const t of TERRAINS){
    if (!SPR[t.sprite]) continue;
    const [ca, ci] = G(t.centre[0], t.centre[1]), cw = aiToWorld(ca, ci), k = t.scale;   // art px per sprite px
    const x0 = Math.round(cw.x*RS.S - t.w*k/2), y0 = Math.round(cw.y*RS.S - t.h*k/2), px = Math.floor((ax - x0)/k), py = Math.floor((ay - y0)/k);
    if (px >= 0 && py >= 0 && px < t.w && py < t.h && isLandPx(t, py*t.w + px)) return { id:t.id, x:cw.x, y:cw.y, sprite:t.sprite, x0, y0, scale:k, terrain:true };
  }
  return null;
}
// on a tap: ease the camera (250 ms) so the landmark sits in the upper part of the map, zoomed in to the first
// whole-pixel step if it was further out than that; lift its sprite 2 px for 120 ms and outline it once in #ffd470
let tapFx = null;
function focusLandmark(hit){
  const sp = SPR[hit.sprite]; if (!sp) return;
  const k = hit.scale || 1, midY = (hit.y0 + sp.h*k/2)/RS.S, midX = (hit.x0 + sp.w*k/2)/RS.S;
  const sMin = RS.S/dpr, s = cam.s < sMin ? snappedScale(sMin, true) : cam.s;
  flyTo(midX, midY + (0.5 - 0.3)*viewH/s, s, 250);
  tapFx = { hit, t0:performance.now() };
  requestRender();
}
const outlineCache = new Map();
function outlineOf(sp){
  let c = outlineCache.get(sp); if (c) return c;
  c = newCanvas(sp.w + 2, sp.h + 2); const g = c.getContext('2d'), id = g.createImageData(sp.w + 2, sp.h + 2), d = new Uint32Array(id.data.buffer), gold = 0xff70d4ff;
  const on = (x, y)=>x>=0 && y>=0 && x<sp.w && y<sp.h && (sp.data[y*sp.w + x] >>> 24) >= 128;
  for (let y=-1; y<=sp.h; y++) for (let x=-1; x<=sp.w; x++) if (!on(x, y) && (on(x-1,y) || on(x+1,y) || on(x,y-1) || on(x,y+1))) d[(y+1)*(sp.w+2) + x+1] = gold;
  g.putImageData(id, 0, 0); outlineCache.set(sp, c); return c;
}
function drawTapFx(){
  if (!tapFx) return;
  const t = performance.now() - tapFx.t0; if (t > 420){ tapFx = null; return; }
  const { hit } = tapFx, sp = SPR[hit.sprite]; if (!sp){ tapFx = null; return; }
  const k = cam.s*dpr/RS.S, sk = hit.scale || 1, ox = Math.round(dpr*cam.x), oy = Math.round(dpr*cam.y), lift = (t < 120 && !reduceMotion) ? Math.round(2*dpr) : 0;
  ctx.setTransform(1,0,0,1,0,0); ctx.imageSmoothingEnabled = false;
  const x = Math.round(ox + hit.x0*k), y = Math.round(oy + hit.y0*k) - lift, w = sp.w*sk*k, h = sp.h*sk*k;
  ctx.drawImage(outlineOf(sp), x - sk*k, y - sk*k, w + 2*sk*k, h + 2*sk*k);
  if (lift) ctx.drawImage(nightSprite(sp).img, x, y, w, h);
  requestRender();
}
// tests and screenshots: centre on a world point at an exact zoom (multiple of the fit-city zoom)
// where a landmark stands (world point at the middle of its footprint)
function landmarkWorld(id){
  const o = OBJECTS.find(o=>(o.k==='sprite' && o.id===id) || (o.k==='ship' && o.kind===id));
  if (o) return o.k==='ship' ? { x:o.x, y:o.y - 8, top:o.y - 30 } : { x:o.px, y:o.py, top:o.y - o.h };
  const t = TERRAINS.find(t=>t.id===id); if (!t) return null;
  const [ca, ci] = G(t.centre[0], t.centre[1]), cw = aiToWorld(ca, ci); return { x:cw.x, y:cw.y, top:cw.y };
}
function viewAt(w, ratio){ setView(w.x, w.y, Math.max(MIN_S, Math.min(MAX_S, baseFit*ratio))); }
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
  const W=target.clientWidth, H=target.clientHeight; if (!W||!H) return false;
  const r=Math.min(window.devicePixelRatio||1,3);
  target.width=Math.round(W*r); target.height=Math.round(H*r);
  const s=baseFit*(zoomMult||5), k=s*r/RS.S;
  // drop any earlier snapshot of this same canvas, then keep this one fresh as pieces arrive
  RS.snaps.forEach(sn=>{ if (sn.target===target) RS.snaps.delete(sn); });
  const sn = { target, k, ox:Math.round(r*(W/2 - w.x*s)), oy:Math.round(r*(H/2 - w.y*s)), w:target.width, h:target.height };
  RS.snaps.add(sn);
  rasterWantSoon();
  if (!shownStore()) return false;
  paintSnap(sn);
  return true;
}
// where a world point lands on a canvas drawn by drawSnapshot(target, w, zoomMult), in CSS px
function snapshotPoint(target, w, zoomMult, p){
  const s=baseFit*(zoomMult||5);
  return { x: target.clientWidth/2 + (p.x-w.x)*s, y: target.clientHeight/2 + (p.y-w.y)*s };
}
function refresh(){ clustersDirty=true; requestRender(); }
// day or night: rebuild the city bitmap in the new palette (and the lights, the first time)
function setTheme(t){
  const n = t==='dark';
  if (n===NIGHT) return;
  NIGHT = n; nightCache.clear();
  if (wrap) wrap.classList.toggle('night', NIGHT);
  if (!dataBuilt) return;
  RS.lastWant = '';
  loadSaved(themeKey());
  rasterPost({ type:'theme', night:themeKey() });
  if (RS.inline) RS.inline.queue = [];
  rasterWant();
  requestRender();
}
function resize(){ if (built && resizeCanvas()){ if (needsCenter) initialView(); requestRender(); } }

export { focusLandmark, buildStats,
  initMap, whenReady, viewAt, rasterPending, rasterStats, landmarkAt, landmarkWorld, showInfo, setStamps, setAreaCounts, placeWorld, fitPoints, fitCity, flyToWorld, flyToSeparate,
  centerLatLng, viewZone, zoomRatio, setPicking, highlight, markDropped, setMeSprite, setSelected, startTracking,
  stopTracking, isTracking, drawSnapshot, snapshotPoint, refresh, resize, visible, setTheme, setShow, setZoneTint, setCars,
  ZONES, zoneById, nearestZone, toAI, toLatLng, inMap, onLand,
};

// ---- for the pixel renderer (mapraster.js, which also runs in mapworker.js) ----
function buildData(){ buildTerrain(); buildObjects(); prepRoads(); }
function setNight(on){ NIGHT = !!on; nightCache.clear(); }
function setLineWidth(w){ LW = w; }
export const RAW = { G, A_MIN, A_MAX, I_MIN, FOG_A, ACTIVE_REGIONS, REGION_PALMS, buildData, setNight, setLineWidth, drawObjectVector, C, shade, hash2, vnoise, isWaterT, proj, aiToGrid, gridToAI, aiToWorld, worldToAI, inRect,
  tileAt, inFootprint, prepCarRoads, budgetStats, HEIGHT_BUDGET, RUNWAYS, BRIDGE_KM, get FOOTPRINTS(){ return FOOTPRINTS; },
  TW, TH, LIP, SLAB, ROWS, COLS, WORLD, RD, OUT, TILE_COLORS, TILE_NIGHT, DISTRICTS, HOODS, TRAM,
  W_SEA, W_SHALLOW, L_BEACH, L_SAND, L_DUNE, L_URBAN, L_PARK, W_CANAL, L_TARMAC, L_PALM, L_LOT, L_GOLF, W_DEEP, L_FARM, L_CREST,
  get tType(){ return tType; }, get roadMask(){ return roadMask; }, worldTile, worldUnder, get OBJECTS(){ return OBJECTS; },
  get ROADS_W(){ return ROADS_W; }, get RUNWAYS_W(){ return RUNWAYS_W; }, get NIGHT(){ return NIGHT; } };
