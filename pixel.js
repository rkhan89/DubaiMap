// Pixel-art rasteriser for the map: hard-edged fills and 1 px lines into a 32-bit pixel buffer.
// No canvas and no DOM, so it runs the same in a Web Worker, on the main thread and in node tests.
// Pixels are sampled at their centres, so two shapes that share an edge never overlap or leave
// a gap, and every 2:1 isometric edge comes out as an exact two-pixel stair.

/* ---------- colours: '#rrggbb' or 'rgba(r,g,b,a)' -> little-endian ABGR uint32 ---------- */
const colourCache = new Map();
export function rgba(str){
  let v = colourCache.get(str);
  if (v !== undefined) return v;
  let r=0, g=0, b=0, a=255;
  if (str[0] === '#'){
    const n = parseInt(str.length === 4 ? str[1]+str[1]+str[2]+str[2]+str[3]+str[3] : str.slice(1, 7), 16);
    r = n>>16&255; g = n>>8&255; b = n&255;
  } else {
    const m = str.match(/[\d.]+/g) || [];
    r = +m[0]||0; g = +m[1]||0; b = +m[2]||0; a = m[3]!==undefined ? Math.round(+m[3]*255) : 255;
  }
  v = ((a<<24) | (b<<16) | (g<<8) | r) >>> 0;
  colourCache.set(str, v);
  return v;
}
export const hex = (r,g,b,a=255)=>((a<<24)|(b<<16)|(g<<8)|r)>>>0;
export function mix(c, d, t){   // blend two packed colours, t of d
  const u = 1-t;
  return hex(Math.round((c&255)*u + (d&255)*t), Math.round((c>>8&255)*u + (d>>8&255)*t), Math.round((c>>16&255)*u + (d>>16&255)*t), 255);
}
export function scale(c, f){   // lighten (f>1) or darken (f<1) a packed colour
  const k = x=>Math.max(0, Math.min(255, Math.round(x*f)));
  return hex(k(c&255), k(c>>8&255), k(c>>16&255), c>>>24);
}

/* ---------- the buffer ---------- */
// a w x h block of pixels whose top-left sits at art coordinates (ox, oy)
export class PixelBuffer {
  constructor(w, h, ox=0, oy=0){ this.w=w; this.h=h; this.ox=ox; this.oy=oy; this.data=new Uint32Array(w*h); }
  // write one pixel in art coordinates; alpha < 255 blends over what's there
  put(x, y, c){
    x -= this.ox; y -= this.oy;
    if (x<0 || y<0 || x>=this.w || y>=this.h) return;
    const k = y*this.w + x, a = c>>>24;
    if (a === 255){ this.data[k] = c; return; }
    if (!a) return;
    const d = this.data[k], t = a/255, u = 1-t;
    this.data[k] = (((d>>>24) | a) << 24 | Math.round(((d>>16)&255)*u + ((c>>16)&255)*t) << 16 | Math.round(((d>>8)&255)*u + ((c>>8)&255)*t) << 8 | Math.round((d&255)*u + (c&255)*t)) >>> 0;
  }
  get(x, y){ x -= this.ox; y -= this.oy; return (x<0 || y<0 || x>=this.w || y>=this.h) ? 0 : this.data[y*this.w + x]; }
  span(y, x0, x1, c){   // [x0, x1) on row y, in art coordinates
    y -= this.oy; if (y<0 || y>=this.h) return;
    x0 = Math.max(0, x0 - this.ox); x1 = Math.min(this.w, x1 - this.ox);
    if (x1 <= x0) return;
    const row = y*this.w;
    if ((c>>>24) === 255) this.data.fill(c, row+x0, row+x1);
    else for (let x=x0; x<x1; x++) this.put(x+this.ox, y+this.oy, c);
  }
}

