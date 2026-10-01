// POST /share-target: Android's Share menu, for the moments the service worker isn't running yet
// (first open, or just after an update). Normally sw.js answers this on the phone and the server
// never sees it. Here the shared text comes in the request body (bodies aren't logged), goes back
// inside the page, and /share-landing.js stores it on the phone and opens the app. Nothing is kept
// or logged on the server, and where it goes next never depends on what was shared.
const MAX = 6000;
const str = v => typeof v === 'string' ? v.slice(0, 2000) : '';
const attr = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export async function POST(request){
  let item = { title:'', text:'', url:'' };
  try{
    if (+(request.headers.get('content-length')||0) <= MAX){
      const raw = (await request.text()).slice(0, MAX);
      const f = new URLSearchParams(raw);
      item = { title:str(f.get('title')), text:str(f.get('text')), url:str(f.get('url')) };
    }
  }catch(_){}
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Koko</title></head>'
    + '<body style="background:#fff8f5;font-family:system-ui,sans-serif;color:#291709;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">'
    + '<p>Opening Koko…</p><div id="share-data" hidden data-share="' + attr(JSON.stringify(item)) + '"></div>'
    + '<script type="module" src="/share-landing.js"></script></body></html>';
  return new Response(html, { status:200, headers:{ 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' } });
}
// nothing to do for a plain visit
export function GET(){ return new Response(null, { status:303, headers:{ Location:'/' } }); }
