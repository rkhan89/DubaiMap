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
  catch(e){ alert('Could not save: this browser\'s storage is full. Try removing some photos.'); }
}
function upsertPlace(data, id){
  if (id){
    const idx = places.findIndex(p=>p.id===id);
    if (idx>-1) places[idx] = {...places[idx], ...data};
  } else {
    const newId = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('p'+Date.now()+Math.random().toString(36).slice(2));
    places.unshift({id:newId, ...data, createdAt: Date.now()});
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
   ZONES  (rectangles on the terrain grid, in grid cells)
   ========================================================= */
const ZONES = [
  {id:'jumeirah',     label:'Jumeirah',     rect:[2,4, 2,5], color:'#E8B860'},
  {id:'marina',       label:'Marina',       rect:[2,3, 6,7], color:'#F2C14E'},
  {id:'jbr',          label:'JBR',          rect:[2,3, 8,9], color:'#F4A63C'},
  {id:'downtown',     label:'Downtown',     rect:[5,8, 5,8], color:'#D9822B'},
  {id:'businessbay',  label:'Business Bay', rect:[7,9, 8,10], color:'#C97B4A'},
  {id:'karama',       label:'Karama',       rect:[4,6, 9,11], color:'#E0A458'},
  {id:'alquoz',       label:'Al Quoz',      rect:[4,8, 11,14], color:'#C9A227'},
  {id:'deira',        label:'Deira',        rect:[9,12,1,4], color:'#D97B3E'},
];
const zoneById = id => ZONES.find(z=>z.id===id);
function zoneAt(col,row){
  return ZONES.find(z=> col>=z.rect[0] && col<=z.rect[1] && row>=z.rect[2] && row<=z.rect[3]);
}
function zoneCentroid(z){
  return { col:(z.rect[0]+z.rect[1])/2, row:(z.rect[2]+z.rect[3])/2 };
}

/* =========================================================
   TERRAIN  (hand-placed: coastline, Dubai Creek, Palm Jumeirah)
   Grid is 13 cols (0-12) x 15 rows (0-14). Types: sea, creek, land, palm
   ========================================================= */
const COLS=13, ROWS=15;
const PALM_CELLS = new Set(['0,6','0,7','1,7','1,8']);
const CREEK_BY_ROW = {1:[7,7],2:[7,7],3:[7,7],4:[7,7],5:[7,8],6:[7,8],7:[7,8],8:[6,6],9:[6,6]};
function terrainAt(col,row){
  if (PALM_CELLS.has(col+','+row)) return 'palm';
  const cr = CREEK_BY_ROW[row];
  if (cr && col>=cr[0] && col<=cr[1]) return 'creek';
  if (row<=1) return 'sea';
  if (col<=1 && row<=9) return 'sea';
  return 'land';
}

/* =========================================================
   ISO PROJECTION
   ========================================================= */
const TILE_W=56, TILE_H=28, ELEV=15, WATER_DROP=6;
function project(col,row){
  return { x:(col-row)*(TILE_W/2), y:(col+row)*(TILE_H/2) };
}
function shade(hex, factor){
  const n = parseInt(hex.slice(1),16);
  let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  r=Math.round(r*factor); g=Math.round(g*factor); b=Math.round(b*factor);
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
}
function hashOffset(str, range){
  let h=0; for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))>>>0; }
  const x=(h%1000)/1000, y=((h>>3)%1000)/1000;
  return [ (x-0.5)*range, (y-0.5)*range ];
}
function hashRot(str){
  let h=0; for(let i=0;i<str.length;i++){ h=(h*17+str.charCodeAt(i))>>>0; }
  return ((h%1200)/100)-6; // -6..6 deg
}

/* =========================================================
   STATE
   ========================================================= */
let places = loadPlaces();
let activeCats = new Set(CATEGORIES.map(c=>c.id));
let topRatedOnly = false;
let currentView = 'map';
let sortMode = 'recent';
let editingId = null;
let pendingPhoto = null;
let WORLD = { offX:0, offY:0, w:0, h:0 };
let TERRAIN = { x:0, y:0, w:0, h:0 };   // terrain bbox in world px, used to frame the camera
let pinK = 1;                            // pin counter-scale so polaroids stay tappable when zoomed out

let cam = { x:0, y:0, scale:1 };
const MIN_SCALE = 0.3;

/* =========================================================
   BUILD TERRAIN + BOUNDS
   ========================================================= */
