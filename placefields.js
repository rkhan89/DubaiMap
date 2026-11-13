// Place details: tidying what Overture (or the web) says about a place into the fields Koko stores, and the
// checks every saved value goes through. Shared by tools/overture-prep.mjs, the server routes and the app.

// Instagram handles: 1-30 letters, digits, dots and underscores, no leading/trailing or doubled dot
export const IG_RE = /^(?!.*\.\.)(?!\.)[A-Za-z0-9._]{1,30}(?<!\.)$/;
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'about', 'developer', 'legal', 'direct', 'web']);
// a handle from "@name", "name" or an instagram.com URL (null when it isn't one)
export function instagramFrom(v){
  if (!v) return null;
  let s = String(v).trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/([^/?#]+)/i);
  if (m) s = m[1]; else if (/[/:]/.test(s)) return null;
  s = s.replace(/^@/, '');
  if (!IG_RE.test(s) || IG_RESERVED.has(s.toLowerCase())) return null;
  return s.toLowerCase();
}
export const validInstagram = h => h == null || h === '' || (IG_RE.test(h) && !IG_RESERVED.has(String(h).toLowerCase()));

// the place's own website: http(s), not a social network or a maps link, without tracking parameters
const NOT_A_SITE = /(^|\.)(facebook|instagram|instagr|tiktok|twitter|x|snapchat|youtube|linkedin|google|goo|wa|whatsapp|linktr)\.(com|am|gl|me|ee)$/i;
export function cleanWebsite(v){
  if (!v) return null;
  let u; try{ u = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v); }catch(_){ return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || NOT_A_SITE.test(u.hostname.replace(/^www\./, ''))) return null;
  [...u.searchParams.keys()].forEach(k=>{ if (/^(utm_|fbclid|gclid|y_source)/i.test(k)) u.searchParams.delete(k); });
  u.hash = '';
  const s = u.toString().replace(/\/$/, '');
  return s.length <= 300 ? s : null;
}
export const validUrl = v => { try{ const u = new URL(v); return /^https?:$/.test(u.protocol) && String(v).length <= 300; }catch(_){ return false; } };

// one phone number, international format (UAE numbers written locally get +971)
export function cleanPhone(v){
  if (!v) return null;
  let s = String(v).replace(/[^\d+]/g, '');
  if (/^00/.test(s)) s = '+' + s.slice(2);
  if (/^0\d{8,9}$/.test(s)) s = '+971' + s.slice(1);
  if (/^971\d{8,9}$/.test(s)) s = '+' + s;
  return /^\+\d{7,15}$/.test(s) ? s : null;
}
export const validPhone = v => v == null || v === '' || /^\+?[\d ()-]{7,20}$/.test(String(v));

// Overture's address list → one line ("Crescent Rd, Palm Jumeirah, Dubai"); Arabic city names become English
const CITY = { 'دبي':'Dubai', 'دبى':'Dubai', 'dubai':'Dubai', 'الشارقة':'Sharjah', 'sharjah':'Sharjah' };
export function addressLine(list){
  const a = (list || [])[0]; if (!a) return null;
  const free = String(a.freeform || '').replace(/\s+/g, ' ').trim();
  const loc = a.locality ? (CITY[String(a.locality).trim().toLowerCase()] || CITY[String(a.locality).trim()] || String(a.locality).trim()) : '';
  const parts = [free];
  if (loc && !free.toLowerCase().includes(loc.toLowerCase())) parts.push(loc);
  const s = parts.filter(Boolean).join(', ').slice(0, 200);
  return s || null;
}

// The fields a place keeps, and where each value came from. 'user' values are never overwritten by later
// enrichment (the database enforces it too: supabase/migrations/0020_places_record.sql).
export const PLACE_FIELDS = ['name', 'address', 'coords', 'zone', 'phone', 'website', 'instagram', 'other_socials', 'categories'];
export const SOURCES = ['seed', 'web', 'user', 'legacy_google'];
