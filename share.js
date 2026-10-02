// Share to Koko (Phase 1c): turn a Google Maps link, a TikTok link, a caption or a place name
// into a want-to-try on your map. The server works out which place it is (api/resolve-share);
// nothing is ever added without you confirming, and every add asks who it's for.
import { APP } from './config.js';
import * as S from './store.js';
import * as MAP from './map.js';
import { CATEGORIES, MEALS, catById, iconSvg, esc, ago } from './data.js';
import { $, icon, toast, openScreen, openSheet, back, closeAll, topbar, catChip, seg, bindSeg, whoHTML, bindWho, whoDefault, whoText, catPickerHTML, bindCatPicker } from './ui.js';
import { go } from './go.js';

const SOURCE = {
  google_maps: { label:'From Google Maps', ic:'map' },
  tiktok:      { label:'From TikTok', ic:'music_note' },
  instagram:   { label:'From Instagram', ic:'photo_camera' },
  text:        { label:'From what you typed', ic:'edit_note' },
  manual:      { label:'Added by you', ic:'edit_location_alt' },
};
// "From TikTok · @biggest.bites_"
const srcLabel = src => { const s = SOURCE[src.sourceType] || SOURCE.text; return s.label + (src.author ? ' · @' + src.author : ''); };
export const zoneFor = (lat, lng)=>{ if (lat==null || lng==null) return null; const ai = MAP.toAI(lat, lng); return MAP.inMap(ai.a, ai.i) ? MAP.nearestZone(ai.a, ai.i).id : null; };

/* ---------- talking to the resolver ---------- */
// Google place suggestions (/api/places): { state:'ok', suggestions } or { state:'ok', place }; 'unavailable' without a key
export async function placesApi(body){
  if (navigator.onLine === false) return { state:'offline' };
  const token = await S.accessToken(); if (!token) return { state:'signed_out' };
  try{
    const r = await fetch('/api/places', { method:'POST', signal:AbortSignal.timeout(8000),
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body:JSON.stringify(body) });
    if (r.status===401) return { state:'signed_out' };
    return (await r.json().catch(()=>null)) || { state:'error' };
  }catch(_){ return { state:'error' }; }
}
async function resolve(input){
  if (navigator.onLine === false) return { state:'offline' };
  const token = await S.accessToken();
  if (!token) return { state:'signed_out' };
  try{
    const r = await fetch('/api/resolve-share', { method:'POST', signal:AbortSignal.timeout(28000),
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body:JSON.stringify(input) });
    if (r.status===401) return { state:'signed_out' };
    const j = await r.json().catch(()=>null);
    return j || { state:'error', message:'Something went wrong reading that.' };
  }catch(e){
    return e && e.name==='TimeoutError' ? { state:'timeout' } : { state:navigator.onLine===false ? 'offline' : 'error' };
  }
}