const tiles = [];
for(let row=0; row<ROWS; row++){
  for(let col=0; col<COLS; col++){
    tiles.push({ col, row, type: terrainAt(col,row) });
  }
}
tiles.sort((a,b)=> (a.col+a.row) - (b.col+b.row));

(function computeBounds(){
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  tiles.forEach(t=>{
    const p = project(t.col, t.row);
    minX=Math.min(minX, p.x - TILE_W/2); maxX=Math.max(maxX, p.x + TILE_W/2);
    minY=Math.min(minY, p.y - TILE_H/2); maxY=Math.max(maxY, p.y + TILE_H/2 + ELEV);
  });
  // PAD leaves room for enlarged pins at the grid edges; headroom covers
  // pins/landmarks that stick up above the back corner of the grid.
  const PAD = 60, HEADROOM = 70;
  WORLD.offX = -minX + PAD;
  WORLD.offY = -minY + PAD + HEADROOM;
  WORLD.w = (maxX-minX) + PAD*2;
  WORLD.h = (maxY-minY) + PAD*2 + HEADROOM;
  TERRAIN = { x:PAD, y:PAD+HEADROOM, w:maxX-minX, h:maxY-minY };
})();

function toScreen(col,row){
  const p = project(col,row);
  return { x: p.x+WORLD.offX, y: p.y+WORLD.offY };
}

