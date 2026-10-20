// A shared page (/p/<token>): one scrapbook page or monthly spread, read-only, for anyone with the link, no sign-in.
// What it shows comes from public.shared_page (the place or crew, the date, first names and pixel avatars) and the
// page's picture from the private shared-pages bucket; both are checked against the link every time (live, not
// expired, not turned off, and the page still shareable), so a turned-off link shows nothing.
import { SUPABASE } from './config.js';
import { esc, fmtDate, fmtMonth } from './data.js';
import { avatarHTML } from './avatar.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const body = document.getElementById('ppBody');
const gone = (why)=>{ body.innerHTML = `<div class="pp-gone"><h1 class="h-md">This page isn’t available</h1><p class="muted mt8">${esc(why)}</p><a class="btn btn-gold mt24" href="/">Open Koko</a></div>`; };
const token = (location.pathname.match(/^\/p\/([A-Za-z0-9_-]{24,64})$/) || [])[1];

(async ()=>{
  if (!token) return gone('The link looks incomplete. Ask whoever sent it for a fresh one.');
  try{
    const { createClient } = await import(SDK);
    const sb = createClient(SUPABASE.url, SUPABASE.key, { auth:{ persistSession:false, autoRefreshToken:false } });
    const { data:info, error } = await sb.rpc('shared_page', { p_token:token });
    if (error) throw error;
    if (!info) return gone('The link has expired or been turned off.');
    let src = '';
    if (info.image){ const { data:blob } = await sb.storage.from('shared-pages').download(info.image); if (blob) src = URL.createObjectURL(blob); }
    const when = info.type==='spread' ? fmtMonth(info.month) : fmtDate(info.date, { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    document.title = `${info.title} • Koko`;
    body.innerHTML = `<h1 class="pp-title">${esc(info.title || 'A page')}</h1><p class="pp-when">${esc(when || '')}${info.type==='spread' ? ' • crew drop' : ''}</p>
      ${src ? `<img class="pp-img" src="${src}" alt="${esc(info.title || 'The scrapbook page')}">` : ''}
      ${(info.people||[]).length ? `<div class="pp-people">${info.people.map(p=>`<span class="pp-person">${avatarHTML({ avatar:p.avatar||{}, name:p.name }, 36)}<b>${esc(p.name)}</b></span>`).join('')}</div>` : ''}
      <p class="pp-exp muted small">This link works until ${esc(fmtDate(String(info.expires).slice(0,10), { day:'numeric', month:'long' }))}.</p>`;
  }catch(e){ console.warn(e); gone('Something went wrong opening it. Try again in a moment.'); }
})();
