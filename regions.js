// Regions the map grows by. Each one is pure data: the map's frame grows to cover it and its coast, terrain,
// zoning, roads and area labels join the city's own (map.js merges them). Adding a region is adding an entry here.
// Everything is real lat/lng; pins and crew data are stored the same way, so nothing already on the map moves.
//
//   id, name, stage
//   status:  'live'   drawn and usable like the city
//            'fogged' its land and coast are there, under a thick haze: nothing built, no roads or cars
//            'locked' not on the map yet (the frame doesn't grow for it)
//   bounds:  { lat:[s, n], lng:[w, e] }   the area it covers (for reference and checks)
//   coast:   [[lat, lng], ...]            its shoreline, in order along the coast (joins the city's coast)
//   terrains:[id, ...]                    terrain sprites it brings (terrains.js: centred on a real point, sized
//                                         by real distance; their land is land in the data)
//   palms:   [{ name, base, hub, fronds, frond:[from, to] km, span, crescent:{ r, w, span } }]   drawn palm islands
//   zoning:  [{ name, sw:[lat, lng], ne:[lat, lng], st, h:[min, max], p, ground? }]   neighbourhoods, as HOODS
//   roads:   [{ k:0|1|2, pts:[[lat, lng], ...] }]   0 highway, 1 major, 2 minor
//   zones:   [{ id, label, lat, lng }]     area labels (what new places are filed under)
//   includes: what of it the city's own data already draws
//   sources: where the coordinates come from (checked Oct 2026)
export const REGIONS = [
  {
    id:'palm-jebel-ali', name:'Palm Jebel Ali, Jebel Ali Port and the coast from the Marina', stage:1, status:'live',
    bounds:{ lat:[24.97, 25.08], lng:[54.93, 55.15] },
    terrains:['palm_jebel_ali'],               // drawn mid-redevelopment: bare sand fronds, sparse lots by the base
    zones:[{ id:'palmjebelali', label:'Palm Jebel Ali', lat:25.010, lng:54.985 }],
    includes:['Jebel Ali Port and its basins', 'Jebel Ali Free Zone', 'the coast from Dubai Marina to Jebel Ali beach'],
    sources:{
      'Palm Jebel Ali':'Wikipedia, 25.010 N 54.985 E (NGA gazetteer: 25.00699 N 54.98823 E, 0.4 km away); 13.4 km², about twice Palm Jumeirah (Nakheel)',
      'Jebel Ali Port':'Searates 25.0195 N 55.0518 E; MarineLink 25.0186 N 55.0638 E',
      'Jebel Ali Free Zone':'jafza.ae, 24.984786 N 55.0906813 E',
    },
  },
  {
    id:'dubai-south', name:'Jebel Ali Village, Dubai Investments Park, Expo City and Al Maktoum airport', stage:2, status:'live',
    bounds:{ lat:[24.86, 25.05], lng:[55.08, 55.25] },
    includes:['Jebel Ali Village', 'Dubai Investments Park', 'Expo City Dubai', 'Dubai South', 'Al Maktoum International Airport (DWC)'],
    sources:{
      'Jebel Ali Village':'Wikipedia, 25.034937 N 55.117054 E',
      'Dubai Investments Park':'its metro station (Wikipedia), 25.00526 N 55.15566 E; the park centre is not sourced',
      'Expo City Dubai':'the map’s 24.963 N 55.149 E (no source found with coordinates)',
      'Al Maktoum airport':'Wikipedia, 24.8883 N 55.1604 E',
    },
  },
  {
    id:'border-coast', name:'The coast to the Abu Dhabi border', stage:3, status:'fogged',
    bounds:{ lat:[24.86, 25.00], lng:[54.82, 55.00] },
    // the shore from Jebel Ali beach south-west to Ghantoot, on the Abu Dhabi border
    coast:[[24.990, 55.020], [24.965, 54.975], [24.930, 54.920], [24.889, 54.8545]],
    sources:{
      'Ghantoot':'MarineLink port listing, 24.8892 N 54.8545 E (approximate: sources differ by ~7 km)',
      'coast points between':'approximate, along the shore between the sourced points',
    },
  },
];
