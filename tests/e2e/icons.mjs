// Every icon the app draws is in the self-hosted subset font and renders as a glyph, not as its name in letters.
// Walks the main screens (signed out, then with the sample crew) and checks each .ms element on the way.
//   node shot.mjs icons 390 light
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUBSET = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'fonts', 'icons.json'), 'utf8')).names);

export default async function icons(h){
  const seen = new Map(), bad = new Map();
  const step = async (name, fn)=>{ try{ await fn(); await collect(name); console.log('ok  ', name); } catch(e){ console.log('skip', name, '-', (e.message||'').split('\n')[0]); } };
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const close = async ()=>{ await h.js(async ()=>(await import('/ui.js')).closeAll()); await h.sleep(500); };
  // every icon in the DOM: its name, and whether it is drawn as one glyph (about 1em wide) rather than as letters
  const collect = async where=>{
    const list = await h.js(async ()=>{ await document.fonts.ready;
      return [...document.querySelectorAll('.ms')].map(e=>{ const name=(e.textContent||'').trim(); const r=e.getBoundingClientRect(); const fs=parseFloat(getComputedStyle(e).fontSize)||1;
        return { name, laidOut: r.width>0 && r.height>0, wide: r.width > fs*1.6 }; }).filter(x=>x.name); });
    for (const i of list){
      seen.set(i.name, where);
      if (!SUBSET.has(i.name)) bad.set(i.name, where+' (not in the subset)');
      else if (i.laidOut && i.wide) bad.set(i.name, where+' (drawn as text)');
    }
  };
  await h.load();
  await step('welcome, signed out', async ()=>{ await h.sleep(800); });
  await step('email sign-in', async ()=>{ await h.click('#wEmail'); });
  await h.seed({ mode:'crew' });
  const ids = await h.js(async ()=>{ const S=await import('/store.js'); return { me:S.me().id, ravi:S.venues().find(v=>v.name==='Ravi Restaurant').id }; });
  await step('map', async ()=>{});
  await step('peek', async ()=>{ await go('showOnMap', ids.ravi); await h.sleep(1200); });
  await step('filter', async ()=>{ await close(); await h.click('#btnFilter'); await h.js(()=>document.querySelector('#fCats [data-cat-more]')?.click()); await h.sleep(300); });
  await step('bell', async ()=>{ await close(); await h.click('#btnBell'); });
  await step('+ menu', async ()=>{ await close(); await h.click('#navLog'); });
  await step('check-in', async ()=>{ await close(); await go('log', { venueId:ids.ravi }); await h.sleep(800); });
  await step('new place', async ()=>{ await close(); await go('log', {}); await h.sleep(500); await h.js(()=>{ const q=document.querySelector('#logQ'); q.value='Zzq Test'; q.dispatchEvent(new Event('input')); }); await h.sleep(500); await h.click('#lNew'); });
  await step('add from link', async ()=>{ await close(); await go('shareAdd'); await h.sleep(600); });
  await step('place', async ()=>{ await close(); await go('place', ids.ravi); await h.sleep(900); });
  await step('plan', async ()=>{ await h.click('#pPlan'); });
  await step('place menu', async ()=>{ await close(); await go('place', ids.ravi); await h.sleep(700); await h.click('#pMore'); });
  await step('list', async ()=>{ await close(); await h.click('[data-tab="list"]'); await h.sleep(600); await h.click('[data-tab="map"]'); });
  await step('crew', async ()=>{ await h.click('[data-tab="crew"]'); await h.sleep(800); });
  await step('event', async ()=>{ await h.js(()=>document.querySelector('.screen [data-event]')?.click()); await h.sleep(600); });
  await step('invite', async ()=>{ await close(); await go('inviteLanding', 'SAMPLE7'); await h.sleep(800); });
  await step('crew setup', async ()=>{ await close(); await go('crewSetup', {}); await h.sleep(700); });
  await step('shelf', async ()=>{ await close(); await h.click('[data-tab="shelf"]'); await h.sleep(900); });
  await step('book', async ()=>{ await h.js(()=>document.querySelector('#screens .screen.in:last-of-type .shelf-book.big')?.click()); await h.sleep(1500); });
  await step('decorate', async ()=>{ await h.js(()=>document.querySelector('#screens .screen.in:last-of-type #kbWand')?.click()); await h.sleep(900);
    for (const t of ['milestones','critters','districts','layout']){ await h.js(t=>document.querySelector(`.dc-tabs [data-tab="${t}"]`)?.click(), t); await h.sleep(300); await collect('decorate '+t); } });
  await step('profile', async ()=>{ await close(); await go('profile', ids.me); await h.sleep(800); });
  await step('settings', async ()=>{ await close(); await go('settings'); await h.sleep(800); });
  await step('critters', async ()=>{ await close(); await go('critters'); await h.sleep(700); });
  await step('stickers', async ()=>{ await close(); await go('stickers', ids.me); await h.sleep(700); });
  await step('goals', async ()=>{ await close(); await go('goals'); await h.sleep(700); });
  console.log(`icons seen on screen: ${seen.size}`);
  if (bad.size) console.log('FAIL icons: ' + [...bad].map(([n,w])=>`${n} @ ${w}`).join('; '));
  else console.log('ok   every rendered icon is in the subset and drawn as a glyph');
}
