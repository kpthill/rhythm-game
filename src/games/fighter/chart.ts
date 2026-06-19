// Fighter chart for the shared song (vendored). Song timing (OFFSET/BPMS/STOPS/
// SONG_LENGTH_BEATS) lives in platform/song.ts; this is just the fight choreography.
//
// One ordered timeline that INTERLEAVES attack combos and defend telegraphs so the
// fight reads as a back-and-forth. Adapted from tunnel's GROOVE structure across the
// three BPM sections.

import type { FightEvent, AttackEvent, DefendEvent, Button, DefenseDir } from "./events";
import type { Direction } from "../../platform/input";

const A: Button = "A";
const B: Button = "B";
const UP: Direction = "UP";
const DOWN: Direction = "DOWN";
const LEFT: Direction = "LEFT";
const RIGHT: Direction = "RIGHT";
const UP_RIGHT: Direction = "UP_RIGHT";
const DOWN_RIGHT: Direction = "DOWN_RIGHT";

// Attack combo: list of [beatOffsetFromStart, direction, button]; first step pins beat.
const atk = (
    startBeat: number,
    steps: [number, Direction, Button][],
): AttackEvent => ({
    kind: "attack",
    beat: startBeat,
    steps: steps.map(([off, dir, btn]) => ({
        beat: startBeat + off,
        direction: dir,
        button: btn,
    })),
});

// Defend telegraph: opponent strikes ON `beat`; player must give `defense` then.
const def = (beat: number, defense: DefenseDir): DefendEvent => ({
    kind: "defend",
    beat,
    defense,
});

export type ChartDef = { name: string; events: FightEvent[] };

// ── ROUND ONE — the full-song fight ──────────────────────────────────────────────
// Authored so attack windows and defend windows alternate. Spacing keeps the lane
// uncluttered: at most one active event near the strike line at a time.
const ROUND_ONE: FightEvent[] = [
    // ── Section 1: 108 BPM (beats ~3–115) ── opening: trade light blows ──────────
    atk(3,  [[0, UP, A], [2, UP, A]]),          // jab, jab
    def(8,  "LEFT"),                             // weave left
    atk(11, [[0, RIGHT, A], [2, RIGHT, B]]),    // cross
    def(16, "DOWN"),                             // duck

    atk(19, [[0, UP, A], [1, RIGHT, A], [2, DOWN, B]]),  // 3-hit combo
    def(25, "UP"),                               // block
    def(28, "RIGHT"),                            // weave right

    atk(31, [[0, LEFT, A], [1, UP, A], [2, RIGHT, B]]),
    def(37, "DOWN"),
    atk(40, [[0, DOWN_RIGHT, A], [2, UP_RIGHT, B]]),
    def(45, "LEFT"),

    atk(48, [[0, UP, A], [1, RIGHT, A], [2, DOWN, A], [3, LEFT, B]]),  // 4-hit
    def(54, "UP"),
    def(57, "DOWN"),

    atk(60, [[0, RIGHT, A], [2, LEFT, B]]),
    def(65, "RIGHT"),
    atk(68, [[0, UP, A], [1, DOWN, B], [2, UP, A], [3, DOWN, B]]),
    def(75, "LEFT"),

    atk(79, [[0, RIGHT, A], [1, UP, A], [2, LEFT, B]]),
    def(85, "DOWN"),
    def(88, "UP"),

    atk(91, [[0, DOWN, B], [1, RIGHT, A], [2, UP, B], [3, LEFT, A]]),  // flurry
    def(98, "RIGHT"),
    atk(101, [[0, UP, A], [2, DOWN, B]]),
    def(106, "UP"),
    def(109, "LEFT"),
    atk(112, [[0, RIGHT, A], [1, UP, B]]),

    // ── Section 2: 126.6 BPM (from beat ~115.6) ── the fight heats up ────────────
    atk(117, [[0, UP, A], [2, UP, A], [4, UP, B]]),
    def(123, "DOWN"),
    def(126, "RIGHT"),

    atk(129, [[0, UP, A], [1, RIGHT, A], [2, DOWN, A], [3, LEFT, B]]),
    def(135, "UP"),
    atk(138, [[0, DOWN, B], [1, RIGHT, A], [2, UP, B]]),
    def(144, "LEFT"),
    def(147, "DOWN"),

    atk(150, [[0, UP, A], [1, RIGHT, B], [2, DOWN, A], [3, LEFT, B]]),  // fast flurry
    def(157, "RIGHT"),
    def(160, "UP"),
    atk(163, [[0, DOWN, A], [1, LEFT, B], [2, UP, A]]),

    def(168, "DOWN"),
    // → STOP ~170
    atk(171, [[0, LEFT, B], [1, UP, A], [2, DOWN, B]]),
    def(177, "UP"),
    def(180, "LEFT"),

    atk(183, [[0, RIGHT, A], [2, DOWN, B]]),
    def(188, "RIGHT"),
    atk(191, [[0, UP, A], [1, DOWN, B]]),
    // → STOP ~192
    def(196, "DOWN"),
    atk(199, [[0, RIGHT, A], [1, UP, B], [2, LEFT, A]]),

    def(205, "UP"),
    def(208, "RIGHT"),
    atk(211, [[0, UP, B], [1, DOWN, A]]),

    // ── Section 3: 86.3 BPM (from beat ~212.5) ── the finishing exchange ─────────
    def(216, "DOWN"),
    // → STOP ~215 / 225
    atk(218, [[0, DOWN, B], [2, UP, A]]),
    def(223, "LEFT"),
    atk(226, [[0, LEFT, B], [1, UP, A], [2, DOWN, B], [3, RIGHT, A]]),
    // → STOP ~232
    def(235, "UP"),
    atk(238, [[0, DOWN, A], [1, UP, B], [2, RIGHT, A]]),
    def(244, "DOWN"),

    atk(247, [[0, LEFT, B], [1, UP, A], [2, RIGHT, B]]),
    def(253, "RIGHT"),
    // FINISHER — big combo
    atk(257, [[0, UP, A], [1, RIGHT, A], [2, DOWN, A], [3, LEFT, A], [4, UP, B]]),
    def(265, "UP"),
];

export const CHARTS: ChartDef[] = [
    { name: "ROUND ONE", events: ROUND_ONE },
];
