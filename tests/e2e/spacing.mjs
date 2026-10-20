// Spacing audit: every main screen, sheet and modal, measured against the app's spacing rules (16px side gutter,
// no sideways scroll, the last item clear of the tab bar, map buttons clear of the bar and each other, sheet
// handle/title/content on one left edge, 44px tap targets). Prints one line per problem and saves a screenshot of
// every state.   node shot.mjs spacing 360|390|430 light
// Set AUDIT_ONLY=1 to print problems without failing the run (used for the "before" table).
export default async function spacing(h){
  const W = h.width;
  const go = async (code)=>{ await h.js(code); await h.sleep(900); };
  const close = async ()=>{ await h.js(async ()=>{ const U=await import('/ui.js'); U.closeAll(); }); await h.sleep(500); };
  const problems = [];
  // measure what's on top now
  const measure = async (label)=>{
    const r = await h.js(()=>{
      const out = [], vw = innerWidth;
      const vis = el=>{ const s=getComputedStyle(el); if (s.visibility==='hidden'||s.display==='none'||+s.opacity===0) return false; const b=el.getBoundingClientRect(); return b.width>0&&b.height>0; };
      // the layer on top: an open sheet, else the top screen, else the main view
      const sheets=[...document.querySelectorAll('.sheet.in')], screens=[...document.querySelectorAll('#screens .screen.in')];
      const sheet=sheets[sheets.length-1], screen=screens[screens.length-1];
      const top = sheet || screen || document.querySelector('#views .view.active');
      if (document.documentElement.scrollWidth > vw + 1) out.push(['overflow', `page scrolls sideways (${document.documentElement.scrollWidth}px wide)`]);
      // anything poking past the screen edge that isn't inside a sideways scroller
      const inScroller = el=>{ for (let p=el.parentElement; p && p!==top; p=p.parentElement){ const s=getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth>p.clientWidth+1) return true; if (s.overflowX==='hidden' && p!==document.body) { const b=p.getBoundingClientRect(); if (b.right<=vw+1 && b.left>=-1) return 'clip'; } } return false; };
      const poke = [];
      top.querySelectorAll('*').forEach(el=>{ if (!vis(el)) return; const b=el.getBoundingClientRect(); if ((b.right>vw+1 || b.left<-1) && b.width < vw*1.5){ const s=inScroller(el); if (!s) poke.push(el); else if (s==='clip' && (el.matches('button,a,input,.btn,.tag,.chip,.person-chip'))) poke.push(el); } });
      // keep the outermost offenders
      poke.filter(el=>!poke.some(o=>o!==el && o.contains(el))).slice(0,4).forEach(el=>{ const b=el.getBoundingClientRect(); out.push(['offscreen', `${el.tagName.toLowerCase()}.${[...el.classList].join('.')||'-'} ${Math.round(b.left)}..${Math.round(b.right)}`]); });
      // side gutter: the scrolling body's padding
      const body = sheet ? sheet.querySelector('.sheet-inner') : screen ? screen.querySelector('.screen-body, .place-body, .list-body') : top.matches('#listView') ? top.querySelector('.list-view') || top : null;
      if (body){ const s=getComputedStyle(body); const pl=parseFloat(s.paddingLeft), pr=parseFloat(s.paddingRight); const bl=body.getBoundingClientRect().left;
        if (Math.round(pl + bl) !== 16 || Math.round(pr) !== 16) out.push(['gutter', `${body.className.split(' ')[0]} content at ${Math.round(pl+bl)}px left / ${Math.round(pr)}px right (want 16)`]); }
      // sheet: handle, title and content on one left edge
      if (sheet){ const t=sheet.querySelector('.sheet-inner .sheet-head, .sheet-inner h2, .sheet-inner .h-md, .sheet-inner .h-lg'); const inner=sheet.querySelector('.sheet-inner');
        if (t && inner){ const cl = inner.getBoundingClientRect().left + parseFloat(getComputedStyle(inner).paddingLeft); const tl=t.getBoundingClientRect().left; if (Math.abs(tl-cl)>1) out.push(['sheet-align', `title at ${Math.round(tl)}px, content edge ${Math.round(cl)}px`]); }
        const pb = parseFloat(getComputedStyle(sheet).paddingBottom); out.push(['info', `sheet padding-bottom ${pb}px`]); }
      // the last thing in a scroller clears the tab bar and the + button
      const nav=document.querySelector('.bottomnav'), plus=document.querySelector('#navLog');
      const navVisible = nav && getComputedStyle(nav).visibility!=='hidden';
      const scroller = sheet ? sheet.querySelector('.sheet-inner') : screen || (top.matches('#listView') ? (top.querySelector('.list-view')||top) : null);
      if (scroller && navVisible && !sheet){ scroller.scrollTop = 1e6;
        const kids=[...scroller.querySelectorAll('button, a, .card, .page, img, p, h3')].filter(vis); const last=kids.sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];
        if (last){ const lb=last.getBoundingClientRect().bottom, nt=nav.getBoundingClientRect().top, pt=plus.getBoundingClientRect().top;
          if (lb > nt - 1) out.push(['under-nav', `last item ends at ${Math.round(lb)}, tab bar at ${Math.round(nt)}`]);
          else if (lb > pt && Math.abs(last.getBoundingClientRect().left + last.getBoundingClientRect().width/2 - (plus.getBoundingClientRect().left+32)) < last.getBoundingClientRect().width/2 + 32) out.push(['under-plus', `last item ends at ${Math.round(lb)}, + button top ${Math.round(pt)}`]); }
        scroller.scrollTop = 0; }
      // tap targets
      const small=[]; top.querySelectorAll('button, a[href], input[type=checkbox], input[type=radio], [role=button], select').forEach(el=>{ if (!vis(el)) return; const b=el.getBoundingClientRect(); if (b.right<0||b.left>vw) return;
        if (el.closest('.map-label') || (el.matches('a') && el.closest('p') && !el.closest('.lm-source'))) return;   // map labels sit on their 44px stamps; links inside a sentence are exempt
        const be=getComputedStyle(el,'::before'); let ew=b.width, eh=b.height;
        if (be.content!=='none' && be.position==='absolute'){ const px=v=>parseFloat(v)||0; ew=Math.max(ew, b.width-px(be.left)-px(be.right)); eh=Math.max(eh, b.height-px(be.top)-px(be.bottom)); }
        if (ew < 43.5 || eh < 43.5) small.push(`${(el.id?'#'+el.id:'')||el.tagName.toLowerCase()+'.'+([...el.classList].slice(0,2).join('.')||'-')} ${Math.round(b.width)}x${Math.round(b.height)}`); });
      const uniq=[...new Set(small.map(s=>s.replace(/ \d+x\d+$/,'')))]; if (uniq.length) out.push(['tap', uniq.slice(0,8).map(u=>small.find(s=>s.startsWith(u))).join(', ')+(uniq.length>8?` +${uniq.length-8} more`:'')]);
      // map buttons
      if (!sheet && !screen && document.querySelector('#mapView.active')){ const f=document.querySelector('#btnFit').getBoundingClientRect(), l=document.querySelector('#btnLocate').getBoundingClientRect(), n=nav.getBoundingClientRect(), p=plus.getBoundingClientRect();
        if (l.bottom > n.top - 8) out.push(['map-ctrl', `locate button bottom ${Math.round(l.bottom)} vs tab bar ${Math.round(n.top)}`]);
        if (f.bottom > l.top) out.push(['map-ctrl', 'fit and locate overlap']);
        if (l.right > p.left && l.left < p.right && l.bottom > p.top - 8) out.push(['map-ctrl', `locate near the + button (${Math.round(l.bottom)} vs ${Math.round(p.top)})`]);
        const strip=document.querySelector('#memStrip:not([hidden])'); if (strip){ const s=strip.getBoundingClientRect(); if (s.right > l.left - 4 && s.bottom > l.top) out.push(['map-ctrl', 'memory strip runs under the map buttons']); } }
      return out;
    });
    r.filter(x=>x[0]!=='info').forEach(([k, m])=>{ problems.push(`${label}\t${k}\t${m}`); console.log(`${process.env.AUDIT_ONLY?'note':'FAIL'} ${W} ${label} [${k}] ${m}`); });
    await h.shot(`sp-${label}`);
  };
  const state = async (label, open)=>{ try{ await open(); await measure(label); }catch(e){ console.log('note', W, label, 'could not open:', e.message.split('\n')[0]); } };

  await h.seed({ mode:'crew' });
  await state('map', async ()=>{});
  await state('map-peek', ()=>go(()=>{ const el=document.querySelector('.stamp-anchor.is-single .stamp'); el && el.click(); }));
  await state('map-filters', async ()=>{ await h.js(()=>{ document.querySelector('.peek')?.classList.remove('in'); }); await go(async ()=>{ const {go}=await import('/go.js'); go.filters(); }); });
  await close();
  await state('bell', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.activity(); }));
  await close();
  await state('list', ()=>go(()=>document.querySelector('[data-tab="list"]').click()));
  await state('crew', ()=>go(()=>document.querySelector('[data-tab="crew"]').click()));
  await state('shelf', ()=>go(()=>document.querySelector('[data-tab="shelf"]').click()));
  await state('book', ()=>go(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.book(S.books().find(b=>b.kind==='personal').id); }));
  await state('book-filters', ()=>go(()=>document.querySelector('.screen.in:last-of-type #bkFilter').click()));
  await close();
  await state('page-editor', ()=>go(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.book(S.books().find(b=>b.kind==='personal').id); await new Promise(r=>setTimeout(r,1200)); (document.querySelector('.screen.in:last-of-type #kbWand:not([hidden])') || document.querySelector('.screen.in:last-of-type [data-editpage]')).click(); }));
  await close();
  await state('cover', ()=>go(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.cover(S.books().find(b=>b.kind==='personal').id); }));
  await close();
  await state('log-1', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.log({}); }));
  await close();
  await state('log-2', ()=>go(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.log({ venueId:S.venues().find(v=>v.name==='Ravi Restaurant').id }); }));
  await close();
  await state('place', ()=>go(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.place(S.venues().find(v=>v.name==='Ravi Restaurant').id); }));
  await close();
  await state('profile', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.profile(); }));
  await close();
  await state('settings', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.settings(); }));
  await close();
  await state('critters', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.critters(); }));
  await close();
  await state('stickers', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.stickers(); }));
  await close();
  await state('goals', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.goals(); }));
  await close();
  await state('recap', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.recap(); }));
  await close();
  await state('area', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.area('satwa'); }));
  await close();
  await state('viewer', ()=>go(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); const ps=S.photos(); go.viewer(ps.map(p=>p.id), 0); }));
  await close();
  await state('feedback', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.feedback(); }));
  await close();
  await state('inbox', ()=>go(async ()=>{ const {go}=await import('/go.js'); go.inbox(); }));
  await close();
  await state('landmark', ()=>go(async ()=>{ const L=await import('/landmarkui.js'); L.openLandmark('burj_khalifa'); }));
  await close();
  // long place names: wrap or truncate, never push chips or buttons off screen
  await h.js(async ()=>{ const S=await import('/store.js'); const v=S.venues().find(v=>v.name==='Ravi Restaurant'); S.updateVenue(v.id, { name:'Ravi Restaurant and the Very Long Name Karak and Paratha House of Satwa' }); });
  await state('long-place', ()=>go(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.place(S.venues().find(v=>v.name.startsWith('Ravi')).id); }));
  await close();
  await state('long-list', ()=>go(()=>document.querySelector('[data-tab="list"]').click()));
  await state('long-book', ()=>go(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.book(S.books().find(b=>b.kind==='personal').id); }));
  await close();
  await state('long-shelf', ()=>go(()=>document.querySelector('[data-tab="shelf"]').click()));
  console.log(`audit ${W}: ${problems.length} problems`);
  if (process.env.AUDIT_ONLY) process.exitCode = 0;
}
