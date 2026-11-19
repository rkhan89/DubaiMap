# Step 4: map and sheet navigation

Decisions so far: D6 yes (List folds into the map sheet). D1 is option A changed: **Map · Crew · + · Scrapbook**, with List and the header gone.

## 1. The tab bar: B, the default since 2026-11-19

You picked **B: Map · Crew · + · Scrapbook · You**, on three conditions, and asked for it as the default for everyone. `?nav=old` brings the old navigation back on that phone (until `?nav=sheet`). What B meets:
- **360 px:** every target is at least 44 px (the slots are 64 to 70 px). The + keeps its 64 px, and the labels use the text face, so Scrapbook and You are 29 px apart.
- **The +:** at peek, half and full, the sheet's content stops 13 px above the + (the place card leaves the same room).
- **You:** your own face (photo, pixel face or initials on a plain card) in a ring of your pin colour. Gold stays on the + only.
- **The header is gone.** The bell sits beside search, and the profile buttons on pages hide, because You does that job.

`tests/e2e/sheet-spike.mjs` checks all of this at 360 (18 checks). Screenshot: `spike/layoutb-360.jpg`.

### The three layouts as first proposed

`options.html` here is a mock for review only. Open it from the app (`/docs/step4-nav/options.html`, add `?theme=dark` for night). Screenshots are in `options-light.png` and `options-dark.png`.

| | Layout | For | Against |
|---|---|---|---|
| A | Four across: Map · Crew · + · Scrapbook, equal slots | Exactly the four you asked for; + under a right thumb | + is right of centre; bell and avatar both float over the map |
| **B (recommended)** | Map · Crew · **+** · Scrapbook · **You** | + dead centre, bar balanced; your avatar gets a home, so only the bell floats over the map | Adds a fifth slot (You = profile and settings) |
| C | Map · Crew · + · Scrapbook, Scrapbook twice as wide | + centred with four items | Looks lopsided |

## 2. The map sheet

On for everyone (`?nav=old` turns it off on that phone). A sheet over the map with three heights (peek, half, full) holding what the List tab used to show; the List tab is hidden.

What it does:
- Drag the grabber or the list to move it; a flick goes one height in its direction, otherwise it settles on the nearest.
- At full, the list scrolls. Pulling down at the top of the list brings the sheet down instead of rubber-banding.
- Panning the map lowers a half-open sheet to peek. Opening a place lowers it, and the place card comes up over it.
- Android back (or a swipe back) lowers it to peek and doesn't leave the app.

### What I tested, and how

`tests/e2e/sheet-spike.mjs` drives it with real touch input (Chrome's touch emulation at 390×844, so the browser's touch-action rules apply). 14 of 14 checks pass:

| Check | Result |
|---|---|
| Starts at peek; List tab gone | ok |
| Dragging the sheet up lands on half, and the map doesn't move | ok (map centre identical before and after) |
| The map still pans above the sheet | ok |
| Panning the map lowers a half sheet to peek | ok |
| Two flicks step up to full | ok |
| At full, the list scrolls; pulling down while scrolled scrolls back (sheet stays) | ok |
| At the top of the list, pulling down brings the sheet down | ok |
| Back lowers the sheet to peek, and the app is still there | ok |
| Showing a place lowers the sheet | ok |
| The list contains its own overscroll; the sheet takes its own touches | ok |
| No page errors | ok |

Screenshots (dark, 390): `spike/spike-peek.jpg`, `spike-half.jpg`, `spike-full.jpg`, `spike-place.jpg`.

### What I could not test

I don't have a phone. These need you on a **mid-range Android** and an **iPhone**, with `?nav=sheet` on the live site:
1. **Drag vs pan:** drag the sheet slowly and quickly from the grabber and from the list; the map underneath must not move. Pan the map just above the sheet's edge.
2. **Android back:** raise the sheet, press back: it should drop to peek. Press back again: the app's usual back.
3. **Safari overscroll:** at full, scroll the list to the top and keep pulling down: the sheet should come down, the page itself should not bounce. Also try in the installed home-screen app.
4. **Smoothness:** does the drag keep up with your finger on the Android phone?

Known spike limits: the sheet doesn't remember its height between visits, and keyboard users can only step it with the grabber.

## 3. Not started

Route migration waits for your go-ahead on the spike, after you've tried it on the phones. D8 (moving invites and share links to a Koko domain) needs a domain: none is on the Vercel account yet.

## 3. Screens moved to layout B (2026-11-19)

Before (the live site with B on) and after, at 390 in light and dark: `migrate/before-*.jpg`, `migrate/after-*.jpg` (made by `tests/e2e/navshots.mjs`).

- **You is a tab.** It opens your profile as a tab page: no back arrow, You marked current, and tapping it again goes to the top. Before, it pushed the profile on top of whatever was open and the bar kept showing the old tab (Scrapbook, in the before shot). `sheet-spike.mjs` checks it.
- **Scrapbook.** The tab's page is titled Scrapbook (eyebrow "Your books"), and the old bar's label and the landmark card's link say Scrapbook too. "Shelf" is gone from the app's words.
- **The map sheet.** Its own search box is gone: the map's search bar is right above it. Me/Crew and the filter share one row, because at half and full the sheet covers the map's own. The Places tab keeps its name search, which searches only places you and your crew have been to.
- **The tour** has a You step after Scrapbook (skipped on the old bar).

Still on the old bar's terms, for later: the List view's code and the old header stay so `?nav=old` keeps working. They go once the phone tests are done.
