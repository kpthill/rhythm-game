# DJ — a turntable rhythm game

A two-lane turntable rhythm game for the rcade: notes fall toward a hit line;
you answer with taps, holds, doubles (A+B), directional scratches, and
sustained spins across two spinner+button lanes. The app boots straight into
DJ; the earlier prototypes from the multi-game experiment live on behind the
home screen's **prototype vault**.

## About RCade

Built for [RCade](https://rcade.recurse.com), a custom arcade cabinet at The
Recurse Center. Learn more at [github.com/fcjr/RCade](https://github.com/fcjr/RCade).

## Getting Started

```bash
npm install
npm run dev        # Vite on :5173 + the RCade cabinet emulator
```

Verification (the machine-checkable done-signal for changes):

```bash
npm run check      # typecheck + unit tests + build
npm test           # just the tests (vitest)
```

## Project Structure

```
├── public/
│   ├── audio/                 # the collection's shared song (platform + vault games)
│   └── songs/<id>/            # per-song audio for DJ songs
├── src/
│   ├── platform/              # host, input, audio clock, beat timing, menu
│   └── games/
│       ├── dj/                # the headliner
│       │   ├── index.ts       # game flow + rendering
│       │   ├── gesture.ts     # spinner acceleration/pulse detection
│       │   ├── sustain.ts     # hold/spin state machine (lapse + recovery)
│       │   ├── score.ts       # stats, song-relative grades, best scores
│       │   ├── chartstats.ts  # select-screen chart summaries
│       │   ├── recorder.ts    # record-a-take chart authoring
│       │   ├── validate.ts    # two-hand-rule chart checks
│       │   └── songs/<id>/    # per-song folders (timing + charts), auto-discovered
│       └── …                  # mothballed prototypes (the vault)
├── docs/
│   ├── songs.md               # how to add a song + chart
│   ├── specs/                 # design docs
│   └── todos-dj.md            # the working list
├── tools/analyze.py           # aubio beat/BPM analysis for new songs
└── takes/                     # recorded takes (dev-only, gitignored)
```

Pure-logic modules (`timing`, `gesture`, `sustain`, `score`, `recorder`,
`chartstats`, `validate`) are unit-tested; see `*.test.ts` alongside each.

## Adding a song

See [docs/songs.md](docs/songs.md) — per-song folders are auto-discovered, and
the in-game recorder (`R` in dev) turns a performed take into chart source.

## Building

```bash
npm run build      # → dist/, ready for deployment
```
