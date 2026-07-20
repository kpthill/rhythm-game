# DJ — Next steps

Working list, brainstormed 2026-07-10. Roughly ordered later; capture first.

## Todos

### Recording mode

- [ ] Write takes to a local directory (via a Vite dev endpoint) instead of console/clipboard.
- [ ] Recording picker: choose among saved takes when testing.
- [ ] "Go back 10 seconds" buttons — replay from there, or punch in and re-record from there.
- [ ] Show beats as lines scrolling down the lanes (replace the screen-flash beat indicator).
- [ ] Zoom-out mode: see many notes side by side; jump to a section to test or edit it.
- [ ] Loop a section (e.g. an 8-beat range) hands-free while practicing/adjusting it.

### Indicators during play

- [ ] Scratches: full-track-width bars instead of circles, rendered *underneath* A/B
      notes (they can coincide with button presses). Direction = color + arrow
      decoration, e.g. right scratch = green bar with right-pointing arrows.
- [ ] Spins: light up the whole track background for the duration — strongly
      decorated start time, clearly readable continuation.
- [ ] All input indicators (buttons, scratches, spins, …) flash/light up on a
      correct hit; distinct color or flash effect for better-timed (PERFECT) hits.
- [ ] Holds: bright while *approaching*, not only while held — cabinet colors are
      dimmer than the dev screen and the pale scheme washes out. Consider flipping
      the state indicator: boundary color change when pressed vs. approaching.

### Responsiveness

- [x] Scratches/spins are too "free" on the cabinet: spinner momentum keeps it
      turning, so e.g. two right scratches in a row only need one physical input.
      Require **acceleration** for a scratch: starting from rest / changing
      direction (as now), or — new — speeding up while already moving in the same
      direction. Makes right-scratch → right-scratch a real input, and lets us
      judge scratch/spin *timing* ("does it accelerate at this moment") instead of
      just "is it spinning". (gesture.ts v3: two-window rate comparison,
      edge-triggered pulses; unit-tested.)
