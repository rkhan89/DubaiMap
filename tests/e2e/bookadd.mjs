// Adding a photo from the shared (crew) scrapbook: it should land in that book.
import path from 'path';
export default async function bookadd(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('bfail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'crew'});
  const text = ()=>h.js(()=>document.body.innerText);
  const store = (fn, ...a)=>h.js(async (src, a)=>{ const S=await import('/store.js'); return (new Function('S','a','return ('+src+')(S,a)'))(S,a); }, fn.toString(), a);
  const crewBookCount = ()=>store(S=>{ const c=S.myCrew(); return S.photos().filter(p=>c.memberIds.includes(p.userId) && S.sharedHere(p)).length; });
  const before = await crewBookCount();
  await step('open the crew book and tap Add', async ()=>{
    await h.click('[data-tab="shelf"]'); await h.sleep(700);
    await h.js(()=>[...document.querySelectorAll('.book-spine')].find(b=>/Collaborative|crew/i.test(b.textContent)).click()); await h.sleep(900);
    await h.shot('b-crewbook');
    const has = await h.js(()=>!!document.querySelector('#bkAddTop')); if (!has) throw new Error('no add button');
    const [chooser] = await Promise.all([p.waitForFileChooser({timeout:4000}).catch(()=>null), h.js(()=>document.querySelector('#bkAddTop').click())]);
    await h.sleep(600);
    if (chooser) await chooser.accept([path.resolve('fixture.jpg')]); else { const i=await p.$('input[type=file]'); await i.uploadFile(path.resolve('fixture.jpg')); }
    await h.sleep(1500); await h.shot('b-add-1');
  });
  await step('pick a place, then add', async ()=>{
    await h.js(()=>document.querySelector('#apGo').click()); await h.sleep(300);
    if (!/Pick the place first/.test(await h.js(()=>document.querySelector('#toast').innerText))) throw new Error('no hint about the place');
    await h.js(()=>{ const i=document.querySelector('#apQ'); i.value='Ravi'; i.dispatchEvent(new Event('input')); }); await h.sleep(500);
    await h.js(()=>[...document.querySelectorAll('.search-result[data-v]')].pop().click()); await h.sleep(500);
    if (!(await h.js(()=>document.querySelector('#apWho [data-who].on')?.textContent||'')).includes('Sample')) throw new Error('crew not pre-picked');
    await h.js(()=>document.querySelector('#apWho').scrollIntoView({block:'center'})); await h.sleep(200); await h.shot('b-add-2');
    await h.js(()=>document.querySelector('#apGo').click()); await h.sleep(1500); await h.shot('b-add-3');
    const after = await crewBookCount();
    if (after!==before+1) throw new Error(`crew book photos ${before} → ${after}`);
    await h.js(()=>[...document.querySelectorAll('#toast .toast-btn')].find(b=>/Open book/.test(b.textContent)).click()); await h.sleep(900);
    if (!/Sample Crew Scra/.test(await text())) throw new Error('opened the wrong book'); await h.shot('b-add-4');
  });
}
