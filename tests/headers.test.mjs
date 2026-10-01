// node --test tests/headers.test.mjs
// The live site's security headers (vercel.json) must match the page: the theme script in
// index.html is allowed by its hash, so editing it without updating the hash would break the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const conf = JSON.parse(fs.readFileSync(new URL('vercel.json', root), 'utf8'));
const all = conf.headers.find(h=>h.source==='/(.*)').headers;
const header = k => (all.find(h=>h.key.toLowerCase()===k.toLowerCase())||{}).value || '';

test('every inline script in index.html is allowed by its hash', ()=>{
  const csp = header('Content-Security-Policy');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts){
    const h = "'sha256-" + crypto.createHash('sha256').update(s).digest('base64') + "'";
    assert.ok(csp.includes(h), 'index.html inline script changed: put '+h+' in vercel.json script-src');
  }
});
test('the security headers are all there', ()=>{
  for (const k of ['Content-Security-Policy','Strict-Transport-Security','X-Frame-Options','X-Content-Type-Options','Referrer-Policy','Permissions-Policy'])
    assert.ok(header(k), k+' missing');
  const csp = header('Content-Security-Policy');
  assert.ok(!/unsafe-eval/.test(csp), 'no unsafe-eval');
  assert.ok(/frame-ancestors 'none'/.test(csp));
  assert.ok(/object-src 'none'/.test(csp));
});
test('the Supabase library is pinned to an exact version', ()=>{
  const cloud = fs.readFileSync(new URL('cloud.js', root), 'utf8');
  assert.match(cloud, /supabase-js@\d+\.\d+\.\d+\//);
});