/* =========================================================
   RENDER: SVG MAP
   ========================================================= */
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs){
  const el = document.createElementNS(NS, tag);
  for(const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function renderMap(){
  const svg = document.getElementById('mapSvg');
  svg.setAttribute('width', WORLD.w);
  svg.setAttribute('height', WORLD.h);
  svg.setAttribute('viewBox', `0 0 ${WORLD.w} ${WORLD.h}`);
  svg.innerHTML = '';
  document.getElementById('mapViewport').style.width = WORLD.w+'px';
  document.getElementById('mapViewport').style.height = WORLD.h+'px';
  document.getElementById('pinsLayer').style.width = WORLD.w+'px';
  document.getElementById('pinsLayer').style.height = WORLD.h+'px';

  const hw=TILE_W/2, hh=TILE_H/2;
  let idx=0;
  tiles.forEach(t=>{
    idx++;
    const {x:cx, y:cy} = toScreen(t.col, t.row);
    const N=[cx,cy-hh], E=[cx+hw,cy], S=[cx,cy+hh], W=[cx-hw,cy];

    // palm cells are open water; the Palm itself is drawn on top in renderLandmarks
    if (t.type==='sea' || t.type==='creek' || t.type==='palm'){
      // water sits WATER_DROP below the land surface so the coast shows a lip
      const color = t.type==='creek' ? '#2C8FA0' : '#1FA8A3';
      const d = WATER_DROP, wh = ELEV - WATER_DROP;
      const wN=[N[0],N[1]+d], wE=[E[0],E[1]+d], wS=[S[0],S[1]+d], wW=[W[0],W[1]+d];
      svg.appendChild(svgEl('polygon',{points:pts([wW,wS,[wS[0],wS[1]+wh],[wW[0],wW[1]+wh]]), class:'tile-side', fill:shade(color,0.72)}));
      svg.appendChild(svgEl('polygon',{points:pts([wS,wE,[wE[0],wE[1]+wh],[wS[0],wS[1]+wh]]), class:'tile-side', fill:shade(color,0.56)}));
      const top = svgEl('polygon',{points:pts([wN,wE,wS,wW]), class:'tile-top', fill:color});
      svg.appendChild(top);
      const shim = svgEl('polygon',{points:pts([wN,wE,wS,wW]), class:'tile-shimmer'});
      shim.style.animationDelay = ((idx%12)*0.28)+'s';
      svg.appendChild(shim);
      return;
    }

    // land or palm: zone color (or neutral sand if no zone matches)
    const z = zoneAt(t.col,t.row);
    const base = z ? z.color : '#DEC582';
    const topColor = t.type==='palm' ? shade(base,1.06) : base;
    const leftColor = shade(base,0.74);
    const rightColor = shade(base,0.56);

    const left = svgEl('polygon',{points:pts([W,S,[S[0],S[1]+ELEV],[W[0],W[1]+ELEV]]), class:'tile-side', fill:leftColor});
    const right = svgEl('polygon',{points:pts([S,E,[E[0],E[1]+ELEV],[S[0],S[1]+ELEV]]), class:'tile-side', fill:rightColor});
    const top = svgEl('polygon',{points:pts([N,E,S,W]), class:'tile-top', fill:topColor});
    svg.appendChild(left); svg.appendChild(right); svg.appendChild(top);
  });

  renderZoneLabels(svg);
  renderLandmarks(svg);
}
function pts(arr){ return arr.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '); }

function renderZoneLabels(svg){
  ZONES.forEach(z=>{
    const c = zoneCentroid(z);
    const {x,y} = toScreen(c.col, c.row);
    // sits on the tile surface just below the centroid, so the zone's pins
    // (anchored above the centroid) don't cover it
    const label = svgEl('text',{x, y:y+20, class:'zone-label', 'text-anchor':'middle'});
    label.textContent = z.label;
    svg.appendChild(label);
  });
}

function renderPalm(svg){
  // trunk from the coast, a fan of fronds and the outer crescent, laid flat on
  // the water in grid space so it follows the iso projection
  const onWater = (c,r)=>{ const p=toScreen(c,r); return [p.x, p.y+WATER_DROP]; };
  const C = [0.85, 7.3];
  const trunk = [[1.95,7.55],C];
  const fronds = [];
  for (let a=100; a<=260; a+=20){
    const t = a*Math.PI/180;
    fronds.push([C, [C[0]+0.85*Math.cos(t), C[1]+0.85*Math.sin(t)]]);
  }
  const arc = [];
  for (let a=95; a<=265; a+=10){
    const t = a*Math.PI/180;
    arc.push([C[0]+1.22*Math.cos(t), C[1]+1.22*Math.sin(t)]);
  }
  const strokes = [trunk, ...fronds, arc];
  const d = strokes.map(line=>'M'+line.map(([c,r])=>onWater(c,r).map(v=>v.toFixed(1)).join(',')).join(' L')).join(' ');
  const g = svgEl('g',{class:'palm'});
  g.appendChild(svgEl('path',{d, fill:'none', stroke:'#2A1B10', 'stroke-width':'7.5', 'stroke-linecap':'round', 'stroke-linejoin':'round'}));
  g.appendChild(svgEl('path',{d, fill:'none', stroke:'#EAD08E', 'stroke-width':'4.5', 'stroke-linecap':'round', 'stroke-linejoin':'round'}));
  svg.appendChild(g);
}

function renderLandmarks(svg){
  renderPalm(svg);

  // Burj Khalifa spike on the west side of Downtown, clear of the pin cluster at the centroid
  const {x:bx,y:by} = toScreen(5, 7);
  const baseY = by + 2;
  const spike = svgEl('polygon',{
    points:`${bx-4},${baseY} ${bx-2},${baseY-70} ${bx},${baseY-100} ${bx+2},${baseY-70} ${bx+4},${baseY}`,
    fill:'#EFE6D0', stroke:'#2A1B10', 'stroke-width':'1.2'
  });
  svg.appendChild(spike);
  const light = svgEl('circle',{cx:bx, cy:baseY-100, r:2.4, fill:'#FFD86B', class:'landmark-glow'});
  svg.appendChild(light);

  // Marina towers, along the seaward edge of the Marina zone
  const {x:mx,y:my} = toScreen(2, 7);
  const heights=[34,48,28,40];
  heights.forEach((h,i)=>{
    const tx = mx-16+i*10, ty = my+4-i*5;
    const tower = svgEl('rect',{x:tx-3, y:ty-h, width:6, height:h, fill:'#7FD6CE', stroke:'#2A1B10', 'stroke-width':'1'});
    svg.appendChild(tower);
  });

  // creek abra boat
  const {x:kx,y:ky0} = toScreen(7.5, 5);
  const ky = ky0 + WATER_DROP;
  const boat = svgEl('g',{class:'boat-bob'});
  const hull = svgEl('path',{d:`M${kx-9},${ky} q9,7 18,0 l-3,3 q-6,3 -12,0 z`, fill:'#8A5A2E', stroke:'#2A1B10', 'stroke-width':'1'});
  boat.appendChild(hull);
  svg.appendChild(boat);
}

/* =========================================================
   RENDER: PINS
   ========================================================= */
function matchesFilters(p){
  const cats = p.categories||[];
  const catOk = cats.some(c=>activeCats.has(c));
  const ratingOk = !topRatedOnly || (p.rating||0)>=4;
  return catOk && ratingOk;
}

function computePinScreenPos(p){
  const z = zoneById(p.zone);
  if (!z) return null;
  const c = zoneCentroid(z);
  const {x,y} = toScreen(c.col, c.row);
  const [ox,oy] = hashOffset(p.id, 44);
  // anchor = bottom-centre of the polaroid, resting on the tile surface
  return { x:x+ox, y:y+oy*0.5+4 };
}

function clusterPlaces(visible){
  const withPos = visible.map(p=>({p, pos:computePinScreenPos(p)})).filter(v=>v.pos);
  const clusters = [];
  const used = new Set();
  withPos.forEach((v,i)=>{
    if (used.has(i)) return;
    const group = [v];
    used.add(i);
    withPos.forEach((w,j)=>{
      if (used.has(j)) return;
      const dx=v.pos.x-w.pos.x, dy=v.pos.y-w.pos.y;
      if (Math.sqrt(dx*dx+dy*dy) < 40*pinK){ group.push(w); used.add(j); }
    });
    const avgX = group.reduce((s,g)=>s+g.pos.x,0)/group.length;
    const avgY = group.reduce((s,g)=>s+g.pos.y,0)/group.length;
    clusters.push({ x:avgX, y:avgY, items:group.map(g=>g.p) });
  });
  return clusters;
}

function renderPins(){
  const layer = document.getElementById('pinsLayer');
  layer.innerHTML = '';
  const visible = places.filter(matchesFilters);
  document.getElementById('emptyState').classList.toggle('hidden', places.length>0);

  layer.style.setProperty('--pin-k', pinK);
  // back-to-front so pins lower on screen overlap the ones behind them
  const clusters = clusterPlaces(visible).sort((a,b)=>a.y-b.y);
  clusters.forEach(cl=>{
    const el = document.createElement('div');
    const rot = hashRot(cl.items[0].id);
    el.className = 'pin' + (cl.items.length>1 ? ' pin-cluster' : '');
    el.style.left = cl.x+'px';
    el.style.top = cl.y+'px';

    const first = cl.items[0];
    const cat = catById((first.categories&&first.categories[0])||'coffee');
    const photoStyle = first.photo ? `background-image:url(${first.photo})` : `background:${cat.color}`;
    el.innerHTML = `
      <div class="pin-bob" style="animation-delay:${(Math.abs(rot)*0.1).toFixed(2)}s">
        <div class="polaroid"${cl.items.length>1?` data-count="${cl.items.length}"`:''} style="transform:rotate(${rot}deg)">
          <div class="tape"></div>
          <div class="photo" style="${photoStyle}">${first.photo?'':iconSvg(cat.id,'#fff')}</div>
          <div class="rating">★ ${first.rating||0}</div>
        </div>
      </div>`;
    if (cl.items.length===1){
      el.addEventListener('click', (e)=>{ e.stopPropagation(); openDetail(first.id); });
    } else {
      el.addEventListener('click', (e)=>{ e.stopPropagation(); openClusterPopover(cl, e); });
    }
    layer.appendChild(el);
  });
}

function openClusterPopover(cl, evt){
  const pop = document.getElementById('clusterPop');
  pop.innerHTML = cl.items.map(p=>{
    const cat = catById((p.categories&&p.categories[0])||'coffee');
    const thumbStyle = p.photo ? `background-image:url(${p.photo})` : `background:${cat.color}`;
    return `<div class="cluster-row" data-id="${p.id}">
      <div class="thumb" style="${thumbStyle}">${p.photo?'':iconSvg(cat.id,'#fff')}</div>
      <div class="name">${escapeHtml(p.name||'Untitled')}</div>
      <div class="rate">★${p.rating||0}</div>
    </div>`;
  }).join('');
  pop.querySelectorAll('.cluster-row').forEach(row=>{
    row.addEventListener('click', ()=>{ pop.classList.add('hidden'); openDetail(row.dataset.id); });
  });

  const wrap = document.getElementById('mapWrap');
  const rect = wrap.getBoundingClientRect();
  pop.classList.remove('hidden');
  // open above the tapped pin, or below it if there's no room, clamped inside the map
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const tx = evt.clientX - rect.left, ty = evt.clientY - rect.top;
  let left = Math.max(8, Math.min(tx - pw/2, rect.width - pw - 8));
  let top = ty - ph - 36;
  if (top < 8) top = Math.min(ty + 24, rect.height - ph - 8);
  pop.style.left = left+'px';
  pop.style.top = Math.max(8, top)+'px';
}
document.getElementById('mapWrap').addEventListener('click', ()=>{
  document.getElementById('clusterPop').classList.add('hidden');
});

/* =========================================================
   RENDER: FILTERS
   ========================================================= */
function renderFilters(){
  const grid = document.getElementById('filterCats');
  grid.innerHTML = CATEGORIES.map(c=>{
    const on = activeCats.has(c.id);
    return `<button class="chip ${on?'':'off'}" data-cat="${c.id}">
      <span class="dot" style="background:${c.color}">${iconSvg(c.id,'#fff')}</span>${c.label}
    </button>`;
  }).join('');
  grid.querySelectorAll('[data-cat]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.cat;
      if (activeCats.has(id)) activeCats.delete(id); else activeCats.add(id);
      renderFilters(); renderPins(); renderList();
    });
  });
  document.getElementById('chipTopRated').classList.toggle('off', !topRatedOnly);
  document.getElementById('btnFilter').classList.toggle('filtered', topRatedOnly || activeCats.size<CATEGORIES.length);
}
document.getElementById('chipTopRated').addEventListener('click', ()=>{
  topRatedOnly = !topRatedOnly;
  renderFilters(); renderPins(); renderList();
});

