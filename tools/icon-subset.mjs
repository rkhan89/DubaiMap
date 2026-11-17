// Builds the self-hosted icon font: only the Material Symbols Outlined icons the app can show.
//   node tools/icon-subset.mjs           scan the app, write fonts/icons.json and download fonts/material-symbols-subset.woff2
//   node tools/icon-subset.mjs --check   exit 1 if the app uses an icon name that isn't in fonts/icons.json
//
// Icon names are often picked at run time (meals, stickers, privacy cards, toggles…), but every one of them is a
// string literal somewhere in the app's source. So the scan takes every quoted or tag-wrapped word in the app's
// .js and .html files that is a real Material Symbols name (Google's official codepoints list), which is a
// superset of what can render. A few extra icons cost a few bytes; a missing one would show its name as text.
// tests/icons.test.mjs runs --check; tests/e2e/icons.mjs checks every icon actually rendered on screen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST = path.join(ROOT, 'fonts', 'icons.json');
const FONT = path.join(ROOT, 'fonts', 'material-symbols-subset.woff2');
const CODEPOINTS = 'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';
// the same axes index.html asked Google Fonts for, so icons render exactly as before
const AXES = 'opsz,wght,FILL,GRAD@20..48,300..600,0..1,0';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

// the words in the app that could be icon names (checked against the real list when building)
export function scanWords(root = ROOT){
  const words = new Set();
  for (const f of fs.readdirSync(root)){
    if (!/\.(js|html)$/.test(f)) continue;
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of s.matchAll(/['"`>]([a-z][a-z0-9_]{1,40})['"`<]/g)) words.add(m[1]);
  }
  return words;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  if (process.argv.includes('--check')){
    const have = new Set(JSON.parse(fs.readFileSync(LIST, 'utf8')).all);
    const known = new Set(JSON.parse(fs.readFileSync(LIST, 'utf8')).names);
    const missing = [...scanWords()].filter(w => have.has(w) && !known.has(w));
    if (missing.length){ console.error('Icons used but not in the subset: ' + missing.join(', ') + '\nRun: node tools/icon-subset.mjs'); process.exit(1); }
    console.log('icon subset covers every icon name in the app (' + known.size + ')');
  } else {
    const all = (await (await fetch(CODEPOINTS)).text()).split('\n').map(l => l.split(' ')[0]).filter(Boolean);
    const allSet = new Set(all);
    const names = [...scanWords()].filter(w => allSet.has(w)).sort();
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:${AXES}&icon_names=${names.join(',')}&display=block`, { headers: { 'User-Agent': UA } })).text();
    const url = (css.match(/url\((https:[^)]+)\)/) || [])[1];
    if (!url) throw new Error('No font URL in the Google Fonts answer:\n' + css.slice(0, 400));
    const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    fs.mkdirSync(path.dirname(FONT), { recursive: true });
    fs.writeFileSync(FONT, buf);
    // `all` is the official list, kept so --check works offline (it decides what counts as an icon name)
    fs.writeFileSync(LIST, JSON.stringify({ axes: AXES, names, all }, null, 0) + '\n');
    console.log(`${names.length} icons, ${Math.round(buf.length / 1024)} KB -> fonts/material-symbols-subset.woff2`);
  }
}
