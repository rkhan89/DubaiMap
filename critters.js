// Critters: 12 collectible pixel animals tied to real places in Dubai. This file is the content;
// edit names, themes and facts here without touching any screen. Where they can be caught (the
// spots, radii and trigger type) lives in config.js (CRITTER_SPOTS).
//
// needsVerification: the fact hasn't been confirmed yet. TODO: check these four (parakeet, falcon,
// hawksbill_turtle, sand_gazelle) and set the flag to false. Until then the fact card says it's
// being checked, or is hidden altogether if APP.critters.hideUnverifiedFacts is true.

export const THEMES = {
  Culture:      { color:'#E5A93C', ink:'#3d2900' },   // mustard
  History:      { color:'#8B5A2B', ink:'#ffffff' },   // brown
  Architecture: { color:'#3F7FD9', ink:'#ffffff' },   // blue
  Fun:          { color:'#E1699A', ink:'#ffffff' },   // pink
};

export const CRITTERS = [
  { id:'street_cat',       name:'Street Cat',       theme:'Fun',          area:'Satwa, Karama',
    fact:'Every neighbourhood has a regular. This one runs the cafeteria strip.', needsVerification:false },
  { id:'gecko',            name:'Gecko',            theme:'Architecture', area:'Al Fahidi',
    fact:'Wind towers caught the breeze and funnelled it down into the rooms. It was air conditioning before air conditioning.', needsVerification:false },
  { id:'pearl_oyster',     name:'Pearl Oyster',     theme:'History',      area:'The Creek, Al Shindagha',
    fact:'Pearls were Dubai’s main trade until cultured pearls and the 1930s slump collapsed it.', needsVerification:false },
  { id:'parakeet',         name:'Green Parakeet',   theme:'Fun',          area:'Zabeel Park, Safa Park',
    fact:'They’re everywhere in Dubai’s parks and none of them are native.', needsVerification:true },
  { id:'ghost_crab',       name:'Ghost Crab',       theme:'Fun',          area:'Kite Beach, Jumeirah Beach',
    fact:'Lives in a burrow above the tide line and mostly comes out at night.', needsVerification:false },
  { id:'flamingo',         name:'Flamingo',         theme:'Fun',          area:'Ras Al Khor',
    fact:'Greater flamingos winter here in the thousands, with Downtown’s towers behind them.', needsVerification:false },
  { id:'falcon',           name:'Falcon',           theme:'Culture',      area:'Etihad Museum, Jumeirah',
    fact:'A falcon sits on the UAE’s emblem, and falcons get their own passports for travel.', needsVerification:true },
  { id:'hawksbill_turtle', name:'Hawksbill Turtle', theme:'Architecture', area:'Burj Al Arab, Madinat Jumeirah',
    fact:'The hotel sits on an island built about 280 m offshore. Next door, a rescue project rehabilitates turtles and releases them.', needsVerification:true },
  { id:'arabian_horse',    name:'Arabian Horse',    theme:'Culture',      area:'Meydan',
    fact:'Home of the Dubai World Cup, one of the richest horse races in the world.', needsVerification:false },
  { id:'camel',            name:'Camel',            theme:'Culture',      area:'Nad Al Sheba, Al Marmoom',
    fact:'Racing camels now carry robot jockeys.', needsVerification:false },
  { id:'arabian_oryx',     name:'Arabian Oryx',     theme:'History',      area:'Al Qudra Lakes',
    fact:'Declared extinct in the wild in 1972. Breeding programmes brought it back.', needsVerification:false },
  { id:'sand_gazelle',     name:'Sand Gazelle',     theme:'Culture',      area:'Dubai Desert Conservation Reserve',
    fact:'Built for the desert, it can go long stretches without drinking.', needsVerification:true },
];
// the landmark critters (bonus tier, landmark-critters.js): one at each of 13 landmarks, found from the landmark's card
export { LANDMARK_CRITTERS } from './landmark-critters.js';
import { LANDMARK_CRITTERS } from './landmark-critters.js';
export const critterById = id => CRITTERS.find(c=>c.id===id) || LANDMARK_CRITTERS.find(c=>c.id===id) || null;
export const lockedImg = id => `critters/locked/${id}.png`;
export const critterImg = id => `critters/${id}.png`;
