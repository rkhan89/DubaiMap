// The monthly drop and sharing: a crew book carries each month's spread after its last visit; the bell says a past
// month dropped and opens it (a page turn onto the spread, then the share card); the story card is 1080x1920 and the
// postcard 1200x1500, made from the page itself; a dropped month can't be decorated.   node shot.mjs drops 390 light
import fs from 'fs';
import path from 'path';
export default async function drops(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('drfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  const expect = (cond, msg)=>{ if (!cond) throw new Error(msg); };
  const top = sel=>`#screens .screen.in:last-of-type ${sel}`;
  await h.seed({ mode:'crew' });
  const months = await h.js(async ()=>{ const S=await import('/store.js'); return S.spreadsOf(S.myCrew()).map(s=>({ id:s.id, month:s.month, dropped:s.dropped, places:s.places, photos:s.photos.length })); });
  console.log('  spreads', JSON.stringify(months));
  await step('the crew book carries each month’s spread', async ()=>{
    expect(months.length > 0, 'no spreads');
    await h.js(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); const sp = S.spreadsOf(S.myCrew()).slice(-1)[0]; go.bookPage(S.shelf().crews[0].id, 'spread|'+sp.id+'|L'); });
    for (let k = 0; k < 40 && !(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type .kb-page.open.kb-spread'))); k++) await h.sleep(250);
    await h.sleep(1500);
    expect(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type .kb-page.open.spread-l')), 'spread not open');
    await h.shot('dr-spread-l');
    await h.click(top('[data-kb="next"]')); await h.sleep(1300);
    expect(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type .kb-page.open.spread-r')), 'right page not open');
    await h.shot('dr-spread-r');
  });
  await step('Just me visits never reach a spread', async ()=>{
    const r = await h.js(async ()=>{ const S=await import('/store.js'); return S.spreadsOf(S.myCrew()).flatMap(s=>s.entries).filter(e=>e.private).length; });
    expect(r === 0, r + ' private visits in spreads');
  });
  const dropped = months.filter(m=>m.dropped).slice(-1)[0];
  await step('the bell: “Your … page dropped” opens the spread, then the share card', async ()=>{
    expect(dropped, 'no dropped month in the sample crew');
    await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500);
    await h.click('#btnBell'); await h.sleep(700);
    const t = await h.js(()=>document.querySelector('.sheet.in [data-drop]')?.innerText || '');
    expect(/page dropped/.test(t), 'bell: '+t);
    await h.shot('dr-bell');
    await h.js(()=>document.querySelector('.sheet.in [data-drop]').click()); await h.sleep(4200);
    const r = await h.js(()=>({ open:!!document.querySelector('#screens .screen.in:last-of-type .kb-page.open.spread-l'), sheet:document.querySelector('.sheet.in')?.innerText || '' }));
    expect(r.open && /Share this spread/.test(r.sheet), JSON.stringify(r));
    await h.shot('dr-drop-share');
    expect(/off on this preview copy|Page link/.test(r.sheet), 'no link section');
  });
  await step('a dropped month can’t be decorated', async ()=>{
    await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(400);
    await h.js(async (id)=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.bookPage(S.shelf().crews[0].id, 'spread|'+id+'|L'); }, dropped.id);
    for (let k = 0; k < 40 && !(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type .kb-page.open.kb-spread'))); k++) await h.sleep(250);
    expect(await h.js(()=>document.querySelector('#screens .screen.in:last-of-type #kbWand').hidden), 'wand shown on a dropped spread');
  });
  const out = path.resolve('shots');
  const save = async (name, fn, args)=>{
    const r = await h.js(async (fn, args)=>{
      const S=await import('/store.js'), X=await import('/export.js');
      const sh = S.shelf(), crewBook = sh.crews[0], P = await import('/pages.js');
      const everything = sh.everything, pages = P.bookPages(everything, S.pagesWorld());
      const withPhoto = P.bookPages(crewBook, S.pagesWorld()).find(p=>p.photos.length);
      const sp = S.spreadsOf(S.myCrew()).slice(-1)[0];
      const blob = fn==='story' ? await X.storyCard({ book:crewBook, pg:withPhoto, n:1 })
        : fn==='spread' ? await X.storyCard({ book:crewBook, spread:sp })
        : fn==='postcard' ? await X.postcard({ book:crewBook, pg:withPhoto }, withPhoto.photos[0])
        : await X.pageImage({ book:crewBook, pg:withPhoto, n:1 });
      const bmp = await createImageBitmap(blob);
      const data = await new Promise(r=>{ const f = new FileReader(); f.onload = ()=>r(f.result); f.readAsDataURL(blob); });
      return { w:bmp.width, h:bmp.height, size:blob.size, data };
    }, fn, args);
    fs.writeFileSync(path.join(out, name), Buffer.from(r.data.split(',')[1], 'base64'));
    return r;
  };
  await step('the story card is 1080 x 1920, from the page itself', async ()=>{ const r = await save('dr-story.png', 'story'); console.log('  story', r.w, r.h, r.size); expect(r.w===1080 && r.h===1920 && r.size > 50000, JSON.stringify({ w:r.w, h:r.h, size:r.size })); });
  await step('a spread’s story card shows both pages', async ()=>{ const r = await save('dr-story-spread.png', 'spread'); expect(r.w===1080 && r.h===1920, r.w+'x'+r.h); });
  await step('the postcard is 1200 x 1500', async ()=>{ const r = await save('dr-postcard.png', 'postcard'); console.log('  postcard', r.w, r.h, r.size); expect(r.w===1200 && r.h===1500, r.w+'x'+r.h); });
  await step('the picture behind a page link is the page alone, 720 x 1200', async ()=>{ const r = await save('dr-page.png', 'page'); expect(r.w===720 && r.h===1200, r.w+'x'+r.h); });
}
