// Local dev server: the static app, /share (as on Vercel) and the /api functions.
//   node dev/server.mjs [--port 5174] [--dev-no-auth] [--headers]
// --headers sends vercel.json's security headers (CSP etc.) to check nothing gets blocked.
// --dev-no-auth lets the resolver run for the app's ?local mode (no Supabase session). Local only.
// Keys come from the environment (GOOGLE_PLACES_API_KEY, ANTHROPIC_API_KEY); never commit them.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PORT = +(args[args.indexOf('--port')+1] || 0) || 5174;
if (args.includes('--dev-no-auth')) process.env.SHARE_DEV_NO_AUTH = '1';
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.txt':'text/plain' };
const rewrites = { '/share':'/index.html', '/terms':'/terms.html', '/privacy':'/privacy.html', '/data':'/data.html' };
// production's security headers (http on localhost, so no upgrade-insecure-requests)
const SEC = args.includes('--headers') ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8')).headers
  .find(h=>h.source==='/(.*)').headers.map(h=>[h.key, h.value.replace(/;s*upgrade-insecure-requests/,'')])) : {};

http.createServer(async (req, res)=>{
  const url = new URL(req.url, 'http://localhost');
  try{
    if (url.pathname === '/share-target') url.pathname = '/api/share-target';   // as vercel.json rewrites it
    if (url.pathname.startsWith('/api/')){
      const file = path.join(ROOT, url.pathname.replace(/\/$/,'') + '.js');
      if (!file.startsWith(path.join(ROOT,'api')) || !fs.existsSync(file)){ res.writeHead(404); return res.end(); }
      const mod = await import(pathToFileURL(file).href + '?t=' + fs.statSync(file).mtimeMs);
      const handler = mod[req.method];
      if (!handler){ res.writeHead(405); return res.end(); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const request = new Request(url.href, { method:req.method, headers:req.headers, body: ['GET','HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const out = await handler(request);
      res.writeHead(out.status, { ...SEC, ...Object.fromEntries(out.headers) }); return res.end(Buffer.from(await out.arrayBuffer()));
    }
    let p = rewrites[url.pathname] || decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { ...SEC, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    fs.createReadStream(file).pipe(res);
  }catch(e){ console.error(e); res.writeHead(500); res.end('error'); }
}).listen(PORT, ()=>console.log(`Koko dev server on http://localhost:${PORT}${process.env.SHARE_DEV_NO_AUTH?' (dev auth bypass)':''}`));
