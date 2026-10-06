// Everyone's ratings on scrapbook pages: the people on a visit with their own stars, the crew
// rating ("Crew avg ★ … · n ratings") matching Place Details and the map, "Add yours" for a
// visit you were tagged on, the bell nudge, and "+N" for a big table.
export default async function ratings(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('rtfail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  await h.seed({mode:'crew'});
  // at a place nobody has been: Kabir logs a visit (4★) tagging you and Maya; you went once (5★); Maya once (3★);
  // Omar logs a big dinner with everyone tagged
  const ids = await h.js(async ()=>{
    const S = await import('/store.js');
    const v = S.addVenue({ name:'Banc Test', zone:'difc', categories:['coffee'] });
    const crew = S.myCrew(), me = S.me().id, now = Date.now();
    const put = e => { const r = { kind:'visit', private:false, crewIds:[crew.id], taggedIds:[], meals:[], notes:'', date:'2026-10-04', createdAt:now, ...e }; S.__put ? S.__put(r) : null; return r; };
    S.addEntry({ venueId:v.id, rating:5, crewIds:[crew.id], date:'2026-10-01' });
    // crewmates' visits go straight into the records (they're on this phone only, like the sample crew)
    const add = (id, e) => { const raw = JSON.parse(localStorage.getItem('bites-db-v2')); raw.entries[id] = { id, venueId:v.id, kind:'visit', private:false, crewIds:[crew.id], taggedIds:[], meals:[], notes:'', date:'2026-10-04', createdAt:now, ...e }; localStorage.setItem('bites-db-v2', JSON.stringify(raw)); };
    S.flush();
    add('demo-rt1', { userId:'demo-kabir', rating:4, taggedIds:[me, 'demo-maya'], notes:'Flat white run' });
    add('demo-rt2', { userId:'demo-maya', rating:3, date:'2026-10-02' });
    add('demo-rt3', { userId:'demo-omar', rating:4.5, taggedIds:[me, 'demo-maya', 'demo-kabir', 'demo-layla', 'demo-noor'], date:'2026-10-03' });
    return { v:v.id, me };
  });
  await h.load();

  await step('the bell: "tagged you at Banc Test · Add your rating"', async ()=>{
    await h.click('#btnBell'); await h.sleep(500);
    if (!/tagged you at\s*Banc Test/.test(await text()) || !/Add your rating/.test(await text())) throw new Error('no nudge');
    await h.shot('rt-bell'); await close();
  });
  await step('the crew book page: each person with their stars, the crew rating, and "Add yours"', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); go.bookPage(S.books().find(b=>b.kind==='crew').id, S.books().find(b=>b.kind==='crew').id+'|demo-rt1'); }); await h.sleep(1500);
    const r = await h.js(()=>{ const pg=document.querySelector('.page.flash'); return pg && { text:pg.innerText, add:!!pg.querySelector('[data-rate]'), raters:pg.querySelectorAll('.rater').length }; });
    if (!r) throw new Error('page not found');
    // you 5, Kabir 4 (he didn’t rate Omar’s dinner), Maya 3, Omar 4.5 → (5 + 4 + 3 + 4.5) / 4 = 4.125 → 4.1
    if (!/Crew avg ★ 4\.1 · 4 ratings/.test(r.text)) throw new Error('overall: '+r.text.replace(/\n/g,' | '));
    if (!r.add) throw new Error('no Add yours');
    if (!/Kabir/.test(r.text) || r.raters!==3) throw new Error('raters: '+r.raters);
    await h.shot('rt-page');
  });
  await step('add your rating (and a note) to Kabir’s visit; it shows on the page and the numbers move', async ()=>{
    await h.js(()=>document.querySelector('.page.flash [data-rate]').click()); await h.sleep(600);
    await h.shot('rt-sheet');
    await h.js(()=>document.querySelector('#rsStars [data-v="2"]').click()); await h.sleep(150);
    await h.js(()=>{ document.querySelector('#rsNote').value='Too busy today'; });
    await h.js(()=>document.querySelector('#rsSave').click()); await h.sleep(800);
    const r = await h.js(()=>{ const pg=document.querySelector('[data-page-id$="|demo-rt1"]'); return { text:pg.innerText, add:!!pg.querySelector('[data-rate]') }; });
    // you: (5 + 2) / 2 = 3.5 → (3.5 + 4 + 3 + 4.5) / 4 = 3.75 → 3.8
    if (!/Crew avg ★ 3\.8 · 4 ratings/.test(r.text)) throw new Error('overall: '+r.text.replace(/\n/g,' | '));
    if (r.add) throw new Error('still says Add yours');
    await h.shot('rt-page-rated');
    const mine = await h.js(async ()=>{ const S=await import('/store.js'); return S.myRatingOn('demo-rt1'); });
    if (!mine || mine.rating!==2 || mine.note!=='Too busy today') throw new Error(JSON.stringify(mine));
  });
  await step('you can’t change Kabir’s own rating', async ()=>{
    const r = await h.js(async ()=>{ const S=await import('/store.js'); S.updateEntry('demo-rt1', { rating:1 }); return S.entry('demo-rt1').rating; });
    if (r!==4) throw new Error('changed to '+r);
  });
  await step('+N: a table of six shows four and "+2", which lists everyone', async ()=>{
    const t = await h.js(()=>{ const pg=document.querySelector('[data-page-id$="|demo-rt3"]'); pg.scrollIntoView(); return { n:pg.querySelectorAll('.rater:not(.rp-more)').length, more:pg.querySelector('.rp-more')?.textContent }; });
    if (t.n!==4 || t.more!=='+2') throw new Error(JSON.stringify(t));
    await h.sleep(300); await h.shot('rt-overflow');
    await h.js(()=>document.querySelector('[data-page-id$="|demo-rt3"] .rp-more').click()); await h.sleep(600);
    if ((await h.js(()=>[...document.querySelectorAll('.sheet .person-row')].length))!==6) throw new Error('list');
    await h.shot('rt-overflow-list');
    await close();
  });
  await step('Place Details and the map peek show the same crew rating', async ()=>{
    await h.js(async (v)=>{ const {go}=await import('/go.js'); go.place(v); }, ids.v); await h.sleep(900);
    const t = await text();
    if (!/Crew avg ★ 3\.8 · 4 ratings/.test(t)) throw new Error('place details');
    if (!/You\s*★?/.test(t) || !/Too busy today/.test(t)) throw new Error('your rating not under Kabir’s visit');
    await h.shot('rt-place');
    await close();
    const peek = await h.js(async (v)=>{ const M=await import('/model.js'); const S=await import('/store.js'); const {state}=await import('/go.js'); return M.venueSummary(S.venue(v), { ...state.scope, mode:'crew', members:null }).rating; }, ids.v);
    if (peek!==3.8) throw new Error('map rating '+peek);
  });
  await step('your own book: Friends avg; and a 1-rating place says "1 rating"', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); go.book(S.books().find(b=>b.kind==='tagged').id); }); await h.sleep(1300);
    if (!/Friends avg ★ 3\.8 · 4 ratings/.test(await text())) throw new Error('tagged book');
    await h.shot('rt-tagged-book'); await close();
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); go.book(S.books().find(b=>b.kind==='personal').id); }); await h.sleep(1300);
    const t = await text();
    if (!/· 1 rating\b/.test(t) && !/avg ★ [\d.]+ · \d+ ratings/.test(t)) throw new Error('wording');
    await close();
  });
}
