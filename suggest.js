// Suggested details for a place (0022_place_suggestions.sql). The gap-fill job (tools/gapfill.py) suggests a missing
// address, phone, website or Instagram from a sourced fact; nothing reaches the shared place until a person who has
// been there taps Confirm (decide_suggestion). This module reads the pending ones and groups them for the place page.
import * as C from './cloud.js';
import { esc } from './data.js';
import { icon } from './ui.js';

// where suggestions come from: the server, or (tests, ?local) something that stands in for it
let source = {
  async list(venueId){
    const c = await C.client(); if (!c) return [];
    const { data, error } = await c.from('place_suggestions').select('id,field,value,source,source_url,confidence')
      .eq('venue_id', venueId).eq('status', 'pending');
    return error ? [] : (data || []);
  },
  decide: (id, ok)=>C.rpc('decide_suggestion', { p_id:id, p_ok:ok }),
};
let stub = false;
export function useSource(s){ source = s; stub = true; }
export const isStub = ()=>stub;
export const listFor = id => source.list(id).catch(()=>[]);
export const decide = (id, ok) => source.decide(id, ok);

const FIELDS = ['address', 'phone', 'website', 'instagram'];
const same = (f, v)=> f === 'phone' ? String(v).replace(/\D/g, '').replace(/^0(?=[1-9])/, '971').replace(/^00/, '')
  : String(v).toLowerCase().replace(/[\s,.-]+/g, ' ').trim();
const host = u => { try{ return new URL(u).hostname.replace(/^www\./, ''); }catch(_){ return ''; } };

// one row per field: the value most sources agree on (then the most confident), with every source that gave it.
// A field the place already has is left out.
export function grouped(rows, venue){
  const out = [];
  for (const f of FIELDS){
    if (venue && venue[f]) continue;
    const groups = new Map();
    rows.filter(r=>r.field === f).forEach(r=>{
      const k = same(f, r.value);
      const g = groups.get(k) || { field:f, value:r.value, ids:[], rows:[], sources:new Set(), site:'', conf:0 };
      g.rows.push(r); g.sources.add(r.source); g.conf = Math.max(g.conf, r.confidence);
      if (r.source === 'web' && r.source_url) g.site = host(r.source_url);
      groups.set(k, g);
    });
    // the copy that gets confirmed: for a phone, the most readable one (with spaces); otherwise the most confident
    groups.forEach(g=>{
      const pick = g.rows.slice().sort((a, b)=>(f === 'phone' ? (/\s/.test(b.value) - /\s/.test(a.value)) : 0) || b.confidence - a.confidence)[0];
      g.value = pick.value; g.ids = [pick.id, ...g.rows.filter(r=>r !== pick).map(r=>r.id)];
    });
    const best = [...groups.values()].sort((a, b)=>b.sources.size - a.sources.size || b.conf - a.conf)[0];
    if (best) out.push(best);
  }
  return out;
}

const LABEL = { address:'Address', phone:'Phone', website:'Website', instagram:'Instagram' };
const ICON  = { address:'location_on', phone:'call', website:'language', instagram:'photo_camera' };
const shown = g => g.field === 'instagram' ? '@' + g.value : g.field === 'website' ? String(g.value).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : g.value;
const fromText = g => {
  const parts = [];
  if (g.sources.has('seed')) parts.push('the Overture Maps listing');
  if (g.sources.has('web')) parts.push(g.site ? 'their website (' + g.site + ')' : 'their website');
  return 'From ' + parts.join(' and ');
};

export function suggestionsHTML(groups){
  if (!groups || !groups.length) return '';
  return `<section class="sugg mt16" aria-labelledby="suggHead">
    <div class="sugg-head"><b class="h-sm" id="suggHead">Suggested details</b>
      <span class="muted small">From public listings and the place’s own website. Check before you confirm: your crew will see it.</span></div>
    ${groups.map(g=>`<div class="sugg-row" data-sg="${g.field}">
      <span class="sugg-ico">${icon(ICON[g.field])}</span>
      <span class="sugg-main"><span class="sugg-k">${LABEL[g.field]}</span><span class="sugg-v">${esc(shown(g))}</span><span class="sugg-src">${esc(fromText(g))}</span></span>
      <span class="sugg-act"><button class="btn btn-soft btn-sm" data-sg-ok="${g.field}">Confirm</button><button class="btn btn-ghost btn-sm" data-sg-no="${g.field}">Not right</button></span>
    </div>`).join('')}
  </section>`;
}
