# Koko — product spec

Living spec for the app as built. Where a review prompt changes behaviour, this file is
updated to match. (Created during polish-1; there was no earlier SPEC.md. Before that, the
Stitch project "Isometric Dubai Travel Tracker", frames 1–22 and 40, was the spec.)

## What it is
A social food scrapbook for Dubai. You and a small crew (up to 15) stamp the places you've
eaten on an isometric pixel-art map of the city, rate them in half stars, keep notes and
photos, and share a photobook. Private logs are visible to their owner only.

## Brand
- Name, tagline and logo live in `config.js` (`APP.name`, `APP.tagline`, `APP.logo`) and `logo.svg`.
- Logo: the Koko wordmark and icons from `brand-kit/` (see README, Branding), brown on light, cream on dark via the `--wordmark` token; the ring-and-dot pin is the loader.
- Name: **Koko**. Tagline: "We were here" (header, welcome screen, recap card, shared places).
- The live URL is still dubai-bites-pi.vercel.app (Vercel project name); rename it in Vercel if you want a new address.

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

**Places without exact coordinates** are spread evenly and stably
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

## The map starts empty, and a first-run guide (replaces the coach marks, frame 7)
There are no starter places: every place on the map is one someone pinned. (The earlier 100
starter places were removed; any a person had logged stay as ordinary places.) Right after
onboarding a guide opens: “Your map looks empty. Let's fix that. Pin a place you've been to
recently.” It walks through the real screens with a spotlight and a floating prompt: search →
add it → where is it → what kind → rate → add a photo → who sees it → save, then the new stamp,
Me / Crew, filters, the bell, the Crew tab and the Shelf. Each step moves on when you do the
thing (or tap Next); Skip is on every step. If you leave the log screen midway, a small pill
offers to pick up again. Anyone whose map is empty (skipped, or new to a crew) sees an
empty-map card with Pin a place and Show me around. Replay from Settings → Replay the guide.
The sample crew brings the 30 real places it has been to, and takes them away again when
switched off (unless you logged or planned something there yourself).

## Everything else
Onboarding (frames 1–6, 8), crew (9–10), place sheet (13), log a place (14), list (40) and the
photobook (15–22) are as designed in Stitch, rebuilt in vanilla JS/CSS. Differences from the
designs are listed in the README and the review reports.

## Accounts, data and privacy
- Accounts are in Supabase. Sign-in is a 6-digit code by email (the email also has a link), or
  Google. New people go through onboarding; someone signing in on a new phone goes straight in.
- A private visit or photo is visible to its owner only; everything else is visible to the
  owner's crew. This is enforced by the database (row level security), not just the app. Crew
  views, counts, the feed, the bell, the leaderboard and the crew book only include visible
  records. Photos are in a private bucket and are opened with short-lived signed links.
- One crew per person, up to 15. Creating, joining (by code or invite link), leaving and removing
  members go through checked server functions; so do RSVPs and photo bookmarks.
- The app keeps a copy on the phone, so it opens instantly and works offline; changes wait in an
  outbox and go out in order when there's a connection. A change the server refuses is undone
  with a note. Crew changes arrive live.
- Someone who used the preview (before accounts) is offered their places to import after
  signing in.
- **Google sign-in**: tap Continue with Google, pick an account, come back signed in. Needs a
  Google Cloud OAuth client (web) whose redirect URI is
  https://crvadsjnqnxlkqzpywva.supabase.co/auth/v1/callback, and the Google provider switched on
  in Supabase with that client's ID and secret.

## Share to Koko (Phase 1c)
Built in four steps. **Step 1 (done):** the resolver, "Add from link or text" and the confirm sheet.
Steps 2–4: Android share target and /share, TikTok captions, Inbox and offline queue.

- **+ button** opens a small menu: *Log a place I've been* or *Add from link or text*.
- **Add from link or text**: paste a Google Maps link (short or full), a caption, or a name. The
  clipboard is read only when you tap Paste. Nothing is added until you confirm.
- **Resolver** (`api/resolve-share.js`, server only): signed-in users only, 30 per hour each,
  4 KB body limit. Only Google Maps and TikTok hosts are ever fetched; redirects are followed by
  hand (3 hops, 5 s each), private addresses are refused, page bodies are never read. Places
  (New) is asked for id, displayName, location, formattedAddress and types only. Answers:
  `match`, `candidates`, `needs_place`, `already_exists` (decided on the phone), `unsupported`,
  `error`. Logs hold the source type, state and time only, never the shared text.
