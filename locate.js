// Where the phone is, asked only when you tap a check-in (never tracked in the background).
// Returns { lat, lng, accuracy } in metres. Development only: ?at=lat,lng[,accuracy] fakes it,
// and only on localhost, so nobody can fake a check-in (or a critter) on the live site.
export function devLocation(){
  if (typeof location === 'undefined' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
  const at = new URLSearchParams(location.search).get('at'); if (!at) return null;
  const [lat, lng, acc] = at.split(',').map(Number);
  return isNaN(lat) || isNaN(lng) ? null : { lat, lng, accuracy: isNaN(acc) ? 10 : acc };
}
export function whereAmI(){
  const fake = devLocation(); if (fake) return Promise.resolve(fake);
  return new Promise((res, rej)=>{
    if (!navigator.geolocation) return rej(Object.assign(new Error('unsupported'), { code:0 }));
    navigator.geolocation.getCurrentPosition(
      p=>res({ lat:p.coords.latitude, lng:p.coords.longitude, accuracy:p.coords.accuracy || 9999 }),
      e=>rej(e), { enableHighAccuracy:true, timeout:15000, maximumAge:30000 });
  });
}
// what to tell you when it can't
export function locationError(e){
  const code = e && e.code;
  if (code === 1) return 'Location is off for Koko. Turn it on in your phone’s settings to check in.';
  if (code === 3) return 'Finding you took too long. Try again outside, or in a moment.';
  if (code === 0) return 'This phone can’t share its location.';
  return 'Couldn’t find you. Check your GPS is on and try again.';
}
