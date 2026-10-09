// The landmarks drawn from the art packs (map-art/*.png: the landmark pack, then the mall pack with the
// malls, Global Village, the Jumeirah Beach Hotel and Wild Wadi): where they stand, the plot they stand on,
// the card you see when you tap one, and the place in the app it links to.
// Pure data, so the map's Web Worker can read it too. Coordinates checked against Wikipedia (Oct 2026).
//   sprite: map-art/<sprite>.png, native pixels, anchor = bottom centre of the ground footprint
//   size:   the sprite's pixel size (places it before the image has loaded)
//   clear:  tiles (radius) cleared of other buildings round it
//   plot:   what it stands on: 'plaza' (paving), 'lake', 'island' (already in the terrain), 'none'
//   venue:  names a matching place in the app might have (the card links to it)
import { CARDS } from './landmark-cards.js';
export const LANDMARKS = [
  { id:'burj_khalifa', size:[76,220], name:'Burj Khalifa', lat:25.1972, lng:55.2744, sprite:'burj_khalifa', clear:2, plot:'plaza', plotR:2,
    fact:'At 828 m it has been the world’s tallest building since it opened in 2010.', venue:['Burj Khalifa', 'At the Top'] },
  { id:'dubai_fountain', size:[136,100], name:'The Dubai Fountain', lat:25.19518, lng:55.27506, sprite:'dubai_fountain_0', clear:0, plot:'lake',
    fact:'The world’s largest choreographed fountain: 275 m long, with jets up to 152 m high. Shows run every half hour in the evening.', venue:['Dubai Fountain'] },
  { id:'burj_al_arab', size:[92,168], name:'Burj Al Arab', lat:25.14139, lng:55.18528, sprite:'burj_al_arab', clear:0, plot:'island', billboard:true,
    fact:'It stands on its own man-made island about 280 m offshore, joined to the beach by a curving bridge. It opened in 1999.', venue:['Burj Al Arab'] },
  { id:'museum_of_the_future', size:[120,92], name:'Museum of the Future', lat:25.21912, lng:55.2821, sprite:'museum_of_the_future', clear:2, plot:'plaza', plotR:2,
    fact:'Its windows are Arabic calligraphy: three quotes about the future by Sheikh Mohammed bin Rashid, written by Emirati artist Matar Bin Lahej. It opened in February 2022.', venue:['Museum of the Future'] },
  { id:'emirates_towers', size:[80,164], name:'Emirates Towers', lat:25.21722, lng:55.28306, sprite:'emirates_towers', clear:1, plot:'plaza', plotR:1,
    fact:'Two triangular towers on Sheikh Zayed Road: the office tower is 355 m tall and the hotel tower 309 m.', venue:['Emirates Towers', 'Jumeirah Emirates Towers'] },
  { id:'dubai_frame', size:[60,96], name:'Dubai Frame', lat:25.23548, lng:55.30034, sprite:'dubai_frame', clear:1, plot:'plaza', plotR:1,
    fact:'About 150 m tall. From the glass-floored deck across the top you see old Dubai on one side and the Sheikh Zayed Road towers on the other.', venue:['Dubai Frame'] },
  { id:'jumeirah_mosque', size:[104,96], name:'Jumeirah Mosque', lat:25.2340, lng:55.2655, sprite:'jumeirah_mosque', clear:2, plot:'plaza', plotR:2,
    fact:'One of the few mosques in Dubai that welcomes non-Muslim visitors, with guided tours.', venue:['Jumeirah Mosque'] },
  { id:'atlantis_the_palm', size:[132,112], name:'Atlantis The Palm', at:'palm-crescent', sprite:'atlantis_the_palm', clear:2, plot:'none',
    fact:'It sits at the top of the Palm Jumeirah’s crescent. It opened in September 2008.', venue:['Atlantis The Palm', 'Atlantis'] },
  { id:'jumeirah_beach_hotel', size:[96,70], name:'Jumeirah Beach Hotel', lat:25.14159, lng:55.19084, sprite:'jumeirah_beach_hotel', clear:1, plot:'none',
    fact:'Shaped like a breaking wave: 26 floors, 93 m tall, opened in December 1997 beside the Burj Al Arab.', venue:['Jumeirah Beach Hotel'] },
  { id:'wild_wadi', size:[92,78], name:'Wild Wadi Water Park', lat:25.13965, lng:55.18943, sprite:'wild_wadi', clear:1, plot:'none',
    fact:'Opened in February 1998, with 17 water slides and the largest wave pool in the Middle East.', venue:['Wild Wadi', 'Wild Wadi Water Park'] },
  // Atlantis The Royal (fix pack): footprint 56 px along the coast by 22 inland, about 700 x 275 m
  { id:'atlantis_the_royal', size:[96,112], fpx:[56,22], fp:[700,275], name:'Atlantis The Royal', lat:25.1385, lng:55.1300, sprite:'atlantis_the_royal', clear:2, plot:'none',
    fact:'Opened in 2023 on the Palm’s crescent: two towers of stacked, shifted blocks joined by a bridge with a sky pool.', venue:['Atlantis The Royal'] },
  { id:'al_fahidi', size:[72,64], name:'Al Fahidi Historical Neighbourhood', lat:25.26389, lng:55.30000, sprite:'al_fahidi_house', clear:1, plot:'plaza', plotR:1,
    fact:'Built by merchants in the 1890s, its houses are topped with wind towers (barjeel) that catch the breeze and send it down into the rooms.', venue:['Al Fahidi', 'Al Bastakiya', 'Arabian Tea House'] },
];

