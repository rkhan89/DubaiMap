# Dubai Bites — product spec

Living spec for the app as built. Where a review prompt changes behaviour, this file is
updated to match. (Created during polish-1; there was no earlier SPEC.md. Before that, the
Stitch project "Isometric Dubai Travel Tracker", frames 1–22 and 40, was the spec.)

## What it is
A social food scrapbook for Dubai. You and a small crew (up to 15) stamp the places you've
eaten on an isometric pixel-art map of the city, rate them in half stars, keep notes and
photos, and share a photobook. Private logs are visible to their owner only.

## Brand
- Name, tagline and logo live in `config.js` (`APP.name`, `APP.tagline`, `APP.logo`) and `logo.svg`.
- Tagline: "Your scrapbook of the city".

## Type
- Titles: **Nunito Sans** (700–900).
- Body, subtitles, taglines, ribbons, footnotes: **Plus Jakarta Sans** (400–700). Subtitles and
  footnotes use it at regular or medium weight, in sentence case, in the softer `--ink-3` colour.
- Small uppercase labels, numbers, photo captions and date labels: **Space Mono** (400/700).
- Map area names and the map's loading text: **Silkscreen** (pixel font).
- Icons: Material Symbols Outlined.
- No handwriting or script font anywhere.

## Colour and themes
- Every colour is a CSS variable in `styles.css`. Light values sit on `:root`; dark values under
  `:root[data-theme="dark"]`. Nothing in the UI is hard-coded.
- Setting: **Light / Dark / Auto** (Auto follows the phone), in Profile → Appearance. There is no
  theme button on the map. `theme.js` resolves the choice to `data-theme` on `<html>`, and an
  inline script in `index.html` does the same before first paint, so there's no flash.
- Browser/PWA theme colour: `#fff8f5` (light), `#1b1612` (dark).
- Dark UI: warm charcoal surfaces (header, sheets, nav, toasts, cards) with the same gold accent.
  Paper surfaces stay cream: stamps, polaroids, photobook pages, book spines and covers keep the
  light palette. The photobook shelf becomes a dark desk. Photos and avatars are unchanged.
- Text contrast meets WCAG AA (4.5:1) for every text/background token pair in both themes.

## The map (frame 11)
Isometric canvas city, projected from real lat/lng (see `map.js`).

**Controls.** Above the map there are at most two rows including the header:
1. Header: logo, name and tagline, a **bell**, and your avatar.
2. One slim row over the map: a small **Me / Crew** toggle (each side shows its count) and a
   **filter** button (a red dot when filters are on).

Bottom right: **fit** (show all my places) and **locate** only. Zoom is pinch, mouse wheel and
double-tap; there are no + / − buttons. Member chips (with the "All N" count) live in the
filter sheet's Members section.

**Nothing about crew activity is persistent on the map.** The bell shows a small dot when
something new has happened since you last looked. Tapping it opens a short sheet of recent crew
activity (newest first); tapping a row flies to that place and opens its card. Toasts only appear
after something you did (for example the points toast after logging) and disappear on their own
after a few seconds.

**Level of detail** (by zoom relative to the whole-city view):
- **Far (< 1.6×):** one marker per area that has places, with the stamp and count combined in one
  element. Areas whose markers would overlap merge. No labels, no landmark names.
- **Mid (1.6–3.2×):** stamps clustered by screen density (a cluster stamp shows its count).
  Area names only for areas that contain places; tapping one opens the area sheet.
- **Near (≥ 3.2×):** single stamps (overlapping ones still cluster until you zoom further).
  Undiscovered places are plain dots. A name shows only for the selected place and the few nearest.

**Label budget.** At most 10 labels at once, placed with collision detection so they never
overlap each other or a stamp. Priority: the selected place, then the most recent crew activity
(within 14 days), then the highest rated. The selected place's name always shows. Everything else
is an unlabelled stamp or dot. Only stamps on screen get DOM elements, and clustering uses a
spatial hash, so 500+ places stay smooth. `?synthetic=500` (development) adds 500 test places in
memory to prove it.

**Places without exact coordinates** (all 100 starter places today) are spread evenly and stably
over about 1 km around their area's centre, kept on land. Real coordinates would place them exactly.

**Night map** (dark theme): deep navy sea, dusky blue-grey land and roads, and city lights: lit
windows in the towers (mostly warm, some cool white, irregular), streetlights along the roads
(amber on the highways), the Burj Khalifa's lit column, spire strobe and beacon, DXB runway lights,
lights along the Palm's crescent and fronds, and boat lights in the marinas and creek. A small
subset twinkles very slowly (CSS opacity on two layers, no per-frame JS). Twinkle is off under
reduced motion and pauses while the map moves. Steady lights are baked into the cached city
bitmap, so panning at night costs the same as by day. Lights dim at the zoom levels where stamps
and labels show.

**Landmarks.** Burj Khalifa, Burj Al Arab (on its island off Umm Suqeim, 25.1412 N 55.1853 E,
with a curved causeway; drawn as a ribbed sail on a braced mast with helipad and Skyview bar), Ain Dubai, Dubai
Frame, Museum of the Future, Atlantis, Mall of the Emirates, Meydan, Ibn Battuta, DXB. At night
the Burj Al Arab's sail glows with a slow colour shift, and its helipad and Skyview bar are lit.

**Cars.** Small pixel cars drive the map's own roads: Sheikh Zayed Road busiest, side roads
quiet. By day they're coloured; at night they're headlight and taillight dots. They sit under
stamps and labels, never take taps, and are hidden where a road passes behind a building. They
only appear from mid zoom, only on roads in view, 80 at most, at ~30 fps. They pause in the
background, on low battery (≤20% and not charging), and while a full screen covers the map;
under reduced motion they're a static frame.

**Burj Khalifa light shows.** 7 pm to 11 pm Dubai time (Asia/Dubai, whatever the phone's zone):
blue at :00 and :30, multicolour at :15 and :45, 60 seconds each, with a 1.5 s fade in and out.
First show 7:00 pm (blue), last 11:00 pm (blue), last multicolour 10:45 pm: 17 shows a night.
Clock-driven with no server, so opening the app mid-show picks up at the right point. It's
recomputed every second and on return from the background. The colour wash runs up the tower
inside its silhouette; it shows by day too, more subtly. Under reduced motion it's a static colour.
Outside a show the tower looks normal. The schedule is one config object in `shows.js`
(timezone, start, end, minute marks with types, duration, plus an overrides list for Ramadan, Eid,
National Day and New Year's Eve, empty and off by default). Profile has a toggle to turn shows
off. `?now=2026-09-30T19:00:20+04:00` sets the app's clock for testing; unit tests are in
`tests/shows.test.mjs` (run `node --test tests/shows.test.mjs`).

## Coach marks (frame 7)
Four steps after onboarding: tap a stamp; Me / Crew and the filter; the bell for crew news;
+ to log a place. Replayable from Profile.

## Everything else
Onboarding (frames 1–6, 8), crew (9–10), place sheet (13), log a place (14), list (40) and the
photobook (15–22) are as designed in Stitch, rebuilt in vanilla JS/CSS. Differences from the
designs are listed in the README and the review reports.

## Data and privacy
Local-first today (`store.js`: localStorage plus IndexedDB for photos) behind an API that Supabase
will replace. A private entry or photo is visible to its owner only. Crew views, counts, the
feed, the bell and the crew book only ever include visible records.
