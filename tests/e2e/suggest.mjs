// Suggested details on the place page (0022 + suggest.js), with a stand-in for the server: rows show grouped by
// field, Confirm writes the value to the place, Not right drops it, and a field the place has is never suggested.
//   node tests/e2e/suggest.mjs [base url] [screenshot folder]   (default http://localhost:5174/)
import fs from 'fs'; import { pathToFileURL } from 'url';
const puppeteer = (await import(pathToFileURL('C:/Users/rkhan/DubaiMap/tests/e2e/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js').href)).default;
const [,, BASEURL='http://localhost:5174/', OUT=''] = process.argv;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e=>errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = BASEURL + '?local&still';
await p.goto(BASE, { waitUntil: 'networkidle0' });
await p.evaluate(async () => { localStorage.clear(); const S = await import('/store.js'); S.signIn({ email: 'r@example.test' }); S.updateMe({ handle: 'rahim', name: 'Rahim', onboarded: true }); await S.setDemo(true); S.setFlag('coachDone'); S.flush(); });
await p.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(1500);
const res = []; const ok = (name, cond, info) => { res.push((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const shot = async (n) => { if (OUT){ fs.mkdirSync(OUT, { recursive:true }); await p.screenshot({ path: `${OUT}/${n}.jpg`, quality: 80 }); } };

// a sample place with no contact details, and a stand-in server holding suggestions for it
const vid = await p.evaluate(async () => {
  const S = await import('/store.js'), SG = await import('/suggest.js'), { go } = await import('/go.js');
  const v = S.venues().find(x => !x.phone && !x.website && !x.instagram);
  window.__decided = [];
  let rows = [
    { id:1, field:'phone', value:'+97145662262', source:'seed', source_url:null, confidence:0.99 },
    { id:2, field:'phone', value:'+971 4 566 2262', source:'web', source_url:'https://thebanc.example/contact', confidence:0.8 },
    { id:3, field:'instagram', value:'thebanc.dubai', source:'web', source_url:'https://thebanc.example', confidence:0.8 },
    { id:4, field:'address', value:'Renaissance Hotel - 188 Marasi Dr, Dubai', source:'seed', source_url:null, confidence:0.77 },
    { id:5, field:'website', value:'http://thebanc.example', source:'seed', source_url:null, confidence:0.77 },
  ];
  if (v.address) rows = rows.filter(r => r.field !== 'address');
  SG.useSource({ list: async () => rows.slice(), decide: async (id, ok) => {
    window.__decided.push([id, ok]); const r = rows.find(x => x.id === id);
    rows = rows.filter(x => !(x.id === id || (ok && x.field === r.field)));
    return ok ? { state:'confirmed', field:r.field, value:r.value } : { state:'rejected' };
  } });
  go.place(v.id);
  return v.id;
});
await sleep(900);
const rowsNow = () => p.evaluate(() => [...document.querySelectorAll('.place-screen .sugg-row')].map(r => ({ f: r.dataset.sg, t: r.querySelector('.sugg-v').textContent, src: r.querySelector('.sugg-src').textContent })));
let r = await rowsNow();
ok('suggestions show on the place page', r.length >= 3, r.map(x => x.f));
const ph = r.find(x => x.f === 'phone');
ok('the phone from two sources is one row, naming both', ph && /listing and their website \(thebanc\.example\)/.test(ph.src), ph && ph.src);
ok('the phone shows its readable copy', ph && ph.t === '+971 4 566 2262', ph && ph.t);
ok('Instagram shows as @handle', r.find(x => x.f === 'instagram')?.t === '@thebanc.dubai');
const sizes = await p.evaluate(() => [...document.querySelectorAll('.sugg-act .btn')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }));
ok('every button is at least 44 px tall', sizes.every(([w, h]) => h >= 44 && w >= 44), sizes);
const overflow = await p.evaluate(() => document.querySelector('.place-screen').scrollWidth > document.querySelector('.place-screen').clientWidth + 1);
ok('no sideways scroll at 390', !overflow);
await p.emulateMediaFeatures([{ name:'prefers-color-scheme', value:'light' }]);
await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.querySelector('.sugg')?.scrollIntoView({ block:'center' }); }); await sleep(300);
await shot('suggest-light');

// Confirm the phone
await p.click('[data-sg-ok="phone"]'); await sleep(600);
const after = await p.evaluate((id) => import('/store.js').then(S => { const v = S.venue(id); return { phone: v.phone, src: (v.fieldSources||{}).phone }; }), vid);
ok('Confirm writes the phone to the place, marked as confirmed by a person', after.phone === '+971 4 566 2262' && after.src === 'user', after);
r = await rowsNow();
ok('the phone row is gone; the place shows a Call row', !r.some(x => x.f === 'phone') && await p.evaluate(() => /Call/.test(document.querySelector('.place-screen .contact-list')?.textContent || '')));

// Not right on Instagram
await p.click('[data-sg-no="instagram"]'); await sleep(600);
r = await rowsNow();
const decided = await p.evaluate(() => window.__decided);
ok('Not right drops the Instagram suggestion', !r.some(x => x.f === 'instagram'), r.map(x => x.f));
ok('decisions sent: confirm the readable phone copy (2), reject 3', JSON.stringify(decided) === JSON.stringify([[2, true], [3, false]]), decided);

// dark
await p.emulateMediaFeatures([{ name:'prefers-color-scheme', value:'dark' }]); await sleep(300);
await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.querySelector('.sugg')?.scrollIntoView({ block:'center' }); }); await sleep(300);
await shot('suggest-dark');
ok('no page errors', errs.length === 0, errs.slice(0, 3));
console.log(res.join('\n'));
await b.close();
process.exit(res.some(l => l.startsWith('FAIL')) ? 1 : 0);