// Global Village and the malls: sprites from the mall art pack (map-art/mall_*.png), placed at their real
// positions (OpenStreetMap, Oct 2026). fp = [metres along the coast, metres inland], h = wall height.
// A mall stands on its own car park; its card says where it is (and one fact for the famous ones).
// Left out: Expo Mall (closed); Galleria Al Barsha, Gate Avenue, Abu Hail Centre and LuLu Village (no reliable position).
export const MALLS = [
  ['dubai_mall','The Dubai Mall',25.19704,55.27895,[480,400],9,'atrium','One of the world’s largest malls, at the foot of the Burj Khalifa. It opened in 2008.'],
  ['mall_of_the_emirates','Mall of the Emirates',25.11798,55.20038,[460,280],9,'skylight','Home to Ski Dubai, an indoor ski slope. It opened in 2005.'],
  ['ibn_battuta','Ibn Battuta Mall',25.04458,55.12058,[1200,160],7,'domes','Its courts are themed on the lands the 14th-century traveller Ibn Battuta wrote about: China, India, Persia, Egypt, Tunisia and Andalusia.'],
  ['dubai_festival_city','Dubai Festival City Mall',25.22187,55.35259,[300,220],8,'skylight'],
  ['city_centre_deira','City Centre Deira',25.25222,55.33225,[300,260],8,'skylight'],
  ['city_centre_mirdif','City Centre Mirdif',25.21602,55.40807,[280,380],8,'skylight'],
  ['dubai_hills_mall','Dubai Hills Mall',25.10167,55.23993,[330,320],8,'skylight'],
  ['dragon_mart','Dragon Mart',25.17375,55.41873,[160,900],6,'scales','A long trading hall for goods from China, shaped like a dragon, in International City.'],
  ['al_ghurair_centre','Al Ghurair Centre',25.26820,55.31744,[220,180],9,'skylight','Opened in 1981, one of Dubai’s first shopping malls.'],
  ['burjuman','BurJuman',25.25306,55.30194,[260,200],9,'skylight'],
  ['wafi','Wafi Mall',25.22876,55.31923,[240,220],8,'pyramids','Built in an ancient-Egyptian style, with pyramids on top.'],
  ['mercato','Mercato Shopping Mall',25.21636,55.25301,[150,150],7,'skylight'],
  ['dubai_marina_mall','Dubai Marina Mall',25.07664,55.14022,[160,180],8,'skylight'],
  ['arabian_centre','Arabian Center',25.23512,55.43601,[160,200],7,'skylight'],
  ['dubai_outlet_mall','Dubai Outlet Mall',25.07141,55.40093,[300,400],6,'skylight'],
  ['city_centre_meaisem','City Centre Me’aisem',25.04034,55.19694,[150,150],6,'skylight'],
  ['cityland_mall','Cityland Mall',25.06652,55.30177,[320,320],7,'garden'],
  ['galleria_al_wasl','The Galleria Al Wasl',25.20712,55.25448,[120,160],6,'skylight'],
  ['times_square_center','Times Square Center',25.13954,55.22004,[160,160],7,'skylight'],
  ['oasis_mall','Oasis Mall',25.16945,55.24178,[170,170],6,'skylight'],
  ['first_avenue_mall','First Avenue Mall',25.04707,55.24327,[120,120],6,'skylight'],
  ['century_mall','Century Mall',25.29095,55.34520,[120,120],6,'skylight'],
  ['grand_city_mall','Grand City Mall',25.12861,55.23240,[80,80],6,'skylight'],
  ['al_barsha_mall','Al Barsha Mall',25.09890,55.20457,[170,170],6,'skylight'],
  ['circle_mall','Circle Mall',25.06571,55.21594,[140,200],7,'skylight'],
  ['etihad_mall','Etihad Mall',25.23704,55.42131,[150,110],6,'skylight'],
  ['al_mizhar_mall','Al Mizhar Mall',25.24601,55.45286,[80,100],5,'skylight'],
  ['aswaaq_mall','Aswaaq Mall',25.19283,55.41009,[90,90],5,'skylight'],
  ['reef_mall','Reef Mall',25.26940,55.32285,[160,130],7,'skylight'],
  ['silicon_central','Silicon Central',25.11122,55.37478,[240,260],7,'skylight'],
  ['city_centre_al_shindagha','City Centre Al Shindagha',25.26399,55.28712,[180,160],6,'skylight'],
  ['nakheel_mall','Nakheel Mall',25.11398,55.13834,[220,220],8,'skylight'],
  ['madina_mall','Madina Mall',25.28198,55.39812,[160,220],6,'skylight'],
  ['al_khawaneej_walk','Al Khawaneej Walk',25.23341,55.47287,[220,150],4,'garden'],
  ['the_springs_souk','The Springs Souk',25.06565,55.19285,[180,220],6,'skylight'],
].map(([id, name, lat, lng, fp, h, roof, fact])=>({ id, name, lat, lng, fp, h, roof, fact, kind:'mall' }));
MALLS.forEach(m=>{
  const c = CARDS['mall_'+m.id];
  LANDMARKS.push({ id:m.id, name:m.name, lat:m.lat, lng:m.lng, sprite:'mall_'+m.id, size:c.size, fpx:c.fpx, clear:Math.max(1, Math.round(Math.max(c.fpx[0], c.fpx[1])/32)),
    plot:'parking', kind:'mall', fp:m.fp, fact:m.fact || '', venue:[m.name] });
});
LANDMARKS.push({ id:'global_village', name:'Global Village', lat:25.06815, lng:55.30731, sprite:'global_village', size:[108,96], clear:2, plot:'none', kind:'park',
  fact:'A seasonal festival park of country pavilions, rides and food, open each winter from October to spring. It first opened in 1996.', venue:['Global Village'] });
