// Pin colours: whose a pin is, at a glance. Everyone has a colour; you pick yours in Settings
// (yours is coral until you do). Friends who haven't picked get one of the rest, never coral and
// never one somebody in your crews already uses, so every face on the map has its own colour.
import * as S from './store.js';

export const PIN_COLORS = [
  { c:'#F26B5B', n:'Coral' },     { c:'#E5A93C', n:'Mustard' },  { c:'#3F7FD9', n:'Blue' },     { c:'#2FA59A', n:'Teal' },
  { c:'#8E5BD6', n:'Violet' },    { c:'#E1699A', n:'Pink' },     { c:'#5F9E3E', n:'Green' },    { c:'#C9622D', n:'Rust' },
  { c:'#1E6B8F', n:'Ocean' },     { c:'#7B2D5B', n:'Plum' },     { c:'#7A8B99', n:'Slate' },    { c:'#9CC43B', n:'Lime' },
];
export const CORAL = PIN_COLORS[0].c;
const valid = c => PIN_COLORS.some(p=>p.c===c);

let cache = null, cacheKey = '';
// one colour per person, the same in every crew
function assign(){
  const me = S.me(); if (!me) return new Map();
  const people = [...new Set(S.myCrews().flatMap(c=>c.memberIds))];
  const key = people.map(id=>id+':'+(S.user(id)?.pinColor||'')).join('|') + '#' + (me.pinColor||'');
  if (cache && key === cacheKey) return cache;
  const out = new Map(), taken = new Set([CORAL]);
  out.set(me.id, valid(me.pinColor) ? me.pinColor : CORAL);
  people.forEach(id=>{ const c = S.user(id)?.pinColor; if (id!==me.id && valid(c)){ out.set(id, c); taken.add(c); } });
  // the rest, in a stable order (by id), get the first colour nobody has
  people.filter(id=>!out.has(id)).sort().forEach(id=>{
    const free = PIN_COLORS.map(p=>p.c).find(c=>!taken.has(c));
    const c = free || PIN_COLORS[1 + (hash(id) % (PIN_COLORS.length-1))].c;
    out.set(id, c); taken.add(c);
  });
  cache = out; cacheKey = key; return out;
}
const hash = s => { let h=0; for (let k=0;k<s.length;k++) h=(h*31+s.charCodeAt(k))>>>0; return h; };
export function colorOf(userId){ return assign().get(userId) || PIN_COLORS[1 + (hash(String(userId)) % (PIN_COLORS.length-1))].c; }
