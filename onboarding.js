// Onboarding: welcome, sign-in, handle, avatar, share default, crew setup, import (frames 1-6, 8).
import { APP } from './config.js';
import * as S from './store.js';
import { CATEGORIES, catById, iconSvg, esc, plural } from './data.js';
import { SKINS, HAIR_COLORS, TOPS, HAIRS, OUTFITS, spriteSvg, DEFAULT_AVATAR, avatarHTML } from './avatar.js';
import { $, icon, toast, openScreen, back, closeAll, topbar, polaroidHTML } from './ui.js';
import { go, state } from './go.js';
import { zoneById } from './map.js';

const STEPS = 5;
function bars(n){ return `<span class="bars">${Array.from({length:STEPS},(_,i)=>`<i class="${i<n-1?'done':i===n-1?'on':''}"></i>`).join('')}</span>`; }
let root=null;

/* ---------- 1. welcome (not a history layer: it's the bottom of the stack) ---------- */
function welcome(){
  if (root) root.remove();
  root=document.createElement('section');
  root.className='screen in'; root.style.transition='none';
  root.innerHTML = `<div class="welcome">
    <h1 class="w-brand"><span class="wordmark" role="img" aria-label="${esc(APP.name)}"></span></h1>
    <span class="hand">${esc(APP.tagline)}</span>
    <div class="w-stack">
      ${polaroidHTML({src:'demo/d04.jpg', caption:'morning ✨', rot:-6, cls:'p1'})}
      ${polaroidHTML({src:'demo/d02.jpg', caption:'Al Fahidi alley hidden gem! 🫖', rot:2.5, cls:'p2 wide', badge:'<span class="pol-badge light">'+icon('verified')+'DXB • 25</span>', sub:''})}
      <span class="crew-pick">${icon('favorite')}CREW PICK</span>
    </div>
    <div class="stack" style="width:100%">
      <button class="btn btn-google btn-block" id="wGoogle"><svg width="22" height="22" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
      <button class="btn btn-gold btn-block" id="wEmail">${icon('mail')}Continue with Email</button>
    </div>
    <div class="or-rule mt20">${icon('restaurant')}</div>
    <p class="center muted mt12" style="font-size:15px">By continuing, you agree to our Terms. Location is only used when stamping and bookmarking a bite.</p>
    ${!S.cloud?`<p class="center mono mt16" style="font-size:11px;color:var(--outline)">PREVIEW • accounts stay on this phone for now</p>`:''}
  </div>`;
  $('#screens').prepend(root);   // always underneath the step screens
  root.querySelector('#wGoogle').onclick=async()=>{
    if (!S.cloud){ S.signIn({provider:'google'}); toast('Google sign-in switches on with accounts. Setting you up on this phone.'); handleStep(); return; }
    // off to Google and back; the app picks up the session on return
    try{ await S.signInGoogle(); }
    catch(e){ toast(/provider is not enabled|Unsupported provider/i.test(e.message||'') ? 'Google sign-in isn’t switched on yet. Use email for now.' : 'Couldn’t reach Google. Try again, or use email.'); }
  };
  root.querySelector('#wEmail').onclick=emailStep;
}

