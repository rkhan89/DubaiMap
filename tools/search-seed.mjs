// Makes search-data.js (the areas and search synonyms the app ships with, for offline and before the first sync)
// and the seed rows in supabase/migrations/0013_search.sql from one list. The areas are the map's own zones; the
// aliases are only the ones agreed (ALIASES below); also_matches starts empty everywhere.
//   node tools/search-seed.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(new URL('../map.js', import.meta.url));

// agreed aliases (the brief); every area's own name matches too
export const ALIASES = {
  marina:['marina', 'dubai marina', 'marina walk'],
  jbr:['jbr', 'jumeirah beach residence', 'the walk'],
  jlt:['jlt', 'jumeirah lakes towers'],
  downtown:['downtown', 'burj khalifa area', 'dubai mall'],
  palm:['palm', 'the palm'],
};
// synonym groups: any term finds the others
export const SYNONYMS = [
  ['ice cream', 'gelato', 'soft serve', 'icecream'],
  ['coffee', 'latte', 'flat white', 'cappuccino', 'espresso', 'americano', 'cortado'],
  ['karak', 'chai', 'karak chai'],
  ['burger', 'burgers', 'smash burger'],
  ['pizza', 'pizzas'],
  ['pasta', 'spaghetti', 'penne', 'linguine', 'carbonara', 'ravioli'],
  ['shawarma', 'shawerma', 'shwarma'],
  ['biryani', 'biriyani', 'briyani'],
  ['sushi', 'sashimi', 'maki'],
  ['dessert', 'desserts', 'sweets', 'cake', 'pastry'],
  ['breakfast', 'brekkie', 'eggs'],
  ['brunch'],
  ['steak', 'steakhouse', 'ribeye'],
  ['seafood', 'fish', 'prawns', 'shrimp'],
  ['falafel'],
];
const areas = M.ZONES.map(z=>({ id:z.id, name:z.label, aliases:ALIASES[z.id] || [], also_matches:[], zone_id:z.id, lat:+z.lat.toFixed(5), lng:+z.lng.toFixed(5), radius_km:3 }));
fs.writeFileSync(path.join(root, 'search-data.js'), `// What search ships with (made by tools/search-seed.mjs; the same rows seed 0013_search.sql). Once signed in the
// app reads the areas and search_synonyms tables instead, so aliases, neighbours (also_matches) and synonyms are
// edited there without a code change.
//   area: a map zone; a place is in the nearest area whose centre is within radius_km, else in none (reported)
export const AREAS = ${JSON.stringify(areas)};
export const SYNONYMS = ${JSON.stringify(SYNONYMS)};
// the dish suggestions after your own tags
export const DISH_SEED = ['pasta','pizza','burger','ice cream','coffee','shawarma','biryani','sushi','brunch','steak','dessert','karak','falafel','seafood','breakfast'];
`);
const q = s=>"'" + String(s).replace(/'/g, "''") + "'", arr = a=>'array[' + a.map(q).join(',') + ']::text[]';
const rows = areas.map(a=>`  (${q(a.id)}, ${q(a.name)}, ${arr(a.aliases)}, ${a.zone_id ? q(a.zone_id) : 'null'}, ${a.lat}, ${a.lng})`).join(',\n');
const syn = SYNONYMS.map((g, k)=>`  (${k+1}, ${arr(g)})`).join(',\n');
const sqlFile = path.join(root, 'supabase/migrations/0013_search.sql');
let sql = fs.readFileSync(sqlFile, 'utf8');
sql = sql.replace(/-- AREAS SEED START[\s\S]*?-- AREAS SEED END/, `-- AREAS SEED START (tools/search-seed.mjs)\ninsert into public.areas (id, name, aliases, zone_id, lat, lng) values\n${rows}\non conflict (id) do nothing;\n-- AREAS SEED END`)
         .replace(/-- SYNONYMS SEED START[\s\S]*?-- SYNONYMS SEED END/, `-- SYNONYMS SEED START (tools/search-seed.mjs)\ninsert into public.search_synonyms (id, terms) values\n${syn}\non conflict (id) do nothing;\n-- SYNONYMS SEED END`);
fs.writeFileSync(sqlFile, sql);
console.log(areas.length, 'areas,', areas.filter(a=>a.aliases.length).length, 'with aliases;', SYNONYMS.length, 'synonym groups');
