// Step 5 (trim and polish): screenshots of the screens it changes, at 390, light and dark, made-up local data only.
//   node tests/e2e/step5shots.mjs <base url> <folder> <prefix>      e.g. the live site as "before", localhost as "after"
import fs from 'fs'; import { pathToFileURL } from 'url';
const puppeteer = (await import(pathToFileURL('C:/Users/rkhan/DubaiMap/tests/e2e/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js').href)).default;
const [,, BASEURL = 'http://localhost:5174/', OUT = 'docs/step5-trim/shots', PRE = 'after'] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = BASEURL + '?local&still';
const page = async theme => {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await p.goto(BASE, { waitUntil: 'networkidle0' }); return p;
};
const full = async (p, path) => {   // the top screen's whole scroll height, as one tall picture
  const h = await p.evaluate(() => { const s = [...document.querySelectorAll('#screens .screen')].pop(); return s ? Math.max(844, Math.min(4000, s.scrollHeight)) : 844; });
  await p.setViewport({ width: 390, height: h, isMobile: true, hasTouch: true }); await sleep(400);
  await p.screenshot({ path, type: 'jpeg', quality: 72 });
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(300);
};
for (const theme of ['light', 'dark']){
  const shot = (p, n) => full(p, `${OUT}/${PRE}-${n}-${theme}.jpg`);
  // first run: every setup screen, by tapping its main button
  let p = await page(theme);
  await p.evaluate(async theme => { localStorage.clear(); const S = await import('/store.js'); S.signIn({ email: 'r@example.test' }); S.updateMe({ onboarded: false }); if (S.setPref) S.setPref('theme', theme); S.flush(); }, theme);
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(1800);
  await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  await p.evaluate(() => { const i = document.querySelector('#hIn'); if (i){ i.value = 'rahim'; i.dispatchEvent(new Event('input')); } }); await sleep(500);
  for (let k = 1; k <= 6; k++){
    const top = await p.evaluate(() => { const s = [...document.querySelectorAll('#screens .screen')].pop(); return s && s.classList.contains('cover') ? (s.querySelector('h1')?.innerText || s.querySelector('.tb-title, h2')?.innerText || '?') : null; });
    console.log(theme, k, top); if (!top) break;
    await shot(p, 'onb' + k);
    const went = await p.evaluate(() => { const s = [...document.querySelectorAll('#screens .screen')].pop(); const btn = s.querySelector('.btn-gold:not([disabled])'); if (!btn) return false; btn.click(); return true; });
    if (!went) break; await sleep(900);
  }
  await p.close();
  // signed in with the sample crew: You, Crew, a place, the Scrapbook shelf, Settings
  p = await page(theme);
  await p.evaluate(async theme => { localStorage.clear(); const S = await import('/store.js'); S.signIn({ email: 'r@example.test' }); S.updateMe({ handle: 'rahim', name: 'Rahim', onboarded: true }); await S.setDemo(true); S.setFlag('coachDone'); S.setFlag('tourDone'); if (S.setPref) S.setPref('theme', theme); localStorage.setItem('bites-scope', JSON.stringify({ mode: 'crew' })); S.flush(); }, theme);
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(2200);
  await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  const open = async (name, fn) => { try{ await p.evaluate(fn); }catch(e){ console.log(name, e.message); } await sleep(1500); await shot(p, name); };
  await open('you', () => document.querySelector('.nav-you').click());
  await open('settings', async () => { const { go } = await import('/go.js'); go.settings(); });
  await open('crew', () => document.querySelector('#nav [data-tab="crew"]').click());
  await open('place', async () => { const S = await import('/store.js'), { go } = await import('/go.js'); go.closeAll && go.closeAll(); go.place(S.venues().find(v => v.name === 'Ravi Restaurant').id); });
  await open('shelf', async () => { const { go } = await import('/go.js'); go.closeAll && go.closeAll(); document.querySelector('#nav [data-tab="shelf"]').click(); });
  await p.close();
}
await b.close();
console.log('saved', PRE, 'shots to', OUT);
