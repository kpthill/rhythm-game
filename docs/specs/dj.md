# DJ — Game Spec (v2)

> Status: direction agreed 2026-07-06; open-question answers folded in
> 2026-07-07. v2 = vertical redesign of the `src/games/dj/` prototype.
> Annotate with `xcxc` comments.

## Concept

A turntable scratch rhythm game built around the cabinet's **spinner(s)**.
Notes stream **top-to-bottom** in vertical lanes toward a hit line above a
spinning platter. The vertical orientation exists for a reason: it lets us run
**two side-by-side note streams** — left lane on player 1's controls, right
lane on player 2's — with one player straddling both. **This is the normal way
the game plays**, not a special expert mode.

The fantasy: you're a DJ riding the track, punctuating the song with scratches.
The spinner is the star — this is the game that justifies the cabinet's unusual
hardware.

## Verbs

Four note types:

- **Tap** — press A or B (or **both together**, shown as a double note) as the
  note crosses the hit line.
- **Hold** — hold A or B for the note's duration. Rendered as an A/B note with
  a tail.
- **Scratch** — spin the platter CW or CCW (direction shown by an arrow on the
  note) as the note crosses the line. Direction matters.
- **Spin** — keep the spinner continuously turning for a sustained period,
  potentially while tapping other notes. This is the sustained counterpart of
  scratch. While active it **colors the entire note stream** (the whole lane it
  applies to) until it ends, and the game gives visible feedback as the spinner
  slows down so the player knows to keep it going.

## Playtest takeaways (v1 prototype)

- Notes are clear and well drawn — keep the note visual language.
- The spinner scratch is a physical, satisfying motion no other prototype has.
- A single lane with a fixed hit line is highly readable at 336×262 (the
  problem that killed the original tunnel design).

## Layout (v2)

- Notes fall top-to-bottom; hit line near the bottom, platter below/beside it.
- **Two lanes, always**: left lane = P1 spinner + buttons, right lane = P2
  spinner + buttons, one player straddling both. Spin notes color their own
  lane's stream.
- Lane charts are **independent but synchronized** — authored as two parts of
  one arrangement, so the two hands feel like playing one song.
- **Two-hand rule**: of the four control groups (left buttons, left spinner,
  right buttons, right spinner), the chart activates **at most two at a
  time**.
- Button lane split within a stream: A notes and B notes color-coded as today
  (blue/orange); double notes span both.

## Controls

| Input | Action |
|---|---|
| Spinner CW / CCW | Scratch (matching note direction) |
| Spinner continuous | Spin (sustained) |
| A / B | Tap; hold for Hold notes; both together for double notes |
| Joystick tap L/R | Scratch fallback (LEFT = CCW, RIGHT = CW) |
| Joystick hold L/R | Spin fallback |
| START (hold) | Quit to launcher (host-reserved) |

**Joystick fallback is always supported**: a tap of the direction is a scratch,
holding the direction is a spin. This doubles as the dev/laptop testing path.

## Timing, scoring, life

- Timing: ±0.45-beat hit window, PERFECT under 55% of the window (carry over
  from v1 unless playtest says otherwise).
- Score = points × combo (300 perfect / 100 good).
- Life: −0.08 per miss, fail at 0, **and slow recovery — successful hits
  regain life** so a rough patch isn't a death sentence.
- Hold/spin notes: **all-or-nothing sustain judging** — entry timing sets the
  grade; dropping the hold / letting the spinner stall past a short grace
  (~¼ beat) downgrades to MISS. Scoring detail is deprioritized: pick simple
  rules and move on.

## Song / difficulty select

Add a selection screen (like the other prototypes have): pick song, then
difficulty. Ship v2 with the shared Mountain King track; more songs eventually
(a breaks/funk CC track would fit the DJ fantasy — needs `tools/analyze.py`
re-run per song). All tiers use the two-lane layout; difficulty scales chart
density and how hard the two-hand rule works you:

- **Normal** — sparse; mostly one lane demanding attention at a time; taps +
  scratches + holds.
- **Hard** — adds spins and double notes; denser, more simultaneous
  two-group moments.
- **Expert** — full density, frequent control-group switches (still within
  the two-hand rule).

## Known issues carried from v1 (fix in v2 core)

1. **Joystick fallback is half-wired.** `flickFrames` is tracked but never used
   in detection — a flick only counts on the exact frame the direction goes
   down. v2's tap/hold fallback semantics replace this outright.
2. **Scratch detection is instantaneous.** One frame ≥ 3 spinner steps counts.
   Detection should accumulate delta over a short window (~100ms gesture) so
   slow-but-deliberate spins register — and spin notes need exactly this
   accumulator plus a stall detector.
3. **No feedback tying the platter to gameplay.** Add scratch SFX (or brief
   playback-rate wobble) on successful scratches; platter/lane visual response
   on spins. Better feedback generally is an open workstream.

## Cut

- Crossfader moments (B held as a fader) — no appeal, cut.
- "Direction runs" as a distinct mechanic — subsumed by spin notes.

## Open questions

- [x] Spinner-required vs. fallback? → **Joystick fallback always** (tap =
      scratch, hold = spin).
- [x] Does scratch direction matter? → **Yes.**
- [x] Chart select? → **Yes, song + difficulty select screen.**
- [x] New songs — eventually; not a v2 blocker.
- [x] Sustain-judging rules for hold/spin? → **All-or-nothing** (entry grade;
      stall past grace = MISS). Scoring is deprioritized for now.
- [x] Two-lane mode: mirrored or independent charts? → **Independent but
      synchronized**, and two lanes are the **normal way the game plays**, not
      an expert mode. Chart authoring follows the **two-hand rule** (at most
      two of the four control groups active at a time).

## Milestones

1. **M1 — Core rework**: vertical **two-lane** layout on both control sets;
   scratch gesture detection (accumulated delta + stall detection); joystick
   tap/hold fallback; life recovery on hits.
2. **M2 — New verbs**: hold notes, spin notes (lane coloring + slow-down
   feedback), double notes; scratch SFX; charts rewritten to showcase them
   under the two-hand rule.
3. **M3 — Shell**: song/difficulty select screen, Normal/Hard/Expert charts,
   results polish.
4. **M4 — Feedback & juice**: platter/lane visual response on spins,
   playback-rate wobble, general feedback polish.
