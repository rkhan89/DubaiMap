// Decorate mode: the wand on a page opens it. The page is scaled to fit above a sticker tray (about 40% of the screen)
// and page turns stop. Stickers go anywhere on top of the automatic layout, which never moves.
//   Tap a sticker in the tray to drop it in the middle of the page, or drag it up onto the page.
//   One finger moves a sticker; two fingers turn and resize it; a tap brings it to the front.
//   Long-press: delete, flip, send to back (on someone else's: who placed it).
//   Tape: pick a roll, then drag across the page; it stretches from where you start to where you lift.
//   Undo and redo (the last 20 changes), Reset (clears your stickers on this page), Done. Changes save as you go.
// Your layer only: in a crew book everyone can decorate a shared page, but each person moves only their own stickers;
// "Mine only" hides the others. At most 12 per person per page; sizes 40% to 250%; never more than half off the page.
import * as S from './store.js';
import { esc, plural, tilt, uid, fmtDay } from './data.js';
import { icon, openScreen, openSheet, back, toast, seg, bindSeg } from './ui.js';
import { pageHTML, PAGE_W, PAGE_H, hydrateMaps } from './paper.js';
import { decoLayerHTML, decoHTML, clamp01, SCALE_MIN, SCALE_MAX } from './deco.js';
import { trayItems, unlockedNow, stickerArt, TAPES, tapeRollHTML, myDistricts } from './stickers.js';
import { moments, reduceMotion } from './feel.js';

const UNDO_MAX = 20, LONG_MS = 480, MOVE_PX = 6;
const TABS = [['starter','Starter'],['milestones','Milestones'],['critters','Critters'],['districts','Districts'],['layout','Layout']];