/* ---------- email + code (frame 2) ---------- */
function emailStep(){
  openScreen(el=>{
    el.innerHTML = topbar({title:'Sign in', eyebrow:'Air mail', profile:false}) + `<div class="screen-body">
      <div class="row between mt8"><span class="airmail">${icon('mail')}AIR MAIL // DXB</span><span class="post-stamp">${icon('verified')}DUBAI</span></div>
      <h1 class="h-xl mt16">What's your email?</h1>
      <p class="muted mt8" style="font-size:16px">We'll send a 6-digit code to open your scrapbook. No passwords.</p>
      <div class="field mt24"><label class="eyebrow" for="eIn">Email</label><input class="input" id="eIn" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"></div>
      <div id="eErr" class="alert mt16" hidden>${icon('priority_high')}<div><b>That doesn't look like an email</b>Check for typos and try again.</div></div>
      <button class="btn btn-gold btn-block mt24" id="eGo">Send my code ${icon('arrow_forward')}</button>
    </div>`;
    const inp=el.querySelector('#eIn'); setTimeout(()=>inp.focus(), 300);
    const btn=el.querySelector('#eGo');
    const go2=async()=>{
      const v=inp.value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){ el.querySelector('#eErr').hidden=false; return; }
      if (!S.cloud) return codeStep(v);
      btn.disabled=true; btn.innerHTML='Sending…';
      try{ await S.sendCode(v); codeStep(v); }
      catch(e){ toast(/rate|seconds|too many/i.test(e.message||'') ? 'Too many codes just now. Wait a minute and try again.' : 'Couldn’t send the code. Check your connection and try again.'); }
      finally{ btn.disabled=false; btn.innerHTML=`Send my code ${icon('arrow_forward')}`; }
    };
    el.querySelector('#eGo').onclick=go2; inp.addEventListener('keydown', e=>{ if (e.key==='Enter') go2(); });
  });
}
function codeStep(email){
  openScreen(el=>{
    let pending = null;
    el.innerHTML = topbar({title:'Check your email', eyebrow:'Scrapbook onboarding', profile:false}) + `<div class="screen-body">
      <div class="row between mt8"><span class="airmail">${icon('mail')}AIR MAIL // DXB-${new Date().getFullYear()}</span><span class="post-stamp">${icon('verified')}DUBAI</span></div>
      <h1 class="h-xl mt16">Check your email ✨ <span class="hand" style="display:block;margin-top:6px">Almost there!</span></h1>
      <p class="muted mt8" style="font-size:16px">We sent a 6-digit code to <span class="tag soft" style="font-size:14px;font-family:var(--f-body);text-transform:none;letter-spacing:0">${esc(email)}</span>. Enter it below to flip open your scrapbook.</p>
      <div class="card-peach mt24" style="padding:16px">
        <div class="code-box" style="padding:0;background:none"><span class="clip"></span>${Array.from({length:6},(_,i)=>`<input inputmode="numeric" maxlength="1" aria-label="Digit ${i+1}" data-i="${i}">`).join('')}</div>
        <div class="row between mt16"><span class="row muted" style="gap:8px">${icon('schedule')}Resend code in <span class="tag soft" id="cT">0:40</span></span><button class="mono" id="cResend" style="color:var(--outline-v);font-weight:700;letter-spacing:.08em" disabled>Send again</button></div>
      </div>
      <div id="cPending"></div>
      <div id="cErr" class="alert mt16" hidden>${icon('priority_high')}<div><b>Wrong code entered</b>Double-check your inbox or spam folder, or tap resend above.</div></div>
      ${!S.cloud?`<div class="note mt16">${icon('science')}<span><b>Preview mode:</b> no email is actually sent yet. Enter any 6 digits.</span></div>`:`<p class="muted small mt12">No email? Check spam, or wait a minute and tap Send again. You can also tap the link in the email.</p>`}
      <button class="btn btn-gold btn-block mt24" id="vfyGo">Verify & Continue ${icon('arrow_forward')}</button>
      <p class="center mt16"><span class="hand">Having trouble?</span> <button class="hand link" data-act="back" style="font-size:19px">Change email address</button></p>
    </div>`;
    if (state.pendingJoin) S.findCrewByCode(state.pendingJoin).then(p=>{ const box=el.querySelector('#cPending'); if (p && box) box.innerHTML=`<div class="card mt16 row">${icon('menu_book')}<div class="grow"><span class="eyebrow">Scrapbook locked</span><div><b>${esc(p.name)}</b></div><span class="hand">crew memories waiting for you</span></div></div>`; });
    const ins=[...el.querySelectorAll('.code-box input')];
    ins.forEach((inp,i)=>{
      inp.addEventListener('input', ()=>{ inp.value=inp.value.replace(/\D/g,'').slice(-1); el.querySelector('#cErr').hidden=true; if (inp.value && ins[i+1]) ins[i+1].focus(); if (ins.every(x=>x.value)) verify(); });
      inp.addEventListener('keydown', e=>{ if (e.key==='Backspace' && !inp.value && ins[i-1]) ins[i-1].focus(); });
      inp.addEventListener('paste', e=>{ const t=(e.clipboardData.getData('text')||'').replace(/\D/g,'').slice(0,6); if (t.length){ e.preventDefault(); t.split('').forEach((c,k)=>{ if (ins[k]) ins[k].value=c; }); (ins[t.length]||ins[5]).focus(); if (t.length===6) verify(); } });
    });
    setTimeout(()=>ins[0].focus(), 300);
    let t=40; const timer=setInterval(()=>{ t--; const tt=el.querySelector('#cT'); if (!tt){ clearInterval(timer); return; } tt.textContent=`0:${String(Math.max(0,t)).padStart(2,'0')}`; if (t<=0){ clearInterval(timer); const r=el.querySelector('#cResend'); r.disabled=false; r.style.color='var(--rust)'; } }, 1000);
    el.querySelector('#cResend').onclick=async()=>{
      if (!S.cloud) return toast('Preview mode: nothing to resend, any 6 digits work');
      try{ await S.sendCode(email); toast('Code sent again'); }catch(_){ toast('Wait a minute before asking for another code'); }
    };
    let checking=false;
    async function verify(){
      const code=ins.map(x=>x.value).join('');
      if (code.length<6){ el.querySelector('#cErr').hidden=false; return; }
      if (!S.cloud){ S.signIn({email, provider:'email'}); handleStep(); return; }
      if (checking) return; checking=true;
      const b=el.querySelector('#vfyGo'); b.disabled=true; b.innerHTML='Checking…';
      try{
        await S.verifyCode(email, code);
        // someone coming back on a new phone goes straight in
        if (S.isOnboarded()) finish(); else handleStep();
      }catch(e){
        el.querySelector('#cErr').hidden=false; ins.forEach(x=>x.value=''); ins[0].focus();
      }finally{ checking=false; b.disabled=false; b.innerHTML=`Verify & Continue ${icon('arrow_forward')}`; }
    }
    el.querySelector("#vfyGo").onclick=verify;
  });
}