/* ---------- polygons (non-zero winding, sampled at pixel centres) ---------- */
// polys: array of rings, each a flat array [x0,y0, x1,y1, ...] in art coordinates.
// fn(y, x0, x1) receives every covered span; clip = {x0,y0,x1,y1} limits the rows and columns visited.
export function scanPolys(polys, fn, clip){
  let y0 = Infinity, y1 = -Infinity;
  const edges = [];
  for (const p of polys){
    const n = p.length/2;
    for (let k=0; k<n; k++){
      const ax=p[2*k], ay=p[2*k+1], j=(k+1)%n, bx=p[2*j], by=p[2*j+1];
      if (ay === by) continue;
      const dir = ay < by ? 1 : -1, ya = Math.min(ay,by), yb = Math.max(ay,by);
      edges.push({ ya, yb, x: ay<by?ax:bx, dx:(bx-ax)/(by-ay), xa:ay<by?ay:by, dir });
      if (ya < y0) y0 = ya; if (yb > y1) y1 = yb;
    }
  }
  if (!edges.length) return;
  let r0 = Math.ceil(y0 - 0.5), r1 = Math.floor(y1 - 0.5);
  if (clip){ r0 = Math.max(r0, clip.y0); r1 = Math.min(r1, clip.y1 - 1); }
  const xs = [];
  for (let y=r0; y<=r1; y++){
    const yc = y + 0.5;
    xs.length = 0;
    for (const e of edges){
      if (yc < e.ya || yc >= e.yb) continue;
      xs.push([e.x + (yc - e.xa)*e.dx, e.dir]);
    }
    if (xs.length < 2) continue;
    xs.sort((p,q)=>p[0]-q[0]);
    let wind = 0;
    for (let k=0; k<xs.length-1; k++){
      wind += xs[k][1];
      if (!wind) continue;
      let a = Math.ceil(xs[k][0] - 0.5), b = Math.floor(xs[k+1][0] - 0.5) + 1;
      if (clip){ a = Math.max(a, clip.x0); b = Math.min(b, clip.x1); }
      if (b > a) fn(y, a, b);
    }
  }
}
export function fillPolys(buf, polys, c){
  scanPolys(polys, (y,a,b)=>buf.span(y,a,b,c), { x0:buf.ox, y0:buf.oy, x1:buf.ox+buf.w, y1:buf.oy+buf.h });
}

/* ---------- lines ---------- */
// 1 px line between two art points (Bresenham on the rounded ends)
export function line(buf, x0, y0, x1, y1, c, dash){
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1-x0), dy = -Math.abs(y1-y0), sx = x0<x1?1:-1, sy = y0<y1?1:-1;
  let err = dx + dy, n = 0;
  for (;;){
    if (!dash || (n % (dash[0]+dash[1])) < dash[0]) buf.put(x0, y0, c);
    n++;
    if (x0===x1 && y0===y1) break;
    const e2 = 2*err;
    if (e2 >= dy){ err += dy; x0 += sx; }
    if (e2 <= dx){ err += dx; y0 += sy; }
  }
}
// a thick polyline as filled quads with round joins and caps; returns the rings (for masks)
export function thickRings(pts, w){
  const rings = [], h = w/2;
  for (let k=0; k<pts.length-1; k++){
    const [ax,ay] = pts[k], [bx,by] = pts[k+1], L = Math.hypot(bx-ax, by-ay) || 1, nx = -(by-ay)/L*h, ny = (bx-ax)/L*h;
    rings.push([ax+nx,ay+ny, bx+nx,by+ny, bx-nx,by-ny, ax-nx,ay-ny]);
  }
  for (const [x,y] of pts) rings.push(ellipseRing(x, y, h, h, 0, Math.PI*2));
  return rings;
}
export function ellipseRing(cx, cy, rx, ry, a0, a1, ccw){
  const out = [], span = ccw ? -((a0 - a1 + Math.PI*4) % (Math.PI*2) || Math.PI*2) : ((a1 - a0 + Math.PI*4) % (Math.PI*2) || Math.PI*2);
  const n = Math.max(8, Math.min(96, Math.ceil(Math.max(rx, ry) * Math.abs(span) * 0.9)));
  for (let k=0; k<=n; k++){ const t = a0 + span*k/n; out.push(cx + Math.cos(t)*rx, cy + Math.sin(t)*ry); }
  return out;
}

/* ---------- a small Canvas 2D stand-in ----------
   Enough of CanvasRenderingContext2D for the map's drawing code (paths, ellipses, arcs, curves,
   rects, fill and stroke with hex or rgba colours, save/restore), drawing hard pixels instead.
   World coordinates are mapped to art pixels by x*s - ox (s = art pixels per world unit). */
