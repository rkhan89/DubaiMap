// The landmarks drawn from the art pack (map-art/*.png): where they stand, the plot they stand on,
// the card you see when you tap one, and the place in the app it links to.
// Pure data, so the map's Web Worker can read it too. Coordinates checked against Wikipedia (Oct 2026).
//   sprite: map-art/<sprite>.png, native pixels, anchor = bottom centre of the ground footprint
//   size:   the sprite's pixel size (places it before the image has loaded)
//   clear:  tiles (radius) cleared of other buildings round it
//   plot:   what it stands on: 'plaza' (paving), 'lake', 'island' (already in the terrain), 'none'
//   venue:  names a matching place in the app might have (the card links to it)
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
  { id:'al_fahidi', size:[72,64], name:'Al Fahidi Historical Neighbourhood', lat:25.26389, lng:55.30000, sprite:'al_fahidi_house', clear:1, plot:'plaza', plotR:1,
    fact:'Built by merchants in the 1890s, its houses are topped with wind towers (barjeel) that catch the breeze and send it down into the rooms.', venue:['Al Fahidi', 'Al Bastakiya', 'Arabian Tea House'] },
];
export const landmarkById = id=>LANDMARKS.find(l=>l.id===id);

// The landmark critters (one per landmark, art to come). Until they're confirmed this returns
// nothing, and the card shows no critter. HOOK: return { id, name, art } here to show a locked
// silhouette on the card (caught only by checking in at the landmark).
export function landmarkCritter(id){ return null; }

// The small props the art pack is redrawing at half size. A file is only used once it's the new,
// smaller one (no bigger than this); until then the map keeps its own small placeholders.
export const PROPS = {
  camel_a:[24,22], camel_b:[24,22], palm:[28,36], palm_short:[28,36], dhow:[42,32], abra:[28,22], yacht:[40,24],
};
// every file the map loads from map-art/
export const SPRITE_FILES = [...new Set([...LANDMARKS.map(l=>l.sprite), 'dubai_fountain_1','dubai_fountain_2','dubai_fountain_3','dubai_fountain_4','dubai_fountain_5', ...Object.keys(PROPS)])];
