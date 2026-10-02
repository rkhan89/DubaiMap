// Adding a place by hand with Google suggestions (faked /api/places: the dev server has no key),
// and Settings → Send feedback, and what error reports keep.
export default async function places(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('pfail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const store = (fn, ...a)=>h.js(async (src, a)=>{ const S=await import('/store.js'); return (new Function('S','a','return ('+src+')(S,a)'))(S,a); }, fn.toString(), a);
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  const typeSearch = async v=>{ await p.click('#logQ', { clickCount:3 }); await p.type('#logQ', v, { delay:40 }); };
  // a fake Google behind /api/places
  let google = 'on', calls = [];
  await p.setRequestInterception(true);
  p.on('request', req=>{
    if (!req.url().endsWith('/api/places')) return req.continue();
    const b = JSON.parse(req.postData()||'{}'); calls.push(b);
    if (google === 'off') return req.respond({ status:200, contentType:'application/json', body:JSON.stringify({ state:'unavailable', suggestions:[] }) });
    if (b.action === 'suggest') return req.respond({ status:200, contentType:'application/json', body:JSON.stringify({ state:'ok', suggestions:[
      { placeId:'ChIJamritsr001', name:'Amritsr', detail:'Al Karama, Dubai' }, { placeId:'ChIJamritsr002', name:'Amritsr Express', detail:'JLT, Dubai' } ] }) });
    return req.respond({ status:200, contentType:'application/json', body:JSON.stringify({ state:'ok', place:{ placeId:'ChIJamritsr001', name:'Amritsr', lat:25.2453, lng:55.3036, address:'Al Karama, Dubai', types:['indian_restaurant','restaurant'], category:'restaurant' } }) });
  });
  await h.seed({mode:'crew'});

  await step('typing a new place shows "On Google Maps" suggestions', async ()=>{
    await go('log', {}); await p.waitForSelector('#logQ', { visible:true });
    await typeSearch('Amri'); await p.waitForSelector('[data-g]', { visible:true, timeout:5000 });
    const t = await text();
    if (!/On Google Maps/i.test(t) || !/Amritsr Express/.test(t) || !/Results from Google Maps/.test(t)) throw new Error('no suggestions');
    // typing doesn't repeat a search per keystroke, and every call uses the same session
    const sugg = calls.filter(c=>c.action==='suggest');
    if (sugg.length > 2) throw new Error(sugg.length+' searches for 4 letters');
    if (new Set(sugg.map(c=>c.sessionToken)).size !== 1) throw new Error('session changed while typing');
    if (await h.js(()=>document.activeElement && document.activeElement.id) !== 'logQ') throw new Error('search box lost focus');
    await h.shot('pl-suggestions');
  });
  await step('picking one fills in the new-place form (name, exact spot, area, kind)', async ()=>{
    const token = calls.filter(c=>c.action==='suggest').pop().sessionToken;
    await h.js(()=>document.querySelector('[data-g="ChIJamritsr001"]').click());
    await p.waitForSelector('#vfN', { visible:true, timeout:5000 });
    const f = await h.js(()=>({ name:document.querySelector('#vfN').value, zone:document.querySelector('#vfZ').value, cat:!!document.querySelector('#vfC [data-cat="restaurant"].on'), exact:/EXACT|📍|exact/i.test(document.querySelector('.sheet').innerText) }));
    if (f.name!=='Amritsr' || f.zone!=='karama' || !f.cat || !f.exact) throw new Error(JSON.stringify(f));
    if (calls.find(c=>c.action==='details').sessionToken !== token) throw new Error('details not in the same session');
    if (!/Place details from Google Maps/.test(await text())) throw new Error('no attribution');
    await h.shot('pl-form');
    await h.js(()=>document.querySelector('#vfS').click()); await h.sleep(700);
    const v = await store(S=>{ const v=S.venues().find(x=>x.name==='Amritsr'); return v && { pid:v.googlePlaceId, lat:v.lat, zone:v.zone, address:v.address }; });
    if (!v || v.pid!=='ChIJamritsr001' || v.lat!==25.2453 || v.zone!=='karama') throw new Error(JSON.stringify(v));
    if (v.address) throw new Error('Google address stored (not allowed)');
    if (!await h.js(()=>!!document.querySelector('#lStars'))) throw new Error('not on to logging the visit');
    await close();
  });
  await step('a Google place already on the map is offered from the map, not added twice', async ()=>{
    await go('log', {}); await p.waitForSelector('#logQ', { visible:true });
    await typeSearch('Amritsr'); await p.waitForSelector('[data-g], [data-v]', { visible:true, timeout:5000 }); await h.sleep(600);
    if (await h.js(()=>!!document.querySelector('[data-g="ChIJamritsr001"]'))) throw new Error('shown twice');
    if (!await h.js(()=>[...document.querySelectorAll('[data-v]')].some(b=>/Amritsr/.test(b.textContent)))) throw new Error('not offered from the map');
    await close();
  });
  await step('no Google (no key, signed out): the list just isn\'t there; add it yourself still works', async ()=>{
    google = 'off';
    await go('log', {}); await p.waitForSelector('#logQ', { visible:true });
    await typeSearch('Secret Shawarma'); await h.sleep(900);
    if (/On Google Maps/i.test(await text())) throw new Error('Google section shown');
    if (!await h.js(()=>!!document.querySelector('#lNew'))) throw new Error('no add-it-yourself');
    await close(); google = 'on';
  });
  await step('Settings → Send feedback', async ()=>{
    await go('settings'); await h.sleep(600);
    await h.js(()=>document.querySelector('[data-go="feedback"]').click()); await h.sleep(500);
    await h.js(()=>document.querySelector('[data-seg="fbKind"] [data-v="idea"]').click()); await h.sleep(200);
    await p.type('#fbMsg', 'Let me sort the list by distance');
    await h.shot('pl-feedback');
    await h.js(()=>document.querySelector('#fbGo').click()); await h.sleep(500);
    if (!/feedback is on its way/.test(await h.js(()=>document.querySelector('#toast').innerText))) throw new Error('no thanks');
    const sent = await h.js(()=>JSON.parse(localStorage.getItem('koko-feedback-local')||'[]').pop());
    if (!sent || sent.kind!=='idea' || !/distance/.test(sent.message) || !sent.appInfo.version) throw new Error(JSON.stringify(sent));
    await close();
  });
  await step('error reports keep the path, never the address or what was shared', async ()=>{
    const t = await h.js(async ()=>{ const E=await import('/errors.js'); return E.tidy('TypeError at paint (https://dubai-bites-pi.vercel.app/place.js?v=2:120:7) via https://dubai-bites-pi.vercel.app/share?text=secret#x'); });
    if (/secret|dubai-bites|\?|#/.test(t) || !/\/place\.js:120:7/.test(t)) throw new Error(t);
  });
}
