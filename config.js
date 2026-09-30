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
  photoLimit: 300,        // per person, across all their logs
  photosPerLog: 10,
  // No accounts backend yet: sign-in, crews and photos live on this device only.
  // When Supabase is connected this flips to false and store.js talks to the server.
  previewMode: true,
};
