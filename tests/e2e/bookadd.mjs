// Adding photos from a crew's book: one flow. The book's camera picks photos, then the log
// form opens with them (and the crew picked); saving tapes the visit's page into that book.
import path from 'path';
export default async function bookadd(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('bfail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'crew'});
  const text = ()=>h.js(()=>document.body.innerText);
  const store = (fn, ...a)=>h.js(async (src, a)=>{ const S=await import('/store.js'); return (new Function('S','a','return ('+src+')(S,a)'))(S,a); }, fn.toString(), a);
  const crewBookPhotos = ()=>store(S=>{ const c=S.myCrew(); return S.photos().filter(p=>c.memberIds.includes(p.userId) && S.sharedHere(p)).length; });
  const before = await crewBookPhotos();
  await step('open the crew book and tap the camera: the log form opens with the photo', async ()=>{
    await h.click('[data-tab="shelf"]'); await h.sleep(700);
    await h.js(()=>[...document.querySelectorAll('.book-spine')].find(b=>/Crew scrapbook/i.test(b.textContent)).click()); await h.sleep(1100);
    await h.shot('b-crewbook');
    const [chooser] = await Promise.all([p.waitForFileChooser({timeout:4000}), h.js(()=>document.querySelector('#bkAddTop').click())]);
    await chooser.accept([path.resolve('fixture.jpg')]); await h.sleep(1500);
    if (!/Log a visit/i.test(await text())) throw new Error('not the log form');
    await h.shot('b-add-1');
  });
  await step('pick the place: the photo is there and the crew is picked; save', async ()=>{
    await h.js(()=>{ const i=document.querySelector('#logQ'); i.value='Ravi'; i.dispatchEvent(new Event('input')); }); await h.sleep(500);
    await h.js(()=>[...document.querySelectorAll('.search-result[data-v]')].find(b=>/Ravi/.test(b.textContent)).click()); await h.sleep(600);
    if (!(await h.js(()=>document.querySelectorAll('.reel [data-rm]').length))) throw new Error('photo not in the form');
    if (!(await h.js(()=>document.querySelector('#lWho [data-who].on')?.textContent||'')).includes('Sample')) throw new Error('crew not pre-picked');
    await h.js(()=>document.querySelector('#lWho').scrollIntoView({block:'center'})); await h.sleep(200); await h.shot('b-add-2');
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(500);
    if (!/Sample Crew Scrapbook/.test(await h.js(()=>document.querySelector('.tapein')?.innerText||''))) throw new Error('not taped into the crew book');
    await h.sleep(1300);
    const after = await crewBookPhotos();
    if (after!==before+1) throw new Error(`crew book photos ${before} → ${after}`);
    await h.js(()=>[...document.querySelectorAll('#toast .toast-btn')].find(b=>/Open page/.test(b.textContent)).click()); await h.sleep(1200);
    const pg = await h.js(()=>{ const f=document.querySelector('.page.flash'); return f ? { text:f.innerText, photos:f.querySelectorAll('.polaroid').length } : null; });
    if (!pg || !/Ravi Restaurant/.test(pg.text) || pg.photos!==1) throw new Error('page: '+JSON.stringify(pg));
    if (!/Crew scrapbook/i.test(await text())) throw new Error('opened the wrong book'); await h.shot('b-add-3');
  });
}
