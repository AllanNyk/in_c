// roster.js — fixed-order voice roster.
//
// Each entry:
//   instrument: folder under assets/audio/<instrument>/
//   range:      [lowMidi, highMidi] — patterns will octave-transpose to fit
//   color:      base hue for the voice circle (HSL hue 0..360)
//
// Voices spawn in this order on each click (after the first). Instruments not yet
// generated are skipped at runtime so the player only ever spawns voices we can hear.

export const ROSTER = [
  // Mallets / keyboards (Phase 1 sonic palette)
  { instrument: 'vibraphone',  range: [55, 88], color: 200 }, // G3..E6 — cool blue
  { instrument: 'marimba',     range: [48, 84], color: 30 },  // C3..C6 — warm amber
  { instrument: 'celeste',     range: [60, 96], color: 280 }, // C4..C7 — soft violet
  { instrument: 'harp',        range: [48, 84], color: 160 }, // C3..C6 — sea green

  // Future roster slots (uncomment after generating their sample banks in build_samples.sh):
  // { instrument: 'harpsichord',  range: [55, 84], color: 50 },
  // { instrument: 'glockenspiel', range: [72, 96], color: 60 },
  // { instrument: 'crotales',     range: [72, 96], color: 90 },
  // { instrument: 'piano',        range: [48, 72], color: 0 },  // mid/low piano (distinct from ostinato)
  // { instrument: 'flute',        range: [60, 84], color: 220 },
  // ...
];
