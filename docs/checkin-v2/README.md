# Step 3: Check in v2 (D4, who it's for is the save button)

Branch `checkin-v2`. Screenshots are 390×844, light and dark, in `?local` mode with the sample crew. `before/` is the live app; `after/` is the branch.

## What changed

| Commit | What it covers | Screenshots |
|---|---|---|
| `f9be84a` + goes straight to Check in (audit Q3) | The + button opens Check in directly. "Add from a link or text" and the Inbox moved onto its first step, so there's no menu in between. | `checkin-search`, `filter-plus` |
| `a4ddda8` Check in v2 | Step 2 is now: rating, "I'm here now", photos. Meal, dishes, notes, date and "who were you with" fold under **Add details**, whose line says what's filled in. The "already on the crew map" banner is now one line. The photo-roll bar only shows from 280 of 300 photos. The save button is the who-it's-for choice: **Just me** (lock, ink edge) or **your crew** (sea-teal, crew icon, ink edge), in a bar pinned to the bottom. With more than one crew, ▾ opens the who sheet so you can pick one or several. Nothing is pre-picked; you still choose every time. Editing a visit keeps the old who cards and "Save changes". | `checkin-form`, `checkin-who`, `checkin-details` |
| `1c45f62` Dark mode: full-screen flows keep the dark palette | A live bug: in dark mode, a rule meant for book covers also matched every full-screen flow (Check in, crew setup, onboarding). They showed light paper with white text. | `darkfix/crew-*` (compare with `../step2-migration/after/crew-setup-390-dark.jpg`) |

## Notes

- Check in now hides the tab bar, like the other full-screen flows, so the save bar sits at the bottom.
- When you open Check in from a crew's book, that crew is the one on the save button.
- The first-run guide's "Who sees it?" and "Save it" steps are now one: "Save it", pointing at the save bar.
- The `tour`, `bookadd`, `scrap2` and `p3` test scripts already failed on `main` before this step (stale selectors, not in CI). They aren't fixed here.