/* ---------- "Add from link or text" ---------- */
export function addFromLink(prefill, shared, inboxId){
  openScreen(el=>{
    let busy = false;
    const paint = (status)=>{
      el.innerHTML = topbar({ title:'Add from a link', eyebrow:'Share to '+APP.name }) + `<div class="screen-body">
        <h1 class="h-lg mt12">Seen somewhere good?</h1>
        <p class="muted mt8">Paste a Google Maps link, a TikTok link or caption, or just type the place's name. You'll check it before anything is added.</p>
        ${!inboxId && S.inbox().length ? `<button class="inbox-chip mt12" id="shInbox">${icon('inbox')}<span>${S.inbox().length} waiting in your Inbox</span>${icon('chevron_right')}</button>` : ''}
        <label class="eyebrow mt20" for="shIn" style="display:block">Link, caption or name</label>
        <textarea class="input mt8 share-in" id="shIn" maxlength="2000" placeholder="https://maps.app.goo.gl/…  or  Ravi Restaurant">${esc(prefill||'')}</textarea>
        <div class="btn-grid mt12"><button class="btn btn-soft" id="shPaste">${icon('content_paste')}Paste</button><button class="btn btn-gold" id="shGo">${icon('travel_explore')}Find it</button></div>
        <div id="shStatus" class="mt20">${status||''}</div>
        <div class="share-sources mt24"><span class="eyebrow">Works with</span>
          <div class="chip-wrap mt8"><span class="tag soft">${icon('map')}Google Maps</span><span class="tag soft">${icon('edit_note')}Place names</span><span class="tag soft">${icon('music_note')}TikTok captions</span></div>
          <p class="muted small mt8">Instagram doesn't let apps read posts: paste the caption or the name instead.</p>
          ${isIOS() ? `<button class="link small mt8" id="shIos">${icon('ios_share')} On iPhone? Share straight to ${esc(APP.name)}</button>` : ''}</div>
      </div>`;
      const inp = el.querySelector('#shIn');
      // read the clipboard only when you tap Paste
      el.querySelector('#shPaste').onclick = async ()=>{
        try{ const t = await navigator.clipboard.readText(); if (t){ inp.value = t.slice(0,2000); } else toast('Your clipboard is empty'); }
        catch(_){ toast('Long-press the box and choose Paste'); inp.focus(); }
      };
      el.querySelector('#shGo').onclick = ()=>run(inp.value);
      const ib = el.querySelector('#shInbox'); if (ib) ib.onclick = ()=>inboxScreen();
      const io = el.querySelector('#shIos'); if (io) io.onclick = ()=>iphoneShortcut();
      inp.addEventListener('keydown', e=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); run(inp.value); } });
    };
    const run = async (value)=>{
      const v = String(value||'').trim();
      if (!v) return toast('Paste a link or type a place name');
      if (busy) return; busy = true;
      el.querySelector('#shStatus').innerHTML = loadingHTML(v);
      el.querySelector('#shGo').disabled = true;
      const isLink = /https?:\/\//i.test(v);
      // a share from the phone's Share menu goes as it came (link and text separately); edits go as typed
      const input = shared && v === String(prefill||'').trim() ? { url:shared.url||'', text:shared.text||'', title:shared.title||'' } : (isLink ? { url:'', text:v } : { text:v });
      const res = await resolve(input);
      busy = false;
      const b = el.querySelector('#shGo'); if (b) b.disabled = false;
      const st = el.querySelector('#shStatus'); if (st) st.innerHTML = '';
      handle(res, { raw:v, inboxId });
    };
    paint();
    if (prefill) setTimeout(()=>run(prefill), 50);
  }, { cls:'share-screen' });
}
go.shareAdd = addFromLink;

/* ---------- the Inbox: shares to finish later ---------- */
const isIOS = ()=> /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// "Save for later": the share as it came (its link, and the text if it was more than the link)
function saveForLater(src, ctx, quiet){
  if (ctx && ctx.inboxId){ if (!quiet) toast('It’s still in your Inbox'); return null; }
  const raw = String(ctx && ctx.raw || '').trim();
  const item = S.addToInbox({ sourceUrl: src.sourceUrl || null, sourceType: src.sourceType || null, text: raw && raw !== src.sourceUrl ? raw : '' });
  if (item && !quiet) toast('Saved to your Inbox', 'Open', ()=>inboxScreen());
  return item;
}
const laterHTML = ctx => ctx && ctx.inboxId ? '' : `<button class="btn btn-ghost btn-block mt8" data-later>${icon('inbox')}Save to Inbox for later</button>`;
function bindLater(body, src, ctx){ const b = body.querySelector('[data-later]'); if (b) b.onclick = ()=>{ saveForLater(src, ctx); closeAll(); }; }
function doneWithInbox(ctx){ if (ctx && ctx.inboxId) S.removeFromInbox(ctx.inboxId); }

