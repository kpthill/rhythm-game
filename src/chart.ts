import type { NoteEvent } from "./notes";
import type { Direction } from "./input";

// Kevin MacLeod – "In the Hall of the Mountain King" (CC BY 4.0)
export const BPM = 160;
export const SONG_FILE = "/audio/song.mp3";

type Button = "A" | "B";

const A = "A";
const B = "B";
const UP = "UP";
const DOWN = "DOWN";
const LEFT = "LEFT";
const RIGHT = "RIGHT";
const UP_RIGHT = "UP_RIGHT";
const UP_LEFT = "UP_LEFT";
const DOWN_RIGHT = "DOWN_RIGHT";
const DOWN_LEFT = "DOWN_LEFT";

const t = (beat: number, dir: Direction, btn: Button): NoteEvent =>
    ({ beat, direction: dir, button: btn, type: "tap" });

const h = (beat: number, dir: Direction, btn: Button, dur: number): NoteEvent =>
    ({ beat, direction: dir, button: btn, type: "hold", duration: dur });

// All notes are at least 3 beats apart (≥ 1.125 s at 160 BPM).
// First note hits at beat 20 (7.5 s); first visible at beat 16 (6 s).

export const CHART: NoteEvent[] = [
    // ── Warm-up: 4 beats apart (beats 20–44) ─────────────────────────────────
    t(20, UP,         A),
    t(24, RIGHT,      B),
    t(28, DOWN,       A),
    t(32, LEFT,       B),
    t(36, UP,         A),
    t(40, RIGHT,      B),
    t(44, DOWN,       A),

    // ── Intro to diagonals: 3–4 beats apart (beats 48–80) ────────────────────
    t(48, UP_RIGHT,   B),
    t(52, DOWN_RIGHT, A),
    t(56, DOWN_LEFT,  B),
    t(60, UP_LEFT,    A),
    t(64, UP,         B),
    t(68, RIGHT,      A),
    t(72, DOWN,       B),
    t(76, LEFT,       A),
    t(80, UP_RIGHT,   B),

    // ── First holds (beats 84–112) ────────────────────────────────────────────
    h(84,  UP,         A, 2),
    t(89,  RIGHT,      B),
    h(93,  DOWN,       A, 2),
    t(98,  LEFT,       B),
    h(102, UP_RIGHT,   A, 2),
    t(107, DOWN_LEFT,  B),
    h(111, UP_LEFT,    A, 2),

    // ── Cycling all directions, 3 beats apart (beats 116–170) ────────────────
    t(116, UP,         B),
    t(119, UP_RIGHT,   A),
    t(122, RIGHT,      B),
    t(125, DOWN_RIGHT, A),
    t(128, DOWN,       B),
    t(131, DOWN_LEFT,  A),
    t(134, LEFT,       B),
    t(137, UP_LEFT,    A),
    t(140, UP,         B),
    t(143, RIGHT,      A),
    t(146, DOWN,       B),
    t(149, LEFT,       A),
    t(152, UP_RIGHT,   B),
    t(155, DOWN_RIGHT, A),
    t(158, DOWN_LEFT,  B),
    t(161, UP_LEFT,    A),
    t(164, UP,         B),
    t(167, RIGHT,      A),
    t(170, DOWN,       B),

    // ── Mix of taps and holds, 3 beats apart (beats 173–220) ─────────────────
    h(173, UP,         A, 3),
    t(179, DOWN,       B),
    h(182, RIGHT,      A, 3),
    t(188, LEFT,       B),
    h(191, UP_RIGHT,   A, 3),
    t(197, DOWN_LEFT,  B),
    t(200, UP,         A),
    t(203, RIGHT,      B),
    t(206, DOWN,       A),
    t(209, LEFT,       B),
    t(212, UP_RIGHT,   A),
    t(215, DOWN_LEFT,  B),
    t(218, UP_LEFT,    A),

    // ── Final stretch: steady 3s to the end (beats 221–260) ──────────────────
    t(221, UP,         B),
    t(224, RIGHT,      A),
    t(227, DOWN,       B),
    t(230, LEFT,       A),
    h(233, UP,         B, 4),
    t(240, DOWN,       A),
    h(243, RIGHT,      B, 4),
    t(250, LEFT,       A),
    h(253, UP,         B, 4),
    t(260, DOWN,       A),
];
