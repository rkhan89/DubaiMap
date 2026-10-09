// Every animated or glowing effect on the map, in one place (map.js draws the live ones, mapraster.js bakes
// the glows into the art). Tune here; nothing else hard-codes an intensity. With prefers-reduced-motion
// nothing animates at all (map.js drawLive returns before drawing).
//
//   effect           where            what moves
//   water glints     live layer       short pale dashes on open water; each one has its own slow, irregular
//                                     blink (period 6 to 24 steps), so only a few change at a time: no
//                                     whole-layer pulse. Zoomed in only (1 device px per art px or more).
//   lit windows      baked in art     never animate (0 % twinkle): the dusk palette and the art's #ffd470
//   street lamps     baked in art     a static warm glow round each head at night
//   edge haze        baked in art     a static soft fade toward the map's edges
//   car headlights   car layer        a glow ahead of each car at night (moves with the car)
export const NIGHT_FX = {
  glintsDay: 160,           // glints per 256 px chunk of water by day (was 260)
  glintsNight: 70,          // ... and at night (was 260)
  glintAlphaDay: 0.7,       // (was 0.8)
  glintAlphaNight: 0.26,    // (was 0.55)
  glintStepMs: 750,         // the glints move on every this many ms (was every 250 ms, all of them at once)
  glintLoop: 24,            // steps before the pattern repeats; each glint's period divides it
  lampGlowNight: 0.16,      // street lamps' glow at night (was 0.32)
  hazeDay: 0.38,            // the edge haze's strength by day
  hazeNight: 0.19,          // ... and at night (was 0.38)
  headlightAlpha: 0.5,      // car headlights at night (was 1)
};
