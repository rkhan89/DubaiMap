# Trust pass (roadmap step 1)

Branch `trust-pass`, cut from `map-art` at `7543eed`, so it also contains the two unpushed Places record commits. Nothing is pushed, merged or deployed. There is one commit per item.

Screenshots: `before/` and `after/`, 390×844, light. Q9 and Q15 also have dark versions, and so does every other captured screen. The names start with the item number. `axe-light.json` and `axe-dark.json` in each folder hold the axe counts.

| Item | Commit | What changed | Files |
|---|---|---|---|
| Q1 | `eeb079a` | The welcome screen gets the `cover` class, so the tab bar is hidden until you're signed in. The email, code, handle, avatar, who-sees, collect and crew steps already added `cover`. | `onboarding.js` |
| Q2 | `5901ff0` | "All sync'd" is replaced by real state: "All saved", "N changes waiting" (singular for 1) or "Offline". It reads `C.pending()` and `navigator.onLine`, and updates on a new `koko:outbox` event and on online and offline. The inline style became a `.sync-status` class. | `cloud.js`, `store.js`, `crew.js`, `styles.css` |
| Q4 | `c10d0b1` | No "⋮" on check-in step 1, where it only showed a toast. Step 2's "⋮" opens the place page and stays. The check-circle "change place" button is a "Change" text link. | `place.js` |
| Q7 | `a23368b` | Opening map search closes the place card (`go.hidePeek`). `.map-top` sits above `.peek` while search is open. Tapping a result still flies there and opens that place's card. | `app.js`, `searchui.js`, `styles.css` |
| Q9 | `8f78848` | New `--line` token (`#8B8176` light, `#7D7266` dark) for input and search borders, the switch track when off and the "+N more" chip outline. Off stars use `--line`. The rating input's star outline uses a new `--star-line` (`#B07A12`, 3.7:1 on white; gold in dark). The "All N" badge is tinted from its chip's own text colour. Selected category chips use ink text on the light colours (Cafeteria 3.51:1 → 5.05:1), and burger and pizza go one shade deeper. In dark mode the selected segment gets a `--line` outline. The Plan sheet's When and Note are real labels. | `styles.css`, `events.js` |
| Q10 | `d9dff8d` | Me/Crew is 44 px tall. A Settings toggle row flips from anywhere on the row; the switch is still the one focusable `role=switch`. Map area and place labels get an invisible 44 px-tall `::before` hit area and look the same. | `styles.css`, `profile.js` |
| Q11 | `9ce5bec` | Copy only; see the replacements below. | `app.js`, `place.js`, `events.js`, `crew.js`, `profile.js`, `tour.js`, `notify.js`, `styles.css`, `tests/e2e/p3.mjs` |
| Q15 | `8c65d39` | All 7 `backdrop-filter` uses removed. The map search bar, Me/Crew, filter, fit and locate buttons and the memory strip are solid surface with a 1 px ink edge and a 2 px hard shadow down-left (`--overlay-shadow`). The pushed screens' top bar and the round sheet-header icon just get a solid fill. | `styles.css` |

## Copy replacements (Q11)

| Old | New | Where |
|---|---|---|
| Add Bite | Check in (with the place page's check-in icon) | peek card |
| Plan a bite | Plan | place page button |
| Plan a crew bite | Plan | plan sheet title |
| Upcoming bites | Upcoming plans ("Plan one" kept) | Crew tab card |
| Crew bites you're going to | Crew plans you're going to | Settings → Reminders |
| planned a bite | made a plan | guide, bell step |
| Crew bite in an hour / before crew bites | Crew plan in an hour / before crew plans | reminders |
| Share places with up to 14 friends | Crews hold up to 15 people, you included | crew setup |
| Add up to 14 friends | Bring up to 14 friends (15 people in all) | solo crew card |
| Fellow explorers | Members | Crew tab |
| members aboard | members | Crew tab |
| Food journal | Visits | Crew tab eyebrow (3 places) |
| Scrapbook passport | Profile | profile eyebrow |
| STARTER / MILESTONES … (uppercase, letter-spaced) | Starter / Milestones … (still Space Mono) | sticker tray tabs |
| 📌 before "already on the crew map" | removed | check-in step 2 |
| 📍 Exact spot pinned | Exact spot pinned | new-place card |

Nothing in data, ids, routes or database columns was renamed. The 📍 and 📌 in `api/_lib/caption.js` and `share.js` read shared TikTok and Instagram captions, so they are parsing logic, not chrome, and stay.

## Where this departs from the brief

- **Q10.** The filter category chips, the search clear button and the Shelf "Open" link already had 44 px hit areas from existing `::before` rules (`styles.css`, the `:is(.seg-mode button,.cat-chip,button.link,…)::before` and `.switch::before,.ksearch-x::before` rules). The audit measured visible boxes only, so they are unchanged. Hit-tested in headless Chrome: the chips and search clear take a tap 21 px above and below their centre. The "Open" link wasn't hit-tested because the seeded shelf had no "Latest pages" strip; its rule covers `button.link`.
- **Q9.** Six category colours fail 4.5:1 with white text when selected, not only Cafeteria. Four pass with ink text. Burger and pizza fail with both, so their selected background is one shade deeper (`#A9501F`, `#C23B3B`). That is the one colour change beyond the tokens asked for.
- **Q10.** The map labels' hit areas sit in the labels layer, which is above the pins (existing stacking). The labels are placed clear of pins, so a pin tap shouldn't be stolen, but that is untested on a crowded map.
- **Q1.** The invite welcome's crew card (name, size, owner) needs the server's `crew_invite_preview`, so it can't show in `?local` mode. The change doesn't touch it (`#wInvite` in the same root). Checked in code only.
- **Q11.** The sticker tray row scrolls sideways. "Districts" is now fully visible at 390 px; "Layout" is still off-screen and reached by scrolling, as before.

## Found along the way (left alone)

- `tests/e2e/p3.mjs` (not in CI) has three failures that also fail on the code before this pass: two call `go.checkIn`, which no longer exists, and one uses an old page-editor selector (`[data-editpage]`).
- `book.js:178`, the cover editor's tap hint, still uses ☝ and 📖 emoji. The brief named only 📌 and 📍.
- `crew.js`: the members line and the "spots open" count still use inline `style=""` attributes from before. None were added.

## Tests

- Unit tests (`node --test tests/*.test.mjs`): 176 of 176 pass.
- Per item at 390: e2e, crews, checkin, tagged, search, a11y, theme, taps, spacing and decorate passed after the item that touched them.
- axe on the changed screens: light 2 violations before (colour contrast 1, label 1) → 0 after. Dark 1 (label) → 0.
- Full CI (`tests/e2e/ci.mjs`): **all 18 browser suites passed**. These are e2e, search, checkin, tagged, crews, scrap, taps, landmarks, theme, a11y (light and dark axe on every main screen), scrapbook, decorate, drops, record, recordList, and spacing at 360, 390 and 430.
  - The drops suite logged one console 404 (a missing resource). It isn't a page error, so it doesn't fail the suite. Not investigated in this pass.
- Test updated for the new copy: `tests/e2e/p3.mjs` (/Plan a bite/ → /\bPlan\b/, /Upcoming bites/ → /Upcoming plans/).
