// Step 4 spike checks for the map sheet (?nav=sheet), with real touch input so touch-action applies.
//   node tests/e2e/sheet-spike.mjs [base url] [screenshot folder]   (default http://localhost:5174/; not part of CI yet)
import fs from 'fs'; import { pathToFileURL } from 'url';
const puppeteer = (await import(pathToFileURL('C:/Users/rkhan/DubaiMap/tests/e2e/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js').href)).default;
const [,, BASEURL='http://localhost:5174/', OUT=''] = process.argv;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = BASEURL + '?local&still&nav=sheet';
await p.goto(BASE, { waitUntil: 'networkidle0' });
await p.evaluate(async () => { localStorage.clear(); localStorage.setItem('koko-nav','sheet'); const S = await import('/store.js'); S.signIn({ email: 'r@example.test' }); S.updateMe({ handle: 'rahim', name: 'Rahim', onboarded: true }); await S.setDemo(true); S.setFlag('coachDone'); localStorage.setItem('bites-scope', JSON.stringify({ mode:'crew' })); S.flush(); });
await p.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(2200);
const res = []; const ok = (name, cond, info) => { res.push((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const st = () => p.evaluate(() => ({ stop: document.querySelector('#mSheet')?.dataset.stop, top: Math.round(document.querySelector('#mSheet')?.getBoundingClientRect().top), scroll: document.querySelector('#mSheet .ms-body')?.scrollTop, hist: history.length }));
const centre = () => p.evaluate(async () => { const M = await import('/map.js'); const c = M.centerLatLng ? M.centerLatLng() : null; return c ? [+c.lat.toFixed(5), +c.lng.toFixed(5)] : null; });
const swipe = async (x, y0, y1, ms = 250, steps = 12) => { await p.touchscreen.touchStart(x, y0); for (let i = 1; i <= steps; i++){ await p.touchscreen.touchMove(x, y0 + (y1 - y0) * i / steps); await sleep(ms / steps); } await p.touchscreen.touchEnd(); await sleep(500); };
const shot = async n => { if (OUT) await p.screenshot({ path: `${OUT}/${n}.jpg`, type:'jpeg', quality:80 }); };

let s = await st(); ok('starts at peek, List tab gone', s.stop === 'peek' && await p.evaluate(() => getComputedStyle(document.querySelector('#nav [data-tab="list"]')).display === 'none'), s);
await shot('spike-peek');
let c0 = await centre();
await swipe(195, s.top + 12, s.top - 330, 300);            // drag the grabber up, slowly
s = await st(); let c1 = await centre();
ok('dragging the sheet up lands on half', s.stop === 'half', s); ok('…and the map did not move', JSON.stringify(c0) === JSON.stringify(c1), { c0, c1 });
await shot('spike-half');
await swipe(195, 300, 160, 250);                          // pan the map above the sheet
let c2 = await centre(); ok('the map still pans above the sheet', JSON.stringify(c2) !== JSON.stringify(c1), { c1, c2 });
s = await st(); ok('…and panning the map lowered the sheet to peek', s.stop === 'peek', s);
// flick up twice to full
s = await st(); await swipe(195, s.top + 12, s.top - 200, 90, 5); s = await st(); await swipe(195, s.top + 12, s.top - 200, 90, 5);
s = await st(); ok('flicks step up to full', s.stop === 'full', s);
await shot('spike-full');
// at full, an upward swipe on the list scrolls it
await swipe(195, 700, 300, 300); s = await st(); ok('at full, the list scrolls', s.stop === 'full' && s.scroll > 100, s);
// a downward swipe while scrolled scrolls back, not drags
await swipe(195, 300, 700, 300); s = await st(); ok('pulling down while scrolled scrolls the list (sheet stays full)', s.stop === 'full', s);
await p.evaluate(() => { document.querySelector('#mSheet .ms-body').scrollTop = 0; document.querySelector('#mSheet .ms-body').dispatchEvent(new Event('scroll')); }); await sleep(200);
await swipe(195, 260, 640, 300); s = await st(); ok('at the top, pulling down the list brings the sheet down', s.stop !== 'full', s);
// Android back lowers it, and doesn't leave the app
s = await st(); await swipe(195, s.top + 12, s.top - 330, 300); s = await st();
const before = s.stop; await p.evaluate(() => history.back()); await sleep(700); s = await st();
ok('back lowers the sheet to peek', before !== 'peek' && s.stop === 'peek', { before, after: s.stop });
ok('…and the app is still here', await p.evaluate(() => !!document.querySelector('#mSheet') && location.pathname === '/'));
// a pin tap lowers it and shows the place card on top
s = await st(); await swipe(195, s.top + 12, s.top - 330, 300);
await p.evaluate(async () => { const S = await import('/store.js'), { go } = await import('/go.js'); go.showOnMap(S.venues().find(v=>v.name==='Ravi Restaurant').id); }); await sleep(1600);
s = await st(); ok('showing a place lowers the sheet', s.stop === 'peek', s);
await shot('spike-place');
// overscroll: what the browser is told (real Safari behaviour needs a phone)
const css = await p.evaluate(() => ({ body: getComputedStyle(document.querySelector('#mSheet .ms-body')).overscrollBehaviorY, sheet: getComputedStyle(document.querySelector('#mSheet')).touchAction, page: getComputedStyle(document.documentElement).overscrollBehaviorY, bodyEl: getComputedStyle(document.body).overscrollBehaviorY }));
ok('list contains its overscroll; the sheet takes its own touches', css.body === 'contain' && css.sheet === 'none', css);
// layout B at 360: Map · Crew · + · Scrapbook · You, targets 44+, labels don't touch, the sheet clears the +
await p.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true }); await sleep(600);
const bar = await p.evaluate(() => {
  const btns = [...document.querySelectorAll('#nav > button')].filter(b => getComputedStyle(b).display !== 'none');
  const labs = btns.map(b => { const l = b.querySelector('span:last-child'); const r = l.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
  return { order: btns.map(b => b.id === 'navLog' ? '+' : b.textContent.replace(/^(map|group|auto_stories)/, '').trim()),
    small: btns.map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).length,
    gaps: btns.slice(1).map((b, i) => btns[i + 1].id === 'navLog' || btns[i].id === 'navLog' ? 99 : labs[i + 1][0] - labs[i][1]),
    header: document.querySelector('.app-header').hidden,
    youFace: !!document.querySelector('.nav-you .you-face .av'), youRing: getComputedStyle(document.querySelector('.nav-you')).getPropertyValue('--you-c').trim() };
});
ok('layout B: Map, Crew, +, Scrapbook, You; no header', bar.order.join() === 'Map,Crew,+,Scrapbook,You' && bar.header, bar);
ok('at 360 every target is 44+ and labels keep 8px apart', bar.small === 0 && Math.min(...bar.gaps) >= 8, bar.gaps);
ok('You is your face in your pin colour', bar.youFace && /^#/.test(bar.youRing), bar.youRing);
const heights = await p.evaluate(async () => {
  const sh = document.querySelector('#mSheet'), g = sh.querySelector('.ms-grab'), plus = document.querySelector('#navLog').getBoundingClientRect().top, out = [];
  const css = document.createElement('style'); css.textContent = '.msheet{transition:none !important}'; document.head.appendChild(css);
  let n = 0; while (sh.dataset.stop !== 'peek' && n++ < 3) g.click();
  for (let k = 0; k < 3; k++) { if (k) g.click(); await new Promise(r => setTimeout(r, 80)); out.push([sh.dataset.stop, Math.round(plus - sh.querySelector('.ms-body').getBoundingClientRect().bottom)]); }
  g.click(); css.remove(); return out;
});
ok('the sheet content clears the + at every height', heights.length === 3 && heights.every(h => h[1] >= 0), heights);
await shot('layoutb-360');
const you = await p.evaluate(async () => {
  document.querySelector('.nav-you').click(); await new Promise(r => setTimeout(r, 900));
  const scr = [...document.querySelectorAll('#screens .screen')].pop();
  const out = { tab: scr && scr.dataset.tab, back: !!(scr && scr.querySelector('[data-act="back"]')), current: document.querySelector('.nav-you').getAttribute('aria-current'), title: scr && scr.querySelector('h1').innerText };
  document.querySelector('#nav [data-tab="map"]').click(); await new Promise(r => setTimeout(r, 600));
  out.mapAgain = document.querySelector('#nav [data-tab="map"]').getAttribute('aria-current'); return out;
});
ok('You is a tab: your profile, no back arrow, You marked current; Map takes you back', you.tab === 'you' && !you.back && you.current === 'page' && you.title === 'Your profile' && you.mapAgain === 'page', you);
ok('no page errors', errs.length === 0, errs.slice(0, 3));
console.log(res.join('\n'));
await b.close();