- **States on screen**: a match opens the confirm sheet; several matches show up to 3 to pick
  from ("None of these" → search); otherwise "Which place is it?" with the search pre-filled,
  places already on your crew's map listed first, and *Add it myself*. Directions links, saved
  lists, Instagram, offline, slow and busy each say what happened in plain words.
- **Confirm sheet**: where it came from; the name (editable when it didn't come from Google);
  **Who's this for?** *Just me* (padlock) or *My crew* (the crew's name), starting from your
  default in Settings, with *Change my default*; area and kind of place for new places.
  *Add to want-to-try* saves it; *I've been here* goes to logging. Already saved → "Already
  saved" and the place opens. Already on the crew map → it says so and no second place is made.
- **After adding**: a toast with *Undo* (5 s; also removes a place it just made) and *View on
  map* (flies there and drops the pin). Saves from shares earn no points.
- **Data**: `venues.google_place_id` (+ `places_fetched_at`); `entries.source_type`
  (google_maps, tiktok, instagram, text, manual). The shared **link** is kept in
  `entry_sources`, readable by its owner only — not on `entries`, which crewmates can read. The
  crew sees at most "from TikTok". `share_inbox` (owner only), `place_type_categories` (Places
  type → our category), `share_rate` and `share_cache` (server functions only).
- **Google terms**: Place IDs may be stored indefinitely; coordinates may be cached for at most
  30 days; other Places content (names, addresses) may not be stored. So the cache keeps only
  link → full link, venues keep the place ID and our own name and pin, and addresses are shown
  but never saved. Sources: developers.google.com/maps/documentation/places/web-service/policies
  and cloud.google.com/maps-platform/terms/maps-service-terms.
- **Tests**: `node --test tests/share-parse.test.mjs` (link shapes, short-link expansion,
  redirect and host limits, ranking); `tests/e2e/sqltest.mjs` (share privacy: a crewmate can't
  read your link or Inbox, can't call the cache or rate tables); `tests/e2e/share1.mjs` (the
  flow in the browser at 390 and 360, light and dark).

## Several crews and tagging
- **Up to 5 crews each** (family, friends, work…), up to 15 people per crew. Starting or joining
  a crew never drops you from another. The Crew tab shows one crew at a time, with a switcher
  at the top and *Start or join another crew*; *Leave* leaves just that crew. On the map, the
  Crew button shows the crew's name when you're in several; tap it again to switch.
- **Who's this for? — chosen on every save.** Log a visit, save to try, check in, add photos,
  add from a link: *Just me* or one or more of your crews. Nothing is pre-picked; saving asks you
  to choose. A place's page shows who your log is shared with and *Change* (applies to your
  visits there and their photos). Onboarding step 4 explains this instead of asking for a
  default; the Settings default is gone.
- **What others see**: a crewmate sees your visit only if you shared it with a crew you're both
  in right now. The crew screens (map, list, feed, leaderboard, crew book, plans) show the
  active crew. Leaving a crew (or being removed) takes your posts out of it; anything shared
  only with that crew becomes just yours.
- **Tagging**: *Who were you with?* on the log screen lists everyone in your crews; typing
  `@handle` in the notes tags them too. Tagged people can see that visit and its photos (even a
  Just me one), get "Maya tagged you at Ravi" in the bell, see the photos in their own
  photobook, and can tap *Not me* to take themselves off. Only people who share a crew with you
  can be tagged. Photobook filter: *Tagged with* (visits you went on together, either way).
- **Data** (`0003_multi_crew.sql`): crew_members allows several crews; `entries.crew_ids`,
  `photos.crew_ids`, `entries.tagged_ids`; `shared_with_me()`, `all_my_crews()`,
  `all_crewmates()`, `tagged_in()`, `untag_me()`; `leave_crew(crew)`; a trigger unshares on
  leave. Existing shared rows move to the owner's crew. Checks in `tests/e2e/sqltest.mjs`;
  the flow in `tests/e2e/crews.mjs`.

## Meals, crew names, adding to a crew book
- **Breakfast / Lunch / Dinner**: optional tags on a visit or a save (log screen, *Meal*).
  The map filter has a *Meal* section (shows places with a visit tagged that meal); a place's
  page shows the meals people tagged. Stored in `entries.meals` (`0004_meals.sql`); only sent
  when set.
- **New crews start as "My Crew"**, ready to rename. The optional preview crew is "Sample Crew".
  Onboarding step 4 just says: up to 5 crews of up to 15 people, and you choose Just me or crews
  each time you save.
