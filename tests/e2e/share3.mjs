// Share to Koko, step 3: TikTok captions. The first part uses the real TikTok (through the dev
// server, no keys: the 📍 line); the second fakes a two-place answer to show the pick-one sheet.
export default async function share3(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('s3fail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const openAdd = async ()=>{ await h.click('#navLog'); await h.click('[data-plus="link"]'); await p.waitForSelector('#shIn', {visible:true}); };
  const submit = async v=>{ await h.js(v=>{ document.querySelector('#shIn').value=v; }, v); await h.js(()=>document.querySelector('#shGo').click()); };
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  const slow = async (fn)=>{ await p.setRequestInterception(true); const hd=req=>{ if (req.url().endsWith('/api/resolve-share')) setTimeout(()=>req.continue(), 1200); else req.continue(); }; p.on('request', hd); try{ await fn(); } finally { p.off('request', hd); await p.setRequestInterception(false); } };
  await h.seed({mode:'crew'});

  await step('a real TikTok: "Reading the TikTok…", then the place from its caption', async ()=>{
    await slow(async ()=>{ await openAdd(); await submit('https://vm.tiktok.com/ZN8h6UV2v/'); await h.sleep(400);
      if (!/Reading the TikTok/.test(await text())) throw new Error('no TikTok loading text'); await h.shot('s3-loading');
      await p.waitForSelector('#npQ', { visible:true, timeout:20000 }); });
    if (!(await text()).includes('caption mentions Amritsar (Al Karama)')) throw new Error('mention missing');
    await p.waitForSelector('#npQ', { visible:true, timeout:20000 });
    if (await h.js(()=>document.querySelector('#npQ').value) !== 'Amritsar') throw new Error('name not filled in from the caption');
    if (!(await text()).toLowerCase().includes('@biggest.bites_')) throw new Error('creator not shown');
    await h.shot('s3-tiktok-which-place');
    await close();
  });

  await step('a caption naming two places → "The caption mentions…" and pick one', async ()=>{
    await p.setRequestInterception(true);
    const handler = req=>{
      if (req.url().endsWith('/api/resolve-share')) return req.respond({ status:200, contentType:'application/json', body: JSON.stringify({
        sourceType:'tiktok', sourceUrl:'https://vm.tiktok.com/ZNabc/', author:'dubaifoodie', state:'candidates', via:'claude', query:'Filli Cafe',
        found:[{ name:'Filli Cafe', area:'JLT' }, { name:'Karak House', area:null }],
        candidates:[{ placeId:'f', name:'Filli Cafe', lat:25.069, lng:55.144, address:'Cluster D, JLT - Dubai', types:['cafe'], category:'coffee' },
                    { placeId:'k', name:'Karak House', lat:25.21, lng:55.25, address:'Jumeirah - Dubai', types:['restaurant'], category:'karak' }] }) });
      req.continue();
    };
    p.on('request', handler);
    try{
      await openAdd(); await submit('https://vm.tiktok.com/ZNabc/');
      await p.waitForSelector('.sheet [data-i]', { visible:true, timeout:8000 });
      const t = await text();
      if (!/The caption mentions Filli Cafe \(JLT\) and Karak House/.test(t)) throw new Error('mentions missing');
      if (!/FROM TIKTOK · @DUBAIFOODIE|From TikTok · @dubaifoodie/i.test(t)) throw new Error('source label missing');
      await h.shot('s3-candidates');
      await h.js(()=>document.querySelector('.sheet [data-i="1"]').click());
      await p.waitForSelector('#cfAdd', { visible:true, timeout:5000 });
      if (await h.js(()=>!!document.querySelector('#cfC [data-cat="karak"].on')) !== true) throw new Error('category not taken from the place');
      await h.shot('s3-confirm');
    } finally { p.off('request', handler); await p.setRequestInterception(false); }
    await close();
  });

  await step('a pasted caption shows "Reading the caption…"', async ()=>{
    await slow(async ()=>{ await openAdd(); await submit('Best karak in town, the saffron one is unreal 🫖 📍 Filli Cafe, JLT'); await h.sleep(400);
      if (!/Reading the caption/.test(await text())) throw new Error('no caption loading text');
      await p.waitForSelector('#npQ, #cfAdd, .sheet [data-i]', { visible:true, timeout:20000 }); });
    await p.waitForSelector('#npQ, #cfAdd, .sheet [data-i]', { visible:true, timeout:20000 });
    if (await h.js(()=>document.querySelector('#npQ')?.value) !== 'Filli Cafe') throw new Error('pin not read from the pasted caption');
    await close();
  });
}
