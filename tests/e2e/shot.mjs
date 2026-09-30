// Screenshot harness: node shot.mjs <scenario> [width=390] [theme=light] [extraQuery]
// Drives headless Edge against the local dev server with a seeded, onboarded user + sample crew.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const [,, scenario, W='390', THEME='light', EXTRA=''] = process.argv;
const BASE = process.env.BASE || 'http://localhost:5174/';
const OUT = path.resolve('shots');
fs.mkdirSync(OUT, {recursive:true});
// Chrome by default; set EXE to use another Chromium browser (e.g. Edge)
const scenarios = (await import(pathToFileURL(path.resolve('scenarios.mjs')).href+'?'+Date.now())).default;

const browser = await puppeteer.launch({
  executablePath: process.env.EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-first-run','--hide-scrollbars','--disable-extensions'],
});
const page = await browser.newPage();
const width = +W, height = width < 380 ? 780 : 844;
await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name:'prefers-color-scheme', value: THEME==='dark'?'dark':'light' }]);
const errors = [];
page.on('pageerror', e=>errors.push('pageerror: '+e.message));
page.on('console', m=>{ if (m.type()==='error') errors.push('console: '+m.text()); });
page.on('requestfailed', r=>errors.push('failed: '+r.url()));

// ?local keeps the app on this device (no Supabase) unless CLOUD=1
const q = (extra)=> BASE + '?still' + (process.env.CLOUD ? '' : '&local') + (EXTRA?'&'+EXTRA:'') + (extra?'&'+extra:'');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const h = {
  page, width, THEME, sleep, extra: EXTRA,
  async load(extra){ await page.goto(q(extra), {waitUntil:'networkidle0'}); await sleep(700); },
  async seed(opts={}){
    await page.goto(q(), {waitUntil:'networkidle0'});
    await page.evaluate(async (theme, opts)=>{
      const S = await import('/store.js');
      if (!S.isOnboarded()){
        S.signIn({email:'rahim@example.test'});
        S.updateMe({handle:'rahim', name:'Rahim', onboarded:true, shareDefault:'crew'});
        await S.setDemo(true);
        const vs = S.venues();
        const pick = n=>vs.find(v=>v.name===n);
        [['Ravi Restaurant',4.5,'Dal fry and a mango lassi.'],['Knot Bakehouse',4,'Pistachio knot.'],['Arabian Tea House',5,'Karak in the courtyard.']]
          .forEach(([n,r,notes],i)=>{ const v=pick(n); if (v) S.addEntry({venueId:v.id, rating:r, notes, createdAt:Date.now()-i*864e5}); });
        S.setFlag('coachDone');
      }
      try{ localStorage.setItem('bites-theme', theme==='dark'?'dark':'light'); }catch(_){}
      if (opts.mode) localStorage.setItem('bites-scope', JSON.stringify({mode:opts.mode}));
      S.flush();
    }, THEME, opts);
    await h.load();
  },
  async shot(name){
    await sleep(350);
    const f = path.join(OUT, `${name}-${width}-${THEME}.png`);
    await page.screenshot({ path:f });
    console.log('shot', f);
  },
  async click(sel){ await page.evaluate(s=>{ const e=document.querySelector(s); if (!e) throw new Error('no '+s); e.click(); }, sel); await sleep(450); },
  async js(fn, ...args){ return page.evaluate(fn, ...args); },
};
try{
  const fn = scenarios[scenario]; if (!fn) throw new Error('unknown scenario '+scenario);
  await fn(h);
}catch(e){ console.log('ERROR', e.message); }
if (errors.length) console.log('PAGE ERRORS:\n'+[...new Set(errors)].join('\n'));
await browser.close();
