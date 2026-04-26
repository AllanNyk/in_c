// score.js — pattern data for Phase 0.
// Times are in seconds, assuming a base tempo of 120 BPM (quarter = 0.5s, eighth = 0.25s).
// Phase 1 will replace this with a MusicXML parser.

// 32nd-note grace ornament length at 120 BPM = 0.0625s
const GRACE = 0.0625;

// Eighth-note ostinato on high C piano. One pulse per pattern; the scheduler loops it.
export const OSTINATO = {
  duration: 0.25, // one eighth at 120 BPM
  notes: [{ time: 0, pitch: 'c6' }],
};

// Figure 1: in 3/4, three iterations of (grace C → quarter E).
// MusicXML encodes the C as a grace note before each quarter E.
export const FIGURE_1 = {
  duration: 1.5, // three quarters at 120 BPM
  notes: [
    { time: 0.0,           pitch: 'c4', grace: true },
    { time: GRACE,         pitch: 'e4' },
    { time: 0.5,           pitch: 'c4', grace: true },
    { time: 0.5 + GRACE,   pitch: 'e4' },
    { time: 1.0,           pitch: 'c4', grace: true },
    { time: 1.0 + GRACE,   pitch: 'e4' },
  ],
};
