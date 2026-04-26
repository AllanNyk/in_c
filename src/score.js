// score.js — load Terry Riley's In C from MusicXML, expose patterns to the engine.
//
// Pattern shape (all times are in seconds at TEMPO_BPM):
//   { duration, notes: [{ time, midi, grace? }] }
//
// Grace notes are encoded at (mainNoteTime - GRACE_OFFSET) so they land just before
// their main note. The first iteration of a pattern starting at time T will have its
// initial grace scheduled at T - GRACE_OFFSET; the scheduler should ensure that's
// still in the future (or just skip past notes).

export const TEMPO_BPM = 120;
export const GRACE_OFFSET = 0.0625; // 32nd note at 120 BPM

const SECONDS_PER_QUARTER = 60 / TEMPO_BPM;

const STEP_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Convert a MIDI number to filename note (e.g. 70 -> "as4", 60 -> "c4").
export function midiToFilename(midi) {
  const names = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];
  const octave = Math.floor(midi / 12) - 1;
  return names[midi % 12] + octave;
}

function readPitch(noteEl, transposeSemitones) {
  const pitchEl = noteEl.querySelector('pitch');
  if (!pitchEl) return null;
  const step = pitchEl.querySelector('step').textContent.trim();
  const octave = parseInt(pitchEl.querySelector('octave').textContent, 10);
  const alterEl = pitchEl.querySelector('alter');
  const alter = alterEl ? parseInt(alterEl.textContent, 10) : 0;
  const written = (octave + 1) * 12 + STEP_TO_SEMITONE[step] + alter;
  return written + transposeSemitones;
}

// Parse a MusicXML <part> element into an array of patterns, one per measure.
// Empty/rest-only measures get an empty notes array.
function parsePart(partEl, divisions, transposeSemitones) {
  const measures = Array.from(partEl.querySelectorAll('measure'));
  const patterns = [];

  // Time signature persists across measures — MusicXML only emits <time>
  // when it CHANGES. Likewise for <divisions>.
  let beats = 4, beatType = 4;

  for (const measure of measures) {
    const timeEl = measure.querySelector('time');
    if (timeEl) {
      beats = parseInt(timeEl.querySelector('beats').textContent, 10);
      beatType = parseInt(timeEl.querySelector('beat-type').textContent, 10);
    }
    const divEl = measure.querySelector('divisions');
    if (divEl) divisions = parseInt(divEl.textContent, 10);

    const measureDurationDivisions = (beats * divisions * 4) / beatType;
    const divisionsToSeconds = (d) => (d / divisions) * SECONDS_PER_QUARTER;

    const notes = [];
    let cursor = 0; // in divisions
    let pendingGraceMidi = null;

    const noteEls = Array.from(measure.children).filter(c => c.tagName === 'note');
    for (const noteEl of noteEls) {
      const isGrace = !!noteEl.querySelector('grace');
      const isRest = !!noteEl.querySelector('rest');
      const isChord = !!noteEl.querySelector('chord');
      const tieEl = noteEl.querySelector('tie');
      const tieStop = tieEl && tieEl.getAttribute('type') === 'stop';

      const durEl = noteEl.querySelector('duration');
      const dur = durEl ? parseInt(durEl.textContent, 10) : 0;

      if (isGrace) {
        const midi = readPitch(noteEl, transposeSemitones);
        if (midi != null) pendingGraceMidi = midi;
        continue;
      }

      if (isRest) {
        cursor += dur;
        pendingGraceMidi = null;
        continue;
      }

      // Chord notes share the previous note's onset; rewind cursor for them.
      const onsetDivisions = isChord ? cursor - dur : cursor;
      const onsetSeconds = divisionsToSeconds(onsetDivisions);
      const noteDurationSeconds = divisionsToSeconds(dur);

      const midi = readPitch(noteEl, transposeSemitones);
      if (midi != null) {
        if (pendingGraceMidi != null && !isChord) {
          // Grace plays just before its main note. Time may be negative for the very
          // first note in a pattern; the scheduler handles negative offsets cleanly
          // (they land in the previous loop iteration's tail).
          notes.push({
            time: onsetSeconds - GRACE_OFFSET,
            midi: pendingGraceMidi,
            grace: true,
            duration: GRACE_OFFSET,
          });
          pendingGraceMidi = null;
        }
        if (tieStop && notes.length > 0) {
          // Tied continuation: extend the previous note's duration instead of
          // re-onsetting. (Assumes the prior pushed note is the tied-from note,
          // which holds for the monophonic patterns in this score.)
          notes[notes.length - 1].duration += noteDurationSeconds;
        } else {
          notes.push({ time: onsetSeconds, midi, duration: noteDurationSeconds });
        }
      }

      if (!isChord) cursor += dur;
    }

    patterns.push({
      duration: divisionsToSeconds(measureDurationDivisions),
      notes,
    });
  }

  return patterns;
}

// Load and parse the In C MusicXML file.
// Returns { ostinato, figures } where figures[0]..figures[52] are the 53 figures.
// Bar 1 = ostinato. Bar (2k+1) for k=1..53 = figure k. Even bars are spacers.
export async function loadPatterns(url = 'In C.xml') {
  const xmlText = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`failed to fetch ${url}`);
    return r.text();
  });
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

  const part = doc.querySelector('part');
  if (!part) throw new Error('no <part> in MusicXML');

  // Initial divisions; defaults to 1 if absent (we'll override per-measure if present).
  const initDivEl = part.querySelector('attributes > divisions');
  const divisions = initDivEl ? parseInt(initDivEl.textContent, 10) : 256;

  // Apply transpose octave-change to all sounding pitches.
  const oct = part.querySelector('attributes > transpose > octave-change');
  const transposeSemitones = oct ? parseInt(oct.textContent, 10) * 12 : 0;

  const allPatterns = parsePart(part, divisions, transposeSemitones);

  // Bar 1 = ostinato; the rest of the figures are any subsequent measures with
  // pitched notes. Spacer (rest-only) bars between figures in the score may not
  // alternate strictly — the encoding has occasional double-rest gaps — so we
  // discover figures by content rather than by fixed bar spacing.
  const ostinato = allPatterns[0];
  const figures = allPatterns.slice(1).filter(p => p.notes.length > 0);
  return { ostinato, figures };
}
