// The share sheet: one sheet for a page, a spread or a book. Every output is exactly what's on the page, stickers
// included, with people by first name only.
//   Story card (9:16) and Postcard (one photo) go through the phone's share sheet (or save, on a computer).
//   Page link: a read-only web page of this page or spread for anyone with the link, no sign-in, for 30 days unless
//   renewed; it can be turned off. Only you can share your Just me pages; a crew page can be shared by anyone in a
//   crew it's shared with (the server checks both, every time the link is opened).
//   The page-flip video is phase 4.
import * as S from './store.js';
import * as C from './cloud.js';
import { APP } from './config.js';
import { esc, plural } from './data.js';
import { icon, openSheet, toast, copy } from './ui.js';
import { storyCard, postcard, pageImage, shareImage } from './export.js';

const token = ()=>{ const a = new Uint8Array(24); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
const linkURL = t => `${location.origin}/p/${t}`;
const daysLeft = iso => Math.max(0, Math.ceil((Date.parse(iso) - Date.now())/864e5));

// target: { book, pg, n } for a visit's page, { book, spread, side } for a spread, or { book } for the book itself
export function shareSheet(target){
  const me = S.me(), e = target.pg && target.pg.entry, sp = target.spread;
  const what = sp ? 'spread' : e ? 'page' : 'book';
  // who may share: your own page always; a crew page if you're in a crew it's shared with; a spread if it's your crew's
  const crewIds = S.myCrews().map(c=>c.id);
  const mayLink = sp ? crewIds.includes(sp.crewId) : e ? (e.userId===me.id || (!e.private && (e.crewIds||[]).some(id=>crewIds.includes(id)))) : false;
  const crewPage = sp || (e && !e.private && target.book.kind==='crew');
  const photos = e ? target.pg.photos : [];
  let links = null, busy = false;
  openSheet(body=>{
    const paint = ()=>{
      const live = (links||[]).find(l=>!l.revoked_at && Date.parse(l.expires_at) > Date.now());
      body.innerHTML = `<div class="sheet-head"><div class="grow"><h2 class="h-md">Share this ${what}</h2><span class="hand">${what==='book' ? esc(target.book.title||'') : 'Exactly as it looks, stickers and all'}</span></div></div>
        <div class="share-opts">
          <button class="share-opt" data-out="story">${icon('smartphone')}<b>Story card</b><span>9:16 picture</span></button>
          ${photos.length ? `<button class="share-opt" data-out="postcard">${icon('photo_frame')}<b>Postcard</b><span>One photo, framed</span></button>` : ''}
        </div>
        ${photos.length > 1 ? `<div class="share-photos mt8" role="group" aria-label="Photo for the postcard">${photos.slice(0,10).map((p,i)=>`<button class="share-ph${i?'':' on'}" data-ph="${esc(p.id)}" aria-pressed="${!i}"><img src="${esc(S.photoURL(p))}" alt="${esc(p.caption||'Photo '+(i+1))}"></button>`).join('')}</div>` : ''}
        ${what !== 'book' ? `<div class="eyebrow mt24">Page link</div>
          ${!mayLink ? `<p class="muted small mt8">Only the person who logged this visit can make a link to it.</p>`
          : !S.cloud ? `<p class="muted small mt8">Page links need an account: they're off on this preview copy.</p>`
          : links === null ? `<p class="muted small mt8">Checking for a link…</p>`
          : live ? `<div class="link-box mt8">${icon('link')}<span class="mono">${esc(linkURL(live.token).replace(/^https?:\/\//,''))}</span><button class="btn btn-gold btn-sm" id="shCopy">Copy</button></div>
              <div class="row between mt8"><span class="muted small">Anyone with the link can see this ${what}. ${plural(daysLeft(live.expires_at), 'day')} left.</span></div>
              <div class="btn-grid mt8"><button class="btn btn-soft btn-sm" id="shRenew">${icon('update')}Renew 30 days</button><button class="btn btn-ghost btn-sm" id="shOff" style="color:var(--red)">${icon('link_off')}Turn off link</button></div>`
          : `<p class="muted small mt8">A read-only page for anyone with the link, no sign-in, first names only. It lasts 30 days unless you renew it, and you can turn it off.</p>
              <button class="btn btn-soft btn-block mt8" id="shMake">${icon('add_link')}Make a page link</button>`}` : ''}
        <p class="row mono muted mt24" style="font-size:12px;gap:var(--sp-2);justify-content:center">${icon('verified_user')}${crewPage ? 'Includes everyone’s stickers on it • ' : ''}Just me visits are never shared</p>`;
      body.querySelectorAll('[data-ph]').forEach(b=>b.onclick=()=>{ body.querySelectorAll('[data-ph]').forEach(x=>{ x.classList.toggle('on', x===b); x.setAttribute('aria-pressed', x===b); }); });
      body.querySelectorAll('[data-out]').forEach(b=>b.onclick=()=>out(b.dataset.out, b));
      const cp = body.querySelector('#shCopy'); if (cp) cp.onclick = ()=>copy(linkURL(live.token), 'Link copied');
      const rn = body.querySelector('#shRenew'); if (rn) rn.onclick = ()=>act(async ()=>{ await C.renewShareLink(live.id); toast('Renewed for 30 days'); });
      const off = body.querySelector('#shOff'); if (off) off.onclick = ()=>act(async ()=>{ await C.revokeShareLink(live); toast('Link turned off'); });
      const mk = body.querySelector('#shMake'); if (mk) mk.onclick = ()=>act(async ()=>{
        mk.disabled = true; mk.innerHTML = `${icon('hourglass_top')}Making the page…`;
        const blob = await pageImage(target);
        const l = await C.makeShareLink({ token:token(), ownerId:me.id, targetType:sp ? 'spread' : 'page', targetId:sp ? sp.id : e.id, blob });
        copy(linkURL(l.token), 'Link made and copied');
      });
    };
    const load = async ()=>{ if (!mayLink || !S.cloud || what==='book'){ links = []; return; } try{ links = await C.shareLinksFor(sp ? 'spread' : 'page', sp ? sp.id : e.id); }catch(_){ links = []; } };
    const act = async fn=>{ if (busy) return; busy = true; try{ await fn(); await load(); }catch(err){ toast(/offline|fetch/i.test(String(err && err.message)) ? 'You’re offline: try again when you’re back' : 'That didn’t work: try again'); console.warn(err); } busy = false; if (body.isConnected) paint(); };
    const out = async (kind, btn)=>{
      if (busy) return; busy = true; btn.classList.add('busy');
      try{
        const name = (sp ? `${APP.name}-${sp.month}` : (S.venue(e?.venueId)?.name || target.book.title || APP.name)).replace(/[^\w-]+/g,'-').slice(0, 40);
        if (kind === 'story'){ const blob = await storyCard(target); await shareImage(blob, name + '-story.png', APP.name); }
        if (kind === 'postcard'){ const id = body.querySelector('[data-ph].on')?.dataset.ph || photos[0].id; const blob = await postcard(target, S.photo(id)); await shareImage(blob, name + '-postcard.png', APP.name); }
      }catch(err){ console.warn(err); toast('Couldn’t make the picture: try again'); }
      busy = false; btn.classList.remove('busy');
    };
    paint(); load().then(()=>{ if (body.isConnected) paint(); });
  });
}
