// Places record, phase 2: the Places toggle on List. Filters combine (name, any of the areas, all of the tags),
// sorting, the empty state and Clear, rows open the place, whose page shows call / website / Instagram / other
// links and directions (never a Google link); empty details are hidden.
//   node shot.mjs recordList 390 light
export default async function recordList(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('rlfail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'crew'});
  // give visited places details and tags (as phase 1's card would have)
  const setup = await h.js(async ()=>{
    const S = await import('/store.js');
    const visited = [...new Set(S.entries({ kind:'visit' }).map(e=>e.venueId))].map(S.venue).filter(Boolean);
    const [a, b, c] = visited;
    S.updateVenue(a.id, { phone:'+97143334444', website:'https://example.com/menu', instagram:'koko.test', otherSocials:['https://www.facebook.com/kokotest','https://www.tiktok.com/@kokotest'], address:'Jumeirah Beach Rd' });
    S.addVenueTag(a.id, 'rooftop'); S.addVenueTag(b.id, 'rooftop'); S.addVenueTag(a.id, 'late night');
    S.updateVenue(c.id, { name:'A very long place name that keeps going well past the edge of a small phone screen' });
    S.flush();
    return { total:visited.length, a:{ id:a.id, zone:a.zone, name:a.name }, b:{ id:b.id, zone:b.zone }, c:c.id };
  });
  const rows = ()=>h.js(()=>[...document.querySelectorAll('#pRows [data-venue]')].map(b=>b.dataset.venue));
  const typeQ = v=>h.js(v=>{ const q=document.querySelector('#pq'); q.value=v; q.dispatchEvent(new Event('input',{bubbles:true})); }, v);
  await step('List has a Feed / Places toggle; Places lists every place been to', async ()=>{
    await h.js(()=>{ const p=JSON.parse(localStorage.getItem('bites-prefs')||'{}'); p.listTab='feed'; localStorage.setItem('bites-prefs', JSON.stringify(p)); });
    await h.click('[data-tab="list"]'); await h.sleep(500);
    if (!(await h.js(()=>!!document.querySelector('#lTab')))) throw new Error('no toggle');
    await h.shot('pl2-feed');
    await h.click('[data-tab-l="places"]'); await h.sleep(500);
    const n = (await rows()).length;
    if (n !== setup.total) throw new Error(`rows ${n}, places been to ${setup.total}`);
    await h.shot('pl2-places');
  });
  await step('the toggle is remembered', async ()=>{
    await h.click('[data-tab="map"]'); await h.click('[data-tab="list"]'); await h.sleep(400);
    if (!(await h.js(()=>!!document.querySelector('#pRows')))) throw new Error('back on the feed');
  });
  await step('tags: all of the picked ones; areas: any of the picked ones; with the name search too', async ()=>{
    await h.click('[data-ptag="rooftop"]');
    let r = await rows(); if (r.length!==2 || !r.includes(setup.a.id) || !r.includes(setup.b.id)) throw new Error('rooftop: '+r.length);
    await h.click('[data-ptag="late night"]');
    r = await rows(); if (r.length!==1 || r[0]!==setup.a.id) throw new Error('rooftop + late night: '+r.length);
    await h.click('[data-ptag="late night"]');
    await h.click(`[data-area="${setup.a.zone}"]`);
    r = await rows(); const inA = setup.a.zone===setup.b.zone ? 2 : 1; if (r.length!==inA) throw new Error('rooftop in one area: '+r.length);
    if (setup.a.zone!==setup.b.zone){ await h.click(`[data-area="${setup.b.zone}"]`); r = await rows(); if (r.length!==2) throw new Error('rooftop in either area: '+r.length); }
    await h.shot('pl2-filtered');
    await typeQ(setup.a.name.slice(0,4)); await h.sleep(400);
    r = await rows(); if (!r.includes(setup.a.id)) throw new Error('name search lost the place');
  });
  await step('nothing matches: a clear empty state, and Clear filters brings everything back', async ()=>{
    await typeQ('zzzz no such place'); await h.sleep(400);
    if ((await rows()).length || !/No places match/.test(await h.js(()=>document.querySelector('#listView').innerText))) throw new Error('no empty state');
    await h.shot('pl2-empty');
    await h.click('#pClear2');
    if ((await rows()).length !== setup.total) throw new Error('clear did not reset');
  });
  await step('sorting: A to Z, most visited, most recent', async ()=>{
    await h.page.select('#pSort', 'name'); await h.sleep(300);
    const names = await h.js(()=>[...document.querySelectorAll('#pRows .pr-title')].map(b=>b.textContent));
    const sorted = [...names].sort((a,b)=>a.localeCompare(b, 'en', { sensitivity:'base' }));
    if (names.join('|') !== sorted.join('|')) throw new Error('not A to Z');
    await h.page.select('#pSort', 'visits'); await h.sleep(300);
    const counts = await h.js(()=>[...document.querySelectorAll('#pRows .pr-meta')].map(m=>parseInt(m.innerText.match(/(\d+) visit/)[1])));
    if (counts.some((c,i)=>i && c > counts[i-1])) throw new Error('not by visits: '+counts);
    await h.page.select('#pSort', 'recent'); await h.sleep(300);
  });
  await step('long names wrap to two lines, nothing runs off the screen; each row shows who went', async ()=>{
    const m = await h.js(id=>{ const r=document.querySelector(`#pRows [data-venue="${id}"]`); const t=r.querySelector('.pr-title');
      return { right:r.getBoundingClientRect().right, vw:innerWidth, h:t.getBoundingClientRect().height, lh:parseFloat(getComputedStyle(t).lineHeight), avatars:r.querySelector('.pr-who').children.length }; }, setup.c);
    if (m.right > m.vw - 15) throw new Error('row past the gutter '+m.right);
    if (m.h > m.lh*2 + 2) throw new Error('title taller than two lines');
    if (!m.avatars) throw new Error('no avatars');
  });
  await step('a row opens the place: call, website, Instagram, other links and directions; empty ones hidden', async ()=>{
    await h.js(id=>document.querySelector(`#pRows [data-venue="${id}"]`).click(), setup.a.id); await h.sleep(1200);
    const links = await h.js(()=>[...document.querySelectorAll('.screen.in .contact-list a')].map(a=>a.getAttribute('href')));
    const want = ['tel:+97143334444', 'https://example.com/menu', 'https://www.instagram.com/koko.test/', 'https://www.facebook.com/kokotest', 'https://www.tiktok.com/@kokotest'];
    if (want.some(w=>!links.includes(w))) throw new Error('links '+JSON.stringify(links));
    const dir = await h.js(()=>[...document.querySelectorAll('.screen.in a')].find(a=>/Directions/.test(a.innerText))?.getAttribute('href'));
    if (!dir || /google/.test(dir)) throw new Error('directions '+dir);
    await h.js(()=>document.querySelector('.screen.in .contact-list').scrollIntoView({ block:'center' })); await h.sleep(300);
    await h.shot('pl2-detail');
    await h.js(async id=>{ const U=await import('/ui.js'); U.closeAll(); const {go}=await import('/go.js'); go.place(id); }, setup.c); await h.sleep(1000);
    if (await h.js(()=>!!document.querySelector('.screen.in .contact-list'))) throw new Error('empty contact block shown');
  });
  await step('directions open the phone’s maps app: Apple Maps on iPhone, geo: on Android, OpenStreetMap otherwise', async ()=>{
    const d = await h.js(async ()=>{ const P = await import('/place.js'); const v = { name:'Karak House', zone:'jumeirah', lat:25.2, lng:55.25 };
      return [P.directionsURL(v, 'iPhone'), P.directionsURL(v, 'Linux; Android 14'), P.directionsURL(v, 'Windows NT'), P.directionsURL({ name:'X', zone:'jumeirah' }, 'Android')]; });
    if (!/^https:\/\/maps\.apple\.com\/\?daddr=25\.200000,55\.250000/.test(d[0]) || !/^geo:25\.200000,55\.250000\?q=/.test(d[1]) || !/openstreetmap\.org\/directions/.test(d[2]) || !/^geo:0,0\?q=X/.test(d[3])) throw new Error(JSON.stringify(d));
  });
}
