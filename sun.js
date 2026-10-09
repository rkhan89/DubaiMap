// Sunrise and sunset for the city (NOAA's sunrise equation; within a minute or two, which is plenty for
// switching day and night). Pure: no DOM, so the tests and the theme both use it.
export const CITY_SUN = { lat:25.2048, lng:55.2708, utc:4 };   // Dubai (UTC+4 all year)

const rad = Math.PI / 180;
// the UTC times (ms) of sunrise and sunset on the city's calendar day containing `at`
export function sunTimes(at, place){
  const { lat, lng, utc } = place || CITY_SUN;
  const t = at instanceof Date ? at.getTime() : +at;
  const day = Math.floor(t / 864e5 + (utc ?? lng / 15) / 24);   // the city's calendar day, midnight to midnight on its clocks
  const n = day - 10957;                                       // days since 1 Jan 2000
  const Jstar = n - lng / 360;                                  // mean solar noon
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const dec = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
  const toMs = J => (J - 2440587.5) * 864e5;
  return { sunrise:toMs(Jtransit - H / 360), sunset:toMs(Jtransit + H / 360) };
}
// is it daytime in the city at `at`? and when does that next change?
export function isDay(at, place){ const t = +at, s = sunTimes(t, place); return t >= s.sunrise && t < s.sunset; }
export function nextChange(at, place){
  const t = +at, s = sunTimes(t, place);
  if (t < s.sunrise) return s.sunrise;
  if (t < s.sunset) return s.sunset;
  return sunTimes(t + 864e5, place).sunrise;
}
