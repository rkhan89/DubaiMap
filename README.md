# Dubai Bites

A personal scrapbook of Dubai food, coffee and dessert spots on an isometric, Habbo-style map of the city.

The map is drawn on a canvas from a stylised but real projection of Dubai (lat/lng rotated so the
coast runs along the iso grid), so pins, "pick on map" and "use my location" line up with real places.
The static city is rendered once into a cached bitmap for zoomed-out views and redrawn as crisp
vectors (culled to the viewport) when zoomed in.

Plain HTML/CSS/JS, no build step: `index.html`, `styles.css`, `app.js`.

- Run locally: `python -m http.server 5173` and open http://localhost:5173
- Deploys: Vercel, auto-deploys on push to `main`
- Storage: `localStorage` (one device only). To sync across devices, swap the four
  storage functions at the top of `app.js` (`loadPlaces`, `persistPlaces`,
  `upsertPlace`, `removePlace`) for a backend such as Supabase.