/* =========================================================
   RENDER: LIST
   ========================================================= */
function fmtDate(d){
  if (!d) return '';
  const dt = new Date(d+'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined,{month:'short', day:'numeric', year:'numeric'});
}
// local YYYY-MM-DD (toISOString is UTC, which is yesterday in Dubai before 4am)
function todayLocal(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function renderList(){
  const body = document.getElementById('listBody');
  let visible = places.filter(matchesFilters);
  if (sortMode==='rating') visible.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else if (sortMode==='name') visible.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  else visible.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  document.getElementById('listCount').textContent = `${visible.length} place${visible.length!==1?'s':''}`;
  if (visible.length===0){
    body.innerHTML = `<div class="list-empty">Nothing matches your filters yet.</div>`;
    return;
  }
  body.innerHTML = visible.map(p=>{
    const z = zoneById(p.zone);
    const cats = p.categories||[];
    const cat0 = catById(cats[0]);
    const thumbStyle = p.photo ? `background-image:url(${p.photo})` : `background:${cat0?cat0.color:'#ccc'}`;
    return `<div class="place-row" data-id="${p.id}">
      <div class="place-thumb" style="${thumbStyle}">${p.photo?'':iconSvg(cats[0]||'coffee','#fff')}</div>
      <div class="place-info">
        <div class="name">${escapeHtml(p.name||'Untitled')}</div>
        <div class="meta">${z?z.label:''} · ${fmtDate(p.dateVisited)}</div>
      </div>
      <div class="place-cats">${cats.slice(0,3).map(c=>{const cat=catById(c); return cat?`<span class="mini" style="background:${cat.color}">${iconSvg(c,'#fff')}</span>`:'';}).join('')}</div>
      <div class="place-rating">★ ${p.rating||0}</div>
    </div>`;
  }).join('');
  body.querySelectorAll('.place-row').forEach(row=>{
    row.addEventListener('click', ()=>openDetail(row.dataset.id));
  });
}
document.getElementById('sortSelect').addEventListener('change', e=>{ sortMode=e.target.value; renderList(); });

/* =========================================================
   DETAIL + FORM SHEETS
   ========================================================= */
function starsHtml(rating){ let out=''; for(let i=1;i<=5;i++) out+=`<span class="${i<=rating?'':'off'}">★</span>`; return out; }

function openDetail(id){
  const p = places.find(x=>x.id===id);
  if (!p) return;
  editingId = id;
  document.getElementById('detailTitle').textContent = p.name || 'Untitled';
  const z = zoneById(p.zone);
  const cats = p.categories||[];
  document.getElementById('detailBody').innerHTML = `
    ${p.photo ? `<div class="detail-photo" style="background-image:url(${p.photo})"></div>` : ''}
    <div class="detail-cats">${cats.map(c=>{const cat=catById(c); if(!cat) return ''; return `<span class="badge" style="background:${cat.color}"><span class="dot">${iconSvg(c,'#fff')}</span>${cat.label}</span>`;}).join('')}</div>
    <div class="detail-row">📍 <b>${z?z.label:'Unknown area'}</b></div>
    <div class="detail-row">📅 ${fmtDate(p.dateVisited)}</div>
    <div class="detail-row">Rating <div class="detail-stars">${starsHtml(p.rating||0)}</div></div>
    ${p.notes ? `<div class="detail-notes">${escapeHtml(p.notes)}</div>` : ''}
  `;
  openSheet('sheetDetail');
}
document.getElementById('detailDelete').addEventListener('click', ()=>{
  if (!editingId) return;
  if (!confirm('Delete this place?')) return;
  removePlace(editingId);
  closeSheets();
  renderPins(); renderList();
});
document.getElementById('detailEdit').addEventListener('click', ()=>{ if(editingId) openForm(editingId); });

function buildFormStatics(){
  document.getElementById('fZone').innerHTML = ZONES.map(z=>`<option value="${z.id}">${z.label}</option>`).join('');
  const grid = document.getElementById('fCats');
  grid.innerHTML = CATEGORIES.map(c=>`
    <button type="button" class="cat-pick" data-cat="${c.id}">
      <span class="dot" style="background:${c.color}">${iconSvg(c.id,'#fff')}</span>
      <span>${c.label}</span>
    </button>`).join('');
  grid.querySelectorAll('.cat-pick').forEach(btn=>btn.addEventListener('click', ()=>btn.classList.toggle('on')));
  document.querySelectorAll('#fStars button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const v = parseInt(btn.dataset.v,10);
      document.querySelectorAll('#fStars button').forEach(b=>b.classList.toggle('on', parseInt(b.dataset.v,10)<=v));
      document.getElementById('fStars').dataset.value = v;
    });
  });
}