export const landmarkById = id=>LANDMARKS.find(l=>l.id===id);

// The landmark critters (one per landmark, art to come). Until they're confirmed this returns
// nothing, and the card shows no critter. HOOK: return { id, name, art } here to show a locked
// silhouette on the card (caught only by checking in at the landmark).
export function landmarkCritter(id){ return null; }

// The small props. A file is only used if it's no bigger than this; until then the map keeps its own
// small placeholders (camels, palms). Boats and planes come in four headings, by the bow's direction on
// screen (ne up-right, nw up-left, sw down-left, se down-right); the map picks one, never flips or turns one.
export const HEADINGS = ['ne', 'nw', 'sw', 'se'];
export const PROPS = {
  camel_a:[24,22], camel_b:[24,22], palm:[28,36], palm_short:[28,36],
  ...Object.fromEntries([['dhow',[38,28]], ['abra',[24,18]], ['yacht',[36,20]], ['plane',[46,34]]].flatMap(([k, sz])=>HEADINGS.map(h=>[k+'_'+h, sz]))),
};
// every file the map loads from map-art/
export const SPRITE_FILES = [...new Set([...LANDMARKS.map(l=>l.sprite), 'dubai_fountain_1','dubai_fountain_2','dubai_fountain_3','dubai_fountain_4','dubai_fountain_5', ...Object.keys(PROPS)])];
// footprints for the pack's other sprites (art pixels: [coast, inland])
for (const lm of LANDMARKS){ const c = CARDS[lm.sprite]; if (c && !lm.fpx) lm.fpx = c.fpx; }
