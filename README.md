# Dubai Bites

A social food scrapbook for Dubai: an isometric, Habbo-style map of the city where you and
your crew stamp the cafés, karak stops and dessert spots you've been to, plus a shared photobook.

Plain HTML/CSS/JS (ES modules), no build step. Live: https://dubai-bites-pi.vercel.app

## Files
| File | What it is |
|---|---|
| `config.js` | App name, tagline, logo, limits. **Rename the app here** (and `logo.svg`). |
| `store.js` | Data layer. Local today (localStorage + IndexedDB for photos). Swap its exported functions for Supabase calls to go multi-device; screens don't touch storage directly. |
| `model.js` | Derived views: stamp state per venue, who's been, feed. Privacy rules applied here via `store.canSee`. |
| `map.js` | The isometric map renderer + camera, gestures, stamps overlay, live location. |
| `app.js` | Shell: map Me/Crew modes, peek card, filters, list feed, profile, map tour. |
| `onboarding.js` | Welcome, sign-in, handle, avatar, share default, crew setup, import (frames 1-8). |
| `crew.js` | Crew screen, crew of one, invite link landing (frames 6, 9, 10). |
| `place.js` | Place sheet and Log a Place (frames 13, 14). |
| `book.js` | Photobook: shelf, cover, open book, filters, viewer, add photos (frames 15-22). |
| `ui.js`, `avatar.js`, `data.js` | Shared components, pixel avatars, categories + helpers. |
| `seed-places.json` | The 100 starter venues. |
| `demo.js`, `demo/` | Optional sample crew for preview mode (toggle in your profile). |
| `design/` | The Stitch reference screens (not deployed). |

## Preview mode
There's no accounts backend yet (`APP.previewMode` in `config.js`). Sign-in creates a profile on
this device, any 6-digit code works, and crews can only be joined on the same device. Everything
else works for real on one phone. Connecting Supabase means implementing `store.js` against it.

Run locally: `python -m http.server 5173` and open http://localhost:5173 (add `?still` to turn
off animations for screenshots).
