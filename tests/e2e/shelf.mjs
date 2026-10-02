// The shelf's "Fresh Spreads" with real phone photos (portrait), shared with the crew:
// no duplicates, square frames, nothing overlapping.
export default async function shelf(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('shfail-'+name.replace(/\W+/g,'-')); } };
  await h.seed({mode:'crew'});
  // two tall photos on a visit shared with the crew (so they're in both your book and the crew's)
  await h.js(async ()=>{
    const S = await import('/store.js');
    const make = (hue)=>new Promise(r=>{ const c=document.createElement('canvas'); c.width=600; c.height=1060; const g=c.getContext('2d');
      g.fillStyle=`hsl(${hue},45%,45%)`; g.fillRect(0,0,600,1060); g.fillStyle='#fff'; g.font='bold 90px sans-serif'; g.fillText('TALL', 160, 540); c.toBlob(r, 'image/jpeg', .8); });
    const v = S.venues().find(x=>x.name==='Knot Bakehouse');
    const e = S.addEntry({ venueId:v.id, kind:'visit', rating:4, crewIds:[S.myCrew().id] });
    await S.addPhotos([{ blob:await make(20), venueId:v.id, entryId:e.id, caption:'Hoop' }, { blob:await make(200), venueId:v.id, entryId:e.id, caption:'Hoop' }]);
    // with no bookmarks, the shelf shows "Fresh Spreads"
    S.photos().forEach(ph=>{ if ((ph.bookmarkedBy||[]).length) S.updatePhoto(ph.id, { bookmarkedBy:[] }); });
  });
  await step('Fresh Spreads: no photo twice, square frames, nothing overlapping', async ()=>{
    await h.click('[data-tab="shelf"]'); await h.sleep(900);
    await h.js(()=>{ const s=[...document.querySelectorAll('.screen')].pop(); const sp=s.querySelector('.spreads'); s.scrollTop = sp.offsetTop - 80; }); await h.sleep(400);
    await h.shot('shelf-spreads');
    const r = await h.js(()=>{
      const cards = [...document.querySelectorAll('.spread-card')];
      const ids = cards.map(c=>c.dataset.spread);
      const imgs = cards.map(c=>{ const b=c.querySelector('.sp-img').getBoundingClientRect(); return b.height / b.width; });
      // every card's contents stay inside the card
      const spill = cards.some(c=>{ const cb=c.getBoundingClientRect(); return [...c.querySelectorAll('*')].some(x=>{ const b=x.getBoundingClientRect(); return b.height && b.bottom > cb.bottom + 1; }); });
      const grid = document.querySelector('.spreads').getBoundingClientRect(), btn = document.querySelector('#shAlbum').getBoundingClientRect();
      return { n:ids.length, unique:new Set(ids).size, ratios:imgs.map(x=>+x.toFixed(2)), spill, buttonsBelow: btn.top >= grid.bottom };
    });
    if (r.unique !== r.n) throw new Error('duplicates: '+JSON.stringify(r));
    if (r.ratios.some(x=>x>1.1)) throw new Error('tall frames: '+JSON.stringify(r.ratios));
    if (r.spill) throw new Error('content spills out of a card');
    if (!r.buttonsBelow) throw new Error('buttons overlap the spreads');
  });
}