/* ---------- 3. handle ---------- */
function handleStep(opts){
  opts=opts||{};
  const me=S.me();
  openScreen(el=>{
    el.innerHTML = topbar({title: opts.edit?'Name & handle':'Scrapbook Onboarding', profile:false}) + `<div class="screen-body">
      ${opts.edit?'':`<div class="row between mt8"><span class="row" style="gap:6px;min-width:0"><span class="step" style="background:none;padding:0">STEP 2 OF ${STEPS}</span><span class="hand trunc">Crew registry</span></span>${bars(2)}</div>`}
      <h1 class="h-xl mt24">Pick your handle <span class="ms" style="color:var(--gold);font-size:30px">edit</span></h1>
      <p class="muted mt8" style="font-size:16px">This is how your food crew will tag you on visits and photos across ${esc(APP.city)}.</p>
      <div class="field-label mt24"><span class="eyebrow">Crew alias</span><span class="hand">letters, numbers &amp; underscores</span></div>
      <div class="handle-input mt8" id="hBox"><b>@</b><input id="hIn" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(me.handle||'')}" placeholder="you"><span class="ok">${icon('check')}</span></div>
      <div class="mt12" id="hMsg"></div>
      <div class="rules mt8"><span id="rLen">&gt; 2 chars</span><span id="rUniq">unique</span></div>
      <div class="field mt20"><label class="eyebrow" for="nIn">Display name <span style="text-transform:none;font-weight:400">(optional)</span></label><input class="input" id="nIn" maxlength="30" value="${esc(me.name||'')}" placeholder="What friends call you"></div>
      <div class="preview-card mt32"><span class="tape-label">live preview</span>
        <div class="row between"><span class="row h-sm">${icon('verified')}Stamps &amp; Activity Look</span><span class="mono muted" style="font-size:11px">PASS PREVIEW</span></div>
        <div class="activity-sample mt12">
          <div class="row"><span class="stamp st-visited"><span class="st-paper"><span class="st-ico">${iconSvg('coffee','#7e5700')}</span></span></span><div class="grow"><b id="pvH">@you</b><div>logged a spot at <b>Trio Cafe</b></div></div><span class="mono muted" style="font-size:12px">Just now</span></div>
          <div class="as-inner"><img src="demo/d08.jpg" alt="" style="width:56px;height:56px;border-radius:8px;object-fit:cover"><div><b>Iced Spanish Latte &amp; Brioche</b><div class="hand">"The cardamom note was crazy good"</div></div></div>
        </div>
        <div class="row between mt12"><span class="hand">${esc(APP.city)} Food Diary · Vol. 01</span><span class="mono muted" style="font-size:12px">● verified alias</span></div>
      </div>
      <button class="btn btn-gold btn-block mt32" id="hGo" disabled>${opts.edit?'Save':'Next: Choose Avatar'} ${icon(opts.edit?'check':'arrow_forward')}</button>
      <p class="center hand mt12">You can always change your alias later in your profile.</p>
    </div>`;
    const inp=el.querySelector('#hIn'), box=el.querySelector('#hBox'), msg=el.querySelector('#hMsg'), btn=el.querySelector('#hGo');
    const check=()=>{
      inp.value = inp.value.toLowerCase().replace(/[^a-z0-9_]/g,'');
      const h=inp.value, st=S.handleStatus(h);
      el.querySelector('#pvH').textContent='@'+(h||'you');
      const lenOk = h.length>=3;
      el.querySelector('#rLen').className = h ? (lenOk?'ok':'bad') : '';
      el.querySelector('#rUniq').className = !lenOk ? '' : (st==='taken'?'bad':'ok');
      box.classList.toggle('valid', st==='ok');
      msg.innerHTML = !h ? '' : st==='ok' ? `<span class="ok-pill">${icon('check_circle')}✓ @${esc(h)} is available!</span>` :
        st==='taken' ? `<span class="tag red" style="font-size:12px;padding:6px 12px">@${esc(h)} is taken</span>` :
        st==='short' ? `<span class="tag rust" style="font-size:12px;padding:6px 12px">too short</span>` : `<span class="tag red" style="font-size:12px;padding:6px 12px">letters, numbers &amp; _ only</span>`;
      btn.disabled = st!=='ok';
    };
    let askT=null, asked='';
    const askServer=()=>{
      clearTimeout(askT); const h=inp.value;
      if (!S.cloud || S.handleStatus(h)!=='ok' || h===(me.handle||'')) return;
      btn.disabled=true;
      askT=setTimeout(async()=>{ asked=h; const free=await S.handleAvailable(h); if (inp.value!==asked) return;
        if (!free){ box.classList.remove('valid'); el.querySelector('#rUniq').className='bad'; msg.innerHTML=`<span class="tag red" style="font-size:12px;padding:6px 12px">@${esc(h)} is taken</span>`; btn.disabled=true; }
        else btn.disabled=false; }, 350);
    };
    inp.addEventListener('input', ()=>{ check(); askServer(); }); check(); askServer();
    setTimeout(()=>inp.focus(), 300);
    btn.onclick=()=>{
      const h=inp.value, name=el.querySelector('#nIn').value.trim();
      S.updateMe({handle:h, name: name || h.charAt(0).toUpperCase()+h.slice(1)});
      if (opts.edit){ back(); toast('Saved'); go.refresh(); } else avatarStep();
    };
  });
}
go.editHandle = ()=>handleStep({edit:true});

