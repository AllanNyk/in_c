// roster.js — fixed-order voice roster.
//
// Each entry:
//   instrument: folder under assets/audio/<instrument>/
//   range:      [lowMidi, highMidi] — patterns will octave-transpose to fit
//   color:      base hue for the voice circle (HSL hue 0..360)
//   sustained:  true for tone-holding instruments (winds, bowed strings) —
//               their notes get a gain envelope cut at the written note end so
//               a long sample doesn't bleed into the next note as legato.
//               false (default) for percussive instruments — let their natural
//               decay ring out as recorded.
//
// Voices spawn in this order on each click (after the first). Order groups by
// family — mallets/keyboards first, then plucked, then woodwinds, then strings —
// so the texture accretes in musically natural layers.

export const ROSTER = [
  // Mallets & keyboards
  { instrument: 'vibraphone',  range: [55, 88], color: 200 }, // G3..E6 — cool blue
  { instrument: 'marimba',     range: [48, 84], color: 30 },  // C3..C6 — warm amber
  { instrument: 'celeste',     range: [60, 96], color: 280 }, // C4..C7 — violet
  { instrument: 'harpsichord', range: [48, 72], color: 15 },  // C3..C5 — burnt orange
  { instrument: 'piano',       range: [48, 76], color: 350 }, // C3..E5 — rose (mid/low piano, distinct from the C6 ostinato)

  // Plucked
  { instrument: 'harp',        range: [48, 84], color: 160 }, // C3..C6 — sea green

  // Woodwinds (sustained — envelope cuts at written note end)
  { instrument: 'flute',       range: [60, 84], color: 190, sustained: true }, // C4..C6 — light blue
  { instrument: 'clarinet',    range: [50, 83], color: 240, sustained: true }, // D3..B5 — deep blue
  { instrument: 'oboe',        range: [58, 82], color: 100, sustained: true }, // A#3..A#5 — yellow-green

  // Strings (sustained)
  { instrument: 'cello',       range: [36, 65], color: 320, sustained: true }, // C2..F4 — magenta
  { instrument: 'doublebass',  range: [28, 60], color: 270, sustained: true }, // E1..C4 — deep blue-violet
];
