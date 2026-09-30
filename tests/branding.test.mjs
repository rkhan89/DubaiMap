// node --test tests/branding.test.mjs
// The link-preview tags in index.html must be absolute URLs on APP.siteUrl (config.js),
// and every brand file the app references must exist unchanged in brand-kit/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP } from '../config.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const meta = (attr, name) => (html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]+)"`)) || [])[1];

test('og and twitter images are absolute and on APP.siteUrl', ()=>{
  for (const [attr, name] of [['property','og:image'], ['name','twitter:image'], ['property','og:url']]){
    const v = meta(attr, name);
    assert.ok(v, `${name} missing`);
    assert.ok(v.startsWith(APP.siteUrl + '/'), `${name} (${v}) is not on ${APP.siteUrl}`);
  }
});
test('brand files exist', ()=>{
  for (const f of [APP.brand.wordmark.light, APP.brand.wordmark.dark, APP.brand.pin, 'favicon.svg', 'favicon.ico', 'favicon-32.png',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/icon-monochrome-512.png',
    'icons/apple-touch-icon-180.png', 'social/og-image-1200x630.png'])
    assert.ok(fs.existsSync(new URL('../'+f, import.meta.url)), f+' missing');
});
test('web icons are byte-identical to the brand kit', ()=>{
  for (const f of ['icon-192.png','icon-512.png','icon-maskable-192.png','icon-maskable-512.png','icon-monochrome-512.png','apple-touch-icon-180.png'])
    assert.deepEqual(fs.readFileSync(new URL('../icons/'+f, import.meta.url)), fs.readFileSync(new URL('../brand-kit/icons/'+f, import.meta.url)), f);
});
