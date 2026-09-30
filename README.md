# Koko

Koko (We were here) is a social food scrapbook for Dubai: an isometric, Habbo-style map of the city where you and
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
| `demo.js`, `demo/` | Optional sample crew for preview mode, with the 30 places they've been (toggle in Settings). |
| `tour.js` | First-run guide (pin your first place) and the empty-map card. |
| `theme.js` | Light / Dark / Auto: resolves to `data-theme` on `<html>`. |
| `synth.js` | Development only: `?synthetic=500` adds test places in memory. |
| `shows.js` | Burj Khalifa light-show schedule and clock (`?now=` to test); tests in `tests/` (`node --test tests/shows.test.mjs`). |
| `stats.js`, `badges.js` | Points, levels and stickers, all derived from visible logs. |
| `profile.js`, `social.js`, `recap.js` | Profile and Settings, leaderboard and goals, the monthly recap card. |
| `events.js`, `notify.js` | Crew plans, check-ins, share links; reminders. |
| `sw.js`, `manifest.webmanifest` | Installable app, offline copy, notification taps. |
| `prefs.js` | Per-device preferences (map extras, reminders). |
| `SPEC.md` | The living product spec. |
| `design/` | The Stitch reference screens (not deployed). |

## Preview mode
There's no accounts backend yet (`APP.previewMode` in `config.js`). Sign-in creates a profile on
this device, any 6-digit code works, and crews can only be joined on the same device. Everything
else works for real on one phone. Connecting Supabase means implementing `store.js` against it.

Run locally: `python -m http.server 5173` and open http://localhost:5173 (add `?still` to turn
off animations for screenshots).

## Branding
The Koko logo files live in `brand-kit/` exactly as supplied (see `brand-kit/README.txt`).
**Never recolour, stretch or redraw them.** If another size is needed, export it from the SVG,
not from a PNG.

| Use | File |
|---|---|
| Wordmark on light backgrounds (and on paper cards in either theme) | `brand-kit/brand/koko-wordmark-brown.svg` |
| Wordmark on dark backgrounds, or on photos with a scrim | `brand-kit/brand/koko-wordmark-cream.svg` |
| Loaders and small marks | `brand-kit/brand/koko-pin.svg` (on dark it sits on a cream disc) |
| App icon | `brand-kit/brand/koko-icon.svg` / `koko-icon-dark.svg` |
| Web / PWA icons | `icons/` (any, maskable, monochrome, Apple 180), favicons in the site root |
| Link preview | `social/og-image-1200x630.png` |
| Future native builds | `native-assets/` (Android adaptive layers, Play 512, App Store 1024), not wired in |

In the app the wordmark is a CSS background switched by the `--wordmark` theme token
(`data-theme`), so the right colour follows the theme without per-screen code; its box keeps
the SVG's 258:100 proportions with at least the dot's height of clear space around it.

Colours: gold `#E8A92B`, brown `#2B1A10`, cream `#FFF4E8`, dark `#1C1410`.
The production address lives in `APP.siteUrl` (`config.js`); the `og:` tags in `index.html`
must use it, and `tests/branding.test.mjs` fails if they drift.

## Tests
- `node --test tests/shows.test.mjs tests/branding.test.mjs` runs the unit tests (light-show schedule, branding files and links).
- `tests/e2e/` has the scripted click-throughs used for every release (headless Chrome via
  puppeteer-core): `cd tests/e2e && npm install`, then e.g. `node shot.mjs tour 390 light`
  or `BASE=https://dubai-bites-pi.vercel.app/ node shot.mjs e2e 360 dark`. Screenshots land in
  `tests/e2e/shots/` (ignored by git).

## Accounts and sync (Supabase)
Project: `crvadsjnqnxlkqzpywva` (URL and publishable key in `config.js`; the publishable key is
meant to be public). **Never commit the secret key.**

- `supabase/migrations/0001_koko.sql` creates everything: tables, row level security (a private
  visit or photo is visible to its owner only; everything else to the owner's crew), the crew /
  RSVP / bookmark functions, the private `photos` storage bucket and realtime. Run it once in the
  Supabase SQL editor.
- `cloud.js` talks to Supabase: sign-in (6-digit email code, Google), loading what you can see,
  an outbox that queues writes while offline, signed photo links, live crew updates.
- `store.js` keeps the in-memory records the screens read and pushes every change through
  `cloud.js`. Add `?local` to the address to run without Supabase (the tests do).
- The sample crew only ever exists on the phone that switched it on.

Dashboard settings the app relies on:
1. Authentication → URL Configuration: Site URL `https://dubai-bites-pi.vercel.app`; redirect
   URLs `https://dubai-bites-pi.vercel.app/**`, `http://localhost:5174/**`.
2. Authentication → Emails: the Magic Link and Confirm signup templates include `{{ .Token }}`
   (the 6-digit code the app asks for).
3. Authentication → SMTP: a custom sender (e.g. Resend). Supabase's built-in email only sends to
   your own team's addresses and a few an hour.
4. Google: see SPEC.md, Accounts.

Tests: `node sqltest.mjs` (in `tests/e2e`) runs the migration in PGlite and checks the privacy
rules; `SUPABASE_SECRET=… node cloud.mjs` runs two real accounts end to end and deletes them.