function openForm(id){
  editingId = id || null;
  pendingPhoto = null;
  const p = id ? places.find(x=>x.id===id) : null;
  document.getElementById('formTitle').textContent = id ? 'Edit place' : 'Add place';
  document.querySelector('#sheetForm .sheet-body').scrollTop = 0;
  document.getElementById('fName').classList.remove('invalid');
  document.getElementById('fPhoto').value = '';
  document.getElementById('fName').value = p ? (p.name||'') : '';
  document.getElementById('fZone').value = p ? p.zone : ZONES[0].id;
  document.getElementById('fDate').value = p ? p.dateVisited : todayLocal();
  document.getElementById('fNotes').value = p ? (p.notes||'') : '';
  document.querySelectorAll('#fCats .cat-pick').forEach(btn=>{
    btn.classList.toggle('on', p ? (p.categories||[]).includes(btn.dataset.cat) : false);
  });
  const rating = p ? (p.rating||0) : 0;
  document.getElementById('fStars').dataset.value = rating;
  document.querySelectorAll('#fStars button').forEach(b=>b.classList.toggle('on', parseInt(b.dataset.v,10)<=rating));

  const drop = document.getElementById('fPhotoDrop');
  const label = document.getElementById('fPhotoLabel');
  drop.classList.remove('has-img');
  drop.querySelectorAll('img').forEach(i=>i.remove());
  if (p && p.photo){
    const img = document.createElement('img'); img.src = p.photo;
    drop.appendChild(img); drop.classList.add('has-img'); label.style.display='none';
  } else { label.style.display='block'; label.textContent='Tap to add a photo'; }

  openSheet('sheetForm');
}

