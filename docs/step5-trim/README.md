# Step 5: trim and polish

Roadmap step 5 from the 2027 audit (docs/koko-audit-2027.md, section G): onboarding (C5), the shelf (S3 option A),
the place page (C6), cutting goals and challenges (C9, decision D5) and the sync status (C8). One commit per item.
Screenshots are in `shots/`: `before-*` is the live site before step 5, `after-*` is this branch, both at 390 in
light and dark, with made-up local data (`node tests/e2e/step5shots.mjs <base url> docs/step5-trim/shots <prefix>`).

## What changed

| Item | Before | After | Shots |
|---|---|---|---|
| Crew challenges and goals (D5: cut) | A challenges screen, a row on the Crew tab, a goals card on your profile, "0/51" areas | Gone. Stickers and critters are the only collecting. Nothing was stored, so no data changes. | `you`, `crew` |
| Crew card | "Since 2026", uppercase "CODE:", a capacity bar, "9 spots open" | "Invite code", the code, "6 members"; spots left only when 3 or fewer remain | `crew` |
| Place page (C6) | Check in and Plan after the reviews, then "Log your visit", then Send to crew, Directions, Show on map, Save to try at the bottom | Under the name: one Check in, then Save · Plan · Directions, then a quiet "Log a past visit". Send to crew and Show on map are in the ⋮ menu. | `place` |
| Onboarding (C5) | 5 steps: handle (with a made-up feed preview), avatar, "You decide who sees each place", "Three things you'll collect", crew | 3 steps: handle, avatar, crew (skippable as before). The save buttons already say who sees each place; the first page and first sticker show what you collect. | `onb1`…`onb3` (before: `onb1`…`onb5`) |
| First-run guide (C5) | 16 spotlight steps | 3 hints: where to type the name, the save button, your first stamp. Its test now runs in CI. | (tour test shots) |
| Scrapbook shelf (S3 A) | Your books, then a latest-pages strip, then kinds, then crews; covers with "DXB SOUK ED.", "PIN" and coordinates | Continue (your newest pages) first, then Everything and Tagged, Crews, By kind, Albums. Covers keep the title, byline and area names only. | `shelf` |
| Sync (C8) | Status only on the Crew tab | Also a small pill under the map's search bar: "Offline" or "n changes waiting". Nothing when all is saved. | — |

## Decisions made along the way

- **Onboarding stays two screens for handle and avatar.** The audit suggested one screen; the avatar builder is long,
  and putting the handle above it would push the Next button far down. Cutting the two explainers already takes it
  from 5 steps to 3.
- **"Save" on the place page** (with the label "Save to try later" for screen readers): "Save to try" didn't fit three
  across at 360.
- **Critters keep "n/12".** Finding all of them is the point of critters, unlike the area and goal counters.
- **Settings needed nothing**: the support card and the sample crew were already under About and For testers.
- **The pill uses `wifi_off` and `sync`** because they're already in the bundled icon subset; `cloud_off` would have
  meant re-downloading the font.

## Not changed

- The old `scrap2` browser suite (not in CI) already failed 3 steps before step 5; the challenge step was removed from
  it, the other failures are unrelated.
