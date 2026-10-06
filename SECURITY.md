# Koko security review (1 October 2026)

How Koko is built, which decides what applies: a static web app on Vercel, one server function
(`/api/resolve-share`), and Supabase for sign-in, the database and photo storage. There are no
passwords: sign-in is a 6-digit email code or Google. Every read and write from the app goes to
Supabase with the user's session and is checked by row level security (RLS) in the database.

## Findings and fixes

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | High | Crew invite codes were name letters + 2 digits. Every "My Crew" got `MYCRE10`–`MYCRE99`: anyone signed in could guess codes and join strangers' crews. After 90 "My Crew"s, creating a crew would loop forever. | `0006_security.sql`: codes are 10 characters from `gen_random_uuid()`; old guessable codes are replaced; owners can't set a code. Local mode uses `crypto.getRandomValues`. |
| 2 | Medium | The Supabase library loaded as `supabase-js@2` (any 2.x) from a CDN: a bad release would run in the app without a deploy. | Pinned to `@2.117.2` (`cloud.js`); a test fails if it's unpinned again. CSP limits scripts to the site and that CDN. |
| 3 | Medium | No security headers apart from Vercel's HSTS. | `vercel.json`: CSP (no `unsafe-eval`, inline script allowed by hash), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP. `tests/headers.test.mjs` checks the hash matches `index.html`. |
| 4 | Medium | The link cache was shared by everyone; any user could call `share_cache_put` and plant a wrong answer for other people's links. | Cache entries are per person (`0006`). |
| 5 | Medium | A plan's host could move it into a crew they're not in. | Update policy now requires a crew you're in (`0006`). |
| 6 | Medium | No way to delete an account (UAE PDPL / GDPR right to erasure). | `delete_me()` (`0006`) + Settings → Delete my account. Shared things are handed over first (crews, crew books, places friends logged); photo files are removed through the storage API. |
| 7 | Low | `?at=lat,lng` faked your location on the live site, so check-ins (and their points) could be faked. | Only works on localhost now. |
| 8 | Low | Signing out left photos cached on the phone. | Cleared on sign-out unless uploads are still pending. |
| 9 | Low | The server function answered errors with HTTP 200, and read the whole body before checking its size. | 500 with a generic message; size checked from `Content-Length` first. |
| 10 | Low | Test-only dependency `puppeteer-core@23` pulled in `extract-zip` with 2 known high advisories (never deployed). | `puppeteer-core@25.12.0`; versions pinned exactly; `npm audit`: 0. |
| 11 | Info | Google Places results were shown without the required Google Maps attribution. | "Place details from Google Maps" on the confirm sheet and results list. |
| 12 | Info | New: scrapbook page extras (stickers, layout, notes) on shared pages, and tagging that shares a visit. | `0008_pages.sql`: `book_pages` has RLS on every action through `page_fits` (runs as the person asking, so it only finds books and visits they can already see; crew-book pages need the visit shared with that crew). Rows go when a visit is un-shared or someone leaves. `share_with_tagged` only adds crews the owner is in (insert check still applies). Checked in `tests/e2e/sqltest.mjs`. |
| 13 | Info | New: ratings from people tagged on a visit. | `0009_visit_ratings.sql`: insert/update only your own row on a visit you're tagged on (`can_rate`); read through `rating_visible` (the rater, the logger, others tagged, or a crewmate sharing one of the visit's crews with both the logger and the rater). Newest write wins (trigger); untagging deletes the rating. Checked in `tests/e2e/sqltest.mjs`. |

## Checked and fine

- **Passwords**: none stored; Supabase handles codes and Google sign-in.
- **CSRF**: not applicable. Sessions travel in an `Authorization` header, never in cookies, so another site can't make requests as you.
- **Authorization**: every table has RLS. Private records are owner-only; shared records are visible only through a crew both people are in; tags grant read-only access to that visit; crew joins, RSVPs, bookmarks, leaving and deleting go through checked functions. 80 checks in `tests/e2e/sqltest.mjs`, run against the real migrations.
- **Horizontal escalation**: every write policy checks `user_id = auth.uid()` (or crew membership); IDs in requests can't reach other people's rows.
- **Vertical escalation**: there are no admin endpoints or roles in the app. The Supabase secret key is not in the code, repo or history.
- **Secrets**: none in the code or git history. The `sb_publishable_…` key in `config.js` is meant to be public (RLS protects the data). Google Places and Anthropic keys live in Vercel env vars only. `.gitignore` now blocks `.env*`, `*.pem`, `*.key`.
- **SQL / NoSQL injection**: no string-built queries anywhere. The app uses the Supabase query builder (parameterised); database functions take typed parameters and use no dynamic SQL; there's no MongoDB.
- **Server function**: signed-in only, 30 lookups an hour per person, body limit, fetches only Google Maps and TikTok hosts, follows redirects by hand (3 hops, 5 s), refuses private addresses, never logs shared text.
- **Errors**: no stack traces or internal details reach users anywhere; Supabase errors are mapped to plain messages. There's no build step, so there are no source maps to leak. A branded `404.html` handles unknown addresses.
- **HTTPS**: Vercel serves HTTPS with a valid certificate, plus HSTS.
- **Photos**: private bucket, your own folder only, 5 MB cap, images only, short-lived signed links, and location data stripped on the phone before upload.

## Supabase dashboard settings to check (Authentication)

- **Email OTP expiry**: 600 seconds (10 minutes). The default is 3600.
- **Rate limits**: keep the defaults or tighten them (emails sent per hour, OTP verifications per IP).
- **JWT expiry**: 3600 seconds (the default). Refresh token rotation on, reuse interval 10 s.
- **URL configuration**: Site URL `https://dubai-bites-pi.vercel.app`, redirect URLs limited to that site and `http://localhost:5174/**`.
- **Custom SMTP**: needed before outside testers can receive codes.
- **Rotate the secret key**: it was pasted in chat during setup; rotate it in Project Settings → API.