// o: { book, pg (the page, from pages.js), n (its page number), after() }
export function decorate(o){
  const b = o.book, pg = o.pg, e = pg.entry, me = S.me();
  if (!e || !me) return;
  const pageType = 'visit', pageId = e.id;
  const all = S.decorationsOn(pageType, pageId);
  let mine = all.filter(d=>d.userId===me.id).map(d=>({ ...d }));
  const others = all.filter(d=>d.userId!==me.id);
  const cfg = { layout:'scrapbook', ...(pg.cfg||{}) }; let order = pg.photos.map(p=>p.id), cfgDirty = false;
  let tab = 'starter', tape = null, mineOnly = false, undo = [], redo = [], saveT = null, unlocked = unlockedNow();
  const shared = !e.private && (b.kind === 'crew' || (e.crewIds||[]).length > 0);
  let saveNow = ()=>{};

  openScreen(el=>{
    el.innerHTML = `<header class="dc-top">
        <button class="icon-btn" id="dcUndo" aria-label="Undo">${icon('undo')}</button>
        <button class="icon-btn" id="dcRedo" aria-label="Redo">${icon('redo')}</button>
        <div class="dc-title"><b>Decorating</b><span class="hand">${esc(S.venue(e.venueId)?.name || '')} • p. ${o.n||''}</span></div>
        <button class="btn btn-ghost btn-sm" id="dcReset">Reset</button>
        <button class="btn btn-gold btn-sm" id="dcDone">${icon('check')}Done</button>
      </header>
      <div class="dc-stage" id="dcStage"><div class="dc-page" id="dcPage"><div class="kb-scale" id="dcScale"></div></div></div>
      <section class="dc-tray" aria-label="Stickers">
        <div class="dc-tabs" role="tablist">${TABS.map(([v,l])=>`<button role="tab" data-tab="${v}" aria-selected="${v===tab}" class="${v===tab?'on':''}">${l}</button>`).join('')}</div>
        <div class="dc-tray-body" id="dcBody"></div>
      </section>`;
    const stage = el.querySelector('#dcStage'), pageBox = el.querySelector('#dcPage'), scaleBox = el.querySelector('#dcScale'), body = el.querySelector('#dcBody');
    let scale = 1;
    // ---- the page, scaled to fit what's left above the tray ----
    const fit = ()=>{ const w = stage.clientWidth - 24, h = stage.clientHeight - 16; scale = Math.max(0.3, Math.min(w/PAGE_W, h/PAGE_H)); pageBox.style.setProperty('--kb-s', scale); pageBox.style.width = Math.floor(PAGE_W*scale)+'px'; pageBox.style.height = Math.floor(PAGE_H*scale)+'px'; };
    const paintPage = ()=>{
      const p = { ...pg, cfg:{ ...cfg }, photos:order.map(id=>pg.photos.find(x=>x.id===id)).filter(Boolean) };
      scaleBox.innerHTML = pageHTML(p, { book:b, n:o.n||1, paper:b.paper||'plain' });
      layer = scaleBox.querySelector('.kb-deco'); layer.removeAttribute('aria-hidden'); paintLayer();
      hydrateMaps(scaleBox);
    };
    let layer = null;
    const paintLayer = ()=>{ if (!layer) return; layer.innerHTML = decoLayerHTML([...(mineOnly ? [] : others), ...mine].sort((a,c)=>(a.z||0)-(c.z||0)), { meId:me.id, editing:true }); updateButtons(); };
    const updateButtons = ()=>{ el.querySelector('#dcUndo').disabled = !undo.length; el.querySelector('#dcRedo').disabled = !redo.length; el.querySelector('#dcReset').disabled = !mine.length; };
    // ---- history and saving ----
    const snap = ()=>JSON.stringify(mine);
    const change = (fn)=>{ undo.push(snap()); if (undo.length > UNDO_MAX) undo.shift(); redo = []; fn(); paintLayer(); autosave(); };
    const autosave = ()=>{ clearTimeout(saveT); saveT = setTimeout(save, 1200); };
    const save = ()=>{ clearTimeout(saveT); S.saveMyDecorations(pageType, pageId, b.id, mine); if (cfgDirty){ S.savePage(b.id, e.id, { layout:cfg.layout, order, stickers:[], note:(cfg.note||'').trim() }); cfgDirty = false; } };
    saveNow = save;
    el.querySelector('#dcUndo').onclick = ()=>{ if (!undo.length) return; redo.push(snap()); mine = JSON.parse(undo.pop()); paintLayer(); autosave(); };
    el.querySelector('#dcRedo').onclick = ()=>{ if (!redo.length) return; undo.push(snap()); mine = JSON.parse(redo.pop()); paintLayer(); autosave(); };
    el.querySelector('#dcReset').onclick = ()=>{ if (!mine.length) return; change(()=>{ mine = []; }); toast('Your stickers on this page are cleared', 'Undo', ()=>el.querySelector('#dcUndo').click()); };
    el.querySelector('#dcDone').onclick = ()=>{ save(); back(); toast(mine.length ? 'Page saved' : 'Saved'); };
    // ---- adding ----
    const topZ = ()=>Math.max(0, ...mine.map(d=>d.z||0), ...others.map(d=>d.z||0));
    const room = ()=>{ if (mine.length < S.DECO_MAX) return true; toast(`${S.DECO_MAX} per person on a page: remove one first`); return false; };
    const addSticker = (key, x, y)=>{
      if (!room()) return;
      const id = uid();
      change(()=>{ mine.push({ id, userId:me.id, kind:'sticker', stickerId:key, x:clamp01(x), y:clamp01(y), rotation:+tilt(id, 6).toFixed(1), scale:1, flip:false, z:topZ()+1 }); });
      moments.stickerDown(); settle(id);
    };
    const settle = (id)=>{ if (reduceMotion()) return; const n = layer.querySelector(`[data-deco="${CSS.escape(id)}"]`); if (n){ n.classList.add('settle'); setTimeout(()=>n.classList.remove('settle'), 420); } };
    // ---- the tray ----
    const paintTray = ()=>{
      el.querySelectorAll('.dc-tabs [data-tab]').forEach(t=>{ const on = t.dataset.tab===tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
      const mineToggle = others.length ? `<label class="dc-mine"><input type="checkbox" id="dcMine" ${mineOnly?'checked':''}> Mine only</label>` : '';
      if (tab === 'layout'){
        body.innerHTML = `${pg.photos.length ? `<div class="eyebrow">Photos</div>${seg('dclayout', [['scrapbook','Scrapbook','auto_awesome_mosaic'],['grid','Grid','grid_view'],['hero','Hero','photo_size_select_large']], cfg.layout).replace('class="seg"','class="seg mt8"')}` : ''}
          ${pg.photos.length > 1 ? `<div class="eyebrow mt16">Photo order</div><div class="dc-order mt8">${order.map((id,i)=>{ const p = pg.photos.find(x=>x.id===id); return `<span class="dc-ord"><img src="${esc(S.photoURL(p))}" alt=""><button class="icon-btn" data-mv="${i}" data-d="-1" ${i?'':'disabled'} aria-label="Move earlier">${icon('chevron_left')}</button><button class="icon-btn" data-mv="${i}" data-d="1" ${i<order.length-1?'':'disabled'} aria-label="Move later">${icon('chevron_right')}</button></span>`; }).join('')}</div>` : ''}
          <label class="eyebrow mt16" for="dcNote" style="display:block">Page note</label>
          <textarea class="input mt8" id="dcNote" maxlength="160" placeholder="What made this visit…">${esc(cfg.note||'')}</textarea>${mineToggle}`;
        bindSeg(body, 'dclayout', v=>{ cfg.layout = v; cfgDirty = true; paintPage(); autosave(); });
        body.querySelectorAll('[data-mv]').forEach(x=>x.onclick=()=>{ const i = +x.dataset.mv, j = i + (+x.dataset.d); [order[i], order[j]] = [order[j], order[i]]; cfgDirty = true; paintPage(); paintTray(); autosave(); });
        const note = body.querySelector('#dcNote'); note.oninput = ()=>{ cfg.note = note.value; cfgDirty = true; clearTimeout(note._t); note._t = setTimeout(()=>{ paintPage(); autosave(); }, 400); };
      } else {
        const items = trayItems(tab, unlocked), dates = tab==='districts' ? myDistricts() : null;
        const n = items.filter(x=>!x.locked).length;
        body.innerHTML = `<div class="dc-tray-head"><span class="mono muted small">${tab==='starter' ? 'Everyone has these' : `${n} of ${items.length}`}</span>${mineToggle}<span class="mono muted small">${mine.length}/${S.DECO_MAX} on this page</span></div>
          ${tab==='starter' ? `<div class="dc-tapes" role="group" aria-label="Tape">${TAPES.map(([v,l])=>`<button class="dc-tape${tape===v?' on':''}" data-tape="${v}" aria-pressed="${tape===v}" aria-label="${esc(l)} tape">${tapeRollHTML(v)}</button>`).join('')}</div>
            ${tape ? `<p class="dc-hint">${icon('gesture')}Drag across the page to lay tape</p>` : ''}` : ''}
          <div class="dc-grid">${items.map(x=>`<button class="dc-item${x.locked?' locked':''}" data-key="${esc(x.key)}" aria-label="${esc(x.label)}${x.locked?', locked: '+esc(x.hint):''}">${stickerArt(x.key, { locked:x.locked, date:dates && dates.get(x.key.slice(9)) })}${x.locked?`<em>${esc(x.hint)}</em>`:''}</button>`).join('')}</div>`;
        body.querySelectorAll('[data-tape]').forEach(x=>x.onclick=()=>{ tape = tape===x.dataset.tape ? null : x.dataset.tape; paintTray(); });
        bindTrayDrag();
      }
      const mt = body.querySelector('#dcMine'); if (mt) mt.onchange = ()=>{ mineOnly = mt.checked; paintLayer(); };
    };
    el.querySelectorAll('.dc-tabs [data-tab]').forEach(t=>t.onclick=()=>{ tab = t.dataset.tab; if (tab!=='starter') tape = null; paintTray(); });
    // tap a sticker to drop it in the middle; drag it up onto the page to place it there
    const bindTrayDrag = ()=>{
      body.querySelectorAll('.dc-item').forEach(item=>{
        let x0 = 0, y0 = 0, ghost = null, id = null;
        item.addEventListener('pointerdown', ev=>{ x0 = ev.clientX; y0 = ev.clientY; id = ev.pointerId; ghost = null; });
        item.addEventListener('pointermove', ev=>{
          if (ev.pointerId !== id || item.classList.contains('locked')) return;
          if (!ghost && y0 - ev.clientY > 14 && Math.abs(ev.clientX - x0) < (y0 - ev.clientY)){
            ghost = document.createElement('div'); ghost.className = 'dc-ghost'; ghost.innerHTML = stickerArt(item.dataset.key);
            ghost.style.setProperty('--s', scale); document.body.appendChild(ghost); item.setPointerCapture(ev.pointerId); moments.stickerUp();
          }
          if (ghost){ ghost.style.left = ev.clientX+'px'; ghost.style.top = ev.clientY+'px'; }
        });
        let dragged = false;
        const end = ev=>{
          if (ev.pointerId !== id) return; id = null;
          if (ghost){ ghost.remove(); ghost = null; dragged = true; const p = toPage(ev.clientX, ev.clientY); if (p.inside) addSticker(item.dataset.key, p.x, p.y); }
        };
        // a tap (or Enter on a keyboard): into the middle of the page
        item.addEventListener('click', ()=>{
          if (dragged){ dragged = false; return; }
          if (item.classList.contains('locked')){ toast(item.querySelector('em')?.textContent || 'Not unlocked yet'); return; }
          addSticker(item.dataset.key, 0.5, 0.46);
        });
        item.addEventListener('pointerup', end); item.addEventListener('pointercancel', ev=>{ if (ghost){ ghost.remove(); ghost = null; } id = null; });
      });
    };
    // screen point -> page point (0 to 1)
    const toPage = (cx, cy)=>{ const r = pageBox.getBoundingClientRect(); const x = (cx - r.left)/r.width, y = (cy - r.top)/r.height; return { x, y, inside:x>=0 && x<=1 && y>=0 && y<=1 }; };

    // ---- moving, turning, resizing your stickers; laying tape ----
    const pointers = new Map(); let act = null, longT = null;
    const nodeOf = id=>layer.querySelector(`[data-deco="${CSS.escape(id)}"]`);
    const live = (d)=>{ const n = nodeOf(d.id); if (!n) return; const tmp = document.createElement('span'); tmp.innerHTML = decoHTML(d, PAGE_W, PAGE_H, { mine:true }); const nn = tmp.firstChild; n.setAttribute('style', nn.getAttribute('style')); n.className = nn.className + ' lifted'; };
    pageBox.addEventListener('pointerdown', ev=>{
      pointers.set(ev.pointerId, { x:ev.clientX, y:ev.clientY });
      const hit = ev.target.closest('.deco');
      // a second finger on the page while moving a sticker: turn and resize it
      if (act && act.type === 'move' && pointers.size === 2){
        const [a, c] = [...pointers.values()];
        act = { type:'pinch', d:act.d, before:act.before, d0:Math.hypot(c.x-a.x, c.y-a.y), a0:Math.atan2(c.y-a.y, c.x-a.x), s0:act.d.scale||1, r0:act.d.rotation||0 };
        clearTimeout(longT); return;
      }
      // fingers left over from a gesture that ended off the page: start afresh with this one
      if (pointers.size > 1){ if (act) return; pointers.clear(); pointers.set(ev.pointerId, { x:ev.clientX, y:ev.clientY }); }
      pageBox.setPointerCapture(ev.pointerId);
      if (hit && hit.dataset.user !== me.id){
        // someone else's: locked; a long-press says who placed it
        longT = setTimeout(()=>{ const u = S.user(hit.dataset.user); toast(`Placed by ${u ? (u.name || '@'+u.handle) : 'a crewmate'} • only they can move it`); }, LONG_MS);
        act = { type:'theirs', x0:ev.clientX, y0:ev.clientY }; return;
      }
      if (hit){
        const d = mine.find(x=>x.id===hit.dataset.deco); if (!d) return;
        act = { type:'move', d, before:snap(), x0:ev.clientX, y0:ev.clientY, dx:d.x, dy:d.y, dx2:d.x2, dy2:d.y2, moved:false };
        hit.classList.add('lifted'); moments.stickerUp();
        longT = setTimeout(()=>{ if (act && !act.moved){ hit.classList.remove('lifted'); const d0 = act.d; act = null; menu(d0); } }, LONG_MS);
        return;
      }
      if (tape){ const p = toPage(ev.clientX, ev.clientY); act = { type:'tape', x:p.x, y:p.y, x2:p.x, y2:p.y }; drawTapePreview(); }
    });
    pageBox.addEventListener('pointermove', ev=>{
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x:ev.clientX, y:ev.clientY });
      if (!act) return;
      if (act.type === 'theirs'){ if (Math.hypot(ev.clientX-act.x0, ev.clientY-act.y0) > MOVE_PX) clearTimeout(longT); return; }
      if (act.type === 'move'){
        const r = pageBox.getBoundingClientRect(), dx = (ev.clientX - act.x0)/r.width, dy = (ev.clientY - act.y0)/r.height;
        if (!act.moved && Math.hypot(ev.clientX-act.x0, ev.clientY-act.y0) < MOVE_PX) return;
        act.moved = true; clearTimeout(longT);
        const d = act.d;
        if (d.kind === 'tape'){
          // the whole strip moves, kept on the page
          const sx = Math.min(1 - Math.max(act.dx, act.dx2), Math.max(-Math.min(act.dx, act.dx2), dx)), sy = Math.min(1 - Math.max(act.dy, act.dy2), Math.max(-Math.min(act.dy, act.dy2), dy));
          d.x = act.dx + sx; d.x2 = act.dx2 + sx; d.y = act.dy + sy; d.y2 = act.dy2 + sy;
        } else { d.x = clamp01(act.dx + dx); d.y = clamp01(act.dy + dy); }
        live(d); return;
      }
      if (act.type === 'pinch'){
        const [a, c] = [...pointers.values()]; if (!c) return;
        const dist = Math.hypot(c.x-a.x, c.y-a.y), ang = Math.atan2(c.y-a.y, c.x-a.x);
        act.d.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, act.s0 * dist/act.d0));
        act.d.rotation = ((act.r0 + (ang - act.a0)*180/Math.PI + 540) % 360) - 180;
        live(act.d); return;
      }
      if (act.type === 'tape'){ const p = toPage(ev.clientX, ev.clientY); act.x2 = clamp01(p.x); act.y2 = clamp01(p.y); drawTapePreview(); }
    });
    const up = ev=>{
      pointers.delete(ev.pointerId); clearTimeout(longT);
      if (!act) return;
      if (act.type === 'pinch' && pointers.size){ return; }   // one finger still down: keep the gesture until both lift
      const a = act; act = null;
      if (a.type === 'theirs') return;
      if (a.type === 'tape'){
        layer.querySelector('.tape-preview')?.remove();
        if (Math.hypot((a.x2-a.x)*PAGE_W, (a.y2-a.y)*PAGE_H) < 18) return;
        if (!room()) return;
        const id = uid();
        change(()=>{ mine.push({ id, userId:me.id, kind:'tape', tapeStyle:tape, x:clamp01(a.x), y:clamp01(a.y), x2:a.x2, y2:a.y2, rotation:0, scale:1, z:topZ()+1 }); });
        moments.tape(); return;
      }
      const d = a.d;
      if (a.type === 'move' && !a.moved){
        // a tap: to the front
        if ((d.z||0) < topZ()){ undo.push(a.before); redo = []; d.z = topZ()+1; paintLayer(); autosave(); } else paintLayer();
        return;
      }
      // a move or a pinch ends: it settles
      undo.push(a.before); if (undo.length > UNDO_MAX) undo.shift(); redo = [];
      paintLayer(); settle(d.id); moments.stickerDown(); autosave();
    };
    pageBox.addEventListener('pointerup', up); pageBox.addEventListener('pointercancel', up);
    const drawTapePreview = ()=>{
      let n = layer.querySelector('.tape-preview');
      const html = decoHTML({ id:'preview', kind:'tape', tapeStyle:tape, x:act.x, y:act.y, x2:act.x2, y2:act.y2, z:9999 }, PAGE_W, PAGE_H, { mine:true });
      const t = document.createElement('span'); t.innerHTML = html; const nn = t.firstChild; nn.classList.add('tape-preview');
      if (n) n.replaceWith(nn); else layer.appendChild(nn);
    };
    // long-press on your own: delete, flip, send to back
    const menu = (d)=>{
      openSheet(sh=>{
        sh.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">${d.kind==='tape' ? 'Tape' : 'Sticker'}</h2><span class="hand">Placed by you</span></div></div>
          <div class="stack">
            ${d.kind==='tape' ? '' : `<button class="btn btn-soft btn-block" data-m="flip">${icon('flip')}Flip</button>`}
            <button class="btn btn-soft btn-block" data-m="back">${icon('flip_to_back')}Send to back</button>
            <button class="btn btn-danger btn-block" data-m="del">${icon('delete')}Delete</button></div>`;
        sh.querySelectorAll('[data-m]').forEach(x=>x.onclick=()=>{
          const m = x.dataset.m; back();
          change(()=>{
            const t = mine.find(y=>y.id===d.id); if (!t) return;
            if (m === 'flip') t.flip = !t.flip;
            if (m === 'back') t.z = Math.min(0, ...mine.map(y=>y.z||0), ...others.map(y=>y.z||0)) - 1;
            if (m === 'del') mine = mine.filter(y=>y.id!==d.id);
          });
        });
      });
    };
    requestAnimationFrame(()=>{ fit(); paintPage(); paintTray(); });
    const onResize = ()=>{ if (!el.isConnected) return removeEventListener('resize', onResize); fit(); };
    addEventListener('resize', onResize);
    // the first time you decorate a page your crew can see, say so once
    if (shared && !S.flag('decoCrewNote')){ S.setFlag('decoCrewNote'); setTimeout(()=>toast('Your crew sees your stickers on this page, and they’re in anything shared from it', null, null, 6000), 500); }
  }, { cover:true, cls:'decorate', onClose:()=>{ saveNow(); o.after && o.after(); } });
}
