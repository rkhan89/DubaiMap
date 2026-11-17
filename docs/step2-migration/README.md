# Step 2: design system migration

Branch `foundations`. Screenshots are 390×844, light and dark. `before/` is the live app before this step; `after/` is the branch. Each file name starts with the screen.

| Commit | What it covers | Screenshots |
|---|---|---|
| `e0b2b27` Design foundation | Google Sans Flex (weight + roundness), Geist Pixel, gold only for Check in and ratings, the sea-teal crew colour, shared components (buttons, chips, inputs, switches, tags, progress, focus) | every screen |
| `1d2b22a` Map | Pins (owner colour body, ink edge, hard shadow), clusters with owner dots, ink selection, TRY tab, Geist Pixel labels | `map`, `map-near` |
| `4e4a73d` Peek card and place page | Gold Check in, teal "in crew" and "Shared with" with the crew icon, filled gold rating stars | `place-peek`, `place-top`, `place-actions` |
| `41dd9b7` Check in | Ink steps and selection, the shared colour when a crew is picked | `checkin-*` (and `after/checkin-who-crew-picked`) |
| `cb2694e` Filter sheet | No gold | `filter`, `filter-2` |
| `7967e9c` List | Ink to-try ribbon | `list` |
| `af01bfc` Crew screens and plan sheet | Crew icon in teal tint, ink code, no gold | `crew*` |
| `cb11fd1` Shelf and book chrome | Ink wand and tray tab; paper kept | `shelf*` |
| `7d4a2d9` Settings | Grouped lists | `settings*` |
| `545fb5f` Profile, onboarding, bell, toasts, the rest | No gold outside Check in, ratings and paper | `profile*`, `onboarding*`, `filter-bell`, `filter-plus` |

Also on the branch: `0b8edbb` (the style guide at /styleguide.html) and `e2bd08b` (the icon scan skips the style guide page).

## Not changed in this step (later decisions or steps)

- Navigation (D1), check-in v2 with save-as-who (D4), cutting goals (D5) and the List tab (D6).
- The icon set: still Material Symbols Outlined. Phosphor and Lucide are on the style guide for you to pick.
- The 12 personal pin colours include a teal and a yellow, which sit close to "shared with crew" and to gold. Changing them would change people's chosen colours, so that's a decision for you.
- Plus Jakarta Sans is still used on the legal pages, the shared page and the 404.
