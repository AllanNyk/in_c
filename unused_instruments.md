# Unused instrument banks

These instruments have generated MP3 banks under `assets/audio/<instrument>/`
and live entries in `tools/build_samples.sh`, but are **not** currently part of
the active roster (`src/roster.js`). Listed here so we don't forget they exist
and can drop them back in (or swap them with active voices) without a rebuild.

## Crotales

- Folder: `assets/audio/crotales/` (MIDI 84–96, chromatic)
- Source: Sonatina `Samples/Crotales/crotale-<note>-ff.flac`, sampled at
  minor thirds and pitch-shifted by `tools/build_samples.sh`.
- Character: high metallic shimmer, very ringy decay.
- Why benched: too insistent in the texture at the current mix levels.
  The bell-like attack carries through everything else.
- Considered range: `[84, 96]` (C6..C7).
- Considered color: hue 60 (gold).

To restore: re-add to `ROSTER` in `src/roster.js`. Suggested entry:

```js
{ instrument: 'crotales', range: [84, 96], color: 60 },
```
