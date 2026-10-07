// Crew: setup (create / join / invite link), crew screen, crew of one, invite landing (frames 6, 9, 10).
import { APP } from './config.js';
import * as S from './store.js';
import * as M from './model.js';
import { esc, plural } from './data.js';
import { avatarHTML } from './avatar.js';
import { $, icon, toast, openScreen, openSheet, back, closeAll, topbar, share, copy, seg, bindSeg } from './ui.js';
import { go, state } from './go.js';

function inviteText(crew){ return `Join my food crew "${crew.name}" on ${APP.name}: code ${crew.code}`; }
async function sendInvite(crew){ await share({ title:`Join ${crew.name}`, text:inviteText(crew), url:APP.inviteUrl(crew.code) }); }

/* ---------- 6. crew setup ---------- */
function crewSetup(opts){
  opts=opts||{};
  let tab = opts.tab || (state.pendingJoin ? 'join' : 'create');
  // in onboarding you may come back to the crew you just made; otherwise this always makes a new crew
  let made = opts.onboarding ? S.myCrew() : null;
  // a new crew starts as "My Crew": rename it here or any time later
  let name = made?.name || 'My Crew';
  const full = !made && S.myCrews().length >= APP.crewsPerPerson;
  let joinCode = opts.code || state.pendingJoin || '';
  let err = null;
  openScreen(el=>{
    const paint=()=>{
      const me=S.me();
      const preview = { name: name.trim() || 'My Crew', code: made?.code || ((name.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5)||'CREW')+'··') };
      el.innerHTML = topbar({title:'Crew Setup Invitation', center:true, profile:false, progress:opts.onboarding?[0,4]:null}) + `<div class="screen-body">
        <div class="row between mt8">${opts.onboarding?`<span class="step">STEP 5 OF 5 • CREW</span>`:'<span></span>'}<span class="hand">Almost ready to feast! 🫖</span></div>
        <h1 class="h-xl mt12">Set up your food crew</h1>
        <p class="muted mt8" style="font-size:16px">Scrapbook hidden spice dens in Deira and secret beach shacks together in one living logbook.</p>
        <div class="mt20">${seg('ctab', [['create','Create Crew','group_add'],['join','Join Crew','key']], tab)}</div>
        ${tab==='create' && full ? `<div class="alert warn mt20">${icon('groups')}<div class="grow"><b>You're in ${APP.crewsPerPerson} crews</b>That's the most one person can be in. Leave one from the Crew tab to start another.</div></div>` : ''}
        ${tab==='create' ? `
        <div class="card mt20">
          <div class="field-label"><span class="eyebrow">${icon('local_cafe')} Crew log name</span><span class="hand">Personalised stamp</span></div>
          <div class="input-wrap mt8"><input class="input" id="cName" maxlength="32" placeholder="My Crew" value="${esc(name)}" style="padding-left:16px;font-size:18px;font-weight:600"><span class="trail ms">edit</span></div>
          <p class="muted mt8">This title adorns your communal polaroid book and map pins across ${esc(APP.city)}.</p>
        </div>
        <div class="card mt16">
          <div class="row between"><span class="eyebrow" style="color:var(--rust)">${icon('link')} Secret invite link</span><span class="tag soft">Up to ${APP.crewMax}</span></div>
          <div class="link-box mt12">${icon('link')}<span>${esc(APP.inviteUrl(preview.code).replace(/^https?:\/\//,''))}</span><button class="btn btn-white btn-sm" id="cCopy">${icon('content_copy')}Copy</button></div>
          <div class="row between mt12"><span class="row" style="gap:8px">${icon('verified')}<span>AirDrop &amp; WhatsApp ready</span></span><span class="hand">No app download needed!</span></div>
        </div>
        <button class="btn btn-gold btn-block mt20" id="cInvite">${icon('share')}Invite Friends to Logbook</button>
        <div class="row between mt24"><span class="eyebrow">${icon('visibility')} Preview for recipients</span><span class="hand">Real-time RSVP card</span></div>
        <div class="invite-card mt12"><span class="tag rust" style="position:absolute;top:-10px;left:50%;transform:translateX(-50%)">${esc(APP.name)}</span>
          <div style="width:64px;height:64px;border-radius:50%;background:var(--gold-fixed);margin:6px auto 0;display:flex;align-items:center;justify-content:center">${icon('restaurant','', true)}</div>
          <span class="hand mt8" style="display:block">Special table invitation</span>
          <h2 class="h-md">You're invited to ${esc(preview.name)}</h2>
          <div class="card-peach mt16" style="text-align:left">
            <div class="row between"><span class="eyebrow">${icon('groups')} Member roster</span><span class="tag green">1 of ${APP.crewMax} members</span></div>
            <div class="roster mt12"><div class="rs">${avatarHTML(me,30)}<div style="min-width:0"><b>You</b><small>@${esc(me.handle)}</small></div></div></div>
            <div class="row between mt12"><span class="mono muted" style="font-size:11px">${APP.crewMax-1} vacant seats remaining</span></div>
          </div>
        </div>` : `
        <div class="card mt20">
          <span class="eyebrow">${icon('confirmation_number')} Crew code</span>
          <p class="muted mt8">Paste the invite link or type the code from your friend's text.</p>
          <div class="input-wrap mt12"><input class="input" id="jCode" autocapitalize="characters" placeholder="E.G. 4F9A2C7E1B" value="${esc(joinCode)}" style="padding-left:16px;font-family:var(--f-mono);letter-spacing:.12em;font-size:18px"><span class="trail ms">key</span></div>
          <button class="btn btn-soft btn-block mt12" id="jGo">Join their crew ${icon('arrow_forward')}</button>
        </div>
        ${err==='invalid'?`<div class="alert mt16">${icon('priority_high')}<div class="grow"><div class="row between"><b>Invalid crew code</b><span class="tag red" style="background:var(--card)">Error #404</span></div>Code <b class="mono">${esc(joinCode.toUpperCase())}</b> not found. Please double-check with your host or paste their link.${!S.cloud?'<br><br><b>Preview mode:</b> only crews made on this phone can be joined until accounts go live.':''}</div></div>`:''}
        ${err==='offline'?`<div class="alert warn mt16">${icon('wifi_off')}<div class="grow"><b>You're offline</b>Joining a crew needs a connection. Try again in a moment.</div></div>`:''}
        ${err==='max'?`<div class="alert warn mt16">${icon('groups')}<div class="grow"><b>You're in ${APP.crewsPerPerson} crews</b>That's the most one person can be in. Leave one from the Crew tab to join this one.</div></div>`:''}
        ${err==='full'?`<div class="alert warn mt16">${icon('lock')}<div class="grow"><div class="row between"><b>Crew is full (${APP.crewMax} of ${APP.crewMax})</b><span class="tag rust">Capacity reached</span></div>New joins need the owner to make room first.</div></div>`:''}`}
        <button class="btn btn-dark btn-block mt32" id="cGo">${opts.onboarding?'Continue to Scrapbook':'Done'} ${icon('arrow_forward')}</button>
        ${opts.onboarding?`<button class="btn btn-ghost btn-block mt8" id="cSolo">I'll explore solo for now →</button>`:''}
      </div>`;
      bindSeg(el, 'ctab', v=>{ tab=v; err=null; paint(); });
      const nm=el.querySelector('#cName');
      if (nm) nm.addEventListener('input', ()=>{ name=nm.value; const lb=el.querySelector('.link-box span:not(.ms)'); if (!made) lb.textContent=APP.inviteUrl((name.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5)||'CREW')+'··').replace(/^https?:\/\//,''); el.querySelector('.invite-card h2').textContent=`You're invited to ${name.trim()||'My Crew'}`; });
      let making=null;
      const ensure=async()=>{
        if (!made){
          if (full){ toast(`You're in ${APP.crewsPerPerson} crews already. Leave one to start another.`); return null; }
          if (!name.trim()) name = 'My Crew';
          try{ made = await (making = making || S.createCrew({name})); }catch(e){ making=null; toast(e && /max/.test(e.message) ? `You're in ${APP.crewsPerPerson} crews already. Leave one to start another.` : 'Couldn’t create the crew. Check your connection and try again.'); return null; }
        }
        else if (name.trim() && name.trim()!==made.name){ S.setActiveCrew(made.id); S.updateCrew({name:name.trim()}); }
        return made;
      };
      const cp=el.querySelector('#cCopy'); if (cp) cp.onclick=async()=>{ const c=await ensure(); if (c){ copy(APP.inviteUrl(c.code), 'Invite link copied'); paint(); } };
      const inv=el.querySelector('#cInvite'); if (inv) inv.onclick=async()=>{ const c=await ensure(); if (c){ await sendInvite(c); paint(); } };
      const jc=el.querySelector('#jCode'); if (jc) jc.addEventListener('input', ()=>{ joinCode=jc.value; });
      const jg=el.querySelector('#jGo'); if (jg) jg.onclick=()=>doJoin();
      const doJoin=async()=>{
        const r=await S.joinCrew(joinCode);
        if (r.error){ err=r.error; paint(); return false; }
        state.pendingJoin=null; toast(`Welcome to ${r.crew?.name||'the crew'}!`); go.refresh(); done(); return true;
      };
      const done=()=>{ if (opts.onboarding) go.finishOnboarding(); else { back(); go.refresh(); } };
      el.querySelector('#cGo').onclick=async()=>{
        const b=el.querySelector('#cGo'); b.disabled=true;
        try{
          if (tab==='create'){ if (name.trim()){ if (!await ensure()) return; go.refresh(); } done(); }
          else { if (joinCode.trim()) await doJoin(); else done(); }
        } finally { b.disabled=false; }
      };
      const solo=el.querySelector('#cSolo'); if (solo) solo.onclick=()=>go.finishOnboarding();
    };
    paint();
  });
}
go.crewSetup = crewSetup;

/* ---------- your crews: switch between them, start or join another ---------- */
function switcherHTML(){
  const cs=S.myCrews(), active=S.myCrew();
  if (cs.length<2 && !active) return '';
  const room = cs.length < APP.crewsPerPerson;
  return `<div class="crew-switch mt12" role="tablist" aria-label="Your crews">${cs.map(c=>`<button class="chip${active&&c.id===active.id?' on':''}" role="tab" aria-selected="${active&&c.id===active.id}" data-crew="${c.id}">${icon('groups')}${esc(c.name)}</button>`).join('')}${room?`<button class="chip" id="csAdd">${icon('add')}New or join</button>`:''}</div>`;
}
function bindSwitcher(el, paint){
  el.querySelectorAll('[data-crew]').forEach(b=>b.onclick=()=>{ S.setActiveCrew(b.dataset.crew); go.refresh(); paint(); });
  const a=el.querySelector('#csAdd'); if (a) a.onclick=()=>crewSetup({});
}
go.crewSwitcher = { html:switcherHTML, bind:bindSwitcher };

/* ---------- 9 / 10. crew screen ---------- */
function crewScreen(){
  openScreen(el=>{
    const paint=()=>{
      const crew=S.myCrew(), me=S.me();
      const members=S.crewMembers(crew);
      if (!crew || members.length<2) return paintSolo(crew);
      const owner=crew.ownerId===me.id;
      const est=new Date(crew.createdAt).getFullYear();
      el.innerHTML = topbar({title:S.myCrews().length>1?'Your Crews':'Your Crew', eyebrow:'Food journal'}) + `<div class="screen-body">
        ${switcherHTML()}
        <div class="passport mt16"><span class="tape"></span>
          <div class="row" style="align-items:flex-start">
            <span class="pp-icon">${icon('local_cafe','',true)}</span>
            <div class="grow"><div class="row" style="gap:8px"><span class="eyebrow" style="color:var(--rust)">Crew passport</span><span class="hand">Est. ${est}</span></div>
              <div class="pp-code">CODE: <b>${esc(crew.code)}</b></div></div>
            <button class="btn btn-white btn-sm" id="cpCopy" style="border-radius:999px">${icon('content_copy')}COPY</button>
          </div>
          <div class="row between mt16"><span class="row" style="gap:6px"><i style="width:9px;height:9px;border-radius:50%;background:var(--green);display:inline-block"></i>${members.length} of ${APP.crewMax} members aboard</span><span class="mono" style="color:var(--rust);font-weight:700;font-size:12px">${APP.crewMax-members.length} spots open</span></div>
          <div class="cap-bar"><i style="width:${Math.round(members.length/APP.crewMax*100)}%"></i></div>
        </div>
        <div class="row mt24" style="align-items:flex-start">
          <div class="grow"><h2 class="h-lg" id="cnm">${esc(crew.name)}</h2><span class="hand">${esc(crew.tagline||(owner?'Tap to add a crew motto':''))}</span></div>
          <button class="btn btn-gold btn-sm" id="cInv" style="border-radius:999px;min-height:48px;font-size:17px">${icon('person_add')}Invite</button>
        </div>
        <button class="card mt16 block-btn row" id="cChallenges">${icon('flag')}<span class="grow"><b>Crew challenges</b><span class="muted small" style="display:block">Three to do together this month</span></span>${icon('chevron_right')}</button>
        ${go.eventsCard ? go.eventsCard() : ''}
        <div class="row between mt20"><span class="eyebrow">Fellow explorers (${members.length})</span><span class="mono" style="color:var(--green);font-size:12px">All sync'd</span></div>
        <div class="stack mt12">${members.map(u=>{
          const isMe=u.id===me.id, isOwner=u.id===crew.ownerId;
          return `<div class="person-row"><button data-profile="${u.id}" aria-label="${esc(u.name||u.handle)}'s profile" style="border-radius:50%">${avatarHTML(u,52)}</button><div class="pr-main">
            <div class="pr-name">${isMe?'You':esc(u.name||u.handle)}${isOwner?'<span class="tag soft">Owner</span>':''}${!isMe&&u.tagline?`<span class="hand">${esc(u.tagline)}</span>`:''}</div>
            <div class="pr-sub">@${esc(u.handle)} • ${plural(M.placesPinned(u.id),'place')} pinned</div></div>
            ${isMe?`<span class="ms" style="color:var(--outline)">${isOwner?'local_police':'person'}</span>`:`<button class="icon-btn" data-member="${u.id}" aria-label="Manage ${esc(u.name||u.handle)}">${icon('more_horiz')}</button>`}</div>`;
        }).join('')}</div>
        <div class="note mt20">${icon('tips_and_updates')}<span>Every pin added by members shows automatically on your shared map. ${owner?'Only you (Owner) can remove members.':'Only the owner can remove members.'}</span></div>
        <button class="btn btn-danger btn-block mt24" id="cLeave">${icon('logout')}Leave ${esc(crew.name)}</button>
        <p class="center mono muted mt12" style="font-size:12px">You'll keep your own saved places, but shared pins will be unlinked.</p>
        ${S.myCrews().length<APP.crewsPerPerson?`<button class="btn btn-ghost btn-block mt12" id="cMore">${icon('group_add')}Start or join another crew</button>`:''}
      </div>`;
      bindSwitcher(el, paint);
      el.querySelector('#cpCopy').onclick=()=>copy(crew.code, `Passcode ${crew.code} copied!`);
      el.querySelector('#cInv').onclick=()=>sendInvite(crew);
      el.querySelector('#cChallenges').onclick=()=>go.goals();
      if (go.bindEventsCard) go.bindEventsCard(el, paint);
      const more=el.querySelector('#cMore'); if (more) more.onclick=()=>crewSetup({});
      el.querySelectorAll('.person-row [data-profile]').forEach(b=>b.onclick=()=>go.profile(b.dataset.profile));
      if (owner){ const t=el.querySelector('#cnm').parentElement; t.style.cursor='pointer'; t.onclick=()=>editCrew(crew, paint); }
      el.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>memberMenu(S.user(b.dataset.member), owner, paint));
      el.querySelector('#cLeave').onclick=()=>{
        openSheet(body=>{
          body.innerHTML = `<h2 class="h-md">Leave ${esc(crew.name)}?</h2><p class="muted mt8">Your places stay in your scrapbook. You'll stop seeing ${esc(crew.name)}'s pins, and they'll stop seeing yours. Anything you shared only with them becomes just yours.</p>
            <div class="btn-grid mt20"><button class="btn btn-soft" data-x="no">Stay</button><button class="btn btn-danger" data-x="yes">Leave</button></div>`;
          body.querySelector('[data-x="no"]').onclick=()=>back();
          body.querySelector('[data-x="yes"]').onclick=async()=>{ try{ await S.leaveCrew(crew.id); }catch(_){ return toast('You’re offline. Try again in a moment.'); } back(); toast(`You left ${crew.name}`); go.refresh(); setTimeout(paint, 300); };
        });
      };
    };
    const paintSolo=(crew)=>{
      const me=S.me();
      el.innerHTML = topbar({title:'Your Crew', eyebrow:'', center:true, profile:false, actions:`<span class="tag soft" style="width:48px;height:48px;border-radius:50%;justify-content:center;padding:0;font-size:13px">1/${APP.crewMax}</span>`}).replace('<span class="tb-eyebrow"></span>','<span class="eyebrow" style="color:var(--rust)">Food journal</span>') + `<div class="screen-body">
        ${switcherHTML()}
        <div class="solo-art mt24"><span class="label">solo table #01</span>
          <div class="solo-card"><div class="inner">${avatarHTML(me,86)}<span class="mono" style="font-weight:700">YOU (CAPTAIN)</span><span class="hand">Table for one</span></div>
            <div class="row mt8" style="gap:6px;justify-content:center"><i style="width:9px;height:9px;border-radius:50%;background:var(--green);display:inline-block"></i><span class="mono muted" style="font-size:12px">Ready to share</span></div>
            <span class="cup"><span>${icon('coffee','',true)}</span></span></div>
          <span class="tag rust" style="font-family:var(--f-mono);font-size:12px;text-transform:none;letter-spacing:0;padding:6px 16px">${icon('local_cafe')} Karak poured, waiting for the crew</span>
        </div>
        <h1 class="h-xl center mt24">Your crew is just you for now</h1>
        <p class="muted center mt12" style="font-size:16px">${esc(APP.name)} is way more fun when you and your friends share the same map. Add up to ${APP.crewMax-1} friends to swap spots, leave reviews, and build your shared scrapbook.</p>
        <button class="btn btn-gold btn-block mt24" id="soInvite">${icon('share')}Invite friends to your crew</button>
        ${crew?`<div class="link-box mt12">${icon('key')}<span>Crew code <b>${esc(crew.code)}</b></span><button class="btn btn-white btn-sm" id="soCopy">${icon('content_copy')}Copy</button></div>`:''}
        <div class="card-soft mt20">
          <div class="row">${icon('confirmation_number')}<b class="h-sm" style="font-family:var(--f-body)">Have an invite code from a friend?</b></div>
          <p class="muted mt8">Enter the crew code from your friend's napkin note or text.</p>
          <div class="input-wrap mt12"><input class="input" id="soCode" autocapitalize="characters" placeholder="E.G. 4F9A2C7E1B" style="background:var(--card);padding-left:16px;font-family:var(--f-mono);letter-spacing:.1em"><span class="trail ms">key</span></div>
          <div id="soErr"></div>
          <button class="btn btn-soft btn-block mt12" id="soJoin">Join their crew ${icon('arrow_forward')}</button>
        </div>
        ${APP.sampleCrew?`<button class="btn btn-ghost btn-block mt12" id="soDemo">${icon('diversity_3')}Preview with a sample crew</button>`:''}
        <p class="row center mt16 muted" style="justify-content:center">${icon('eco')} You can always explore solo and invite friends whenever you're ready.</p>
      </div>`;
      bindSwitcher(el, paint);
      el.querySelector('#soInvite').onclick=()=>{ const c=S.myCrew(); c ? sendInvite(c) : crewSetup({tab:'create'}); };
      const sc=el.querySelector('#soCopy'); if (sc) sc.onclick=()=>copy(crew.code, 'Crew code copied');
      el.querySelector('#soJoin').onclick=async()=>{
        const r=await S.joinCrew(el.querySelector('#soCode').value);
        if (r.error==='offline'){ el.querySelector('#soErr').innerHTML = `<div class="alert warn mt12">${icon('wifi_off')}<div><b>You're offline</b>Joining needs a connection.</div></div>`; return; }
        if (r.error){ el.querySelector('#soErr').innerHTML = r.error==='max' ? `<div class="alert warn mt12">${icon('groups')}<div><b>You're in ${APP.crewsPerPerson} crews</b>Leave one to join another.</div></div>` : r.error==='full' ? `<div class="alert warn mt12">${icon('lock')}<div><b>Crew is full</b>They've reached ${APP.crewMax} members.</div></div>` : `<div class="alert mt12">${icon('priority_high')}<div><b>Invalid crew code</b>That code isn't a crew${!S.cloud?' on this phone yet (accounts aren’t live)':''}.</div></div>`; return; }
        toast(`Welcome to ${r.crew.name}!`); go.refresh(); paint();
      };
      const d=el.querySelector('#soDemo'); if (d) d.onclick=async()=>{ await S.setDemo(true); toast('Sample crew added'); go.refresh(); paint(); };
    };
    paint();
    el._repaint = paint;
  });
}
go.crew = crewScreen;

function editCrew(crew, after){
  openSheet(body=>{
    body.innerHTML = `<h2 class="h-md">Crew details</h2>
      <div class="field mt16"><label class="eyebrow">Name</label><input class="input" id="ecN" maxlength="32" value="${esc(crew.name)}"></div>
      <div class="field mt12"><label class="eyebrow">Motto</label><input class="input" id="ecT" maxlength="60" value="${esc(crew.tagline||'')}" placeholder="Chai, saffron buns, and old Deira hideouts"></div>
      <button class="btn btn-gold btn-block mt20" id="ecS">Save</button>`;
    body.querySelector('#ecS').onclick=()=>{ S.updateCrew({name:body.querySelector('#ecN').value.trim()||crew.name, tagline:body.querySelector('#ecT').value.trim()}); back(); after(); go.refresh(); };
  });
}
function memberMenu(u, owner, after){
  openSheet(body=>{
    body.innerHTML = `<div class="row">${avatarHTML(u,56)}<div class="grow"><h2 class="h-md">${esc(u.name||u.handle)}</h2><span class="mono muted">@${esc(u.handle)}</span></div></div>
      <div class="stack mt20">
        <button class="person-row" data-x="profile">${icon('badge')}<span class="pr-main"><span class="pr-name">View profile</span><span class="pr-sub">Stickers, stats and favourite spots</span></span></button>
        <button class="person-row" data-x="map">${icon('map')}<span class="pr-main"><span class="pr-name">See ${esc(u.name||u.handle)}'s places</span><span class="pr-sub">Filters the crew map to them</span></span></button>
        ${owner?`<button class="person-row" data-x="remove" style="color:var(--red)">${icon('person_remove')}<span class="pr-main"><span class="pr-name">Remove from crew</span><span class="pr-sub">Their places leave your shared map</span></span></button>`:''}
      </div>`;
    body.querySelector('[data-x="profile"]').onclick=()=>{ back(); setTimeout(()=>go.profile(u.id), 60); };
    body.querySelector('[data-x="map"]').onclick=()=>{ closeAll(); state.scope.mode='crew'; state.scope.members=new Set([u.id]); go.switchView('map'); go.refresh(); };
    const r=body.querySelector('[data-x="remove"]'); if (r) r.onclick=async()=>{ try{ await S.removeMember(u.id); }catch(_){ return toast('You’re offline. Try again in a moment.'); } back(); toast(`${u.name||u.handle} removed`); go.refresh(); after(); };
  });
}

/* ---------- invite link landing (?join=CODE) ---------- */
go.inviteLanding = async (code)=>{
  const crew = await S.findCrewByCode(code);
  openScreen(el=>{
    const members = crew ? crew.members : [];
    const count = crew ? (crew.count ?? members.length) : 0;
    el.innerHTML = topbar({title:'Crew invitation', center:true}) + `<div class="screen-body">
      <div class="invite-card mt24"><span class="tag rust" style="position:absolute;top:-10px;left:50%;transform:translateX(-50%)">${esc(APP.name)}</span>
        <div style="width:64px;height:64px;border-radius:50%;background:var(--gold-fixed);margin:6px auto 0;display:flex;align-items:center;justify-content:center">${icon('restaurant','',true)}</div>
        <span class="hand mt8" style="display:block">Special table invitation</span>
        <h2 class="h-lg">You're invited to ${esc(crew?crew.name:'a food crew')}</h2>
        ${crew&&crew.tagline?`<p class="muted mt8">${esc(crew.tagline)}</p>`:''}
        <div class="card-peach mt16" style="text-align:left">
          <div class="row between"><span class="eyebrow">${icon('groups')} Member roster</span><span class="tag green">${crew?count:'?'} of ${APP.crewMax} members</span></div>
          ${crew?`<div class="roster mt12">${members.slice(0,6).map(u=>`<div class="rs">${avatarHTML(u,30)}<div style="min-width:0"><b>${esc(u.id===S.me().id?'You':u.name||u.handle)}</b><small>@${esc(u.handle)}</small></div></div>`).join('')}</div>`:`<p class="mono mt12" style="font-size:13px">Code <b>${esc(code)}</b></p>`}
        </div>
      </div>
      ${!crew&&!S.cloud?`<div class="note mt16">${icon('science')}<span><b>Preview mode:</b> joining a crew made on someone else's phone needs accounts, which aren't live yet. Save this code and join once they are.</span></div>`:''}
      ${!crew&&S.cloud?`<div class="alert mt16">${icon('priority_high')}<div><b>That invite doesn't work</b>The code <b class="mono">${esc(code)}</b> isn't a crew. Ask for a fresh link.</div></div>`:''}
      <button class="btn btn-gold btn-block mt24" id="ilJoin" ${crew?'':'disabled'}>${icon('group_add')}Join ${esc(crew?crew.name:'crew')}</button>
      <button class="btn btn-ghost btn-block mt8" data-act="back">Maybe later</button>
    </div>`;
    el.querySelector('#ilJoin').onclick=async()=>{
      const r=await S.joinCrew(code);
      if (r.error==='full') return toast('That crew is full');
      if (r.error==='max') return toast(`You're in ${APP.crewsPerPerson} crews already. Leave one to join this one.`);
      if (r.error==='offline') return toast('You’re offline. Try again in a moment.');
      if (r.error) return toast('That code has expired or is wrong');
      toast(`Welcome to ${r.crew?.name||crew.name}!`); back(); go.refresh();
    };
  });
};
