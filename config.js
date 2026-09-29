// Everything that names or brands the app lives here, so a rename is a one-file change.
// The logo is the single asset logo.svg (also used as the favicon).
export const APP = {
  name: 'Dubai Bites',
  tagline: 'your scrapbook of the city',
  logo: 'logo.svg',
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