document.getElementById('fPhoto').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    const img = new Image();
    img.onload = ()=>{
      const maxW=480, scale=Math.min(1, maxW/img.width);
      const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const dataUrl = canvas.toDataURL('image/jpeg',0.72);
      pendingPhoto = dataUrl;
      const drop = document.getElementById('fPhotoDrop');
      drop.querySelectorAll('img').forEach(i=>i.remove());
      const imgEl = document.createElement('img'); imgEl.src = dataUrl;
      drop.appendChild(imgEl); drop.classList.add('has-img');
      document.getElementById('fPhotoLabel').style.display='none';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});
document.getElementById('fPhotoRemove').addEventListener('click', e=>{
  e.preventDefault(); e.stopPropagation();
  pendingPhoto = '';
  const drop = document.getElementById('fPhotoDrop');
  drop.querySelectorAll('img').forEach(i=>i.remove());
  drop.classList.remove('has-img');
  document.getElementById('fPhotoLabel').style.display='block';
  document.getElementById('fPhoto').value='';
});

document.getElementById('formSave').addEventListener('click', ()=>{
  const name = document.getElementById('fName').value.trim();
  if (!name){
    const f = document.getElementById('fName');
    f.classList.add('invalid'); f.focus();
    f.addEventListener('input', ()=>f.classList.remove('invalid'), {once:true});
    return;
  }
  const zone = document.getElementById('fZone').value;
  const cats = Array.from(document.querySelectorAll('#fCats .cat-pick.on')).map(b=>b.dataset.cat);
  if (cats.length===0){ alert('Pick at least one category.'); return; }
  const rating = parseInt(document.getElementById('fStars').dataset.value||'0',10);
  const dateVisited = document.getElementById('fDate').value || todayLocal();
  const notes = document.getElementById('fNotes').value.trim();
  const data = { name, zone, categories:cats, rating, dateVisited, notes };
  if (pendingPhoto !== null) data.photo = pendingPhoto || null;
  upsertPlace(data, editingId);
  closeSheets();
  renderPins(); renderList();
});

