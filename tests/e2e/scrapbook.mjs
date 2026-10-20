// The scrapbook rebuild: the shelf (Everything, Tagged, kind books, crews, albums), the book turned page by page
// (cover, paper pages, the pager), the List toggle, the cover editor's paper, and the Sounds switch.
//   node shot.mjs scrapbook 390 light
export default async function scrapbook(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('sbfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  const expect = (cond, msg)=>{ if (!cond) throw new Error(msg); };
  const top = 'document.querySelector("#screens .screen.in:last-of-type")';
  await h.seed({ mode:'crew' });
  // a crewmate's visit with photos tags you, so you have a Tagged book and pages with photos
  await h.js(async ()=>{
    const S = await import('/store.js');
    const me = S.me(), e = S.entries().find(x=>x.userId!==me.id && S.photos({ entryId:x.id }).length);
    if (e) S.updateEntry(e.id, { taggedIds:[...(e.taggedIds||[]), me.id] });
    S.flush();
  });
  await step('the shelf: Everything, Tagged, latest pages, kinds, crews', async ()=>{
    await h.click('[data-tab="shelf"]'); await h.sleep(900);
    const r = await h.js(()=>{ const s = document.querySelector('#screens .screen.in:last-of-type');
      return { books:[...s.querySelectorAll('.shelf-book b')].map(b=>b.textContent), strip:s.querySelectorAll('.shelf-strip .spread-card').length,
        kinds:s.querySelectorAll('.spine-row .spine').length, heads:[...s.querySelectorAll('.shelf-h')].map(x=>x.textContent.trim()) }; });
    expect(r.books.includes('Everything') && r.books.includes('Tagged'), 'books '+JSON.stringify(r.books));
    expect(r.strip > 0, 'no latest pages strip');
    expect(r.heads.some(x=>/By kind/.test(x)) && r.heads.some(x=>/Crews/.test(x)), 'sections '+JSON.stringify(r.heads));
    await h.shot('sb-shelf');
    await h.js(()=>{ document.querySelector('#screens .screen.in:last-of-type').scrollTop = 560; }); await h.sleep(300); await h.shot('sb-shelf-2');
  });
  await step('Everything opens as a book: the cover swings open onto page 1', async ()=>{
    await h.js(()=>{ document.querySelector('#screens .screen.in:last-of-type').scrollTop = 0; document.querySelector('#screens .screen.in:last-of-type .shelf-book.big').click(); });
    for (let k = 0; k < 40 && !(await h.js(()=>/Page 1/.test(document.querySelector('#screens .screen.in:last-of-type .kb-count')?.textContent||''))); k++) await h.sleep(250);
    const r = await h.js(()=>{ const s = document.querySelector('#screens .screen.in:last-of-type');
      return { book:!!s.querySelector('.kb-book'), count:s.querySelector('.kb-count')?.textContent, pages:s.querySelectorAll('.kb-page').length, curl:!!s.querySelector('.stf__parent'), fade:!!s.querySelector('.kb-fade') }; });
    expect(r.book && r.pages > 0, 'no book '+JSON.stringify(r));
    expect(/Page 1 of/.test(r.count||''), 'pager says '+r.count);
    console.log('  book', JSON.stringify(r));
    await h.shot('sb-book-p1');
  });
  await step('the pager turns pages', async ()=>{
    await h.click('#screens .screen.in:last-of-type [data-kb="next"]'); await h.sleep(1100);
    const c = await h.js(()=>document.querySelector('#screens .screen.in:last-of-type .kb-count').textContent);
    expect(/Page 2 of/.test(c), 'after next: '+c);
    await h.shot('sb-book-p2');
    await h.click('#screens .screen.in:last-of-type [data-kb="last"]'); await h.sleep(1200);
    await h.shot('sb-book-last');
  });
  await step('List shows the feed; Book comes back', async ()=>{
    await h.click('#screens .screen.in:last-of-type [data-seg="bview"] [data-v="list"]'); await h.sleep(1200);
    expect(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type .feed')), 'no feed');
    await h.shot('sb-list');
    await h.click('#screens .screen.in:last-of-type [data-seg="bview"] [data-v="book"]'); await h.sleep(1500);
    expect(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type .kb-book')), 'no book after toggling back');
  });
  await step('a crew book, by place', async ()=>{
    await h.js(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.book(S.shelf().crews[0].id); }); await h.sleep(2600);
    await h.click('#screens .screen.in:last-of-type [data-seg="bmode"] [data-v="place"]'); await h.sleep(1500);
    await h.shot('sb-crew-place');
  });
  await step('a kind book has an automatic cover', async ()=>{
    await h.js(async ()=>{ const S=await import('/store.js'), P=await import('/pages.js'), {go}=await import('/go.js'); const k = P.kindCounts(S.me().id, S.pagesWorld())[0]; go.book('kind:'+k.cat, { startAt:-1 }); });
    await h.sleep(500); await h.shot('sb-kind-cover'); await h.sleep(2200); await h.shot('sb-kind-p1');
  });
  await step('the cover editor picks the paper', async ()=>{
    await h.click('#screens .screen.in:last-of-type #bkCover'); await h.sleep(900);
    await h.click('#screens .screen.in:last-of-type [data-paper="kraft"]'); await h.sleep(300);
    expect(await h.js(()=>document.querySelector('#screens .screen.in:last-of-type [data-paper="kraft"]').classList.contains('on')), 'kraft not chosen');
    await h.js(()=>{ const b=document.querySelector('#screens .screen.in:last-of-type [data-paper]'); b.scrollIntoView({block:'center'}); }); await h.sleep(300);
    await h.shot('sb-cover-paper');
    await h.click('#screens .screen.in:last-of-type #cvPrev'); await h.sleep(2800);
    expect(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type .kb-page.paper-kraft')), 'kraft paper not on the pages');
    await h.shot('sb-kraft');
  });
  await step('with reduced motion, pages cross-fade (no curl)', async ()=>{
    await h.page.emulateMediaFeatures([{ name:'prefers-reduced-motion', value:'reduce' }]);
    await h.js(async ()=>{ const U=await import('/ui.js'), S=await import('/store.js'), {go}=await import('/go.js'); U.closeAll(); setTimeout(()=>go.book(S.shelf().everything.id), 400); });
    await h.sleep(2200);
    const r = await h.js(()=>{ const s = document.querySelector('#screens .screen.in:last-of-type'); return { fade:!!s.querySelector('.kb-fade'), curl:!!s.querySelector('.stf__parent'), count:s.querySelector('.kb-count')?.textContent }; });
    expect(r.fade && !r.curl, 'reduced motion '+JSON.stringify(r));
    await h.click('#screens .screen.in:last-of-type [data-kb="next"]'); await h.sleep(500);
    expect(/Page 2/.test(await h.js(()=>document.querySelector('#screens .screen.in:last-of-type .kb-count').textContent)), 'fade next');
    await h.page.emulateMediaFeatures([{ name:'prefers-reduced-motion', value:'no-preference' }]);
  });
  await step('Settings has the Sounds switch, off by default on the web', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const U=await import('/ui.js'); U.closeAll(); go.settings(); }); await h.sleep(900);
    const on = await h.js(()=>document.querySelector('#sSounds')?.getAttribute('aria-checked'));
    expect(on === 'false', 'sounds switch '+on);
  });
}
