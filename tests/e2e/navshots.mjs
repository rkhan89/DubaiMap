// Step 4 route migration: screenshots of the screens it changes, at 390, light and dark, made-up local data only.
//   node tests/e2e/navshots.mjs <base url> <folder> <prefix>      e.g. the live site as "before", localhost as "after"
import fs from 'fs'; import { pathToFileURL } from 'url';
const puppeteer = (await import(pathToFileURL('C:/Users/rkhan/DubaiMap/tests/e2e/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js').href)).default;
const [,, BASEURL = 'http://localhost:5174/', OUT = 'docs/step4-nav/migrate', PRE = 'after'] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const theme of ['light', 'dark']){
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  const BASE = BASEURL + '?local&still';
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(async (theme) => { localStorage.clear(); const S = await import('/store.js'); S.signIn({ email: 'r@example.test' }); S.updateMe({ handle: 'rahim', name: 'Rahim', onboarded: true }); await S.setDemo(true); S.setFlag('coachDone'); S.setFlag('tourDone'); if (S.setPref) S.setPref('theme', theme); localStorage.setItem('bites-scope', JSON.stringify({ mode: 'crew' })); S.flush(); }, theme);
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(2500);
  await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  const shot = n => p.screenshot({ path: `${OUT}/${PRE}-${n}-${theme}.jpg`, type: 'jpeg', quality: 78 });
  // the map sheet at full
  await p.evaluate(async () => { const css = document.createElement('style'); css.textContent = '.msheet{transition:none !important}'; document.head.appendChild(css);
    const sh = document.querySelector('#mSheet'), g = sh.querySelector('.ms-grab'); let n = 0; while (sh.dataset.stop !== 'full' && n++ < 4) g.click(); });
  await sleep(600); await shot('sheet');
  await p.evaluate(() => { const g = document.querySelector('.ms-grab'), sh = document.querySelector('#mSheet'); let n = 0; while (sh.dataset.stop !== 'peek' && n++ < 4) g.click(); });
  // the Scrapbook tab
  await p.evaluate(() => document.querySelector('#nav [data-tab="shelf"]').click()); await sleep(900); await shot('scrapbook');
  // the You tab
  await p.evaluate(() => document.querySelector('.nav-you').click()); await sleep(900); await shot('you');
  await p.close();
}
await b.close();
console.log('saved', PRE, 'shots to', OUT);
