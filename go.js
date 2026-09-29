// Navigation registry: screens register their openers here and call each other through it,
// which keeps the modules free of circular imports.
export const go = {};
// app-wide UI state shared between modules
export const state = { scope:null, view:'map', pendingJoin:null };