/* ---------- 4. avatar ---------- */
function avatarStep(opts){
  opts=opts||{};
  const me=S.me();
  const av = {...DEFAULT_AVATAR, ...(me.avatar&&me.avatar.pixel||{})};
  const pid = 100 + (parseInt((me.id||'').replace(/\D/g,'').slice(0,3)||'804',10)%900);
  openScreen(el=>{
    const paint=()=>{
      const robe = av.outfit==='kandura' || av.outfit==='abaya';
      el.innerHTML = topbar({title: opts.edit?'Your avatar':'Scrapbook Onboarding', profile:false}) + `<div class="screen-body">
        ${opts.edit?'':`<div class="row between mt8"><span class="step">STEP 3 OF ${STEPS}</span>${bars(3)}</div>`}
        <div class="row mt20" style="align-items:flex-start"><h1 class="h-xl grow">Style your pixel avatar</h1><span class="hand" style="margin-top:6px">Pocket friend!</span></div>
        <p class="muted mt8" style="font-size:16px">Visible only to your crew on the map and scrapbook pages.</p>
        <div class="avatar-stage mt20"><span class="tape rose" style="left:40px"></span><span class="tape" style="right:40px;left:auto"></span>
          <div class="avatar-ring">${spriteSvg(av, 11)}</div>
          <span class="px-id">DXB_PIXEL_ID #${pid} ${icon('verified')}</span>
        </div>
        <div class="row between mt24"><h3 class="h-md">Skin Tone</h3><span class="hand">6 desert tones</span></div>
        <div class="swatches mt8" data-k="skin">${SKINS.map((c,i)=>`<button class="sw${av.skin===i?' on':''}" style="background:${c}" data-v="${i}" aria-label="Skin ${i+1}"></button>`).join('')}</div>
        <div class="row between mt24"><h3 class="h-md">Hair &amp; Headwear</h3><span class="eyebrow">Style</span></div>
        <div class="pills mt8" data-k="hair">${HAIRS.map(([v,l])=>`<button class="pill-opt${av.hair===v?' on':''}" data-v="${v}">${av.hair===v?icon('check'):''}${l}</button>`).join('')}</div>
        <div class="row between mt20"><h3 class="h-md">Hair colour</h3></div>
        <div class="swatches round mt8" data-k="hairColor">${HAIR_COLORS.map(c=>`<button class="sw${av.hairColor===c?' on':''}" style="background:${c}" data-v="${c}" aria-label="Hair colour"></button>`).join('')}</div>
        <div class="row between mt24"><h3 class="h-md">Outfits</h3><span class="eyebrow">Attire</span></div>
        <div class="opt-grid mt8" data-k="outfit">${OUTFITS.map(([v,l])=>`<button class="opt-card${av.outfit===v?' on':''}" data-v="${v}">${icon(v==='dress'?'checkroom':v==='abaya'?'woman':'apparel')}${l}<span class="radio"></span></button>`).join('')}</div>
        ${robe?'':`<div class="row between mt24"><h3 class="h-sm" style="font-family:var(--f-body)">Garment Tint</h3><span class="mono muted" style="font-size:12px">${TOPS.length} tones</span></div>
        <div class="swatches round mt8" data-k="top">${TOPS.map(c=>`<button class="sw${av.top===c?' on':''}" style="background:${c}" data-v="${c}" aria-label="Top colour"></button>`).join('')}</div>`}
        <div class="card-peach mt24 row"><span style="background:var(--card);border-radius:12px;padding:6px;box-shadow:var(--shadow-sm)">${spriteSvg(av,3)}</span><div class="grow"><b class="h-sm">Map Badge Preview</b><div class="hand">"Ready for Old Dubai karak runs!"</div></div>${icon('push_pin')}</div>
        <div class="note mt16">${icon('shield_lock')}<span>Your avatar is visible to your crew.</span></div>
        <button class="btn btn-gold btn-block mt24" id="aGo">${opts.edit?'Save avatar':'Next: Crew Sharing'} ${icon(opts.edit?'check':'arrow_forward')}</button>
        <p class="center hand mt12">You can re-dress your pocket avatar anytime</p>
      </div>`;
      el.querySelectorAll('[data-k] [data-v]').forEach(b=>b.addEventListener('click', ()=>{
        const k=b.closest('[data-k]').dataset.k; av[k] = k==='skin' ? parseInt(b.dataset.v,10) : b.dataset.v;
        const st=el.scrollTop; paint(); el.scrollTop=st;
      }));
      el.querySelector('#aGo').onclick=()=>{
        S.updateMe({avatar:{...(me.avatar||{}), pixel:{...av}}});
        go.paintMe && go.paintMe();
        if (opts.edit){ back(); toast('Looking sharp'); go.refresh(); } else shareStep();
      };
    };
    paint();
  });
}
go.editAvatar = ()=>avatarStep({edit:true});