const SRC_ICON = { google_maps:'map', tiktok:'music_note', instagram:'photo_camera', text:'edit_note', manual:'link' };
function inboxRowText(i){
  // the words, without the link (the link's site shows underneath)
  const first = (i.title || i.text || '').replace(/https?:\/\/\S+/g, ' ').split('\n').map(s=>s.replace(/\s+/g, ' ').trim()).find(Boolean);
  if (first) return first;
  try{ const u = new URL(i.sourceUrl); return u.hostname.replace(/^www\./,'') + u.pathname; }catch(_){ return i.sourceUrl || 'Shared place'; }
}
function inboxScreen(){
  openScreen(el=>{
    const paint = ()=>{
      const list = S.inbox();
      el.innerHTML = topbar({ title:'Inbox', eyebrow:'Share to '+APP.name }) + `<div class="screen-body">
        <p class="muted mt8">Shares waiting to be added: ones you saved for later, ones you shared while offline, and extras shared before you signed in. Only you can see them.</p>
        ${list.length ? `<div class="stack mt16">${list.map(i=>`<div class="inbox-row">
            <button class="search-result grow" data-open="${i.id}"><span class="sr-ico">${icon(SRC_ICON[i.sourceType] || (i.sourceUrl ? 'link' : 'edit_note'))}</span>
              <span class="grow" style="min-width:0"><b class="trunc" style="display:block">${esc(inboxRowText(i))}</b><span class="muted small">${esc((SOURCE[i.sourceType]||{label:i.sourceUrl?'Link':'Text'}).label)} · ${esc(ago(i.createdAt))}</span></span>${icon('chevron_right')}</button>
            <button class="icon-btn" data-remove="${i.id}" aria-label="Remove from Inbox">${icon('close')}</button></div>`).join('')}</div>`
        : `<div class="empty mt24">${icon('inbox')}<span class="hand">Nothing waiting</span><p class="muted small">Tap “Save to Inbox for later” when you share something you'll add another time.</p></div>`}
        <button class="link small mt24" id="ibIos">${icon('ios_share')} Share to ${esc(APP.name)} from an iPhone</button>
      </div>`;
      el.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{
        const i = S.inbox().find(x=>x.id===b.dataset.open); if (!i) return;
        const shared = { url:i.sourceUrl||'', text:i.text||'', title:i.title||'' };
        const parts = [i.title && !i.text && !i.sourceUrl ? i.title : '', i.text, i.sourceUrl && !String(i.text||'').includes(i.sourceUrl) ? i.sourceUrl : ''].filter(Boolean);
        addFromLink(parts.join('\n'), shared, i.id);
      });
      el.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
        const i = S.inbox().find(x=>x.id===b.dataset.remove); if (!i) return;
        S.removeFromInbox(i.id); paint();
        toast('Removed from your Inbox', 'Undo', ()=>{ S.addToInbox(i); paint(); });
      });
      el.querySelector('#ibIos').onclick = ()=>iphoneShortcut();
    };
    paint();
    // keep the list current while it's open (a share saved elsewhere, or a sync); stop once it closes
    const off = S.onChange(what=>{ if (!el.isConnected) return off(); if (what==='inbox' || what==='sync') paint(); });
  });
}
go.inbox = inboxScreen;

/* ---------- iPhone: a Shortcut in the Share menu (Safari web apps can't add themselves to it) ---------- */
function iphoneShortcut(){
  const base = (APP.siteUrl || location.origin).replace(/\/$/, '');
  const target = base + '/share#text=';
  openScreen(el=>{
    el.innerHTML = topbar({ title:'Share from iPhone', eyebrow:'Share to '+APP.name }) + `<div class="screen-body">
      <div class="note mt12">${icon('science')}<span><b>Not tested on an iPhone yet.</b> If a step doesn't match what you see, tell us from Settings → Send feedback.</span></div>
      <p class="mt16">iPhones don't let web apps join the Share menu, but a free Shortcut can. Set it up once (about 2 minutes) and “${esc(APP.name)}” appears when you tap Share in Google Maps, TikTok or Safari.</p>
      <ol class="ios-steps mt16">
        <li>Open the <b>Shortcuts</b> app and tap <b>+</b> to make a new shortcut.</li>
        <li>Tap the <b>ⓘ</b> (or the shortcut's name) and turn on <b>Show in Share Sheet</b>. Under <b>Receive</b>, keep <b>URLs</b>, <b>Text</b> and <b>Safari web pages</b>.</li>
        <li>Add the action <b>URL Encode</b>. It encodes the <b>Shortcut Input</b>.</li>
        <li>Add the action <b>Text</b> and paste the address below, then tap at the end and insert <b>URL Encoded Text</b>.</li>
        <li>Add the action <b>Open URLs</b>.</li>
        <li>Name it <b>${esc(APP.name)}</b> and pick an icon. Done.</li>
      </ol>
      <label class="eyebrow mt20" style="display:block">The address for step 4</label>
      <div class="link-box mt8"><span class="mono">${esc(target)}</span><button class="btn btn-white btn-sm" id="iosCopy">${icon('content_copy')}Copy</button></div>
      <p class="muted small mt12">The shared link or caption goes after the <b>#</b>, so it stays on your phone and never reaches our servers' logs.</p>
      <div class="card-soft mt16"><b>Then:</b> in Google Maps or TikTok, tap <b>Share</b> → <b>${esc(APP.name)}</b>. It opens in Safari, so sign in to ${esc(APP.name)} in Safari once; the share waits for you if you're not signed in yet.</div>
    </div>`;
    el.querySelector('#iosCopy').onclick = async ()=>{
      try{ await navigator.clipboard.writeText(target); toast('Address copied'); }
      catch(_){ const r = document.createRange(); r.selectNodeContents(el.querySelector('.link-box .mono')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Long-press to copy'); }
    };
  });
}
go.iphoneShortcut = iphoneShortcut;

// what we're doing while the server works (a TikTok takes a few seconds: caption, then Claude, then Google)
const loadingHTML = v=>{
  const s = String(v||''), tiktok = /tiktok\.com/i.test(s), caption = !/https?:\/\//i.test(s) && (s.length > 60 || /\n|📍/u.test(s));
  const [t, sub] = tiktok ? ['Reading the TikTok…', 'Finding the place in its caption'] : caption ? ['Reading the caption…', 'Finding the places it mentions'] : ['Reading link…', 'Working out which place it is'];
  return `<div class="share-loading card row"><span class="brand-pin small" aria-hidden="true"></span><span class="grow"><b>${t}</b><span class="muted small" style="display:block">${sub}</span></span></div>`;
};

/* ---------- what the resolver said → what you see ---------- */
function handle(res, ctx){
  // when the server couldn't answer (offline, busy), still label a pasted link by where it's from
  const link = !res.sourceType && ctx && (String(ctx.raw||'').match(/https?:\/\/[^\s]+/)||[])[0];
  const guess = !link ? 'text' : /tiktok\.com/i.test(link) ? 'tiktok' : /instagram\.com/i.test(link) ? 'instagram' : /goo\.gl|google\.[a-z.]+\/maps|maps\.google/i.test(link) ? 'google_maps' : 'manual';
  const src = { sourceType: res.sourceType || guess, sourceUrl: res.sourceUrl || link || null, author: res.author || null };
  switch (res.state){
    case 'match': return confirmPlace(res.place, src, ctx);
    case 'candidates': return candidates(res.candidates||[], res.query||'', src, ctx, res.found);
    case 'needs_place': case 'unsupported': return needsPlace(res, src, ctx);
    case 'rate_limited': return needsPlace({ ...res, message: res.message || 'That’s a lot of links in one go. Try again in a bit.' }, src, ctx);
    case 'timeout': return needsPlace({ ...res, message:'That took too long. Type the place name, or try the link again in a moment.' }, src, ctx);
    case 'offline':{ saveForLater(src, ctx, true); return needsPlace({ ...res, message: ctx && ctx.inboxId ? 'You’re offline. It stays in your Inbox until you’re back online, or add it now by name.' : 'You’re offline, so it’s saved in your Inbox. Add it now by name, or finish it from the Inbox when you’re back online.' }, src, ctx); }
    case 'signed_out': toast('Sign in first, then share again'); return;
    default: return needsPlace({ ...res, message: res.message || 'We couldn’t read that. Type the place name and we’ll find it.' }, src, ctx);
  }
}

// several possible places: pick one, or search yourself
function candidates(list, query, src, ctx, found){
  const named = (found||[]).map(n=>n.area ? `${n.name} (${n.area})` : n.name);
  openSheet(body=>{
    body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">${esc(srcLabel(src))}</span><h2 class="h-md">Which one is it?</h2></div></div>
      ${named.length ? `<p class="muted mt4 mb12">The caption mentions ${esc(named.length===1 ? named[0] : named.slice(0,-1).join(', ')+' and '+named[named.length-1])}.</p>` : ''}
      <div class="stack">${list.slice(0,3).map((p,i)=>{ const z=MAP.zoneById(zoneFor(p.lat,p.lng)); const cat=catById(p.category);
        return `<button class="search-result" data-i="${i}"><span class="sr-ico">${cat?iconSvg(cat.id, cat.color):icon('storefront')}</span><span class="grow"><b class="trunc" style="display:block">${esc(p.name)}</b><span class="muted small">${esc(z?z.label:(p.address||APP.city))}</span></span>${icon('chevron_right')}</button>`; }).join('')}</div>
      <button class="btn btn-ghost btn-block mt12" id="cdNone">None of these</button>
      ${laterHTML(ctx)}
      <p class="g-attr mt8">Results from <b>Google Maps</b></p>`;
    body.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{ back(); setTimeout(()=>confirmPlace(list[+b.dataset.i], src, ctx), 60); });
    bindLater(body, src, ctx);
    body.querySelector('#cdNone').onclick=()=>{ back(); setTimeout(()=>needsPlace({ state:'needs_place', query, message:'Search again, or add it yourself.' }, src, ctx), 60); };
  });
}

// couldn't tell (or couldn't read): search box pre-filled, or add it yourself
function needsPlace(res, src, ctx){
  openSheet(body=>{
    const q = res.query || (ctx.raw && !/https?:\/\//.test(ctx.raw) ? ctx.raw.slice(0,80) : '');
    // places already on your (crew's) map with that name come first: no duplicates
    const local = q ? S.searchVenues(q, 3) : [];
    const named = (res.found||[]).map(n=>n.area ? `${n.name} (${n.area})` : n.name);
    body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">${esc(srcLabel(src))}</span><h2 class="h-md">Which place is it?</h2></div></div>
      ${res.message ? `<div class="note">${icon(res.state==='offline'?'wifi_off':res.state==='unsupported'?'link_off':'help')}<span>${esc(res.message)}</span></div>`
        : named.length ? `<p class="muted mb12">The caption mentions ${esc(named.join(' and '))}. Search to find it on the map, or add it yourself.</p>` : ''}
      ${local.length ? `<div class="eyebrow mt16">Already on your map</div><div class="stack mt8">${local.map(v=>{ const z=MAP.zoneById(v.zone), cat=catById((v.categories||[])[0]); return `<button class="search-result" data-v="${v.id}"><span class="sr-ico">${cat?iconSvg(cat.id,cat.color):icon('storefront')}</span><span class="grow"><b class="trunc" style="display:block">${esc(v.name)}</b><span class="muted small">${esc(z?z.label:'')}</span></span>${icon('chevron_right')}</button>`; }).join('')}</div>` : ''}
      <label class="search mt16">${icon('search')}<input id="npQ" value="${esc(q)}" placeholder="Place name" autocomplete="off"></label>
      <div class="btn-grid mt12"><button class="btn btn-soft" id="npSelf">${icon('edit_location_alt')}Add it myself</button><button class="btn btn-gold" id="npGo">${icon('search')}Search</button></div>
      ${res.state==='offline' ? '' : laterHTML(ctx)}`;
    bindLater(body, src, ctx);
    const inp = body.querySelector('#npQ');
    body.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ back(); setTimeout(()=>confirmPlace({ venueId:b.dataset.v }, src, ctx), 60); });
    body.querySelector('#npGo').onclick = async ()=>{
      const v = inp.value.trim(); if (!v) return toast('Type the place name');
      const b = body.querySelector('#npGo'); b.disabled = true; b.innerHTML = 'Searching…';
      const r = await resolve({ text:v });
      back();
      // keep where it came from (the original link) even though we searched by name
      setTimeout(()=>handle({ ...r, sourceType:src.sourceType, sourceUrl:src.sourceUrl }, { raw:v }), 60);
    };
    body.querySelector('#npSelf').onclick = ()=>{ const v = inp.value.trim(); back(); setTimeout(()=>confirmPlace({ placeId:null, name:v, lat:res.location?.lat??null, lng:res.location?.lng??null, category:null, manual:true }, src, ctx), 60); };
    setTimeout(()=>inp.focus(), 300);
  });
}

/* ---------- the confirm sheet ---------- */
function confirmPlace(place, src, ctx){
  const me = S.me(); if (!me) return;
  // already on the map? (by Google place id; otherwise same name very close by)
  let existing = place.venueId ? S.venue(place.venueId) : S.venueByPlaceId(place.placeId);
  if (!existing && place.name && place.lat!=null){
    existing = S.venues().find(v=>v.name.toLowerCase()===place.name.toLowerCase() && v.lat!=null && Math.abs(v.lat-place.lat)<0.0006 && Math.abs(v.lng-place.lng)<0.0006) || null;
  }
  if (existing && S.entries({ venueId:existing.id, userId:me.id }).length){
    doneWithInbox(ctx); toast('Already saved'); go.place(existing.id); return;
  }
  const d = {
    name: existing ? existing.name : (place.name||''),
    zone: existing ? existing.zone : (zoneFor(place.lat, place.lng) || MAP.viewZone()?.id || 'downtown'),
    cats: existing ? [...(existing.categories||[])] : (place.category ? [place.category] : []),
    meals: [],
    who: whoDefault(),            // you choose every time: null until you pick
  };
  const editName = !existing && (!place.placeId || place.manual);
  const s = SOURCE[src.sourceType] || SOURCE.text;
  openSheet(body=>{
    const paint = ()=>{
      const z = MAP.zoneById(d.zone);
      body.innerHTML = `
        <div class="row" style="flex-wrap:wrap;gap:6px 12px;justify-content:space-between"><span class="tag soft trunc" style="max-width:100%">${icon(s.ic)}${esc(srcLabel(src))}</span>${place.placeId?`<span class="g-attr">Place details from <b>Google Maps</b></span>`:''}</div>
        ${existing ? `<div class="note mt12">${icon('groups')}<span><b>${esc(existing.name)}</b> is already on the crew map. Add it to your list?</span></div>` : ''}
        <div class="mt12">${editName
          ? `<label class="eyebrow" for="cfN">Place</label><input class="input mt8" id="cfN" maxlength="80" value="${esc(d.name)}" placeholder="Place name">`
          : `<h2 class="h-lg">${esc(d.name)}</h2>`}</div>
        <div class="eyebrow mt20">Who's this for?</div>
        <div class="mt8" id="cfWho">${whoHTML(d.who)}</div>
        <div class="row between mt20"><span class="eyebrow">Meal</span><span class="hand">Optional</span></div>
        <div class="chip-wrap mt8" id="cfM">${MEALS.map(m=>`<button type="button" class="person-chip meal-chip${d.meals.includes(m.id)?' on':''}" data-meal="${m.id}" aria-pressed="${d.meals.includes(m.id)}">${icon(m.icon)}${m.label}</button>`).join('')}</div>
        ${existing ? '' : `
        <div class="field mt20"><label class="eyebrow" for="cfZ">Area</label><select class="input" id="cfZ">${MAP.ZONES.slice().sort((a,b)=>a.label.localeCompare(b.label)).map(x=>`<option value="${x.id}"${x.id===d.zone?' selected':''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="eyebrow mt16">Kind of place</div>
        <div class="chip-wrap mt8" id="cfC">${catPickerHTML(d.cats, {open:body.dataset.catsOpen==='1'})}</div>`}
        <div class="sheet-foot">
          <button class="btn btn-gold btn-block" id="cfAdd">${icon('bookmark_add')}Add to want-to-try</button>
          <button class="btn btn-ghost btn-block mt8" id="cfBeen">${icon('check_circle')}I've been here</button>
          ${laterHTML(ctx)}
        </div>`;
      const n = body.querySelector('#cfN'); if (n) n.oninput = ()=>{ d.name = n.value; };
      bindWho(body, ()=>d.who, v=>{ d.who = v; keep(paint); });
      body.querySelectorAll('#cfM [data-meal]').forEach(b=>b.onclick=()=>{ const m=b.dataset.meal; d.meals=d.meals.includes(m)?d.meals.filter(x=>x!==m):[...d.meals,m]; keep(paint); });
      const zs = body.querySelector('#cfZ'); if (zs) zs.onchange = ()=>{ d.zone = zs.value; };
      bindCatPicker(body.querySelector('#cfC'), body);
      const cc = body.querySelector('#cfC'); if (cc) cc.onclick = e=>{ const b=e.target.closest('[data-cat]'); if (!b) return; const id=b.dataset.cat; d.cats.includes(id) ? d.cats.splice(d.cats.indexOf(id),1) : d.cats.push(id); keep(paint); };
      body.querySelector('#cfAdd').onclick = ()=>add(false);
      body.querySelector('#cfBeen').onclick = ()=>add(true);
      bindLater(body, src, ctx);
    };
    const keep = fn=>{ const st = body.scrollTop; fn(); body.scrollTop = st; };
    const add = (been)=>{
      if (!existing){
        if (!d.name.trim()) return toast('Give the place a name');
        if (!d.cats.length) return toast('Pick what kind of place it is');
      }
      if (d.who===null && !been){ body.querySelector('#cfWho').scrollIntoView({ block:'center', behavior:'smooth' }); return toast('Choose who it’s for'); }
      const created = !existing;
      const v = existing || S.addVenue({ name:d.name, zone:d.zone, categories:d.cats, lat:place.lat, lng:place.lng, googlePlaceId:place.placeId||null });
      closeAll();
      doneWithInbox(ctx);
      if (been){ setTimeout(()=>go.log({ venueId:v.id, who:d.who, meals:d.meals }), 300); return; }
      // a want-to-try from a share earns no points (logging the visit later does)
      const e = S.addEntry({ venueId:v.id, kind:'want', crewIds:d.who, meals:d.meals, sourceType:src.sourceType, sourceUrl:src.sourceUrl });
      go.switchView('map'); go.refresh();
      const show = ()=>{ const w = MAP.placeWorld(v); MAP.markDropped(v.id); MAP.flyToSeparate(w, S.venues().filter(x=>x.id!==v.id).map(x=>MAP.placeWorld(x)).filter(p=>Math.hypot(p.x-w.x,p.y-w.y)<60)); };
      const msg = d.who.length ? 'Added. '+whoText(d.who) : 'Added to your list. Only you can see it.';
      toast(msg, [
        ['Undo', async ()=>{ await S.deleteEntry(e.id); if (created) S.deleteVenue(v.id); go.refresh(); toast('Removed'); }],
        ['View on map', show],
      ], null, 5000);
    };
    paint();
  });
}
go.confirmShare = confirmPlace;
