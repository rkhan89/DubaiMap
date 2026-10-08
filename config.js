// Everything that names or brands the app lives here, so a rename is a one-file change.
// The logo files live in brand-kit/ exactly as supplied (see README, Branding).
export const APP = {
  name: 'Koko',
  version: '2026.10.08a',   // shown in Settings and sent with feedback and error reports
  tagline: 'We were here',
  brand: {
    wordmark: { light:'brand-kit/brand/koko-wordmark-brown.svg', dark:'brand-kit/brand/koko-wordmark-cream.svg' },
    pin: 'brand-kit/brand/koko-pin.svg',
  },
  // production address: share links and the link-preview image (index.html's og tags must match; a test checks)
  siteUrl: 'https://dubai-bites-pi.vercel.app',
  city: 'Dubai',
  // invite links look like <origin>/?join=CODE
  inviteUrl: code => `${location.origin}/?join=${encodeURIComponent(code)}`,
  crewMax: 15,            // you + 14 friends
  crewsPerPerson: 5,      // crews one person can be in
  photoLimit: 300,        // per person, across all their logs
  photosPerLog: 10,
  // Accounts, crews and photos live in Supabase (store.js + cloud.js). The publishable key is
  // meant to be public: what anyone can read or write is decided by the database's row level
  // security (supabase/migrations). Never put the secret key here.
  supabase: { url:'https://crvadsjnqnxlkqzpywva.supabase.co', key:'sb_publishable_9I39ztDfQcQ9dRkTIK392g_zP6HJsVg' },
  // the sample crew (Maya, Omar…) can be switched on in Settings; it only ever exists on that phone
  sampleCrew: true,
  // shown on /terms, /privacy and /data (and in the app). Fill these in before launch.
  legal: { owner:'Rahman', contact:'collectify.app1@gmail.com', city:'the United Arab Emirates',
           law:'the laws of the United Arab Emirates', effective:'1 October 2026' },
  // "Support Koko": a Stripe Payment Link (https://buy.stripe.com/…) and/or a PayPal.me link. Empty = hidden.
  support: { stripe:'', paypal:'https://paypal.me/rhmnkhn' },
  critters: {
    // the fact on a critter still marked needsVerification (critters.js): false shows it with a
    // "being checked" note, true hides it until it's confirmed
    hideUnverifiedFacts: false,
    // a check-in only counts if the phone's location is this good: half the spot's radius,
    // but never stricter than the floor (GPS in town is rarely better than ~20 m)
    accuracyShare: 0.5, accuracyFloorM: 50,
  },
};

/* Where each critter can be caught. PLACEHOLDERS: every coordinate and radius below was estimated
   from the area name in critters.json and has NOT been verified. Check each one on the ground
   before treating it as final, then set placeholder:false.
   trigger: 'checkin'  any check-in while you're inside the radius ("Check in where I am" or a place's Check in)
            'venue'    only a place check-in (a café or venue) inside the radius
   radius in metres: small for a building, large for a reserve. */
export const CRITTER_SPOTS = {
  street_cat:       [{ name:'Satwa',                        lat:25.2215, lng:55.2770, radius:600,  trigger:'checkin', placeholder:true },
                     { name:'Karama',                       lat:25.2440, lng:55.3020, radius:600,  trigger:'checkin', placeholder:true }],
  gecko:            [{ name:'Al Fahidi',                    lat:25.2636, lng:55.2995, radius:250,  trigger:'checkin', placeholder:true }],
  pearl_oyster:     [{ name:'Al Shindagha, the Creek',      lat:25.2680, lng:55.2895, radius:350,  trigger:'checkin', placeholder:true }],
  parakeet:         [{ name:'Zabeel Park',                  lat:25.2330, lng:55.2960, radius:500,  trigger:'checkin', placeholder:true },
                     { name:'Safa Park',                    lat:25.1850, lng:55.2440, radius:450,  trigger:'checkin', placeholder:true }],
  ghost_crab:       [{ name:'Kite Beach',                   lat:25.1590, lng:55.2010, radius:400,  trigger:'checkin', placeholder:true },
                     { name:'Jumeirah Public Beach',        lat:25.2310, lng:55.2560, radius:350,  trigger:'checkin', placeholder:true }],
  flamingo:         [{ name:'Ras Al Khor',                  lat:25.1870, lng:55.3340, radius:1200, trigger:'checkin', placeholder:true }],
  falcon:           [{ name:'Etihad Museum',                lat:25.2390, lng:55.2740, radius:150,  trigger:'checkin', placeholder:true }],
  hawksbill_turtle: [{ name:'Burj Al Arab, Madinat',        lat:25.1350, lng:55.1860, radius:500,  trigger:'checkin', placeholder:true }],
  arabian_horse:    [{ name:'Meydan',                       lat:25.1570, lng:55.2990, radius:700,  trigger:'checkin', placeholder:true }],
  camel:            [{ name:'Nad Al Sheba',                 lat:25.1500, lng:55.3300, radius:1000, trigger:'checkin', placeholder:true },
                     { name:'Al Marmoom',                   lat:24.8170, lng:55.4300, radius:1500, trigger:'checkin', placeholder:true }],
  arabian_oryx:     [{ name:'Al Qudra Lakes',               lat:24.8390, lng:55.3770, radius:2000, trigger:'checkin', placeholder:true }],
  sand_gazelle:     [{ name:'Desert Conservation Reserve',  lat:24.8250, lng:55.6650, radius:5000, trigger:'checkin', placeholder:true }],
};
