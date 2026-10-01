// Profile (yours or a crew friend's) and Settings. Phase 2, own design: there are no
// Stitch frames for these, so they're built from the existing components.
import { APP } from './config.js';
import * as S from './store.js';
import * as MAP from './map.js';
import { userStats, levelFor, leaderboard, thisMonth, POINTS } from './stats.js';
import { badgeStatus, stickerHTML } from './badges.js';
import { goalProgress } from './social.js';
import { CATEGORIES, catById, iconSvg, esc, plural, fmtDate, fmtMonth, fmtRating } from './data.js';
import { avatarHTML } from './avatar.js';
import { icon, openScreen, openSheet, topbar, toast, back, seg, bindSeg, toggleHTML, bindToggle, ratingPill } from './ui.js';
import { LEGAL_PAGES, fillLegal } from './legal.js';
import { themePref, setThemePref } from './theme.js';
import { prefs, setPref } from './prefs.js';
import { go } from './go.js';

/* =========================================================
   PROFILE
   ========================================================= */
function profileScreen(userId){
  const me = S.me(); if (!me) return;
  userId = userId || me.id;
  const mine = userId === me.id;
  openScreen(el=>{
    const paint = ()=>{
      const u = S.user(userId); if (!u) return;
      const crew = S.myCrew(), all = userStats(userId), month = userStats(userId, thisMonth());
      const lvl = levelFor(all.points);
      const badges = badgeStatus(userId).sort((a,b)=>(b.done-a.done) || (b.have/b.need - a.have/a.need));
      const got = badges.filter(b=>b.done).length;
      const board = crew ? leaderboard(thisMonth()) : [];
      const rank = board.findIndex(r=>r.u.id===userId)+1;
      const topCats = [...all.cats].sort((a,b)=>b[1]-a[1]).slice(0,4), maxCat = topCats[0]?.[1] || 1;
      const areaCounts = {}; all.visitList.forEach(e=>{ const v=S.venue(e.venueId); if (v) areaCounts[v.zone]=(areaCounts[v.zone]||0)+1; });
      const favArea = Object.entries(areaCounts).sort((a,b)=>b[1]-a[1])[0];
      const recent = all.visitList.slice().reverse().slice(0,5);
      const goals = mine ? goalProgress() : [];
      el.innerHTML = topbar({title: mine ? 'Your profile' : (u.name||u.handle), eyebrow: mine ? 'Scrapbook passport' : 'Crew friend', profile:false,
        actions: mine ? `<button class="icon-btn" id="prSettings" aria-label="Settings">${icon('settings')}</button>` : ''}) + `<div class="screen-body">
        <div class="passport mt16 profile-hero"><span class="tape"></span>
          <div class="row" style="gap:16px;align-items:center">${avatarHTML(u, 84)}
            <div class="grow" style="min-width:0"><h1 class="h-lg trunc">${esc(u.name||'@'+u.handle)}</h1>
              <div class="mono muted small">@${esc(u.handle)}${crew && crew.memberIds.includes(userId) ? ` • ${esc(crew.name)}` : ''}</div>
              ${u.tagline ? `<div class="hand mt4">${esc(u.tagline)}</div>` : ''}</div>
            ${mine ? `<button class="icon-btn" id="prEdit" aria-label="Edit profile">${icon('edit')}</button>` : ''}
          </div>
          <div class="level mt16"><div class="row between"><span class="tag">${icon('military_tech')}Level ${lvl.n} · ${esc(lvl.name)}</span><span class="mono small"><b>${all.points}</b> pts</span></div>
            <div class="cap-bar mt8"><i style="width:${Math.round(lvl.progress*100)}%"></i></div>
            <div class="mono muted small mt4">${lvl.to ? `${lvl.to-all.points} pts to level ${lvl.n+1}` : 'Top level reached'}</div></div>
        </div>
        <div class="stat-grid mt16">
          <div class="stat"><b>${all.places}</b><span>places</span></div>
          <div class="stat"><b>${all.visits}</b><span>visits</span></div>
          <div class="stat"><b>${all.areaCount}<small>/${MAP.ZONES.length}</small></b><span>areas</span></div>
          <div class="stat"><b>${all.photos}</b><span>photos</span></div>
        </div>
        <button class="card mt16 block-btn" id="prStickers"><div class="row between"><span class="h-sm">Stickers</span><span class="mono muted small">${got} of ${badges.length} ${icon('chevron_right')}</span></div>
          <div class="sticker-strip mt12">${badges.slice(0,6).map(b=>stickerHTML(b, 52)).join('')}</div></button>
        ${crew && rank ? `<button class="card mt12 block-btn row" id="prBoard"><span class="rank-badge">#${rank}</span><span class="grow"><b>${rank===1?'Top of':'Number '+rank+' in'} ${esc(crew.name)}</b><span class="muted small" style="display:block">${month.points} pts this month • ${plural(month.newPlaces,'new place')}</span></span>${icon('leaderboard')}</button>` : ''}
        ${mine ? `<button class="card mt12 block-btn" id="prGoals"><div class="row between"><span class="h-sm">${fmtMonth(thisMonth())} goals</span><span class="mono muted small">${goals.filter(g=>g.done).length} of ${goals.length} done ${icon('chevron_right')}</span></div>
          <div class="goal-mini mt12">${goals.map(g=>`<div class="gm${g.done?' done':''}"><span class="ring" style="--p:${Math.round(g.pct*100)}"><span>${g.done?icon('check'):Math.round(g.pct*100)+'%'}</span></span><small>${esc(g.short)}</small></div>`).join('')}</div></button>
        <button class="card mt12 block-btn row" id="prRecap">${icon('auto_awesome')}<span class="grow"><b>Your ${fmtMonth(thisMonth()).split(' ')[0]} recap</b><span class="muted small" style="display:block">A card of your month in bites, ready to share</span></span>${icon('chevron_right')}</button>` : ''}
        ${topCats.length ? `<div class="card mt12"><span class="h-sm">Favourite kinds</span>
          <div class="cat-bars mt12">${topCats.map(([c,n])=>{ const k=catById(c); return `<div class="cb"><span class="cb-ico">${iconSvg(c, k.color)}</span><span class="cb-name">${esc(k.label)}</span><span class="cb-bar"><i style="width:${Math.round(n/maxCat*100)}%;background:${k.color}"></i></span><b>${n}</b></div>`; }).join('')}</div>
          ${favArea ? `<p class="muted small mt12">${icon('location_on')} Most at home in <b>${esc(MAP.zoneById(favArea[0])?.label||'')}</b> (${plural(favArea[1],'visit')})</p>` : ''}</div>` : ''}
        ${recent.length ? `<div class="row between mt24"><span class="h-md">Recent stamps</span></div>
          <div class="stack mt12">${recent.map(e=>{ const v=S.venue(e.venueId), z=v&&MAP.zoneById(v.zone); return v ? `<button class="person-row" data-venue="${v.id}"><span class="pr-main"><span class="pr-name trunc">${esc(v.name)}</span><span class="pr-sub">${esc(z?z.label:'')} • ${fmtDate(e.date)}${e.private?' • only you':''}</span></span>${e.rating?ratingPill(e.rating):''}</button>` : ''; }).join('')}</div>`
          : `<div class="empty">${icon('restaurant')}<p class="muted">${mine?'Log your first place with the + button and it shows up here.':'Nothing shared yet.'}</p></div>`}
        <p class="center muted small mt20">${mine ? 'Points: new place 10, repeat visit 4, first in the crew +5, each photo +2, check-in +3.' : 'Only what they share with the crew is counted here.'}</p>
      </div>`;
      const on = (id, fn)=>{ const b=el.querySelector('#'+id); if (b) b.onclick=fn; };
      on('prSettings', ()=>settingsScreen());
      on('prEdit', ()=>go.editHandle());
      on('prStickers', ()=>go.stickers(userId));
      on('prBoard', ()=>go.leaderboard());
      on('prGoals', ()=>go.goals());
      on('prRecap', ()=>go.recap());
      el.querySelectorAll('[data-venue]').forEach(r=>r.onclick=()=>go.place(r.dataset.venue));
    };
    paint();
    el._repaint = paint;
  });
}
go.profile = profileScreen;

/* =========================================================
   SETTINGS
   ========================================================= */
function settingsScreen(){
  const me = S.me(); if (!me) return;
  openScreen(el=>{
    const paint = ()=>{
      const crew = S.myCrew(), p = prefs();
      const row = (ic, name, sub, right, attrs)=>`<div class="person-row"${attrs||''}>${icon(ic)}<span class="pr-main"><span class="pr-name">${name}</span>${sub?`<span class="pr-sub">${sub}</span>`:''}</span>${right||''}</div>`;
      const link = (ic, name, sub, key)=>`<button class="person-row" data-go="${key}">${icon(ic)}<span class="pr-main"><span class="pr-name">${name}</span>${sub?`<span class="pr-sub">${sub}</span>`:''}</span>${icon('chevron_right')}</button>`;
      el.innerHTML = topbar({title:'Settings', eyebrow:'Your scrapbook', profile:false}) + `<div class="screen-body">
        ${!S.cloud?`<div class="note mt16">${icon('science')}<span><b>Preview mode.</b> Your account, crew and photos live on this phone until sign-in goes live. Export a backup to move them.</span></div>`:''}
        ${supportCardHTML()}
        <div class="eyebrow mt24">Account</div><div class="stack mt8">
          ${link('face','Edit avatar','Pixel you on the map','avatar')}
          ${link('alternate_email','Name & handle','@'+esc(me.handle),'handle')}
          ${row('mail','Email', esc(me.email||'Not set'))}
        </div>
        <div class="eyebrow mt24">Appearance</div><div class="stack mt8">
          <div class="person-row" style="flex-wrap:wrap">${icon('contrast')}<span class="pr-main"><span class="pr-name">Theme</span><span class="pr-sub">Auto follows your phone</span></span>${seg('theme', [['light','Light'],['dark','Dark'],['auto','Auto']], themePref())}</div>
        </div>
        <div class="eyebrow mt24">Map</div><div class="stack mt8">
          ${row('my_location','Show me on the map','Only on this phone, never saved', toggleHTML('sLoc', MAP.isTracking(),'Show my location'))}
          ${row('format_color_fill','Colour explored areas','Areas you (or your crew) have eaten in glow gold', toggleHTML('sZones', p.zones,'Colour explored areas'))}
          ${row('directions_car','Cars on the roads','Little traffic for life and colour', toggleHTML('sCars', p.cars,'Cars on the roads'))}
          ${row('celebration','Burj Khalifa light shows','7 to 11 pm, every 15 minutes', toggleHTML('sShows', p.shows,'Burj Khalifa light shows'))}
        </div>
        <div class="eyebrow mt24">Privacy</div><div class="stack mt8">
          ${row('share','Who sees your places','You choose every time you save: just you, or any of your crews. Change a place later from its page.', '')}
        </div>
        <div class="eyebrow mt24">Notifications</div><div class="stack mt8">
          ${row('notifications_active','Reminders on this phone', 'Crew bites you’re going to, and a heads-up before light shows. Needs the app open or installed.', toggleHTML('sNotify', p.notify && ('Notification' in window) && Notification.permission==='granted','Reminders'))}
        </div>
        <div class="eyebrow mt24">Crew</div><div class="stack mt8">
          ${link('groups', crew?esc(crew.name):'Your crew', crew?plural(crew.memberIds.length,'member'):'Start or join a crew', 'crew')}
          ${APP.sampleCrew?row('diversity_3','Preview with a sample crew','Adds Maya, Omar, Layla, Kabir & Noor with real-looking logs and photos, on this phone only', toggleHTML('sDemo', S.demoOn(),'Sample crew')):''}
        </div>
        <div class="eyebrow mt24">Your data</div><div class="stack mt8">
          ${link('download','Export backup','Your logs and photos as one file','export')}
          <label class="person-row" style="position:relative">${icon('upload')}<span class="pr-main"><span class="pr-name">Import backup</span></span>${icon('chevron_right')}<input type="file" accept="application/json,.json" id="sImport" style="position:absolute;inset:0;opacity:0"></label>
          ${S.legacyPlaces().length?link('install_mobile','Import from this phone', plural(S.legacyPlaces().length,'place')+' from the old version','import'):''}
          ${link('tour','Replay the guide','How to pin a place and use the map','tour')}
        </div>
        <div class="eyebrow mt24">About</div><div class="stack mt8">
          ${link('gavel','Terms of use','The rules for using '+esc(APP.name),'legal-terms')}
          ${link('shield','Privacy policy','What we collect and why','legal-privacy')}
          ${link('table_view','How we use your data','Everything we keep, in one table','legal-data')}
        </div>
        <button class="btn btn-danger btn-block mt24" id="sOut">${icon('logout')}Sign out</button>
        <button class="btn btn-ghost btn-block mt8" id="sDelete" style="color:var(--red)">${icon('delete_forever')}Delete my account</button>
        <p class="center mono muted small mt16">${esc(APP.name)} • preview build</p>
      </div>`;
      bindSeg(el, 'theme', v=>setThemePref(v));
      bindToggle(el.querySelector('#sLoc'), on=>{ on?MAP.startTracking(true):MAP.stopTracking(); });
      bindToggle(el.querySelector('#sZones'), on=>{ setPref('zones', on); go.refresh(); });
      bindToggle(el.querySelector('#sCars'), on=>{ setPref('cars', on); MAP.setCars(on); });
      bindToggle(el.querySelector('#sShows'), on=>{ setPref('shows', on); go.tickShow && go.tickShow(); });
      bindToggle(el.querySelector('#sNotify'), async on=>{ const ok = await go.setNotify(on); if (on && !ok) paint(); });
      const d = el.querySelector('#sDemo'); if (d) bindToggle(d, async on=>{ await S.setDemo(on); toast(on?'Sample crew added':'Sample crew removed'); go.refresh(); paint(); });
      el.querySelector('#sImport').addEventListener('change', async e=>{
        const f = e.target.files[0]; if (!f) return;
        try{ const n = await S.importBackup(JSON.parse(await f.text())); toast(`Imported ${plural(n,'log')}`); go.refresh(); }catch(_){ toast("That file isn't a backup from this app"); }
      });
      el.querySelectorAll('[data-go]').forEach(b=>b.onclick=async()=>{
        const k = b.dataset.go;
        if (k==='avatar') go.editAvatar();
        if (k==='handle') go.editHandle();
        if (k==='crew') go.crew();
        if (k==='import') go.importPhone();
        if (k.startsWith('legal-')) go.legal(k.slice(6));
        if (k==='tour'){ go.closeAll(); go.switchView('map'); setTimeout(()=>go.startTour(), 300); }
        if (k==='export'){
          toast('Preparing backup…');
          const data = await S.exportBackup(), blob = new Blob([JSON.stringify(data)], {type:'application/json'});
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${APP.name.replace(/\W+/g,'-').toLowerCase()}-backup.json`;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
        }
      });
      bindSupport(el);
      el.querySelector('#sDelete').onclick = ()=>deleteAccountSheet();
      el.querySelector('#sOut').onclick = async ()=>{ await S.signOut(); go.closeAll(); setTimeout(()=>{ go.refresh(); go.onboarding(); }, 300); };
    };
    paint();
  });
}
go.settings = settingsScreen;

