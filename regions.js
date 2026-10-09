// Regions the map can grow by. Each one is pure data: the map's frame grows to cover its bounds and its
// coastline, land, zoning, roads and area labels join the city's own (map.js merges them). Adding a region is
// adding an entry here, not code. Everything is in real lat/lng; pins and crew data are stored the same way,
// so nothing already on the map moves (only screen positions are recomputed).
//
//   id, name
//   bounds:  { lat:[s, n], lng:[w, e] }   the area it needs on the map (the frame grows to fit, plus sea)
//   coast:   [[lat, lng], ...]            its shoreline, in order along the coast (joins the city's coast)
//   palms:   [{ name, base, hub, fronds, frond:[from, to] km, span (radians each side), crescent:{ r, w, span } km }]
//            palm-shaped islands: the trunk runs from base (on the shore) out to hub
//   zoning:  [{ name, sw:[lat, lng], ne:[lat, lng], st, h:[min, max], p, ground? }]
//            neighbourhoods, as for HOODS in map.js (st: villa, low, mid, busy, glass, shed, resort, campus…)
//   roads:   [{ k:0|1|2, pts:[[lat, lng], ...] }]   0 highway, 1 major, 2 minor
//   zones:   [{ id, label, lat, lng }]     area labels (what new places are filed under)
//   sources: where the coordinates come from (checked Oct 2026)
// No regions are live yet: the extension (Palm Jebel Ali, the Jebel Ali coast, the border coast as fog) waits for
// sign-off, and its draft lives on the branch map-extent-wip. With none, the map's frame is exactly the city's own.
export const REGIONS = [];
