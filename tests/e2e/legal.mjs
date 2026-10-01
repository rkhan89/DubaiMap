// Terms / privacy / data (web pages and in-app), the support card, and deleting an account (local mode).
export default async function legal(h){
  const p = h.page, step = async (name, fn)=>{ try{ await fn(); console.log('ok  ', name); } catch(e){ console.log('FAIL', name, '-', (e.message||'').split('\n')[0]); await h.shot('lfail-'+name.replace(/\W+/g,'-')); } };
  const text = ()=>h.js(()=>document.body.innerText);
  const go = (fn, ...a)=>h.js(async (fn,a)=>{ const {go}=await import('/go.js'); go[fn](...a); }, fn, a);
  const back = async ()=>{ await h.js(()=>history.back()); await h.sleep(450); };

  await step('web pages: terms, privacy, data', async ()=>{
    for (const [path, re] of [['/terms', /Terms of use/], ['/privacy', /Privacy policy/], ['/data', /How Koko uses your data/]]){
      await p.goto(new URL(path, process.env.BASE||'http://localhost:5174/').href, { waitUntil:'networkidle0' }); await h.sleep(300);
      if (!re.test(await text())) throw new Error(path+' wrong page');
      await h.shot('l-web'+path.replace('/','-'));
    }
    if (await h.js(()=>document.querySelectorAll('.fill-missing').length)) throw new Error('something on the legal pages is still blank');
    if (!/collectify.app1@gmail.com/.test(await text())) throw new Error('contact missing');
  });
  await h.load();
  await step('sign-in screen links to terms and privacy', async ()=>{
    await h.js(()=>document.querySelector('[data-legal="privacy"]').click()); await h.sleep(900);
    if (!/What we collect/.test(await text())) throw new Error('privacy not shown in app');
    await h.shot('l-app-privacy'); await back();
  });
  await h.seed({mode:'crew'});
  await step('settings: About section, support card (with links set)', async ()=>{
    await h.js(async ()=>{ const {APP}=await import('/config.js'); APP.support = { stripe:'https://buy.stripe.com/test_example', paypal:'https://paypal.me/example' }; });
    await go('settings'); await h.sleep(700);
    if (!/Buy me a karak/.test(await text())) throw new Error('no support card');
    await h.shot('l-settings-support');
    await h.js(()=>{ const s=[...document.querySelectorAll('.screen')].pop(); s.scrollTop=s.scrollHeight; }); await h.sleep(300);
    if (!/Terms of use/.test(await text()) || !/Delete my account/.test(await text())) throw new Error('no About / delete');
    await h.shot('l-settings-about');
    await h.js(()=>document.querySelector('[data-go="legal-data"]').click()); await h.sleep(900);
    if (!/Everything Koko keeps/.test(await text())) throw new Error('data page not shown'); await h.shot('l-app-data'); await back();
  });
  await step('no support card without links', async ()=>{
    await h.js(async ()=>{ const {APP}=await import('/config.js'); APP.support = { stripe:'', paypal:'' }; });
    await back(); await go('settings'); await h.sleep(600);
    if (/Buy me a karak/.test(await text())) throw new Error('card shown with no links'); await back();
  });
  await step('delete my account (this phone)', async ()=>{
    await go('settings'); await h.sleep(600);
    await h.js(()=>document.querySelector('#sDelete').click()); await h.sleep(500);
    if (!await h.js(()=>document.querySelector('#dlYes').disabled)) throw new Error('not guarded');
    await p.type('#dlIn', 'delete'); await h.sleep(200); await h.shot('l-delete');
    await h.js(()=>document.querySelector('#dlYes').click()); await h.sleep(1500);
    const st = await h.js(async ()=>{ const S=await import('/store.js'); return { me: !!S.me(), entries: S.entries({includeHidden:true}).length, keys: Object.keys(localStorage).filter(k=>/^koko-outbox|^koko-active/.test(k)).length }; });
    if (st.me || st.entries) throw new Error(JSON.stringify(st));
    if (!/Continue with Email/.test(await text())) throw new Error('not back at sign-in');
  });
}
