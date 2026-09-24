# Dubai Bites

A personal scrapbook of Dubai food, coffee and dessert spots on an isometric map of the city.

Plain HTML/CSS/JS, no build step: `index.html`, `styles.css`, `app.js`.

- Run locally: `python -m http.server 5173` and open http://localhost:5173
- Deploys: Vercel, auto-deploys on push to `main`
- Storage: `localStorage` (one device only). To sync across devices, swap the four
  storage functions at the top of `app.js` (`loadPlaces`, `persistPlaces`,
  `upsertPlace`, `removePlace`) for a backend such as Supabase.
