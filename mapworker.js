// The map's pixel renderer, off the main thread. map.js asks for the overviews and for chunks in
// priority order (what's on screen first); each comes back as an ImageBitmap (or raw pixels if this
// browser can't make bitmaps in a worker). A new list replaces the old one, so panning re-prioritises.
import { prepare, renderRect, renderChunk, setNight, artSize, chunkGrid, CH, S } from './mapraster.js';

let theme = null, queue = [], busy = false;

async function send(kind, extra, buf, w, h){
  const px = new Uint8ClampedArray(buf.data.buffer);
  if (typeof createImageBitmap === 'function'){
    try {
      const bmp = await createImageBitmap(new ImageData(px, w, h));
      postMessage({ kind, ...extra, bmp }, [bmp]);
      return;
    } catch(e){ /* fall through to raw pixels */ }
  }
  postMessage({ kind, ...extra, w, h, px }, [px.buffer]);
}
function pump(){
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  const t0 = performance.now(), th = theme;   // a theme change can arrive while a result is being sent
  (async ()=>{
    try {
      if (job.kind === 'overview'){
        const a = artSize(job.s), buf = renderRect(0, 0, a.w, a.h, job.s);
        await send('overview', { theme:th, s:job.s, ms:Math.round(performance.now()-t0) }, buf, a.w, a.h);
      } else {
        await send('chunk', { theme:th, cx:job.cx, cy:job.cy, ms:Math.round(performance.now()-t0) }, renderChunk(job.cx, job.cy), CH, CH);
      }
    } catch(e){ postMessage({ kind:'error', message:String(e && e.stack || e) }); }
    busy = false;
    setTimeout(pump, 0);   // let a newer request list in between jobs
  })();
}
onmessage = e=>{
  const m = e.data;
  if (m.type === 'init' || m.type === 'theme'){
    if (m.night !== theme){ theme = m.night; setNight(theme === 'night'); }
    if (m.type === 'init'){ const t0 = performance.now(); prepare(); postMessage({ kind:'ready', theme, grid:chunkGrid(), art:artSize(), CH, S, ms:Math.round(performance.now()-t0) }); }
    queue = [];
  } else if (m.type === 'want'){
    // [{kind:'overview', s}, {kind:'chunk', cx, cy}, …] in priority order (map.js only asks for what it hasn't got)
    queue = m.list.slice();
    pump();
  }
};
