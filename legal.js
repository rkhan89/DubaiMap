// Terms, privacy and data pages. One source: the web pages /terms.html, /privacy.html, /data.html.
// The app shows the same text in a screen (go.legal); the web pages fill in the owner and contact
// from config.js too. Owner and contact go in APP.legal (config.js).
import { APP } from './config.js';

export const LEGAL_PAGES = { terms:'Terms of use', privacy:'Privacy policy', data:'How Koko uses your data' };

// fill [data-fill] spans from config; anything not set yet is highlighted so it can't ship unnoticed
export function fillLegal(root){
  // label each table cell with its column, so the table can stack on phones
  root.querySelectorAll('table').forEach(t=>{ const hs=[...t.querySelectorAll('thead th')].map(th=>th.textContent); t.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>{ if (hs[i]) td.dataset.label=hs[i]; })); });
  const L = APP.legal || {};
  const values = { owner: L.owner, contact: L.contact, city: L.city, law: L.law, effective: L.effective, app: APP.name, site: APP.siteUrl || location.origin };
  root.querySelectorAll('[data-fill]').forEach(el=>{
    const v = values[el.dataset.fill];
    if (v){
      if (el.dataset.fill==='contact'){ el.textContent = ''; const a = document.createElement('a'); a.href = 'mailto:'+v; a.textContent = v; el.appendChild(a); }
      else el.textContent = v;
    } else { el.textContent = '['+el.dataset.fill+' to be added]'; el.classList.add('fill-missing'); }
  });
}
// on the web pages themselves
if (document.body && document.body.classList.contains('legal-page')) fillLegal(document);
