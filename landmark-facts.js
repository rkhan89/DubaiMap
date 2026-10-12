// The landmark cards' words, bundled with the app (from the final art pack's landmarks.json, Oct 2026), so a card
// works offline and nothing is fetched when you tap. bonus: the "More" fact (null = no More). verify: the fact is
// still being checked (listed in the build report; shown normally). The landmark critters are in landmark-critters.js.
// The fountain's schedule is its tap_extra as data: Wikipedia's show times, to check against the official site.
export const LANDMARK_FACTS = [
 {
  "id": "burj_khalifa",
  "name": "Burj Khalifa",
  "area": "Downtown Dubai",
  "fact": "Burj Khalifa opened on 4 January 2010 and, at 828 m, is the tallest building in the world.",
  "bonus": "On a clear day with low tide, the Iranian coast is reportedly visible from the top, around 153 km away.",
  "source": "https://en.wikipedia.org/wiki/Burj_Khalifa",
  "verify": false
 },
 {
  "id": "burj_al_arab",
  "name": "Burj Al Arab",
  "area": "Umm Suqeim",
  "fact": "The Burj Al Arab is 321 m tall and stands on an artificial island 280 m offshore. Its shape is meant to resemble the sail of a dhow.",
  "bonus": "In February 2005, Roger Federer and Andre Agassi played an exhibition match on its helipad, about 210 m up.",
  "source": "https://en.wikipedia.org/wiki/Burj_Al_Arab",
  "verify": false
 },
 {
  "id": "museum_of_the_future",
  "name": "Museum of the Future",
  "area": "Trade Centre",
  "fact": "The Museum of the Future opened on 22 February 2022. Its ring-shaped shell is made of 1,024 steel-clad panels, and the windows form Arabic calligraphy by Emirati artist Matar Bin Lahej.",
  "bonus": "The calligraphy quotes Sheikh Mohammed bin Rashid on the future of Dubai.",
  "source": "https://en.wikipedia.org/wiki/Museum_of_the_Future",
  "verify": false
 },
 {
  "id": "dubai_frame",
  "name": "Dubai Frame",
  "area": "Zabeel Park",
  "fact": "The Dubai Frame is about 150 m tall and 95 m wide. Look through it one way and you see modern Dubai, the other way and you see Deira and Karama.",
  "bonus": "It opened on 1 January 2018 in Zabeel Park and cost AED 230 million.",
  "source": "https://en.wikipedia.org/wiki/Dubai_Frame",
  "verify": false
 },
 {
  "id": "jumeirah_mosque",
  "name": "Jumeirah Mosque",
  "area": "Jumeirah 1",
  "fact": "Jumeirah Mosque opened in 1979 and is built in a Fatimid-inspired style. Non-Muslims can visit on guided tours run by the Sheikh Mohammed Centre for Cultural Understanding.",
  "bonus": "It appeared on the 2003 series of the 500 dirham note.",
  "source": "https://en.wikipedia.org/wiki/Jumeirah_Mosque",
  "verify": false
 },
 {
  "id": "atlantis_the_palm",
  "name": "Atlantis The Palm",
  "area": "Palm Jumeirah",
  "fact": "Atlantis The Palm opened on 24 September 2008 at the top of Palm Jumeirah. Its aquarium is home to over 65,000 marine animals.",
  "bonus": "The opening party used about 100,000 fireworks over 15 minutes, and Kylie Minogue performed for the hotel's 2,000 guests.",
  "source": "https://en.wikipedia.org/wiki/Atlantis,_The_Palm",
  "verify": false
 },
 {
  "id": "atlantis_the_royal",
  "name": "Atlantis The Royal",
  "area": "Palm Jumeirah",
  "fact": "Atlantis The Royal opened to the public on 10 February 2023 after a three-day launch event. It has 760 rooms.",
  "bonus": "Beyonce gave a private performance at the resort on 21 January 2023, during its launch weekend.",
  "source": "https://en.wikipedia.org/wiki/Atlantis_The_Royal",
  "verify": true
 },
 {
  "id": "emirates_towers",
  "name": "Emirates Towers",
  "area": "Sheikh Zayed Road",
  "fact": "The 355 m Emirates Office Tower and its hotel twin opened on 15 April 2000, and were once the tallest buildings in Dubai.",
  "bonus": null,
  "source": "https://en.wikipedia.org/wiki/Emirates_Towers",
  "verify": false
 },
 {
  "id": "al_fahidi",
  "name": "Al Fahidi Historical Neighbourhood",
  "area": "Bur Dubai",
  "fact": "Al Fahidi was built from the 1890s by Persian merchants from Bastak. Its wind towers catch the breeze and funnel it down into the house, a natural way to keep cool.",
  "bonus": "In 1989 the municipality ordered the district cleared, but demolition was cancelled after a visit by Prince Charles, and restoration began in 2005.",
  "source": "https://en.wikipedia.org/wiki/Al_Bastakiya",
  "verify": false
 },
 {
  "id": "dubai_fountain",
  "name": "The Dubai Fountain",
  "area": "Downtown Dubai",
  "fact": "The Dubai Fountain opened on 8 May 2009 alongside the Dubai Mall. It is 275 m long and its tallest jets reach about 152 m. It cost AED 800 million.",
  "bonus": "It has over 6,600 lights and 25 colour projectors, and as of 2025 is described as the world's largest choreographed fountain.",
  "source": "https://en.wikipedia.org/wiki/Dubai_Fountain",
  "verify": false,
  "tapExtra": "Show times as listed on Wikipedia: afternoon shows 13:00 and 13:30 (Sat to Thu) or 14:00 and 14:30 (Fri); evening shows 18:00 to 23:00 every 30 minutes. Verify against the official Dubai Fountain site before shipping.",
  "schedule": {
   "afternoon": {
    "satThu": [
     "13:00",
     "13:30"
    ],
    "fri": [
     "14:00",
     "14:30"
    ]
   },
   "evening": {
    "from": "18:00",
    "to": "23:00",
    "everyMin": 30
   },
   "showMin": 5
  }
 },
 {
  "id": "qe2",
  "name": "Queen Elizabeth 2",
  "area": "Port Rashid",
  "fact": "The QE2 was launched on 20 September 1967 by Queen Elizabeth II and made 806 transatlantic crossings. Since 18 April 2018 she has been a floating hotel at Port Rashid.",
  "bonus": "In 2002 she became the first merchant ship to sail more than 5 million nautical miles.",
  "source": "https://en.wikipedia.org/wiki/RMS_Queen_Elizabeth_2",
  "verify": false
 },
 {
  "id": "the_world_islands",
  "name": "The World",
  "area": "Offshore, off Jumeirah",
  "fact": "The World is a man-made archipelago of about 300 islands arranged to look like a world map from above. The whole development measures about 6 km by 9 km.",
  "bonus": "The first hotel on the Heart of Europe islands, Cote d'Azur Monaco, opened in December 2022. Most other islands are still undeveloped.",
  "source": "https://en.wikipedia.org/wiki/The_World_(archipelago)",
  "verify": true
 },
 {
  "id": "palm_jebel_ali",
  "name": "Palm Jebel Ali",
  "area": "Jebel Ali",
  "fact": "Palm Jebel Ali was started in 2002, halted after the 2008 financial crisis and relaunched on 31 May 2023. The first properties are planned for delivery in Q1 2027.",
  "bonus": "Announced as up to twice the size of Palm Jumeirah, with about 110 km of additional coastline.",
  "source": "https://en.wikipedia.org/wiki/Palm_Jebel_Ali",
  "verify": true
 },
{
 "id": "princess_tower",
 "name": "Princess Tower",
 "area": "Dubai Marina",
 "fact": "Princess Tower is 413.4 m tall with 101 floors. It was the world's tallest residential building from 2012 to 2015.",
 "bonus": "It was completed in September 2012, and 432 Park Avenue in New York overtook it in 2015.",
 "source": "https://en.wikipedia.org/wiki/Princess_Tower",
 "verify": true
},
{
 "id": "marina_101",
 "name": "Marina 101",
 "area": "Dubai Marina",
 "fact": "Marina 101 is about 425 m tall. Its first 33 floors are a 281-room Hard Rock hotel, and floors 34 to 100 are residential.",
 "bonus": "The 101st floor has a club lounge and restaurant. Construction began in 2006 and stalled when the original developer ran out of capital.",
 "source": "https://en.wikipedia.org/wiki/Marina_101",
 "verify": true
},
{
 "id": "ciel_tower",
 "name": "Ciel Tower",
 "area": "Dubai Marina",
 "fact": "Ciel Tower is the world's tallest hotel-only building, at 377 m with 82 floors and 1,042 rooms.",
 "bonus": "Its silver facade tapers at the top and bottom, with recesses at the apex. The hotel opened in November 2025.",
 "source": "https://en.wikipedia.org/wiki/Ciel_Tower",
 "verify": true
},
{
 "id": "dubai_marina_mall",
 "name": "Dubai Marina Mall",
 "area": "Dubai Marina",
 "fact": "Dubai Marina Mall opened in December 2008 and has 140 retail outlets. It is linked to the JW Marriott Marina hotel.",
 "bonus": "A zipline called XLine runs from the mall into the Marina, starting 170 m above ground and reaching up to 80 km/h.",
 "source": "https://en.wikipedia.org/wiki/Dubai_Marina",
 "verify": true
},
{
 "id": "jbr_walk",
 "name": "The Walk, JBR",
 "area": "JBR",
 "fact": "The Walk at Jumeirah Beach Residence is a 1.7 km strip of shops and restaurants at ground and plaza level. It officially opened in August 2008.",
 "bonus": "Next to it, The Beach is a retail complex with four plazas and about 70 shops and restaurants.",
 "source": "https://en.wikipedia.org/wiki/Jumeirah_Beach_Residence",
 "verify": true
},
{
 "id": "ain_dubai",
 "name": "Ain Dubai",
 "area": "Bluewaters",
 "fact": "Ain Dubai is a 250 m observation wheel on Bluewaters Island, and has been the world's tallest since it opened on 21 October 2021. It has 48 cabins and carries up to 1,750 passengers.",
 "bonus": "It closed in March 2022 for 'periodic enhancements', stayed closed indefinitely from April 2023, and reopened to visitors on 26 December 2024.",
 "source": "https://en.wikipedia.org/wiki/Ain_Dubai",
 "verify": true
},
{
 "id": "bluewaters_island",
 "name": "Bluewaters Island",
 "area": "Bluewaters",
 "fact": "Bluewaters is an artificial island about 400 m off the JBR coast. It opened in November 2018.",
 "bonus": "Madame Tussauds Dubai opened there in September 2021, and the island also has retail, hotels and residences.",
 "source": "https://en.wikipedia.org/wiki/Bluewaters_Island",
 "verify": true
}
];
export const factsFor = id=>LANDMARK_FACTS.find(f=>f.id===id) || null;