/* ---------- 5. who sees what (you choose on every save) ---------- */
function shareStep(){
  openScreen(el=>{
    el.innerHTML = topbar({title:'Crew sharing', center:true, profile:false, progress:[0,4]}) + `<div class="screen-body center">
      <span class="tag rust mt8" style="transform:rotate(-1deg)">● Field notes • privacy</span><br>
      <span class="step mt8" style="letter-spacing:.2em">STEP 4 OF ${STEPS}</span>
      <h1 class="h-xl mt12">You decide who sees each place</h1>
      <p class="muted mt8" style="font-size:16px">Every time you save a place, pick <b>Just me</b> or any of your crews: family, friends, the work lunch gang. Nothing is shared unless you choose.</p>
      <div class="card mt24" style="text-align:left;position:relative"><span class="tape" style="right:40px;left:auto;top:-10px"></span>
        <span class="eyebrow">Who's this for?</span>
        <div class="who-grid mt8" aria-hidden="true">
          <span class="radio-card"><span class="rc-head">${icon('lock')}Just me</span><p>Only you can see it</p></span>
          <span class="radio-card on"><span class="rc-head">${icon('groups','',true)}Family</span><p>4 members</p></span>
          <span class="radio-card on"><span class="rc-head">${icon('groups','',true)}Karak Crew</span><p>6 members</p></span>
          <span class="radio-card"><span class="rc-head">${icon('groups')}Work</span><p>9 members</p></span>
        </div></div>
      <div class="note mt20" style="border-radius:999px;justify-content:center;text-align:center">${icon('verified_user')}<span>You can be in up to ${APP.crewsPerPerson} crews. Change who sees a place any time from its page.</span></div>
      <button class="btn btn-gold btn-block mt24" id="sGo">Continue to Crew Setup ${icon('arrow_forward')}</button>
    </div>`;
    el.querySelector('#sGo').onclick=()=>go.crewSetup({onboarding:true});
  });
}