- [x] Spins: require a timed input at onset (same acceleration logic), not just
      "already spinning when the note arrives". (`spinPulse` is now the spin
      note's entry input; sustain still uses the activity detector.)
- [x] Keyboard/joystick unchanged: tap = scratch, hold = spin, judged with the
      same timing strictness (holding through a note without a fresh input ≠ hit).
      The emulator's spinner keys (`c`/`v` for spinner 1, `.`/`/` for spinner 2)
      should behave this way too — verify they arrive as step deltas and get the
      same acceleration treatment. (Fallback press = surge from rest, hold =
      steady rate → correct semantics fall out of the acceleration rule; unit-
      tested. Emulator keys share the spinnerDelta path — worth one live sanity
      check on the dev setup.)

### Spins / holds feedback

- [x] Hold release grace: ~1 beat to recover an accidentally released hold — tail
      flashes red during the grace window; re-press within it to keep the note.
      (sustain.ts state machine; recovery downgrades the entry grade to GOOD.)
- [x] Spin lapse recovery: when the spin slows down (rare on cabinet) or simply
      hasn't accelerated in a while, flash and demand a fresh spin — make sustains
      feel like an *active question*, not a passive state. (Lapsed spins flash
      red + "SPIN!" and only a fresh acceleration pulse revives them.)
- [ ] Open question: should spins always require frequent re-acceleration (a
      steady cadence of inputs), rather than only when momentum decays enough to
      register as slowing?

### Multi-chart support

- [ ] Select among multiple songs, and among multiple charts per song.
- [ ] Reorganize songs + charts into folders (per-song directory holding audio,
      timing data, and its charts).
- [ ] Select-screen niceties from other rhythm games:
  - [ ] Song preview plays while a song is highlighted.
  - [ ] Song info on selection: length, BPM.
  - [ ] Chart summary stats on selection: note count, note-type breakdown,
        note density, maybe more.
  - [ ] Eventually: a difficulty measure computed from the chart.
- [ ] Community songs from RC folks via PR:
  - [ ] Documentation: how to make and test a song.
  - [ ] Clean up the tools (`tools/analyze.py` etc.) for outside users.
  - [ ] GitHub Action for song PRs — investigate an LLM reviewer that
        auto-approves recurser PRs that only add a song in the right format.
  - [ ] Check copyright implications of community-submitted songs.

### Platform

- [ ] **DJ is the winner** of the multi-game experiment — make it front and
      center: boot straight into DJ, with the other prototypes mothballed behind
      a sub-sub-option off the main screen (kept as a novelty).
- [ ] Rename the game (and possibly the repo) to match its new headliner status.
- [ ] Platform separation follow-through: old song + charts move to an isolated
      folder that supports the mothballed games; DJ gets the new per-song folder
      structure (see Multi-chart support).
- [ ] Runner gets mothballed too — DJ is the sole focus.

### Productionizing

- [ ] Refactor the current bag of js files into modules with clear dependencies,
      to support iterative development of everything above. (Not fully thought
      through yet — needs a design pass.)
- [x] Unit tests for all modules, so agents don't introduce regressions as they
      iterate. (vitest wired up as `npm test`; `npm run check` = typecheck +
      test + build is the done-signal. Pure-logic modules covered:
      timing, gesture, recorder, chart validation. Grow coverage as modules
      are added/refactored.)

### Web interface

- [ ] rcade games are playable on computers too — look into publishing this one:
      can this Vite app bundle as a static site (needed for GitHub Pages)?
- [ ] Web-play niceties (open questions for later):
  - [ ] Detect touchpad swipes and interpret them as spinner moves?
  - [ ] How does the game change with only one touchpad — single-lane web
        variant? Remap the second lane?

### Scoring and life

- [ ] DDR-like life: start at half; lose life on misses, gain it back through
      strings of good hits.
- [ ] Show the score on screen during play.
- [ ] Death = grade "FAILED", regardless of score.
- [ ] Grades relative to the song, not raw score thresholds:
  - S: near-full combo, most notes properly timed.
  - A: few dropped notes (or more drops offset by a higher proportion of
    perfects).
  - B: common. C: you struggled. D: barely scraped through.
  - Maybe SS / SSS: full combo with mostly / fully perfect timings.
- [ ] Pressing unnecessary notes hurts score but not life.
- [ ] Results screen with run stats: life/score/accuracy graph over the song, or
      counts of note types hit + accuracy breakdown (more thinking needed).
- [ ] High scores: no DB, but hold session-scoped scores and show in song
      select. Or localStorage — check whether the rcade cabinet persists it.

### Agent strategy

This project doubles as a test case for semi-ambitious agent-driven development.

- [ ] Decide where agents run (local sessions / Hetzner VPS / Claude Code
      routines / CI). VPS idea: ssh + tmux, possibly even for interactive
      sessions — persistent, survives laptop sleep, overnight-friendly.
- [ ] Test Claude Code routines (scheduled cloud agents) and understand how they
      differ from self-hosted VPS runs.
- [ ] Make full use of the Max plan (the $100 tier). Set up auto-retry that
      resumes work after the usage-limit window resets (limits reset every few
      hours) instead of dying at the first limit hit.
- [ ] Verify: when running remotely (VPS / routines / CI), what uses plan
      capacity vs. API credits?
- [x] Verification strategy for agent work: every task needs a machine-checkable
      done-signal (typecheck + build + unit tests + targeted checks); agents
      don't merge/finish without it. (`npm run check` is that signal.)
- [ ] Work tracking: is todos.md enough, or adopt something like beads?

## Future directions

- [ ] Cabinet top display board: something cute — current song, score, a little
      animation (record spinning? EQ bars bouncing to the beat?).
- [ ] Test colors on the actual cabinet (dev screens read brighter; holds washed
      out, though most of the game reads fine).
- [ ] Investigate why dj washes out on the cabinet when other games don't —
      deprioritized for now.
- [ ] Automatic chart generation from music. Two angles: ML (à la Dance Dance
      Convolution — learned onset/step placement), or good instructions for an
      AI agent — how to use aubio (`tools/analyze.py` precedent) to extract beat
      timings / onsets and generate interesting, playable step files from them.

## Suggested (Claude — take or leave)

- Recorder QoL: "T = play last take" from the take-captured screen (localStorage), skip the paste round-trip while iterating on a chart.
- Judgment feedback pass: hit/miss flash on the hit line itself, not just the floating text — eyes are on the hit line during play.
- Count-in on game start (4 metronome ticks before beat 0) so the first notes aren't a cold open.
