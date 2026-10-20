// Accessibility: axe-core (WCAG 2.1 A and AA rules) on each main screen, in whatever theme the run uses. A serious or
// critical problem fails the step; moderate and minor ones are listed. The map canvas itself is art, so only its
// controls are checked.   node shot.mjs a11y 390 light|dark
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export default async function a11y(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('a11yfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  const AXE = require.resolve('axe-core/axe.min.js');
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  // run axe on what's on screen now; return problems as text
  const check = async (label, scope)=>{
    await h.page.addScriptTag({ path:AXE });
    const r = await h.js(async scope=>{
      const res = await window.axe.run(scope ? document.querySelector(scope) : document,
        { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa'] }, resultTypes:['violations'], exclude:[['#mapCanvas']] });
      return res.violations.map(v=>({ id:v.id, impact:v.impact, help:v.help, n:v.nodes.length, where:v.nodes.slice(0,3).map(n=>n.target.join(' ')+(n.any&&n.any[0]&&n.any[0].message?' :: '+n.any[0].message.slice(0,140):'')) }));
    }, scope || null);
    const bad = r.filter(v=>v.impact === 'serious' || v.impact === 'critical'), rest = r.filter(v=>!bad.includes(v));
    rest.forEach(v=>console.log(`  note ${label}: ${v.id} (${v.impact}, ${v.n}) ${v.help}`));
    if (bad.length) throw new Error(bad.map(v=>`${v.id} x${v.n} [${v.where.join(' | ')}]`).join(' ;; '));
  };
  await step('welcome (signed out)', async ()=>{ await h.load('fresh'); await h.js(()=>{ localStorage.clear(); }); await h.load(); await h.sleep(800); await check('welcome'); });
  await h.seed({ mode:'crew' });
  await step('map', async ()=>{ await check('map'); });
  await step('map search results', async ()=>{
    await h.js(()=>{ const i=document.querySelector('#mapSearch .ksearch-q'); i.focus(); i.value='karak'; i.dispatchEvent(new Event('input',{bubbles:true})); }); await h.sleep(500);
    await check('search'); await h.js(()=>{ const i=document.querySelector('#mapSearch .ksearch-q'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); i.blur(); }); await h.sleep(300);
  });
  await step('place screen', async ()=>{ await h.js(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.place(S.venues().find(v=>v.name==='Ravi Restaurant').id); }); await h.sleep(900); await check('place'); await close(); });
  await step('check in: find the place, then details', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); go.log({}); }); await h.sleep(800); await check('checkin-1');
    await h.js(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); const U=await import('/ui.js'); U.closeAll(); go.log({ venueId:S.venues()[0].id }); }); await h.sleep(900); await check('checkin-2'); await close();
  });
  await step('shelf', async ()=>{ await h.js(async ()=>{ const {go}=await import('/go.js'); go.shelf(); }); await h.sleep(900); await check('shelf'); });
  await step('a scrapbook page', async ()=>{ await h.js(()=>document.querySelector('.screen.in:last-of-type [data-spread]').click()); await h.sleep(1300); await check('book'); await close(); });
  await step('decorate mode', async ()=>{ await h.js(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.book(S.shelf().everything.id); }); for (let k=0;k<40 && !(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type #kbWand:not([hidden])')));k++) await h.sleep(250); await h.js(()=>document.querySelector('#screens .screen.in:last-of-type #kbWand').click()); await h.sleep(900); await check('decorate'); await close(); });
  await step('critters', async ()=>{ await h.js(async ()=>{ const {go}=await import('/go.js'); go.critters(); }); await h.sleep(800); await check('critters'); await close(); });
  await step('a landmark card', async ()=>{ await h.js(async ()=>{ const L=await import('/landmarkui.js'); L.openLandmark('burj_khalifa'); }); await h.sleep(800); await check('landmark'); await close(); });
  await step('crew', async ()=>{ await h.click('[data-tab="crew"]'); await h.sleep(800); await check('crew'); await close(); });
  await step('profile and settings', async ()=>{ await h.js(async ()=>{ const {go}=await import('/go.js'); go.settings(); }); await h.sleep(800); await check('settings'); await close(); });
}