export class PixelCtx {
  constructor(buf, s){
    this.buf = buf; this.s = s;
    this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.lineWidth = 1; this.globalAlpha = 1;
    this.lineCap = 'butt'; this.lineJoin = 'miter'; this.dash = null;
    this.rings = []; this.cur = null; this.stack = [];
  }
  X(x){ return x*this.s; } Y(y){ return y*this.s; }
  save(){ this.stack.push([this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.lineCap, this.lineJoin, this.dash]); }
  restore(){ const s = this.stack.pop(); if (s) [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.lineCap, this.lineJoin, this.dash] = s; }
  setLineDash(d){ this.dash = d && d.length ? d.map(v=>Math.max(1, Math.round(v*this.s))) : null; }
  beginPath(){ this.rings = []; this.cur = null; }
  moveTo(x, y){ this.cur = [this.X(x), this.Y(y)]; this.cur.closed = false; this.rings.push(this.cur); }
  lineTo(x, y){ if (!this.cur) return this.moveTo(x, y); this.cur.push(this.X(x), this.Y(y)); }
  closePath(){ if (this.cur){ this.cur.closed = true; const x=this.cur[0], y=this.cur[1]; this.cur = [x, y]; this.cur.closed = false; this.cur.sub = true; this.rings.push(this.cur); } }
  quadraticCurveTo(cx, cy, x, y){
    if (!this.cur) this.moveTo(cx, cy);
    const p = this.cur, x0 = p[p.length-2], y0 = p[p.length-1], X1 = this.X(cx), Y1 = this.Y(cy), X2 = this.X(x), Y2 = this.Y(y);
    const n = Math.max(4, Math.ceil(Math.hypot(X2-x0, Y2-y0)/2));
    for (let k=1; k<=n; k++){ const t=k/n, u=1-t; p.push(u*u*x0 + 2*u*t*X1 + t*t*X2, u*u*y0 + 2*u*t*Y1 + t*t*Y2); }
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y){
    if (!this.cur) this.moveTo(c1x, c1y);
    const p = this.cur, x0 = p[p.length-2], y0 = p[p.length-1], A=[this.X(c1x),this.Y(c1y)], B=[this.X(c2x),this.Y(c2y)], E=[this.X(x),this.Y(y)];
    const n = Math.max(6, Math.ceil(Math.hypot(E[0]-x0, E[1]-y0)/2));
    for (let k=1; k<=n; k++){ const t=k/n, u=1-t; p.push(u*u*u*x0 + 3*u*u*t*A[0] + 3*u*t*t*B[0] + t*t*t*E[0], u*u*u*y0 + 3*u*u*t*A[1] + 3*u*t*t*B[1] + t*t*t*E[1]); }
  }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw){
    const ring = ellipseRing(this.X(x), this.Y(y), rx*this.s, ry*this.s, a0, a1, ccw);
    if (this.cur && this.cur.length > 2 && !this.cur.closed) this.cur.push(...ring);
    else { this.cur = ring; ring.closed = false; this.rings.push(ring); }
  }
  arc(x, y, r, a0, a1, ccw){ this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  rect(x, y, w, h){ this.moveTo(x, y); this.lineTo(x+w, y); this.lineTo(x+w, y+h); this.lineTo(x, y+h); this.closePath(); }
  colour(style){ let c = typeof style === 'number' ? style : rgba(style); if (this.globalAlpha < 1) c = ((Math.round((c>>>24)*this.globalAlpha) << 24) | (c & 0xffffff)) >>> 0; return c; }
  fill(){
    const polys = this.rings.filter(r=>r.length >= 6);
    if (polys.length) fillPolys(this.buf, polys, this.colour(this.fillStyle));
  }
  stroke(){
    const c = this.colour(this.strokeStyle), w = this.lineWidth*this.s;
    for (const r of this.rings){
      if (r.length < 4 && !(r.closed && r.length >= 2)) continue;
      const pts = []; for (let k=0; k<r.length; k+=2) pts.push([r[k], r[k+1]]);
      if (r.closed) pts.push(pts[0]);
      if (w < 1.6){ for (let k=0; k<pts.length-1; k++) line(this.buf, pts[k][0], pts[k][1], pts[k+1][0], pts[k+1][1], c, this.dash); }
      else if (this.dash){
        // thick dashes: walk the line, filling a short thick piece per dash
        const on = this.dash[0], off = this.dash[1]; let carry = 0;
        for (let k=0; k<pts.length-1; k++){
          const [ax,ay] = pts[k], [bx,by] = pts[k+1], L = Math.hypot(bx-ax, by-ay);
          for (let d = -carry; d < L; d += on+off){
            const s0 = Math.max(0, d), s1 = Math.min(L, d+on); if (s1 <= s0) continue;
            fillPolys(this.buf, thickRings([[ax+(bx-ax)*s0/L, ay+(by-ay)*s0/L], [ax+(bx-ax)*s1/L, ay+(by-ay)*s1/L]], w), c);
          }
          carry = (carry + L) % (on+off);
        }
      } else fillPolys(this.buf, thickRings(pts, w), c);
    }
  }
  fillRect(x, y, w, h){ this.beginPath(); this.rect(x, y, w, h); this.fill(); }
  strokeRect(x, y, w, h){ this.beginPath(); this.rect(x, y, w, h); this.stroke(); }
}
