// Turns an Overture extract (tools/overture-extract.py) into the rows tools/overture-import.py loads into
// place_seed: only places on Koko's map, in the kinds of place people log (KEEP_TOP below), still open, with
// the fields tidied (one address line, one phone, the place's own website, its Instagram handle, other socials).
//   node tools/overture-prep.mjs <extract.ndjson> <release> [out.ndjson] [--sample dev/place-seed-sample.json]
// --sample also writes a small fixture (food places only) the dev server answers with in ?local mode.
//
// Data from Overture Maps Foundation, Places theme (https://overturemaps.org/attribution). Every row keeps its
// sources and licences, so attribution stays correct per row.
import fs from 'node:fs';
import { toAI, inMap, nearestZone } from '../map.js';
import { cleanWebsite, instagramFrom, cleanPhone, addressLine } from '../placefields.js';

const [inFile, release, outArg] = process.argv.slice(2).filter(a=>!a.startsWith('--'));
const sampleAt = process.argv.indexOf('--sample');
const sampleFile = sampleAt > 0 ? process.argv[sampleAt + 1] : null;
if (!inFile || !release) { console.error('usage: node tools/overture-prep.mjs <extract.ndjson> <release> [out.ndjson]'); process.exit(1); }
const outFile = outArg || inFile.replace(/\.ndjson$/, '') + '.seed.ndjson';

// top-level taxonomy kept (an easy list to change): the places people eat, drink and hang out, plus where they
// sit (malls, hotels, attractions). Offices, clinics, schools and government buildings are left out.
export const KEEP_TOP = ['food_and_drink', 'shopping', 'lodging', 'arts_and_entertainment', 'sports_and_recreation',
  'cultural_and_historic', 'travel_and_transportation', 'lifestyle_services', null];

const stats = { read:0, kept:0, offMap:0, closed:0, category:0, address:0, phone:0, website:0, instagram:0, social:0 };
const out = fs.createWriteStream(outFile, 'utf8');
const sample = [];
// split on newlines only: some addresses carry a bare carriage return inside the text
for (const line of fs.readFileSync(inFile, 'utf8').split(String.fromCharCode(10))){
  if (!line.trim()) continue;
  const r = JSON.parse(line); stats.read++;
  if (r.lat == null || r.lng == null || !r.name) continue;
  const ai = toAI(r.lat, r.lng);
  if (!inMap(ai.a, ai.i)) { stats.offMap++; continue; }
  if (r.operating_status === 'permanently_closed') { stats.closed++; continue; }
  const top = (r.taxonomy_hierarchy || [])[0] ?? null;
  if (!KEEP_TOP.includes(top)) { stats.category++; continue; }
  const links = [...(r.websites || []), ...(r.socials || [])];
  const instagram = links.map(instagramFrom).find(Boolean) || null;
  const website = (r.websites || []).map(cleanWebsite).find(Boolean) || null;
  // other socials: everything that isn't the website or Instagram, as https URLs
  const socials = [...new Set(links.filter(u=>/^https?:\/\//i.test(u) && !instagramFrom(u) && cleanWebsite(u) !== website)
    .filter(u=>/facebook\.com|tiktok\.com|twitter\.com|x\.com|snapchat\.com|youtube\.com|linkedin\.com|wa\.me|whatsapp/i.test(u))
    .map(u=>u.replace(/^http:/i, 'https:')))].slice(0, 6);
  const licenses = [...new Set((r.sources || []).map(s=>s.license).filter(Boolean))];
  const row = {
    id: 'overture:' + r.id, source: 'overture', source_id: r.id, release,
    name: String(r.name).trim().slice(0, 120), address: addressLine(r.addresses), lat: +r.lat.toFixed(7), lng: +r.lng.toFixed(7),
    zone: nearestZone(ai.a, ai.i).id,
    phone: (r.phones || []).map(cleanPhone).find(Boolean) || null, website, instagram, socials,
    basic_category: r.basic_category || null, taxonomy_primary: r.taxonomy_primary || null, taxonomy_hierarchy: r.taxonomy_hierarchy || [],
    confidence: r.confidence == null ? null : +(+r.confidence).toFixed(3), brand: r.brand || null,
    licenses, sources: (r.sources || []).map(s=>({ dataset:s.dataset, license:s.license, record_id:s.record_id, property:s.property || '' })),
  };
  stats.kept++;
  if (row.address) stats.address++; if (row.phone) stats.phone++; if (row.website) stats.website++;
  if (row.instagram) stats.instagram++; if (row.socials.length || row.instagram) stats.social++;
  out.write(JSON.stringify(row) + '\n');
  if (sampleFile && top === 'food_and_drink' && (row.confidence ?? 0) >= 0.9 && row.phone && sample.length < 4000) sample.push(row);
}
out.end();
await new Promise(r=>out.on('finish', r));
if (sampleFile){
  // a small, varied fixture: the first 600 well-filled food places, thinned evenly
  const step = Math.max(1, Math.floor(sample.length / 600));
  fs.writeFileSync(sampleFile, JSON.stringify(sample.filter((_, k)=>k % step === 0).slice(0, 600)));
}
console.log(JSON.stringify({ release, out: outFile, ...stats }, null, 1));