/* ---------- support Koko (only shown once a Stripe or PayPal link is set in config.js) ---------- */
function supportCardHTML(){
  const s = APP.support || {}; if (!s.stripe && !s.paypal) return '';
  return `<div class="support-card mt16"><div class="row" style="gap:12px;align-items:flex-start"><span class="support-cup">${icon('local_cafe','',true)}</span>
    <div class="grow"><b class="h-sm">${esc(APP.name)} is free. Buy me a karak?</b><p class="muted small mt4">No ads, and your data's never for sale. If ${esc(APP.name)}'s found you a good spot, chip in for the next one.</p></div></div>
    <div class="btn-grid mt12">${s.stripe?`<a class="btn btn-gold" href="${esc(s.stripe)}" target="_blank" rel="noopener" data-support="stripe">${icon('credit_card')}Card or Apple Pay</a>`:''}${s.paypal?`<a class="btn btn-soft" href="${esc(s.paypal)}" target="_blank" rel="noopener" data-support="paypal">${icon('account_balance_wallet')}PayPal</a>`:''}</div>
    <p class="muted small mt8">A gift, not a purchase: it doesn't unlock anything. Payments are handled by Stripe or PayPal.</p></div>`;
}
function bindSupport(el){ el.querySelectorAll('[data-support]').forEach(a=>a.addEventListener('click', ()=>toast('Thank you! That keeps the karak flowing.'))); }
go.supportCardHTML = supportCardHTML;

