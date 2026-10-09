const zoom = (h, mult, where) => h.js(async (mult, where)=>{
  const MAP = await import('/map.js'), S = await import('/store.js');
  if (mult === 'fit') MAP.fitCity(false);
  else {
    const v = where ? S.venues().find(v=>v.name===where) : null;
    const z = MAP.zoneById('downtown');
    MAP.flyToWorld(v ? MAP.placeWorld(v) : MAP.placeWorld({id:'x', zone:'jumeirah'}), mult);
  }
}, mult, where);
const counts = h => h.js(()=>({
  stamps: document.querySelectorAll('.stamp-anchor').length,
  dots: document.querySelectorAll('.map-dot').length,
  labels: [...document.querySelectorAll('.map-label:not(.hidden)')].map(e=>e.textContent),
  lod: document.querySelector('.stamps-layer').dataset.lod,
}));

import screens from './screens.mjs';
import baa from './baa.mjs';
import perf from './perf.mjs';
import show from './show.mjs';
import e2e from './e2e.mjs';
import p2 from './p2.mjs';
import p3 from './p3.mjs';
import tour from './tour.mjs';
import brand from './brand.mjs';
import share1 from './share1.mjs';
import crews from './crews.mjs';
import bookadd from './bookadd.mjs';
import gallery from './gallery.mjs';
import gv from './gv.mjs';
import legal from './legal.mjs';
import share2 from './share2.mjs';
import share3 from './share3.mjs';
import places from './places.mjs';
import share4 from './share4.mjs';
import shelf from './shelf.mjs';
import scrap from './scrap.mjs';
import scrap2 from './scrap2.mjs';
import ratings from './ratings.mjs';
import mapfull from './mapfull.mjs';
import mapart from './mapart.mjs';
import mapcache from './mapcache.mjs';
import landmarks from './landmarks.mjs';
import mapperf2 from './mapperf2.mjs';
import blur from './blur.mjs';
import mallpack from './mallpack.mjs';
import fixpack from './fixpack.mjs';
import checkin from './checkin.mjs';
import pack2 from './pack2.mjs';
import frametime from './frametime.mjs';
import taps from './taps.mjs';
import lcritters from './lcritters.mjs';
import searchE2E from './search.mjs';
import mapperf from './mapperf.mjs';
import pins from './pins.mjs';
import critters from './critters.mjs';
const dflt = { screens, baa, perf2:perf, show, e2e, p2, p3, tour, brand, share1, crews, bookadd, gallery, gv, legal, share2, share3, places, share4, shelf, scrap, scrap2, ratings, mapfull, mapart, mapcache, landmarks, mapperf2, blur, mallpack, fixpack, checkin, pack2, frametime, taps, lcritters, search:searchE2E, mapperf, pins, critters,
  async fonts(h){
    await h.seed({mode:'crew'});
    await h.click('[data-tab="shelf"]'); await h.sleep(600); await h.shot('f-shelf');
    await h.click('.book-spine'); await h.sleep(800); await h.shot('f-book');
  },
  async welcome(h){ await h.load(); await h.shot('f-welcome'); },
  // item 1: the map at three zoom levels, Me and Crew
  async map(h){
    const tag = h.extra.includes('synthetic') ? '500' : 'real';
    for (const mode of ['crew','me']){
      await h.seed({mode});
      await h.shot(`m-${tag}-${mode}-mid`); console.log(mode,'mid', JSON.stringify(await counts(h)));
      await zoom(h,'fit'); await h.sleep(500);
      await h.shot(`m-${tag}-${mode}-far`); console.log(mode,'far', JSON.stringify(await counts(h)));
      await zoom(h, 11, 'Ravi Restaurant'); await h.sleep(900);
      await h.shot(`m-${tag}-${mode}-near`); console.log(mode,'near', JSON.stringify(await counts(h)));
      // select a stamp near the middle
      await h.js(()=>{ const els=[...document.querySelectorAll('.stamp-anchor.is-single')]; const W=innerWidth/2, H=innerHeight/2;
        els.sort((a,b)=>{ const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); return Math.hypot(ra.x-W,ra.y-H)-Math.hypot(rb.x-W,rb.y-H); });
        els[0] && els[0].querySelector('.stamp').click(); });
      await h.sleep(700); await h.shot(`m-${tag}-${mode}-selected`); console.log(mode,'sel', JSON.stringify(await counts(h)));
    }
  },
  async bell(h){
    await h.seed({mode:'crew'});
    await h.click('#btnBell'); await h.sleep(500); await h.shot('b-activity');
    await h.js(()=>history.back()); await h.sleep(400);
    await h.click('#btnFilter'); await h.sleep(500); await h.shot('b-filter');
  },
  async perf(h){
    await h.seed({mode:'crew'});
    const r = await h.js(async ()=>{
      const MAP = await import('/map.js');
      const t0=performance.now(); let frames=0;
      MAP.fitCity(false);
      await new Promise(res=>{ const end=performance.now()+2000; const step=()=>{ frames++; if (performance.now()<end) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
      return { fps: frames/2, stamps: document.querySelectorAll('.stamp-anchor').length };
    });
    console.log(JSON.stringify(r));
  },
};
export default dflt;