/* ---------- finish + 8. import ---------- */
function finish(){
  S.updateMe({onboarded:true});
  closeAll();
  if (root){ const r=root; root=null; r.classList.add('fade'); r.style.transition='opacity .3s'; r.style.opacity='0'; setTimeout(()=>r.remove(), 320); }
  go.afterOnboarding();
}
go.finishOnboarding = ()=>{ if (S.legacyPlaces().length) importStep(true); else finish(); };

function importStep(fromOnboarding){
  const list=S.legacyPlaces();
  const sel=new Set(list.map(p=>p.id));
  openScreen(el=>{
    const paint=()=>{
      const n=sel.size;
      el.innerHTML = topbar({title:'Import', center:true, profile:false, progress:fromOnboarding?[0,4]:null}) + `<div class="screen-body center">
        <span class="tag soft mt8">AUTO-SYNC • THIS PHONE</span>
        <div style="margin:14px auto 0;width:52px;height:52px;border-radius:50%;background:var(--sc-high);display:flex;align-items:center;justify-content:center">${icon('photo_library')}</div>
        <h1 class="h-xl mt12">Found ${plural(list.length,'place')} on this phone</h1>
        <p class="muted mt8" style="font-size:16px">Add them to your scrapbook?</p>
        <div class="stack mt20" style="text-align:left">${list.map(p=>{
          const cat=catById((p.categories||[])[0])||CATEGORIES[0], z=zoneById(p.zone);
          return `<button class="import-row${sel.has(p.id)?' on':''}" data-id="${esc(p.id)}"><span class="cb">${icon('check')}</span>
            <span class="ir-thumb">${p.photo?`<img src="${p.photo}" alt="">`:iconSvg(cat.id,cat.color)}</span>
            <span class="grow"><b class="h-sm trunc" style="display:block">${esc(p.name||'Untitled')}</b><span class="muted">${esc(z?z.label:APP.city)} • ${p.photo?'<span style="color:var(--rust)">1 photo</span>':(p.status==='want'?'Want to try':'Visit')}</span></span>
            <span class="tag ${cat.id==='karak'||cat.id==='matcha'?'green':''}">${esc(cat.label)}</span></button>`;
        }).join('')}</div>
        <div class="card-peach mt20" style="text-align:left"><span class="eyebrow" style="color:var(--rust)">${icon('verified')} Preview scrapbook sync</span>
          <div class="h-md mt8">${n} places added, ${list.length-n} skipped</div><span class="hand">Ready to paste into your personal food itinerary</span></div>
        <button class="btn btn-gold btn-block mt24" id="iGo" ${n?'':'disabled'}>${icon('library_add_check')}Import Selected (${n})</button>
        <button class="btn btn-white btn-block mt12" id="iSkip">${icon('close')}Skip for now</button>
        <p class="center hand mt16">Don't worry, you can easily delete or retag items later!</p>
      </div>`;
      el.querySelectorAll('.import-row').forEach(r=>r.onclick=()=>{ sel.has(r.dataset.id)?sel.delete(r.dataset.id):sel.add(r.dataset.id); const st=el.scrollTop; paint(); el.scrollTop=st; });
      el.querySelector('#iGo').onclick=async()=>{ const n=await S.importLegacy([...sel]); toast(`${plural(n,'place')} added to your scrapbook`); fromOnboarding?finish():(back(), go.refresh()); };
      el.querySelector('#iSkip').onclick=()=>{ S.skipLegacy(); fromOnboarding?finish():back(); };
    };
    paint();
  });
}
go.importPhone = ()=>importStep(false);

go.onboarding = ()=>{
  if (S.me() && !S.isOnboarded()){ welcome(); handleStep(); return; }
  welcome();
};
