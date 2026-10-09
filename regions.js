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
export const REGIONS = [
  {
    id:'jebel-ali-coast', name:'Palm Jebel Ali and the coast to Ghantoot',
    bounds:{ lat:[24.84, 25.07], lng:[54.80, 55.20] },
    // the shore from Jebel Ali beach south-west to Ghantoot, on the Abu Dhabi border
    coast:[[24.990, 55.020], [24.965, 54.975], [24.930, 54.920], [24.889, 54.8545]],
    // its middle (the NGA point, 25.00699 N 54.98823 E) falls among the fronds; the hub is 2 km out along the trunk
    palms:[{ name:'Palm Jebel Ali', base:[24.996, 55.025], hub:[25.0016, 55.0061], fronds:16, frond:[0.35, 2.5], span:1.7,
      crescent:{ r:3.6, w:0.13, span:1.9 }, bare:true }],     // still being built: bare sand, nothing on it yet
    zoning:[
      { name:'Jebel Ali power and water', sw:[24.975, 55.020], ne:[24.995, 55.045], st:'shed', h:[6,14], p:0.45 },
      { name:'Ghantoot', sw:[24.885, 54.858], ne:[24.905, 54.885], st:'villa', h:[5,7], p:0.3 },
    ],
    roads:[{ k:0, pts:[[24.960, 54.990], [24.925, 54.930], [24.895, 54.880]] }],   // Sheikh Zayed Road (E11) on to Abu Dhabi
    zones:[{ id:'palmjebelali', label:'Palm Jebel Ali', lat:25.007, lng:54.988 }, { id:'ghantoot', label:'Ghantoot', lat:24.889, lng:54.865 }],
    sources:{
      'Palm Jebel Ali':'NGA GEOnet gazetteer, 25.006991 N 54.988234 E',
      'Ghantoot':'MarineLink port listing, 24.8892 N 54.8545 E (approximate, sources differ by ~7 km)',
      'Jebel Ali Free Zone':'jafza.ae, 24.984786 N 55.0906813 E (already on the map)',
      'Jebel Ali Village':'Wikipedia, 25.034937 N 55.117054 E (already on the map)',
      'Al Maktoum airport':'Wikipedia, 24.8883 N 55.1604 E (already on the map)',
      'coast points between':'approximate, interpolated along the shore between the sourced points',
    },
  },
];
