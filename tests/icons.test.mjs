// The self-hosted icon font holds only the icons the app uses (tools/icon-subset.mjs). Fail if the source uses an
// icon name the subset doesn't have: it would render as its name in plain text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scanWords } from '../tools/icon-subset.mjs';

const { names, all } = JSON.parse(fs.readFileSync(new URL('../fonts/icons.json', import.meta.url), 'utf8'));

test('every icon name in the app is in the subset font', ()=>{
  const official = new Set(all), have = new Set(names);
  const missing = [...scanWords()].filter(w => official.has(w) && !have.has(w));
  assert.deepEqual(missing, [], 'run: node tools/icon-subset.mjs');
});

test('the subset font and the stylesheet are in place', ()=>{
  assert.ok(fs.statSync(new URL('../fonts/material-symbols-subset.woff2', import.meta.url)).size > 10000);
  const css = fs.readFileSync(new URL('../fonts/fonts.css', import.meta.url), 'utf8');
  assert.match(css, /font-family: 'Material Symbols Outlined';[\s\S]*material-symbols-subset\.woff2/);
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/fonts\.googleapis\.com/.test(index), 'index.html should not load Google Fonts any more');
});
