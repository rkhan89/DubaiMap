// Decorate mode: the wand opens it over the page; tap a sticker to drop it in the middle; drag to move it; two fingers
// to turn and resize; tape across the page; undo and redo; the 12-per-person cap; long-press menu; it saves and the
// page in the book shows the same layer.   node shot.mjs decorate 390 light
export default async function decorate(h){
  const step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('dcfail-'+name.replace(/\W+/g,'-').slice(0,40)); } };
  const expect = (cond, msg)=>{ if (!cond) throw new Error(msg); };
  const top = sel=>`#screens .screen.in:last-of-type ${sel}`;
  const mine = ()=>h.js(()=>document.querySelectorAll('#screens .screen.in:last-of-type .kb-deco .deco.mine').length);
  const box = async sel=>h.js(s=>{ const r = document.querySelector(s).getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, h:r.height }; }, sel);
  await h.seed({ mode:'crew' });
  await step('the wand opens decorate mode with the tray', async ()=>{
    await h.js(async ()=>{ const S=await import('/store.js'), {go}=await import('/go.js'); go.book(S.shelf().everything.id); });
    for (let k = 0; k < 40 && !(await h.js(()=>/Page 1/.test(document.querySelector('#screens .screen.in:last-of-type .kb-count')?.textContent||''))); k++) await h.sleep(250);
    await h.click(top('#kbWand')); await h.sleep(900);
    const r = await h.js(()=>{ const s = document.querySelector('#screens .screen.in:last-of-type'); return { decorate:s.classList.contains('decorate'), tabs:[...s.querySelectorAll('.dc-tabs [data-tab]')].map(x=>x.textContent), items:s.querySelectorAll('.dc-item').length, tapes:s.querySelectorAll('.dc-tape').length }; });
    expect(r.decorate && r.tabs.join() === 'Starter,Milestones,Critters,Districts,Layout' && r.items === 13 && r.tapes === 8, JSON.stringify(r));
    await h.shot('dc-open');
  });
  await step('tap a sticker: it lands in the middle of the page', async ()=>{
    await h.click(top('.dc-item[data-key="starter:coffee"]')); await h.sleep(500);
    expect(await mine() === 1, 'stickers: '+await mine());
  });
  await step('drag it with one finger', async ()=>{
    const s = await box(top('.kb-deco .deco.mine')), p = await box(top('#dcPage'));
    await h.page.mouse.move(s.x + s.w/2, s.y + s.h/2); await h.page.mouse.down();
    await h.page.mouse.move(s.x + s.w/2 + 60, s.y + s.h/2 + 90, { steps:8 }); await h.page.mouse.up(); await h.sleep(500);
    const d = await h.js(async ()=>{ return null; });
    const s2 = await box(top('.kb-deco .deco.mine'));
    expect(s2.x > s.x + 40 && s2.y > s.y + 60, `moved ${JSON.stringify(s)} -> ${JSON.stringify(s2)} on page ${JSON.stringify(p)}`);
  });
  await step('two fingers turn and resize it', async ()=>{
    const s = await box(top('.kb-deco .deco.mine')), cx = s.x + s.w/2, cy = s.y + s.h/2;
    const cdp = await h.page.target().createCDPSession();
    const tp = (x, y, id)=>({ x, y, id, radiusX:2, radiusY:2, force:1 });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[tp(cx, cy, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[tp(cx, cy, 1), tp(cx + 40, cy, 2)] });
    for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[tp(cx, cy, 1), tp(cx + 40 + k*8, cy + k*8, 2)] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await h.sleep(500);
    const st = await h.js(()=>document.querySelector('#screens .screen.in:last-of-type .kb-deco .deco.mine').getAttribute('style'));
    const sc = +(/--s:([\d.]+)/.exec(st)||[])[1];
    expect(sc > 1.2, 'scale after pinch: '+st);
    await h.shot('dc-pinch');
  });
  await step('tape stretches across the page', async ()=>{
    await h.click(top('.dc-tape[data-tape="stripes"]')); await h.sleep(300);
    const p = await box(top('#dcPage'));
    await h.page.mouse.move(p.x + p.w*.2, p.y + p.h*.62); await h.page.mouse.down();
    await h.page.mouse.move(p.x + p.w*.75, p.y + p.h*.55, { steps:10 }); await h.page.mouse.up(); await h.sleep(400);
    expect(await h.js(()=>!!document.querySelector('#screens .screen.in:last-of-type .kb-deco .deco-tape.mine')), 'no tape');
    await h.click(top('.dc-tape[data-tape="stripes"]'));
    await h.shot('dc-tape');
  });
  await step('undo and redo', async ()=>{
    const n0 = await mine();
    await h.click(top('#dcUndo')); await h.sleep(200);
    const n1 = await mine();
    await h.click(top('#dcRedo')); await h.sleep(200);
    expect(n1 === n0 - 1 && await mine() === n0, `undo/redo ${n0} ${n1} ${await mine()}`);
  });
  await step('twelve per person per page', async ()=>{
    for (let k = 0; k < 12; k++){ await h.click(top('.dc-item[data-key="starter:karak"]')); }
    await h.sleep(400);
    expect(await mine() === 12, 'have '+await mine());
    const t = await h.js(()=>document.querySelector('#toast').innerText);
    expect(/12 per person/.test(t), 'toast: '+t);
  });
  await step('long-press: delete', async ()=>{
    const s = await box(top('.kb-deco .deco.mine.deco-sticker'));
    await h.page.mouse.move(s.x + s.w/2, s.y + s.h/2); await h.page.mouse.down(); await h.sleep(650); await h.page.mouse.up(); await h.sleep(500);
    expect(await h.js(()=>!!document.querySelector('.sheet.in [data-m="del"]')), 'no menu');
    await h.shot('dc-menu');
    await h.js(()=>document.querySelector('.sheet.in [data-m="del"]').click()); await h.sleep(500);
    expect(await mine() === 11, 'after delete '+await mine());
  });
  await step('milestones, critters and districts show locked ones with a hint', async ()=>{
    for (const t of ['milestones','critters','districts']){ await h.click(top(`.dc-tabs [data-tab="${t}"]`)); await h.sleep(300); }
    const r = await h.js(()=>({ locked:document.querySelectorAll('#screens .screen.in:last-of-type .dc-item.locked em').length, open:document.querySelectorAll('#screens .screen.in:last-of-type .dc-item:not(.locked)').length }));
    expect(r.locked > 0, JSON.stringify(r));
    await h.shot('dc-districts');
  });
  await step('Done saves; the book page shows the same layer', async ()=>{
    await h.click(top('#dcDone')); await h.sleep(1200);
    const r = await h.js(async ()=>{ const S = await import('/store.js'); const s = document.querySelector('#screens .screen.in:last-of-type'); const pg = s.querySelector('.kb-page.open'); return { saved:S.decorationsOn('visit', pg.dataset.entry).length, shown:pg.querySelectorAll('.kb-deco .deco').length }; });
    expect(r.saved === 11 && r.shown === 11, JSON.stringify(r));
    await h.shot('dc-saved');
  });
  // the same layer at another width lands on the same spots (positions are 0 to 1 of the page)
  await step('every sticker renders where it is stored (0 to 1 of the page), at any width', async ()=>{
    const r = await h.js(async ()=>{ const S = await import('/store.js'); const pg = document.querySelector('#screens .screen.in:last-of-type .kb-page.open'), b = pg.getBoundingClientRect();
      return [...pg.querySelectorAll('.kb-deco .deco-sticker')].map(n=>{ const d = S.decorationsOn('visit', pg.dataset.entry).find(x=>x.id===n.dataset.deco); const art = n.firstElementChild.getBoundingClientRect();
        return Math.max(Math.abs((art.left + art.width/2 - b.left)/b.width - d.x), Math.abs((art.top + art.height/2 - b.top)/b.height - d.y)); }); });
    const worst = Math.max(...r);
    console.log('  ', h.width, 'px wide:', r.length, 'stickers, worst offset', worst.toFixed(4));
    expect(r.length && worst < 0.01, 'offsets '+JSON.stringify(r));
  });
}
