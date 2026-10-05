// The scrapbook as the payoff of logging: every visit is a page (photos or not), the taped-in
// moment, the pages feed that loads as you scroll, the map's latest-page strip, "on this day",
// and "add photos" opening the log flow.
import path from 'path';
export default async function scrap(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('scfail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  // wait out the taped-in moment and close any sticker that pops after it
  const settle = async ()=>{ await h.sleep(1900); for (let i=0;i<6;i++){ await h.js(()=>{ const b=document.querySelector('.unlock [data-x="ok"]'); if (b) b.click(); }); await h.sleep(350); } };
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  await h.seed({mode:'me'});
  // a visit from a year ago today, with Kabir tagged (for "on this day")
  await h.js(async ()=>{
    const S = await import('/store.js'), { todayISO } = await import('/data.js');
    const t = todayISO(), ago = (+t.slice(0,4)-1) + t.slice(4);
    const v = S.venues().find(x=>x.name==='Ravi Restaurant');
    S.addEntry({ venueId:v.id, rating:5, date:ago, notes:'Butter chicken for two', crewIds:[S.myCrew().id], taggedIds:['demo-kabir'], createdAt:Date.now()-365*864e5 });
    // plenty of pages, for the feed
    S.venues().slice(0, 14).forEach((x,i)=>S.addEntry({ venueId:x.id, rating:3+(i%3), date:`2026-0${1+(i%8)}-1${i%9}`, meals:i%2?['lunch']:[], crewIds:i%3?[S.myCrew().id]:[], createdAt:Date.now()-(40+i)*864e5 }));
  });
  await h.load();

  await step('map: "on this day" card, above the map controls and the nav', async ()=>{
    await h.sleep(800);
    const r = await h.js(()=>{ const s=document.querySelector('#memStrip'); if (!s || s.hidden) return null; const b=s.getBoundingClientRect(), c=document.querySelector('.map-ctrl').getBoundingClientRect(), n=document.querySelector('#nav').getBoundingClientRect();
      return { text:s.innerText, overlapsCtrl: b.right > c.left && b.bottom > c.top, aboveNav: b.bottom <= n.top }; });
    if (!r) throw new Error('no strip');
    if (!/year ago today/i.test(r.text) || !/Ravi Restaurant/.test(r.text) || !/Kabir/.test(r.text)) throw new Error('text: '+r.text);
    if (r.overlapsCtrl) throw new Error('covers the map controls');
    if (!r.aboveNav) throw new Error('covers the nav');
    await h.shot('sc-otd');
  });
  await step('the bell has the memory too; dismissing the card shows the latest page', async ()=>{
    await h.click('#btnBell'); await h.sleep(500);
    if (!/A year ago today/.test(await text())) throw new Error('not in the bell');
    await h.shot('sc-bell'); await close();
    await h.click('#memStrip [data-ms="x"]'); await h.sleep(300);
    const t = await h.js(()=>document.querySelector('#memStrip').innerText);
    if (!/Latest page/i.test(t)) throw new Error('strip: '+t);
    await h.shot('sc-latest');
  });
  await step('log a visit with no photos: taped into the personal book, toast opens the page', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); go.log({ venueId:S.venues().find(v=>v.name==='Knot Bakehouse').id }); }); await h.sleep(700);
    await h.js(()=>document.querySelector('[data-who="me"]').click()); await h.sleep(200);
    await h.js(()=>document.querySelector('#lNotes').value='Cardamom knot, still warm'); await h.js(()=>document.querySelector('#lNotes').dispatchEvent(new Event('input')));
    if (/New place|Repeat visit|Combo/.test(await text())) throw new Error('points still shown in the form');
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(450);
    const ov = await h.js(()=>document.querySelector('.tapein')?.innerText||'');
    if (!/Taped into/.test(ov)) throw new Error('no taped-in moment');
    await h.shot('sc-tapein');
    await h.sleep(1300);
    if (await h.js(()=>!!document.querySelector('.tapein'))) throw new Error('overlay stuck');
    const t = await h.js(()=>document.querySelector('#toast').innerText);
    if (!/Taped into .*Vol/.test(t)) throw new Error('toast: '+t);
    if (await h.js(()=>document.querySelector('#points').classList.contains('show'))) throw new Error('points bar shown');
    await h.js(()=>[...document.querySelectorAll('#toast .toast-btn')].find(b=>/Open page/.test(b.textContent)).click()); await h.sleep(1200);
    const r = await h.js(()=>{ const f=document.querySelector('.page.flash'); if (!f) return null; const b=f.getBoundingClientRect(); return { text:f.innerText, top:b.top, plain:f.classList.contains('layout-plain'), stamp:!!f.querySelector('.postage') }; });
    if (!r) throw new Error('page not opened');
    if (!/Knot Bakehouse/.test(r.text) || !/Cardamom knot/.test(r.text) || !r.plain || !r.stamp) throw new Error('page: '+JSON.stringify(r));
    await h.shot('sc-page-plain');
    await close(); await settle();
  });
  await step('a crew visit is taped into the crew book', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); go.log({ venueId:S.venues().find(v=>v.name==='Arabian Tea House').id }); }); await h.sleep(700);
    await h.js(()=>document.querySelector('[data-who]:not([data-who="me"])').click()); await h.sleep(200);
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(450);
    const ov = await h.js(()=>document.querySelector('.tapein')?.innerText||'');
    if (!/Sample Crew Scrapbook/.test(ov)) throw new Error('overlay: '+ov);
    await settle();
  });
  await step('tagging a crewmate on a Just me visit shares it with the crew (with a note)', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); go.log({ venueId:S.venues().find(v=>v.name==='Ravi Restaurant').id }); }); await h.sleep(700);
    await h.js(()=>document.querySelector('[data-who="me"]').click()); await h.sleep(200);
    await h.js(()=>document.querySelector('[data-tag="demo-kabir"]').click()); await h.sleep(300);
    if (!/Tagging shares this visit with Sample Crew/.test(await text())) throw new Error('no note: '+JSON.stringify(await h.js(()=>({ on:[...document.querySelectorAll('#lTags .on')].map(x=>x.dataset.tag), who:[...document.querySelectorAll('#lWho .on')].map(x=>x.dataset.who), note:document.querySelector('.tag-note')?.innerText, unlock:!!document.querySelector('.unlock') }))));
    await h.js(()=>document.querySelector('#lTags').scrollIntoView({block:'center'})); await h.shot('sc-tagnote');
    await h.js(()=>document.querySelector('#lSave').click()); await h.sleep(500);
    const e = await h.js(async ()=>{ const S=await import('/store.js'); const x=S.entries({kind:'visit'}).filter(e=>e.userId===S.me().id).sort((a,b)=>b.createdAt-a.createdAt)[0]; return { private:x.private, crewIds:x.crewIds }; });
    if (e.private || !e.crewIds.length) throw new Error(JSON.stringify(e));
    await settle();
  });
  await step('the book is a feed: pages load as you scroll, no next-page buttons', async ()=>{
    await h.js(async ()=>{ const {go}=await import('/go.js'); const S=await import('/store.js'); go.book(S.books().find(b=>b.kind==='personal').id); }); await h.sleep(1400);
    const n0 = await h.js(()=>document.querySelectorAll('.feed .page').length);
    if (await h.js(()=>!!document.querySelector('.page-nav, [data-page]'))) throw new Error('old page buttons still there');
    await h.shot('sc-feed');
    for (let i=0;i<6;i++){ await h.js(()=>{ const s=[...document.querySelectorAll('.screen')].pop(); s.scrollTop = s.scrollHeight; }); await h.sleep(400); }
    const n1 = await h.js(()=>document.querySelectorAll('.feed .page').length);
    if (!(n1 > n0)) throw new Error(`pages ${n0} → ${n1}`);
    const ids = await h.js(()=>[...document.querySelectorAll('.feed .page')].map(x=>x.dataset.pageId));
    if (new Set(ids).size !== ids.length) throw new Error('a page twice');
    await h.shot('sc-feed-end');
    // By Place: chapters
    await h.js(()=>document.querySelector('[data-seg="bmode"] [data-v="place"], .seg [data-v="place"]').click()); await h.sleep(500);
    if (!(await h.js(()=>document.querySelectorAll('.chapter').length))) throw new Error('no chapters');
    await h.shot('sc-byplace');
    await close();
  });
  await step('Shelf: latest pages; the camera opens the log flow with the photos picked', async ()=>{
    await h.click('[data-tab="shelf"]'); await h.sleep(800);
    if (!/Latest pages/.test(await text())) throw new Error('no latest pages');
    await h.shot('sc-shelf');
    const [chooser] = await Promise.all([p.waitForFileChooser({timeout:4000}), h.js(()=>document.querySelector('#shNew').click())]);
    await chooser.accept([path.resolve('fixture.jpg')]); await h.sleep(1500);
    const t = await text();
    if (!/Log Entry/i.test(t)) throw new Error('not the log flow');
    if (/Add Scrapbook Memory/i.test(t)) throw new Error('old flow');
    await h.js(async ()=>{ const S=await import('/store.js'); const i=document.querySelector('#logQ'); i.value='Knot'; i.dispatchEvent(new Event('input')); }); await h.sleep(500);
    await h.js(()=>document.querySelector('.search-result[data-v]').click()); await h.sleep(500);
    if (!(await h.js(()=>document.querySelectorAll('.reel [data-rm]').length))) throw new Error('photo not carried in');
    await h.shot('sc-log-with-photo');
    await close();
  });
}
