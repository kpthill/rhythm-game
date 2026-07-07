# Runner — Game Spec (v2)

> Status: direction agreed 2026-07-06; open-question answers folded in
> 2026-07-07. This is a **major redesign** of the
> `src/games/tuberun/` prototype: from discrete beat-dodge events to a
> continuous-terrain rhythm platformer. Annotate with `xcxc` comments.

## Concept

A rhythm platformer inside a tube. The camera looks down the tube (concentric
rings receding to a vanishing point); a visible **runner avatar** runs on the
tube wall. A continuous **terrain** — a winding path with gaps, obstacles, and
pickups — scrolls toward the player in time with the music.

The core change from v1: you are **always on terrain**, not reacting to
isolated beat events. Steering is continuous path-following; the chart is the
shape of the terrain. Jumps and B-presses land on beats, so playing well feels
like dancing through the track.

## Verbs

- **Steer** — rotate the tube (joystick primary, spinner supported) to follow
  the terrain path. Fine-tuning and curve-following, **not** 90° lurches
  between beats. The path drifts; you track it.
- **Jump** (A) — clear gaps and obstacles. Parabolic arc (~0.8 beats); longer
  gaps demand more precise takeoff timing, which is the natural rhythm
  pressure — no artificial anti-spam rules needed.
- **B-action** (B) — a second verb that can be pressed rapidly in sequence,
  since gravity limits how often you can jump. **Destroy** for the first
  prototype: B blasts an obstacle ahead on the path. Deflect/collect remain
  fallbacks if destroy doesn't play well.

## Playtest takeaways (v1 prototype)

What went wrong (design-level, motivating this redesign):

- Discrete bars/rings weren't enough — the player wants a **whole terrain**
  they stay on continuously.
- No visible runner figure — a dot doesn't create attachment; needs a real
  avatar.
- It was unclear when to jump (gaps didn't read as gaps).
- Rotation was far too fast and disorienting: safe zones 90° apart on
  sequential beats forced jarring back-and-forth. 180°/sec joystick speed is
  too fast.

What survives:

- The core idea is good — tube + music-synced running is worth pulling out.
- Approach-ring perspective gives long readable lookahead (8 beats in v1)
  despite the tiny screen.
- Continuous steering complements DJ's tapping/scratching rather than
  duplicating it.

## Terrain model

The heart of v2. Replaces v1's `gap`/`jump`/`tunnel` beat events.

- Terrain is a **continuous ribbon** on the tube wall: at every beat position
  it has an angular center and width. Between defined points it interpolates,
  so the path curves smoothly.
- The chart authors the ribbon: drifting curves, narrowing sections, gaps that
  must be jumped, obstacles sitting on the path, B-targets.
- **Being off the terrain at any moment is failure** (falling), not a
  per-beat judgment. Rotation matters constantly, not just on beats.
- Gaps must read clearly as holes in the ribbon (v1's "were there supposed to
  be gaps?" problem). Obstacles read as objects standing on it.
- Rendering: ribbon drawn across the approach rings toward the vanishing
  point, runner avatar standing on its near end.

First-prototype numbers: ribbon is **30° wide** and its center changes at most
**30°/s**, so steering stays "following a path", not "yanking". Per-difficulty
width, steering speed, and lookahead distance remain hands-on tuning
parameters.

## Death & progression

- **Instant death** when you fall (miss a gap jump, run off the terrain) —
  with **checkpoints**: death rewinds the song to the last checkpoint and you
  resume from there. Going backward in the song is deliberately distinctive
  vs. the other games' life bars.
- Softer failures cost life instead: an obstacle you fail to destroy drains a
  little life, while falling kills. (Working split — confirm in playtest.)
- Checkpoint spacing: roughly per song section (BPM-section boundaries are
  natural candidates for the shared song).

## Controls

| Input | Action |
|---|---|
| Joystick L/R | Steer (primary; speed tuned well below v1's 180°/sec) |
| Spinner | Steer (supported; some may like it, most won't) |
| A | Jump |
| B | Destroy obstacle ahead |
| START (hold) | Quit to launcher (host-reserved) |

Dual steering support stays (no reason to cut it), but joystick is the
expected primary — the spinner felt unnatural for steering, and DJ owns the
spinner showcase anyway.

## Scoring

- Score × combo for clean jumps, B-hits, and terrain sections survived;
  PERFECT/GOOD timing on jumps relative to gap edges/beats.
- Results grade (S–D like DJ) plus a distance/completion framing — "how far
  did you get" fits the runner fantasy better than raw score alone.
- Detail TBD after terrain prototype plays well.

## Songs

Multiple songs eventually, with a select screen (song → difficulty). v2
development on the shared Mountain King track; a driving/electronic CC track
is a natural addition later (needs `tools/analyze.py` per song).

## Out of scope for now

- 2-player (shared-tube rotation would be chaos; split view won't fit 336px).
- Motion juice (speed lines, camera shake, section color shifts) — deferred
  until the redesigned core is fun; don't polish a moving target.
- Combined rotate+jump set pieces as a designed mechanic — may emerge
  naturally from terrain authoring; revisit later.

## Open questions

- [x] B-action: destroy vs. deflect vs. collect? → **Destroy** for the first
      prototype; validate in play, fall back to deflect/collect if it
      doesn't land.
- [x] Ribbon width / drift-rate numbers? → First prototype: **30° wide, ≤30°/s
      drift**. Steering speed and per-difficulty variants still hands-on.
- [x] Life bar vs. instant death? → **Instant death + checkpoints (song
      rewind)**; possibly life-drain for soft misses (B-targets).
- [x] Does off-beat rotation matter? → **Yes — terrain is continuous.**
- [x] 2P? → **Not for now.**
- [x] Multiple songs? → **Yes, eventually; select screen planned.**

## Milestones

1. **M1 — Terrain core**: ribbon terrain model + rendering, runner avatar,
   continuous on/off-terrain detection, retuned joystick steering, instant
   death + checkpoint rewind. One hand-authored test section. This is the
   "is it fun now?" gate.
2. **M2 — Verbs**: jump vs. gaps with edge-based timing judgment; wire the
   destroy action (B blasts an obstacle ahead); scoring + combo wired to the
   new model.
3. **M3 — Content & shell**: full-song terrain chart, checkpoints at section
   boundaries, difficulty variants, song/difficulty select, results grade.
4. **M4 — Juice**: speed lines, stumble/fall animation polish, section color
   shifts, camera feel.
