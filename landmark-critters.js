// The landmark critters (bonus tier): one hidden at each of 13 landmarks, from the art pack's landmark_critters.json
// (Oct 2026). Pure data: tune a radius here without touching code. Sprites: critters/<id>.png (32 px native) and the
// locked silhouettes critters/locked/<id>.png (shown only if SHOW_LOCKED_LANDMARK_CRITTERS is turned on).
//   radiusM: how close to the landmark's centre counts (first guesses, not measured; the World and Palm Jebel Ali
//            are offshore, so 3000 m round the art's real centre, covering the shore)
//   accuracy needed: LANDMARK_ACCURACY_M, or LANDMARK_ACCURACY_WIDE_M for the 3000 m ones
export const LANDMARK_ACCURACY_M = 100, LANDMARK_ACCURACY_WIDE_M = 500, WIDE_RADIUS_M = 3000;
export const SHOW_LOCKED_LANDMARK_CRITTERS = false;
export const LANDMARK_CRITTERS = [
 {
  "id": "steppe_eagle",
  "name": "Steppe Eagle",
  "theme": "Architecture",
  "tier": "landmark",
  "landmarkId": "burj_khalifa",
  "area": "Burj Khalifa",
  "radiusM": 250,
  "fact": "Burj Khalifa opened on 4 January 2010 and, at 828 m, is the tallest building in the world.",
  "bonusFact": "On a clear day with low tide, the Iranian coast is reportedly visible from the top, around 153 km away.",
  "source": "https://en.wikipedia.org/wiki/Burj_Khalifa",
  "needsVerification": false
 },
 {
  "id": "sailfish",
  "name": "Sailfish",
  "theme": "Architecture",
  "tier": "landmark",
  "landmarkId": "burj_al_arab",
  "area": "Burj Al Arab",
  "radiusM": 400,
  "fact": "The Burj Al Arab is 321 m tall and stands on an artificial island 280 m offshore. Its shape is meant to resemble the sail of a dhow.",
  "bonusFact": "In February 2005, Roger Federer and Andre Agassi played an exhibition match on its helipad, about 210 m up.",
  "source": "https://en.wikipedia.org/wiki/Burj_Al_Arab",
  "needsVerification": false
 },
 {
  "id": "cuttlefish",
  "name": "Cuttlefish",
  "theme": "Culture",
  "tier": "landmark",
  "landmarkId": "museum_of_the_future",
  "area": "Museum of the Future",
  "radiusM": 200,
  "fact": "The Museum of the Future opened on 22 February 2022. Its ring-shaped shell is made of 1,024 steel-clad panels, and the windows form Arabic calligraphy by Emirati artist Matar Bin Lahej.",
  "bonusFact": "The calligraphy quotes Sheikh Mohammed bin Rashid on the future of Dubai.",
  "source": "https://en.wikipedia.org/wiki/Museum_of_the_Future",
  "needsVerification": false
 },
 {
  "id": "frame_chameleon",
  "name": "Frame Chameleon",
  "theme": "Architecture",
  "tier": "landmark",
  "landmarkId": "dubai_frame",
  "area": "Dubai Frame",
  "radiusM": 200,
  "fact": "The Dubai Frame is about 150 m tall and 95 m wide. Look through it one way and you see modern Dubai, the other way and you see Deira and Karama.",
  "bonusFact": "It opened on 1 January 2018 in Zabeel Park and cost AED 230 million.",
  "source": "https://en.wikipedia.org/wiki/Dubai_Frame",
  "needsVerification": false
 },
 {
  "id": "laughing_dove",
  "name": "Laughing Dove",
  "theme": "Culture",
  "tier": "landmark",
  "landmarkId": "jumeirah_mosque",
  "area": "Jumeirah Mosque",
  "radiusM": 150,
  "fact": "Jumeirah Mosque opened in 1979 and is built in a Fatimid-inspired style. Non-Muslims can visit on guided tours run by the Sheikh Mohammed Centre for Cultural Understanding.",
  "bonusFact": "It appeared on the 2003 series of the 500 dirham note.",
  "source": "https://en.wikipedia.org/wiki/Jumeirah_Mosque",
  "needsVerification": false
 },
 {
  "id": "manta_ray",
  "name": "Manta Ray",
  "theme": "Fun",
  "tier": "landmark",
  "landmarkId": "atlantis_the_palm",
  "area": "Atlantis The Palm",
  "radiusM": 400,
  "fact": "Atlantis The Palm opened on 24 September 2008 at the top of Palm Jumeirah. Its aquarium is home to over 65,000 marine animals.",
  "bonusFact": "The opening party used about 100,000 fireworks over 15 minutes, and Kylie Minogue performed for the hotel's 2,000 guests.",
  "source": "https://en.wikipedia.org/wiki/Atlantis,_The_Palm",
  "needsVerification": false
 },
 {
  "id": "sand_fox",
  "name": "Sand Fox",
  "theme": "Architecture",
  "tier": "landmark",
  "landmarkId": "emirates_towers",
  "area": "Emirates Towers",
  "radiusM": 250,
  "fact": "The 355 m Emirates Office Tower and its hotel twin opened on 15 April 2000, and were once the tallest buildings in Dubai.",
  "bonusFact": null,
  "source": "https://en.wikipedia.org/wiki/Emirates_Towers",
  "needsVerification": false
 },
 {
  "id": "desert_hedgehog",
  "name": "Desert Hedgehog",
  "theme": "History",
  "tier": "landmark",
  "landmarkId": "al_fahidi",
  "area": "Al Fahidi Historical Neighbourhood",
  "radiusM": 300,
  "fact": "Al Fahidi was built from the 1890s by Persian merchants from Bastak. Its wind towers catch the breeze and funnel it down into the house, a natural way to keep cool.",
  "bonusFact": "In 1989 the municipality ordered the district cleared, but demolition was cancelled after a visit by Prince Charles, and restoration began in 2005.",
  "source": "https://en.wikipedia.org/wiki/Al_Bastakiya",
  "needsVerification": false
 },
 {
  "id": "moon_jelly",
  "name": "Moon Jelly",
  "theme": "Fun",
  "tier": "landmark",
  "landmarkId": "atlantis_the_royal",
  "area": "Atlantis The Royal",
  "radiusM": 400,
  "fact": "Atlantis The Royal opened to the public on 10 February 2023 after a three-day launch event. It has 760 rooms.",
  "bonusFact": "Beyonce gave a private performance at the resort on 21 January 2023, during its launch weekend.",
  "source": "https://en.wikipedia.org/wiki/Atlantis_The_Royal",
  "needsVerification": true
 },
 {
  "id": "pied_kingfisher",
  "name": "Pied Kingfisher",
  "theme": "Fun",
  "tier": "landmark",
  "landmarkId": "dubai_fountain",
  "area": "The Dubai Fountain",
  "radiusM": 250,
  "fact": "The Dubai Fountain opened on 8 May 2009 alongside the Dubai Mall. It is 275 m long and its tallest jets reach about 152 m. It cost AED 800 million.",
  "bonusFact": "It has over 6,600 lights and 25 colour projectors, and as of 2025 is described as the world's largest choreographed fountain.",
  "source": "https://en.wikipedia.org/wiki/Dubai_Fountain",
  "needsVerification": false
 },
 {
  "id": "socotra_cormorant",
  "name": "Cormorant",
  "theme": "History",
  "tier": "landmark",
  "landmarkId": "qe2",
  "area": "Queen Elizabeth 2",
  "radiusM": 250,
  "fact": "The QE2 was launched on 20 September 1967 by Queen Elizabeth II and made 806 transatlantic crossings. Since 18 April 2018 she has been a floating hotel at Port Rashid.",
  "bonusFact": "In 2002 she became the first merchant ship to sail more than 5 million nautical miles.",
  "source": "https://en.wikipedia.org/wiki/RMS_Queen_Elizabeth_2",
  "needsVerification": false
 },
 {
  "id": "dugong",
  "name": "Dugong",
  "theme": "Fun",
  "tier": "landmark",
  "landmarkId": "the_world_islands",
  "area": "The World",
  "radiusM": 3000,
  "fact": "The World is a man-made archipelago of about 300 islands arranged to look like a world map from above. The whole development measures about 6 km by 9 km.",
  "bonusFact": "The first hotel on the Heart of Europe islands, Cote d'Azur Monaco, opened in December 2022. Most other islands are still undeveloped.",
  "source": "https://en.wikipedia.org/wiki/The_World_(archipelago)",
  "needsVerification": true
 },
 {
  "id": "reef_heron",
  "name": "Reef Heron",
  "theme": "Architecture",
  "tier": "landmark",
  "landmarkId": "palm_jebel_ali",
  "area": "Palm Jebel Ali",
  "radiusM": 3000,
  "fact": "Palm Jebel Ali was started in 2002, halted after the 2008 financial crisis and relaunched on 31 May 2023. The first properties are planned for delivery in Q1 2027.",
  "bonusFact": "Announced as up to twice the size of Palm Jumeirah, with about 110 km of additional coastline.",
  "source": "https://en.wikipedia.org/wiki/Palm_Jebel_Ali",
  "needsVerification": true
 }
];
export const accuracyFor = c=>c.radiusM >= WIDE_RADIUS_M ? LANDMARK_ACCURACY_WIDE_M : LANDMARK_ACCURACY_M;
export const landmarkCritterOf = landmarkId=>LANDMARK_CRITTERS.find(c=>c.landmarkId===landmarkId) || null;
