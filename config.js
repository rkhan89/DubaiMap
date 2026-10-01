// Everything that names or brands the app lives here, so a rename is a one-file change.
// The logo files live in brand-kit/ exactly as supplied (see README, Branding).
export const APP = {
  name: 'Koko',
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
  legal: { owner:'', contact:'', city:'Dubai, United Arab Emirates',
           law:'the laws of the United Arab Emirates as applied in the Emirate of Dubai', effective:'1 October 2026' },
  // "Support Koko": a Stripe Payment Link (https://buy.stripe.com/…) and/or a PayPal.me link. Empty = hidden.
  support: { stripe:'', paypal:'' },
};
