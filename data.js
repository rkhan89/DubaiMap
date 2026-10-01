// Shared constants and small helpers used by every screen.

/* ---------- categories ---------- */
// meal tags on a visit or a save (filterable on the map)
export const MEALS = [
  { id:'breakfast', label:'Breakfast', icon:'free_breakfast' },
  { id:'lunch',     label:'Lunch',     icon:'lunch_dining' },
  { id:'dinner',    label:'Dinner',    icon:'dinner_dining' },
];
export const mealById = id => MEALS.find(m=>m.id===id) || null;
export const CATEGORIES = [
  {id:'coffee',    label:'Coffee',     color:'#8B5A2B', icon:c=>`<path d="M5 8h11v6.5A3.5 3.5 0 0 1 12.5 18h-4A3.5 3.5 0 0 1 5 14.5V8z" fill="none" stroke="${c}" stroke-width="2"/><path d="M16 9.2c2.4-.3 3.6 1.2 3.6 2.8s-1.2 3-3.6 2.8" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 4.5c-.6.7-.6 1.3 0 2M11 4.5c-.6.7-.6 1.3 0 2" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`},
  {id:'matcha',    label:'Matcha',     color:'#5F8D4E', icon:c=>`<path d="M4 9.5c0 4.5 3.6 8 8 8s8-3.5 8-8" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="9.5" x2="20" y2="9.5" stroke="${c}" stroke-width="2"/><path d="M9 4l.6 4M12 3.5l0 4M15 4l-.6 4" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`},
  {id:'dessert',   label:'Dessert',    color:'#E1699A', icon:c=>`<path d="M7 11h10l-1.4 8.2a1 1 0 0 1-1 .8H9.4a1 1 0 0 1-1-.8L7 11z" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 11c0-2.8 1.8-5 4-5s4 2.2 4 5" fill="none" stroke="${c}" stroke-width="2"/><circle cx="12" cy="4.6" r="1.2" fill="${c}"/>`},
  {id:'burger',    label:'Burger',     color:'#C9622D', icon:c=>`<path d="M5 10.5c0-3 3.1-5.3 7-5.3s7 2.3 7 5.3H5z" fill="none" stroke="${c}" stroke-width="2"/><line x1="4.5" y1="13" x2="19.5" y2="13" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><path d="M5 16.5h14a1.6 1.6 0 0 1-1.6 2.3H6.6A1.6 1.6 0 0 1 5 16.5z" fill="none" stroke="${c}" stroke-width="2"/>`},
  {id:'fastfood',  label:'Fast food',  color:'#D6A72C', icon:c=>`<path d="M7.5 10h9l-1.3 9.4a1 1 0 0 1-1 .8H9.8a1 1 0 0 1-1-.8L7.5 10z" fill="none" stroke="${c}" stroke-width="2"/><line x1="10" y1="4" x2="9.6" y2="10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="3.5" x2="12" y2="10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><line x1="14" y1="4" x2="14.4" y2="10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`},
  {id:'cafeteria', label:'Cafeteria',  color:'#7A8B99', icon:c=>`<rect x="4.5" y="7" width="15" height="10" rx="2" fill="none" stroke="${c}" stroke-width="2"/><line x1="9.5" y1="7" x2="9.5" y2="17" stroke="${c}" stroke-width="1.6"/><line x1="14.5" y1="7" x2="14.5" y2="17" stroke="${c}" stroke-width="1.6"/>`},
  {id:'karak',     label:'Karak',      color:'#B5451B', icon:c=>`<path d="M9 5h6l-.9 11a1.3 1.3 0 0 1-1.3 1.2h-1.6A1.3 1.3 0 0 1 9.9 16L9 5z" fill="none" stroke="${c}" stroke-width="2"/><ellipse cx="12" cy="19" rx="4.5" ry="1.1" fill="none" stroke="${c}" stroke-width="1.6"/>`},
  {id:'pizza',     label:'Pizza',      color:'#D64545', icon:c=>`<path d="M12 4.3 20 19H4L12 4.3z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M5.4 17.3h13.2" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="11" r=".9" fill="${c}"/><circle cx="9.8" cy="14.5" r=".9" fill="${c}"/><circle cx="14.2" cy="14.5" r=".9" fill="${c}"/>`},
  {id:'acai',      label:'Acai',       color:'#8E4FD6', icon:c=>`<path d="M12 4c4 0 7 3.2 7 7.2C19 16 16 20 12 20S5 16 5 11.2C5 7.2 8 4 12 4z" fill="none" stroke="${c}" stroke-width="2"/><path d="M9 9c.6 1 .6 2 0 3M12 8c.6 1.2 .6 2.4 0 3.6M15 9c.6 1 .6 2 0 3" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`},
  {id:'froyo',     label:'Froyo',      color:'#E893B8', icon:c=>`<path d="M8 11c0-3 1.8-5.5 4-5.5s4 2.5 4 5.5" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path d="M7 11h10l-1.6 7.4a1 1 0 0 1-1 .8H9.6a1 1 0 0 1-1-.8L7 11z" fill="none" stroke="${c}" stroke-width="2"/><circle cx="12" cy="5" r="1" fill="${c}"/>`}
];
export const catById = id => CATEGORIES.find(c=>c.id===id);
export function iconSvg(catId, color){
  const cat = catById(catId); if(!cat) return '';
  return `<svg viewBox="0 0 24 24" fill="none">${cat.icon(color||'#fff')}</svg>`;
}

/* ---------- text + dates ---------- */
export function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function todayISO(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
export function fmtDate(iso, opts){
  if (!iso) return '';
  const d=new Date(iso+'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', opts||{day:'numeric', month:'short', year:'numeric'});
}
export function fmtDay(iso){ return fmtDate(iso,{weekday:'long', day:'numeric', month:'long'}); }
export function monthKey(iso){ return (iso||'').slice(0,7); }
export function fmtMonth(key){ const d=new Date(key+'-01T00:00:00'); return isNaN(d)?key:d.toLocaleDateString('en-GB',{month:'long', year:'numeric'}); }
export function ago(ts){
  const s=Math.max(1,(Date.now()-ts)/1000);
  if (s<60) return 'just now';
  if (s<3600) return Math.round(s/60)+'m';
  if (s<86400) return Math.round(s/3600)+'h';
  if (s<86400*7) return Math.round(s/86400)+'d';
  if (s<86400*35) return Math.round(s/86400/7)+'w';
  return new Date(ts).toLocaleDateString('en-GB',{day:'numeric', month:'short'});
}
export function agoLong(ts){
  const a=ago(ts); if (a==='just now') return a;
  const n=parseInt(a,10), u=a.replace(/\d+/,'');
  const w={m:'min',h:'hour',d:'day',w:'week'}[u];
  return w ? `${n} ${w}${n===1?'':'s'} ago` : a;
}
export function fmtRating(r){ r=+r||0; return r%1 ? r.toFixed(1) : String(r); }
export function avg(list){ return list.length ? list.reduce((s,x)=>s+x,0)/list.length : 0; }
export function plural(n, one, many){ return `${n} ${n===1?one:(many||one+'s')}`; }
export function uid(){ return (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2); }
export function hashStr(str){ let h=0; for(let k=0;k<str.length;k++) h=(h*31+str.charCodeAt(k))>>>0; return h; }
export function tilt(id, range){ return ((hashStr(String(id))%1000)/1000-0.5)*(range||6); }
