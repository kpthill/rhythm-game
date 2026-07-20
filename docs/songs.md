# Adding a song to DJ

Songs are auto-discovered: adding one means creating a folder — no registry
edits.

## Layout

```
src/games/dj/songs/<song-id>/
├── index.ts     # default-exports a SongDef (metadata + timing + chart list)
└── charts.ts    # note data (by convention; index.ts imports it)
public/songs/<song-id>/
└── audio.mp3    # the track (any format the browser decodes)
```

## 1. Analyze the audio

Timing data (offset / BPMs / stops) comes from the track. `tools/analyze.py`
uses [aubio](https://aubio.org/) to detect beats:

```bash
python3 tools/analyze.py public/songs/<song-id>/audio.mp3
```

It reports the first downbeat (→ `offset`), a BPM map, and candidate stops.
Sanity-check by ear — aubio is good but not gospel.

## 2. Describe the song

`src/games/dj/songs/<song-id>/index.ts`:

```ts
import type { SongDef } from "../types";
import { CHART_MAIN } from "./charts";

const song: SongDef = {
    id: "<song-id>",             // folder name
    title: "Song Title",
    artist: "Artist",
    audioFile: "/songs/<song-id>/audio.mp3",
    offset: 1.234,               // seconds where beat 0 lands
    bpms: [[0, 120.0]],          // [beatStart, bpm], sorted, first at beat 0
    stops: [],                   // [beat, pauseSeconds]
    lengthBeats: 200,
    previewSeconds: 45,          // where the select-screen preview starts
    charts: [
        { id: "main", name: "main", events: CHART_MAIN },
    ],
};

export default song;
```

## 3. Chart it

Two ways:

- **Record a take** (recommended): run `npm run dev`, pick your song, press
  `R`, and perform the chart on the controls. Stop with `R`; the take is
  quantized to the half-beat grid and copied as paste-ready `charts.ts`
  source. Iterate.
- **Hand-author**: write `NoteEvent`s directly (see an existing `charts.ts`
  for the `tap`/`hold`/`dbl`/`sc`/`spin` helpers).

Rules of thumb:

- **Two-hand rule**: within one lane, button notes (tap/hold/double) must not
  overlap spinner notes (scratch/spin) — one hand can't do both. The dev
  console warns on violations.
- Both lanes belong to one player; simultaneous left+right action is the fun
  part, but keep it humanly possible.

## 4. Check it

```bash
npm run check     # typecheck + unit tests + build
npm run dev       # play it
```

Chart stats (note counts, density) show on the chart-select screen —
useful for judging difficulty at a glance.
