// Koko search, end to end: the bar always on the Map and the Shelf (one component), results as photo cards (a
// place and its visits in one card), "pasta marina", a typo, a month, "ice cream with Kabir", tapping a card on the
// Map (flies, opens the place) and on the Shelf (opens the page), Show on map, "from photo", Add this place for a
// link or a name with no match (into the add-from-link flow), dish tags on the visit form, the Shelf's book chips,
// and Import Roll grouping photos by day and place with a suggested place.   node shot.mjs search 390 light|dark
import fs from 'fs';
import path from 'path';
export default async function searchE2E(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('srfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  const aiCalls = []; h.page.on('request', r=>{ if (r.url().includes('/api/photo-tags')) aiCalls.push(r.method()); });
  await h.seed({mode:'crew'});
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(400); };
  // a Marina place and a visit (pasta), a photo-only visit in Jumeirah, and Kabir's ice cream visit in September tagging you
  const ids = await h.js(async ()=>{ const S = await import('/store.js');
    const v = S.addVenue({ name:'Trattoria del Porto', zone:'marina', categories:['restaurant'], lat:25.0805, lng:55.1403 });
    const e = S.addEntry({ venueId:v.id, kind:'visit', rating:4, notes:'', date:'2026-10-01', dishTags:['pasta'] });
    const v2 = S.addVenue({ name:'Shack 21', zone:'jumeirah', categories:['coffee'], lat:25.2030, lng:55.2500 });
    const e2 = S.addEntry({ venueId:v2.id, kind:'visit', rating:4, notes:'', date:'2026-08-01' });
    const cv = document.createElement('canvas'); cv.width = cv.height = 8; const blob = await new Promise(r=>cv.toBlob(r, 'image/jpeg'));
    const [p] = await S.addPhotos([{ blob, caption:'', venueId:v2.id, entryId:e2.id, date:'2026-08-01' }]);
    S.setPhotoAiTags(p.id, ['ice cream', 'dessert', 'cone', 'outdoor']);
    const v3 = S.addVenue({ name:'Scoop Shop', zone:'jumeirah', categories:['icecream'], lat:25.2100, lng:55.2560 });
    S.flush();
    const crew = S.myCrew(), me = S.me().id, raw = JSON.parse(localStorage.getItem('bites-db-v2'));
    raw.entries['demo-sr1'] = { id:'demo-sr1', userId:'demo-kabir', venueId:v3.id, kind:'visit', rating:5, private:false, crewIds:[crew.id], taggedIds:[me], meals:[], notes:'Pistachio scoop', date:'2026-09-14', createdAt:Date.now() };
    localStorage.setItem('bites-db-v2', JSON.stringify(raw));
    return { v:v.id, e:e.id, v2:v2.id, e2:e2.id, v3:v3.id }; });
  await h.load();

  const MAPQ = '#mapSearch .ksearch-q', MAPOUT = '#mapSearch .ksearch-out';
  const type = async (sel, q)=>{ await h.js((sel, q)=>{ const i = document.querySelector(sel); i.focus(); i.value = q; i.dispatchEvent(new Event('input', { bubbles:true })); }, sel, q); await h.sleep(300); };
  const cards = out=>h.js(out=>({ v:[...document.querySelectorAll(out + ' [data-v]')].map(b=>b.dataset.v), e:[...document.querySelectorAll(out + ' [data-v]')].map(b=>b.dataset.e || ''),
    add:!!document.querySelector(out + ' [data-add]'), photo:[...document.querySelectorAll(out + ' .sr-photo')].map(x=>x.closest('[data-v]').dataset.v), img:document.querySelectorAll(out + ' .sr-img img').length,
    text:(document.querySelector(out)||{}).innerText||'' }), out);

  await step('the Map has the search bar at the top (no magnifier), with Me/Crew and filters under it', async ()=>{
    const r = await h.js(()=>{ const bar = document.querySelector('#mapSearch .ksearch-bar').getBoundingClientRect(), mode = document.querySelector('#mapMode').getBoundingClientRect();
      return { w:bar.width, vw:innerWidth, below:mode.top >= bar.bottom, mag:!!document.querySelector('#btnSearch') }; });
    await h.shot('sr-map-bar');
    if (r.mag || r.w < r.vw - 40 || !r.below) throw new Error(JSON.stringify(r));
  });
  await step('"pasta marina": one photo card for the place, its visit folded in', async ()=>{
    await type(MAPQ, 'pasta marina'); const r = await cards(MAPOUT);
    if (r.v[0] !== ids.v || r.e[0] !== ids.e || r.v.filter(x=>x === ids.v).length !== 1) throw new Error(JSON.stringify(r).slice(0, 200));
    await h.shot('sr-pasta-marina');
  });
  await step('a typo still matches: "pasat marnia"', async ()=>{ await type(MAPQ, 'pasat marnia'); if ((await cards(MAPOUT)).v[0] !== ids.v) throw new Error('typo'); });
  await step('a month: "September" finds Kabir\'s September visit; "ice cream with Kabir" too', async ()=>{
    await type(MAPQ, 'September'); let r = await cards(MAPOUT); if (!r.v.includes(ids.v3) || r.v.includes(ids.v)) throw new Error('month ' + JSON.stringify(r.v));
    await type(MAPQ, 'ice cream with Kabir'); r = await cards(MAPOUT); if (r.v[0] !== ids.v3 || r.v.includes(ids.v2)) throw new Error('combo ' + JSON.stringify(r.v));
    await h.shot('sr-combo');
  });
  await step('"ice cream" finds the photo-only visit with its photo and a "from photo" marker', async ()=>{
    await type(MAPQ, 'ice cream'); const r = await cards(MAPOUT);
    if (!r.photo.includes(ids.v2) || !r.img) throw new Error(JSON.stringify(r).slice(0, 200));
  });
  await step('Show on map dims every pin but the matches; clearing puts them back', async ()=>{
    await type(MAPQ, 'pasta marina');
    await h.js(()=>{ const c = document.querySelector('#mapSearch .ksearch-show'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true })); });
    await h.js(async ()=>{ const M=await import('/map.js'); M.fitCity(false); }); await h.sleep(900);
    const dim = await h.js(()=>({ dim:document.querySelectorAll('.stamp-anchor.dim, .map-dot.dim').length, all:document.querySelectorAll('.stamp-anchor, .map-dot').length }));
    await type(MAPQ, ''); await h.sleep(300);
    const after = await h.js(()=>document.querySelectorAll('.dim').length);
    if (!(dim.dim > 0 && dim.dim < dim.all) || after !== 0) throw new Error(JSON.stringify({ ...dim, after }));
  });
  await step('tap a card on the Map: it flies to the pin, the place\'s card opens, the results tuck away', async ()=>{
    await type(MAPQ, 'trattoria');
    await h.js(id=>document.querySelector(`#mapSearch [data-v="${id}"]`).click(), ids.v); await h.sleep(1400);
    const r = await h.js(async ()=>{ const M = await import('/map.js'), p = document.querySelector('#peek'); return { peek:p && !p.hidden ? p.innerText : '', at:M.centerLatLng(), open:!document.querySelector('#mapSearch .ksearch-drop').hidden }; });
    await h.shot('sr-fly-card');
    if (!/Trattoria del Porto/.test(r.peek) || r.open || Math.abs(r.at.lat - 25.0805) > 0.02) throw new Error(JSON.stringify(r).slice(0, 200));
  });
  await step('a name with no match offers "Add this place", which opens the add-from-link flow with it', async ()=>{
    await type(MAPQ, 'Zzyzx Noodle Bar'); const r = await cards(MAPOUT);
    if (!r.add || r.v.length) throw new Error(JSON.stringify(r).slice(0, 160));
    await h.shot('sr-add-name');
    await h.js(()=>document.querySelector('#mapSearch [data-add]').click()); await h.sleep(900);
    const t = await h.js(()=>({ title:document.querySelector('.share-screen')?.innerText || '', val:document.querySelector('#shIn')?.value }));
    if (!/Add from a link/.test(t.title) || t.val !== 'Zzyzx Noodle Bar') throw new Error(JSON.stringify(t).slice(0, 120));
    await close(); await type(MAPQ, '');
  });
  await step('a Google Maps link puts "Add this place" first', async ()=>{
    await type(MAPQ, 'https://maps.app.goo.gl/abc123'); const r = await cards(MAPOUT);
    if (!r.add || !/From the link you pasted/.test(r.text)) throw new Error(r.text.slice(0, 100));
    await type(MAPQ, '');
  });
  await step('the visit form: "What did you have?" chips still work', async ()=>{
    await h.js(async id=>{ const { go } = await import('/go.js'); go.log({ entryId:id }); }, ids.e); await h.sleep(800);
    const sug = await h.js(()=>[...document.querySelectorAll('#lDishSug [data-dish-add]')].map(b=>b.dataset.dishAdd));
    if (!sug.length) throw new Error('no suggestions');
    await close();
  });
  await step('the Shelf: the same bar at the top, then the book chips, then the photo grid; no magnifier', async ()=>{
    await h.js(async ()=>{ const { go } = await import('/go.js'); go.shelf(); }); await h.sleep(900);
    const r = await h.js(()=>{ const s = document.querySelector('.screen.in:last-of-type'); const bar = s.querySelector('#shSearchHost .ksearch-bar'), chips = s.querySelector('.shelf-chips'), grid = s.querySelector('.spreads');
      return { bar:!!bar, mag:!!s.querySelector('#shSearch'), order: bar && chips && grid ? bar.getBoundingClientRect().top < chips.getBoundingClientRect().top && chips.getBoundingClientRect().top < grid.getBoundingClientRect().top : false,
        chips:[...s.querySelectorAll('.shelf-chip')].map(c=>c.innerText.replace(/\s+/g,' ').trim()), buttons:!!s.querySelector('#shAlbum') && !!s.querySelector('#shImport') }; });
    await h.shot('sr-shelf');
    if (!r.bar || r.mag || !r.order || !r.buttons || !r.chips.some(c=>/Personal/.test(c)) || !r.chips.some(c=>/Critters/.test(c))) throw new Error(JSON.stringify(r));
  });
  await step('the Personal chip filters the grid; Critters opens its own screen', async ()=>{
    const n0 = await h.js(()=>document.querySelectorAll('.screen.in:last-of-type .spreads [data-spread]').length);
    await h.js(()=>[...document.querySelectorAll('.screen.in:last-of-type .shelf-chip')].find(c=>/Personal/.test(c.innerText)).click()); await h.sleep(400);
    const books = await h.js(()=>[...new Set([...document.querySelectorAll('.screen.in:last-of-type .spreads [data-spread]')].map(x=>x.dataset.inbook))]);
    const personal = await h.js(async ()=>{ const S=await import('/store.js'); return S.books().find(b=>b.kind==='personal').id; });
    if (!n0 || books.length !== 1 || books[0] !== personal) throw new Error(JSON.stringify({ n0, books }));
    await h.js(()=>document.querySelector('#shCritters').click()); await h.sleep(800);
    if (!/Critters/.test(await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || ''))) throw new Error('critters');
    await h.js(()=>history.back()); await h.sleep(600);
  });
  await step('search on the Shelf: results replace the grid; a card opens its scrapbook page', async ()=>{
    await type('#shSearchHost .ksearch-q', 'pasta');
    const r = await h.js(()=>({ grid:!document.querySelector('#shDyn').hidden, res:!document.querySelector('#shResults').hidden }));
    await h.shot('sr-shelf-search');
    if (r.grid || !r.res) throw new Error(JSON.stringify(r));
    await h.js(id=>document.querySelector(`#shResults [data-v="${id}"]`).click(), ids.v); await h.sleep(1200);
    const t = await h.js(()=>document.querySelector('.screen.in:last-of-type')?.innerText || '');
    if (!/Trattoria del Porto/.test(t)) throw new Error(t.slice(0, 100));
    await close();
  });
  await step('Import Roll: photos grouped by day and place; the place on the map is suggested; Use it files the visit', async ()=>{
    // two photos taken at the Trattoria (EXIF date and GPS), one with nothing in it
    const src = fs.readFileSync(path.resolve('fixture.jpg')), withExif = (date, lat, lng)=>{
      const b = Buffer.alloc(300), le = true; const v = new DataView(b.buffer, b.byteOffset, 300); let p = 0;
      const u16 = x=>{ v.setUint16(p, x, le); p += 2; }, u32 = x=>{ v.setUint32(p, x, le); p += 4; };
      v.setUint8(0, 0x49); v.setUint8(1, 0x49); p = 2; u16(42); u32(8);
      p = 8; u16(2); u16(0x8769); u16(4); u32(1); u32(50); u16(0x8825); u16(4); u32(1); u32(100); u32(0);
      p = 50; u16(1); u16(0x9003); u16(2); u32(20); u32(200); u32(0); Buffer.from(date + '\0').copy(b, 200);
      p = 100; u16(4); u16(1); u16(2); u32(2); v.setUint8(p, 78); p += 4; u16(2); u16(5); u32(3); u32(240); u16(3); u16(2); u32(2); v.setUint8(p, 69); p += 4; u16(4); u16(5); u32(3); u32(264); u32(0);
      const dms = (x, at)=>{ const d = Math.floor(x), m = Math.floor((x - d)*60), s = Math.round(((x - d)*60 - m)*60*1000); [[d,1],[m,1],[s,1000]].forEach(([n, den], k)=>{ v.setUint32(at + k*8, n, le); v.setUint32(at + k*8 + 4, den, le); }); };
      dms(lat, 240); dms(lng, 264);
      const seg = Buffer.concat([Buffer.from([0xFF, 0xE1, 0, 0]), Buffer.from('Exif\0\0', 'binary'), b]); seg.writeUInt16BE(seg.length - 2, 2);
      return Buffer.concat([src.subarray(0, 2), seg, src.subarray(2)]);
    };
    const dir = path.resolve('shots', 'roll'); fs.mkdirSync(dir, { recursive:true });
    fs.writeFileSync(path.join(dir, 'a.jpg'), withExif('2026:09:20 13:05:00', 25.0806, 55.1404));
    fs.writeFileSync(path.join(dir, 'b.jpg'), withExif('2026:09:20 13:40:00', 25.0807, 55.1402));
    fs.writeFileSync(path.join(dir, 'c.jpg'), src);
    await h.js(async ()=>{ const { go } = await import('/go.js'); go.shelf(); }); await h.sleep(900);
    const [chooser] = await Promise.all([h.page.waitForFileChooser({ timeout:4000 }), h.js(()=>document.querySelector('.screen.in:last-of-type #shImport').click())]);
    await chooser.accept(['a.jpg', 'b.jpg', 'c.jpg'].map(f=>path.join(dir, f))); await h.sleep(2500);
    const r = await h.js(()=>({ text:document.querySelector('.sheet')?.innerText || '', groups:document.querySelectorAll('.roll-group').length, use:!!document.querySelector('[data-use]') }));
    await h.shot('sr-import-roll');
    if (r.groups !== 2 || !r.use || !/Trattoria del Porto/.test(r.text) || !/don't say where/.test(r.text)) throw new Error(JSON.stringify(r).slice(0, 240));
    await h.js(()=>document.querySelector('[data-use]').click()); await h.sleep(1200);
    const t = await h.js(()=>({ text:document.querySelector('.screen.in:last-of-type .search input')?.value || '', photos:document.querySelectorAll('.reel [data-rm]').length, date:document.querySelector('#lDate')?.value }));
    if (!/Trattoria del Porto/.test(t.text) || t.photos !== 2 || t.date !== '2026-09-20') throw new Error(JSON.stringify({ photos:t.photos, date:t.date, place:/Trattoria del Porto/.test(t.text) }));
    await close();
  });
  await step('photo tagging off: no AI call was made', async ()=>{ if (aiCalls.filter(m=>m === 'POST').length) throw new Error(aiCalls.join(',')); });
}
