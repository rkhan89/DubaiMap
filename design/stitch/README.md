# Stitch reference screens: scrapbook rebuild

Project **Isometric Dubai Travel Tracker** (12443408242014882893), pulled 2026-10-20.
Each folder has `screen.png` (the rendered screen), `code.html` (Stitch's markup) and `meta.json`.
Reference only: the app rebuilds these with its own components and tokens. Where a screen and
the scrapbook spec (SPEC.md, "Scrapbook v2") disagree, the spec wins; conflicts are listed below.

| # | Screen ID | Stitch title (at pull time) | What it shows | Spec screen |
|---|---|---|---|---|
| 1 | 47a83999ab4a4ab996ad675d00bf9157 | Open Scrapbook Spread (By Date) | One visit as a journal page: ribbon, date, coords, postmark, price stamp, taped polaroids, handwritten note strip, crew tally, prev/next page links | Book view: a single auto page (paper anatomy) |
| 2 | 0d13b28c1c9a43c89844353e85592a97 | Taping a New Memory Studio | Polaroid on paper with washi tape choices (5 styles) and rubber-stamp choices | Decorate mode: tape and stamp tools |
| 3 | 473fa1bff7a04ffe9113f0a57907a836 | Koko • Vol. 1 Scrapbook Page (Trio Cafe, p. 24) | Desktop-width book view: List/Book toggle, paper page with ribbon, stamp, polaroid, rubber-stamp rating "★ 4", note strip, crew chips, page number, wand button, page curl corner | Book view (page-turn) |
| 4 | 6dabdeb1c42249d698254c2c2c37f2a3 | Closed Leather Keepsake Cover | Leather cover with stitched border, title, edition badge, enamel badges, coordinates, ribbon; Open Journal / Edit Cover buttons | Book cover (hard cover before the page turn) |
| 5 | 70f753f8cb1345b3bcd02a72f7e0f217 | Decorating Mode - Trio Cafe Scrapbook Page | The page scaled to fit, stickers placed freely with rotate/resize handles, tape, page dimmed around it | Decorate mode |
| 6 | efcff9964a93435cb70bab1ecb7a4ed9 | Place Chapter Spread (By Spot) | Several visits to one place as a chapter: stacked polaroids, tasting notes, attendee cards, prev/next place | Book view, By Place order |
| 7 | 798b68121b304630b046998af25e2e61 | Smash burger food photo | `smash-burger.jpg`, the photo used by screen 8 (an image asset, not a screen; no code) | Asset |
| 8 | b3114b35ccad4146a62bb581427dd6b3 | 6. Make-a-Sticker Studio | Cutout preview with die-cut border, Add to page / Save to Mine | Make a sticker (phase 4) |
| 9 | e7e6b53e493d41a595513669e10fc755 | 3. Expanded Districts Stamp Sheet | Sticker tray (Starter, Milestones, Critters, Districts) with passport-style district stamps, "9 of 34 districts" | Sticker tray, Districts tab |
| 10 | d29a1070f99e4b04be186c409e292753 | 4. Monthly Drop Spread | "Your crew's October page dropped": map crop with numbered pins, counts, 6 polaroids, Share the spread | Monthly drop spread |
| 11 | 6418dc9666284507a52d04b9fcc8423a | 5. Social Share Sheet | Story (9:16) and video previews, page link with Copy / Turn off link, Export Image / Send to Crew, "Just me visits are never shared" | Share sheet |

All five screens titled "Generating Screen..." in the brief had finished by the time of the pull, so none was skipped.

## Conflicts (the spec wins)
- **Screen 10** shows a bottom nav of Book / Pockets / Crew / Profile. The app keeps its own tab bar.
- **Screen 10** labels the counts "Spotted / Untapped / Territory". The spec says places, new places and districts, so the app uses plain words.
- **Screens 1 and 6** add a price stamp, a "crew bill tally", a "souq credibility" score and field recordings. None of these are visit data the app has; not built.
- **Screen 4** shows "enamel badges" on the cover. The existing cover editor has no badges; the cover stays as it is today.
- **Screen 2** offers a rubber-stamp picker and pen ink colours. The spec's stamp is automatic (rating and check-in) and has no free drawing; only the washi tape choices are used.
- **Screen 8** says "Cutouts stay on your phone, never uploaded". The cutout approach is undecided (phase 4); not built.
- **Screen 11**'s screenshot was captured scrolled down, so the top of the sheet (page preview, postcard option) isn't visible; `code.html` has the full sheet.
- **Screen 3** is drawn at desktop width; the app builds it for phones.