/* =========================================================
   SHEET / OVERLAY PLUMBING
   ========================================================= */
function openSheet(id){
  // one sheet at a time (Edit from the detail sheet swaps to the form)
  document.querySelectorAll('.sheet.open').forEach(s=>{ if(s.id!==id) s.classList.remove('open'); });
  document.getElementById('clusterPop').classList.add('hidden');
  document.getElementById('overlay').classList.add('open');
  document.getElementById(id).classList.add('open');
}
function closeSheets(){
  document.getElementById('overlay').classList.remove('open');
  document.querySelectorAll('.sheet').forEach(s=>s.classList.remove('open'));
  editingId = null;
}
document.getElementById('overlay').addEventListener('click', closeSheets);
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click', closeSheets));

/* =========================================================
   NAV
   ========================================================= */
document.getElementById('tabMap').addEventListener('click', ()=>{
  currentView='map';
  document.getElementById('tabMap').classList.add('active');
  document.getElementById('tabList').classList.remove('active');
  document.getElementById('mapWrap').style.display='block';
  document.getElementById('listWrap').classList.remove('active');
  if (needsCenter) centerCamera();
});
document.getElementById('tabList').addEventListener('click', ()=>{
  currentView='list';
  document.getElementById('tabList').classList.add('active');
  document.getElementById('tabMap').classList.remove('active');
  document.getElementById('mapWrap').style.display='none';
  document.getElementById('listWrap').classList.add('active');
  renderList();
});
document.getElementById('btnAdd').addEventListener('click', ()=>openForm(null));
document.getElementById('btnFilter').addEventListener('click', ()=>openSheet('sheetFilter'));

/* =========================================================
   MAP PAN / PINCH-ZOOM
   ========================================================= */