- **Adding photos from a crew book**: the crew is pre-picked (it's where you asked to add),
  the Add button says what's missing instead of greying out, and "Open book" returns to that
  book. Every book has an Add photos button in its header.
- **Categories**: Restaurant, Shisha and Ice cream added (13 in all). Pickers (new place, add from
  link, map filter) show the 3 most-used categories plus anything picked, and "+N more" for the
  rest. Google restaurant types map to Restaurant, ice cream shops to Ice cream
  (`0005_categories.sql` updates the server's copy of that map).
- **Global Village** on the map (Dubailand): festival ground ringed by domed pavilions, the Ferris
  wheel at the back and the rainbow-arched gate at the front; at night the wheel's bulbs cycle,
  the gate glows and string lights twinkle. A "Global Village" area files places there.

## Share to Koko, step 2: the phone's Share menu (Android)
- Once Koko is installed (Chrome → Install app / Add to Home screen), it appears in Android's Share
  menu (`share_target` in `manifest.webmanifest`). Share from Google Maps, TikTok, a browser or a
  note, and Koko opens "Add from link" with it filled in and looks it up straight away.
- The share arrives as a POST to `/share-target`. The service worker (`sw.js`) keeps the title, text and
  link on the phone (IndexedDB `koko-share`) and always redirects to `/share?shared=1`. Nothing about
  the share reaches the server, so it can't end up in request logs, and the redirect never depends
  on the content. The app then cleans the address back to `/`, so a reload doesn't share twice.
- The link and text are sent to the resolver as they came; it uses the first link in either.
- Signed out: the share waits on the phone (up to 10), the sign-in screen says so, and it opens
  once you're in. `/share?text=…&url=…` also works (for the iPhone Shortcut in step 4).
- If the service worker isn't running yet (first open, or mid-update), `api/share-target.js` gets the
  share in the request body (not logged), returns a page whose `share-landing.js` stores it on the phone
  and continues as above. Nothing is kept or logged on the server.
- Tests: `tests/e2e/share2.mjs` (real form POST, with and without the service worker, signed in and out).

## Share to Koko, step 3: TikTok captions
- A TikTok link (shared or pasted): the server asks TikTok's public oEmbed for the post's caption
  and creator (only that JSON is read). Claude (`claude-haiku-4-5`) reads the caption and must answer
  through one tool, so all it can return is up to 3 place names with areas. The caption is wrapped
  and labelled as data, and the answer is only ever used as a search term. Each name is looked up on
  Google Places (names may be spelt slightly differently: "Amritsar" finds "Amritsr").
- One clear match opens the confirm sheet; several give "Which one is it?" with "The caption
  mentions …"; nothing found asks for the name, already filled in. The source label shows the
  creator ("From TikTok · @biggest.bites_").
- Without the Claude key, or if Claude is down, the 📍 line in the caption is used. A private or
  deleted TikTok asks for the name.
- Captions pasted as text (from Instagram, say) are read the same way; a plain place name is
  searched directly and never sent to Claude.
- Cached per person for 30 days: the place names and creator a TikTok gave (never the caption), so
  sharing it again costs nothing. Logs record which path answered (`via`), never the text.
- Tests: `tests/caption.test.mjs` (16, with faked TikTok/Claude/Google), `tests/e2e/share3.mjs`
  (a real TikTok through the dev server, the pick-one sheet, pasted captions).

## Adding a place by hand: Google suggestions
- Typing a new place's name on the log screen (3+ letters, after a short pause) shows **On Google
  Maps** under the places already on your crews' maps. Tapping one opens the new-place form with
  the name, exact pin, area and kind of place filled in; you check it, pick a meal, save. Places
  already on the map aren't offered twice. "Add 'X'" by hand still works, and the list simply isn't
  there without the key or a connection.
- `api/places.js` (signed in, 300 an hour each) calls Places Autocomplete with one session token
  per search, then Place Details with the same token, so the typing is free and a pick costs one
  lookup. The Google address isn't stored (only the place id and pin, as with shares).

## Feedback and error reports
- Settings → **Send feedback** (something broke / an idea / other), with the app version and phone
  model, browser, language and screen size attached. Read it in Supabase: Table Editor → feedback.
- `errors.js` reports errors the app hits on a phone (signed in only): the message and where in the
  code, never what was typed or saved; addresses are cut back to their path. Each error once, 5 a
  session, 50 a day per person. Table Editor → client_errors.
- `0007_feedback_places.sql`; error reports are deleted after 90 days and feedback after a year
  (`prune_reports()`, monthly if pg_cron is on).
