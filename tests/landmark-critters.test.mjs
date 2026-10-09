// node --test tests/
// The landmark critters (bonus tier): 13, each joined to a landmark that exists, radii as data (3000 m for the two
// offshore terrains), the stickers at 5, 10 and 13, and no trace of tower_swift (the Burj's critter is the Steppe Eagle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
const LC = await import('../landmark-critters.js');
const { factsFor } = await import('../landmark-facts.js');
const L = await import('../landmarks.js');
const { critterById, CRITTERS } = await import('../critters.js');

test('13 landmark critters, each at a landmark with a card, sprites and its radius as data', ()=>{
  assert.equal(LC.LANDMARK_CRITTERS.length, 13);
  assert.equal(new Set(LC.LANDMARK_CRITTERS.map(c=>c.landmarkId)).size, 13, 'one per landmark');
  for (const c of LC.LANDMARK_CRITTERS){
    assert.ok(L.landmarkById(c.landmarkId) && factsFor(c.landmarkId), c.id + ': no landmark ' + c.landmarkId);
    assert.ok(Number.isFinite(c.radiusM) && c.radiusM > 0, c.id + ' radius');
    assert.ok(fs.existsSync(new URL(`../critters/${c.id}.png`, import.meta.url)) && fs.existsSync(new URL(`../critters/locked/${c.id}.png`, import.meta.url)), c.id + ' sprites');
    assert.equal(critterById(c.id), c);
    assert.equal(L.landmarkCritter(c.landmarkId), c);
  }
  for (const id of ['the_world_islands', 'palm_jebel_ali']){ const c = LC.landmarkCritterOf(id); assert.equal(c.radiusM, 3000); assert.equal(LC.accuracyFor(c), 500); }
  assert.equal(LC.accuracyFor(LC.landmarkCritterOf('burj_khalifa')), 100);
  assert.equal(LC.landmarkCritterOf('burj_khalifa').id, 'steppe_eagle');
  assert.equal(LC.SHOW_LOCKED_LANDMARK_CRITTERS, false);
  assert.equal(CRITTERS.length, 12, 'the street critters are untouched');
});

test('stickers for 5, 10 and all 13 landmark critters; no points, scores or leaderboard', async ()=>{
  const src = fs.readFileSync(new URL('../badges.js', import.meta.url), 'utf8');
  for (const id of ['lmk5', 'lmk10', 'lmk13']) assert.match(src, new RegExp(`id:'${id}'`));
  const card = fs.readFileSync(new URL('../landmarkui.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../landmark-critters.js', import.meta.url), 'utf8');
  const code = card.split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');   // (comments may say there are none)
  assert.ok(!/\bpoints?\b|\bscore|leaderboard/i.test(code));
});

test('no tower_swift anywhere in the app, its data or its assets', ()=>{
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), hits = [];
  const walk = d=>{ for (const f of fs.readdirSync(d, { withFileTypes:true })){
    if (['node_modules', '.git', 'shots', 'tests'].includes(f.name)) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/tower_swift/.test(f.name) || (/\.(js|mjs|json|sql|md|html|css)$/.test(f.name) && fs.readFileSync(p, 'utf8').includes('tower_swift'))) hits.push(p);
  } };
  walk(root);
  assert.deepEqual(hits, []);
});