(function initMapControls(){
  const stage = document.getElementById('mapWrap');
  const pointers = new Map();
  let lastDist = null, lastMid = null;
  let downAt = null, dragged = false;
  const DRAG_SLOP = 6;

  function applyCamera(){
    // keep at least some terrain on screen so the map can't be flung away
    const rect = stage.getBoundingClientRect();
    if (rect.width){
      const m = 80;
      const tx0 = TERRAIN.x*cam.scale, tx1 = (TERRAIN.x+TERRAIN.w)*cam.scale;
      const ty0 = TERRAIN.y*cam.scale, ty1 = (TERRAIN.y+TERRAIN.h)*cam.scale;
      cam.x = Math.min(rect.width-m-tx0, Math.max(m-tx1, cam.x));
      cam.y = Math.min(rect.height-m-ty0, Math.max(m-ty1, cam.y));
    }
    document.getElementById('mapViewport').style.transform =
      `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
    // pins never shrink below ~75% of their design size on screen
    const k = Math.round(Math.max(1, 0.75/cam.scale)*20)/20;
    if (k!==pinK){ pinK = k; renderPins(); }
  }
  window.__applyCamera = applyCamera;

  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function mid(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
  function zoomAt(localX, localY, newScale){
    newScale = Math.max(MIN_SCALE, Math.min(2.2, newScale));
    const wx = (localX-cam.x)/cam.scale, wy = (localY-cam.y)/cam.scale;
    cam.x = localX - wx*newScale;
    cam.y = localY - wy*newScale;
    cam.scale = newScale;
    applyCamera();
  }

  // Pointer capture is only taken once a drag actually starts; capturing on
  // pointerdown retargets the click to the map and swallows taps on pins,
  // zoom buttons and the cluster popover.
  stage.addEventListener('pointerdown', e=>{
    if (pointers.size===0) dragged = false;
    if (e.target.closest('.zoom-ctrl, .cluster-pop')) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pointers.size===1) downAt = {x:e.clientX, y:e.clientY};
  });
  stage.addEventListener('pointermove', e=>{
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = {x:e.clientX, y:e.clientY};
    if (!dragged){
      if (pointers.size===1 && Math.hypot(cur.x-downAt.x, cur.y-downAt.y) < DRAG_SLOP) return;
      dragged = true;
      document.getElementById('clusterPop').classList.add('hidden');
    }
    try{ stage.setPointerCapture(e.pointerId); }catch(_){}
    pointers.set(e.pointerId, cur);

    if (pointers.size===1){
      cam.x += (cur.x-prev.x);
      cam.y += (cur.y-prev.y);
      applyCamera();
    } else if (pointers.size===2){
      const pts2 = Array.from(pointers.values());
      const d = dist(pts2[0], pts2[1]);
      const m = mid(pts2[0], pts2[1]);
      if (lastDist){
        const rect = stage.getBoundingClientRect();
        // pan with the midpoint, then zoom around it
        if (lastMid){ cam.x += m.x-lastMid.x; cam.y += m.y-lastMid.y; }
        zoomAt(m.x-rect.left, m.y-rect.top, cam.scale * (d/lastDist));
      }
      lastDist = d; lastMid = m;
    }
  });
  function endPointer(e){
    pointers.delete(e.pointerId);
    if (pointers.size<2){ lastDist=null; lastMid=null; }
    // when one finger of a pinch lifts, continue panning from where the other one is now
    if (pointers.size===1){
      const [id] = pointers.keys();
      downAt = pointers.get(id);
    }
  }
  ['pointerup','pointercancel'].forEach(ev=>stage.addEventListener(ev, endPointer));
  stage.addEventListener('pointerleave', e=>{ if (e.pointerType==='mouse') endPointer(e); });

  // a drag that ends over a pin must not also count as a tap on it
  stage.addEventListener('click', e=>{
    if (dragged){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  stage.addEventListener('wheel', e=>{
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    zoomAt(e.clientX-rect.left, e.clientY-rect.top, cam.scale * (e.deltaY>0 ? 0.9 : 1.1));
  }, {passive:false});

  function zoomCenter(f){
    const rect = stage.getBoundingClientRect();
    zoomAt(rect.width/2, rect.height/2, cam.scale*f);
  }
  document.getElementById('zoomIn').addEventListener('click', ()=>zoomCenter(1.25));
  document.getElementById('zoomOut').addEventListener('click', ()=>zoomCenter(0.8));
})();

let needsCenter = true, lastCenterW = 0;
function centerCamera(){
  const wrap = document.getElementById('mapWrap');
  const rect = wrap.getBoundingClientRect();
  if (!rect.width || !rect.height){ needsCenter = true; return; }   // list view is showing
  // frame the terrain diamond (not the padded world). On narrow portrait
  // screens let the empty far-left/right corners crop so the city isn't a thin strip.
  // The crop is biased toward the empty west corner so Deira keeps some margin.
  const narrow = rect.width < 600;
  const cropW = narrow ? 0.84 : 1, focusX = narrow ? 0.56 : 0.5;
  const fitScale = Math.min(rect.width/(TERRAIN.w*cropW), rect.height/TERRAIN.h) * 0.96;
  cam.scale = Math.max(MIN_SCALE, Math.min(1.4, fitScale));
  cam.x = rect.width/2 - (TERRAIN.x + TERRAIN.w*focusX)*cam.scale;
  cam.y = (rect.height - TERRAIN.h*cam.scale)/2 - TERRAIN.y*cam.scale;
  needsCenter = false; lastCenterW = rect.width;
  window.__applyCamera();
}

/* =========================================================
   BOOT
   ========================================================= */
buildFormStatics();
renderFilters();
renderMap();
renderPins();
renderList();
requestAnimationFrame(centerCamera);
// only re-frame on width changes (rotation, desktop resize); height changes on
// phones are the URL bar or keyboard and shouldn't reset the user's pan/zoom
window.addEventListener('resize', ()=>{
  const w = document.getElementById('mapWrap').getBoundingClientRect().width;
  if (needsCenter || (w && w!==lastCenterW)) centerCamera();
});

})();