/* ---------- terms, privacy, your data: the same text as the web pages ---------- */
function legalScreen(name){
  const title = LEGAL_PAGES[name]; if (!title) return;
  openScreen(el=>{
    el.innerHTML = topbar({ title, eyebrow:'About '+APP.name, profile:false }) + `<div class="screen-body"><div class="legal" id="lgBody"><p class="muted">Loading…</p></div>
      <p class="mt24 small"><a href="/${name}" target="_blank" rel="noopener">Open this page in your browser</a></p></div>`;
    (async ()=>{
      try{
        const html = await (await fetch('/'+name+'.html')).text();
        const main = new DOMParser().parseFromString(html, 'text/html').querySelector('main');
        const body = el.querySelector('#lgBody'); body.innerHTML = main.innerHTML; fillLegal(body);
        body.querySelectorAll('a[href^="/"]').forEach(a=>{ const n=a.getAttribute('href').slice(1); if (LEGAL_PAGES[n]) a.onclick=e=>{ e.preventDefault(); legalScreen(n); }; });
      }catch(_){ el.querySelector('#lgBody').innerHTML = `<p>Couldn't load this page. You can read it at <a href="/${name}" target="_blank" rel="noopener">${esc(location.origin)}/${name}</a>.</p>`; }
    })();
  });
}
go.legal = legalScreen;

/* ---------- delete my account ---------- */
function deleteAccountSheet(){
  openSheet(body=>{
    body.innerHTML = `<h2 class="h-md">Delete your account?</h2>
      <p class="muted mt8">This removes your profile, every place you've logged or saved, your photos and your plans, from ${esc(APP.name)} and from this phone. It can't be undone.</p>
      <ul class="muted small mt8" style="padding-left:18px;display:flex;flex-direction:column;gap:4px">
        <li>Crews you own pass to the next member. Places friends have logged stay on their maps.</li>
        <li>Want a copy first? Settings → Export backup.</li>
      </ul>
      <label class="eyebrow mt16" for="dlIn" style="display:block">Type DELETE to confirm</label>
      <input class="input mt8" id="dlIn" autocomplete="off" autocapitalize="characters" placeholder="DELETE">
      <div class="btn-grid mt16"><button class="btn btn-soft" id="dlNo">Keep my account</button><button class="btn btn-danger" id="dlYes" disabled>Delete everything</button></div>`;
    const inp = body.querySelector('#dlIn'), yes = body.querySelector('#dlYes');
    inp.oninput = ()=>{ yes.disabled = inp.value.trim().toUpperCase()!=='DELETE'; };
    body.querySelector('#dlNo').onclick = ()=>back();
    yes.onclick = async ()=>{
      yes.disabled = true; yes.textContent = 'Deleting…';
      try{ await S.deleteAccount(); }
      catch(_){ yes.disabled = false; yes.textContent = 'Delete everything'; return toast('Couldn’t delete it just now. Check your connection and try again.'); }
      go.closeAll(); toast('Your account and everything in it has been deleted.'); setTimeout(()=>{ go.refresh(); go.onboarding(); }, 300);
    };
  });
}

