// Tunnel charts for the shared song (vendored). Song timing (OFFSET/BPMS/STOPS/
// SONG_LENGTH_BEATS) lives in platform/song.ts; these are just the note patterns.

import type { NoteEvent } from "./notes";
import type { Direction } from "../../platform/input";

type Button = "A" | "B";

const A = "A";
const B = "B";
const UP           = "UP";
const DOWN         = "DOWN";
const LEFT         = "LEFT";
const RIGHT        = "RIGHT";
const UP_RIGHT     = "UP_RIGHT";
const UP_LEFT      = "UP_LEFT";
const DOWN_RIGHT   = "DOWN_RIGHT";
const DOWN_LEFT    = "DOWN_LEFT";

const t = (beat: number, dir: Direction, btn: Button): NoteEvent =>
    ({ beat, direction: dir, button: btn, type: "tap" });

const h = (beat: number, dir: Direction, btn: Button, dur: number): NoteEvent =>
    ({ beat, direction: dir, button: btn, type: "hold", duration: dur });

export type ChartDef = { name: string; notes: NoteEvent[] };

// ── Classic chart ──────────────────────────────────────────────────────────────
// Every other beat, includes diagonals and holds.
const CHART_CLASSIC: NoteEvent[] = [
    t(3,    UP,         A),
    t(5,    UP,         A),
    t(7,    UP,         A),
    t(9,    UP,         A),

    t(11,   UP,         A),
    t(11.5, UP,         A),   // burst triplet
    t(12,   UP,         A),
    t(13,   UP,         A),
    t(15,   UP,         A),
    h(17,   UP,         A, 1.5),

    t(19,   UP,         A),
    t(21,   UP,         B),
    t(23,   UP,         A),
    t(25,   UP,         B),

    t(27,   UP,         A),
    t(27.5, UP,         B),   // burst triplet
    t(28,   UP,         A),
    t(29,   UP,         A),
    t(31,   UP,         A),
    t(33,   UP,         A),

    t(35,   UP_RIGHT,   A),
    t(37,   RIGHT,      A),
    t(39,   DOWN_RIGHT, A),
    t(41,   DOWN,       A),
    t(43,   DOWN_LEFT,  A),
    t(45,   LEFT,       A),
    t(47,   UP_LEFT,    A),

    t(49,   UP,         A),
    t(51,   UP,         A),
    t(53,   UP,         A),
    t(55,   UP,         A),
    t(57,   UP,         A),
    t(59,   UP,         A),
    t(61,   UP,         A),
];

// ── Fast chart ─────────────────────────────────────────────────────────────────
// Every beat, cardinal directions only (no diagonals), A/B alternating.
const DIRS_CARDINAL = ["UP", "RIGHT", "DOWN", "LEFT"] as const;
const CHART_FAST: NoteEvent[] = Array.from({ length: 61 }, (_, i) =>
    t(3 + i, DIRS_CARDINAL[i % 4], i % 2 === 0 ? A : B)
);

// ── Groove chart ───────────────────────────────────────────────────────────────
// Full-song chart. Covers all three BPM sections.
const CHART_GROOVE: NoteEvent[] = [
    // ── Section 1: 108 BPM (beats 1–115) ─────────────────────────────────────
    t( 3, UP,    A),
    t( 7, UP,    A),
    t(11, UP,    A),
    t(15, UP,    A),

    t(17, UP,    A),  t(19, DOWN,  A),
    t(21, UP,    A),  t(23, DOWN,  A),
    t(25, UP,    A),  t(27, DOWN,  A),
    t(29, UP,    A),  t(31, DOWN,  A),

    t(33, LEFT,  A),  t(35, UP,    A),
    t(37, RIGHT, A),  t(39, DOWN,  A),
    t(41, LEFT,  A),  t(43, UP,    A),
    t(45, RIGHT, A),  t(47, DOWN,  A),

    t(49, UP,    A),  t(50, RIGHT, A),  t(51, DOWN,  A),  t(52, LEFT,  A),
    t(53, UP,    A),  t(54, RIGHT, A),  t(55, DOWN,  A),

    t(57, UP,    A),  t(59, RIGHT, A),
    t(61, DOWN,  A),  t(63, LEFT,  A),
    t(65, UP,    A),  t(67, RIGHT, A),

    t(69, UP,    A),  t(70, RIGHT, B),  t(71, DOWN,  A),  t(72, LEFT,  B),
    t(73, UP,    A),  t(74, RIGHT, B),  t(75, DOWN,  A),  t(76, LEFT,  B),
    t(77, UP,    A),  t(78, RIGHT, B),  t(79, DOWN,  A),
    h(80, LEFT,  B, 2),

    t(83, UP,    A),  t(84, RIGHT, B),  t(85, DOWN,  A),  t(86, LEFT,  B),
    t(87, UP,    A),

    t(93, DOWN,  B),  t(94, RIGHT, A),  t(95, UP,    B),  t(96, LEFT,  A),
    t(97, DOWN,  B),  t(98, RIGHT, A),  t(99, UP,    B),  t(100, LEFT, A),
    h(101, UP,   A, 2),
    t(103, RIGHT, B), t(104, DOWN,  A), t(105, LEFT,  B), t(106, UP,   A),
    t(107, DOWN, B),  t(108, RIGHT, A), t(109, UP,    B), t(110, LEFT, A),
    t(111, DOWN, B),  t(112, RIGHT, A), t(113, UP,    B),

    // ── Section 2: 126.6 BPM (from beat 115.6) ───────────────────────────────
    t(117, UP,   A),  t(119, UP,   A),  t(121, UP,   A),
    t(123, UP,   A),  t(125, UP,   A),  t(127, UP,   A),

    t(129, UP,   A),  t(130, RIGHT, A), t(131, DOWN,  A), t(132, LEFT,  A),
    t(133, UP,   A),  t(134, RIGHT, A), t(135, DOWN,  A), t(136, LEFT,  A),

    t(137, UP,   A),  t(138, DOWN,  B), t(139, RIGHT, A), t(140, LEFT,  B),
    t(141, UP,   A),  t(142, DOWN,  B), t(143, RIGHT, A), t(144, LEFT,  B),
    t(145, UP,   A),  t(146, DOWN,  B), t(147, RIGHT, A), t(148, LEFT,  B),

    h(149, UP,   A, 4),
    t(153, RIGHT, B),

    t(155, DOWN, A),  t(156, LEFT,  B), t(157, UP,   A),  t(158, RIGHT, B),
    t(159, DOWN, A),  t(160, LEFT,  B), t(161, UP,   A),  t(162, RIGHT, B),
    t(163, DOWN, A),  t(164, LEFT,  B),

    t(167, UP,   A),  t(168, DOWN,  B), t(169, RIGHT, A),
    // → STOP 170.1
    t(171, LEFT, B),  t(172, UP,   A),  t(173, DOWN,  B), t(174, RIGHT, A),
    t(175, LEFT, B),
    h(176, UP,   A, 3),

    t(179, DOWN, B),
    t(182, UP,   A),  t(183, DOWN,  B),
    t(185, RIGHT, A),
    t(188, LEFT, B),
    t(190, UP,   A),  t(191, DOWN,  B),
    t(192, RIGHT, A),
    // → STOP 192.2
    t(193, LEFT, B),  t(194, UP,   A),  t(195, DOWN,  B),
    t(197, RIGHT, A), t(198, LEFT,  B), t(199, UP,    A),

    t(201, DOWN, B),  t(202, RIGHT, A), t(203, UP,    B), t(204, LEFT,  A),
    t(205, DOWN, B),  t(206, RIGHT, A), t(207, UP,    B), t(208, LEFT,  A),
    t(209, DOWN, B),  t(210, RIGHT, A), t(211, UP,    B),

    // ── Section 3: 86.3 BPM (from beat 212.5) ────────────────────────────────
    t(213, DOWN,  B),
    // → STOP 214.7
    t(216, UP,    A),
    h(217, DOWN,  B, 2),
    t(219, LEFT,  A),
    h(220, UP,    A, 2),
    t(222, RIGHT, B),
    t(223, DOWN,  A),
    // → STOP 225.2
    t(226, LEFT,  B),  t(227, UP,   A),  t(228, DOWN,  B), t(229, RIGHT, A),
    t(230, LEFT,  B),
    // → STOP 232.6
    t(234, UP,    A),
    h(235, RIGHT, B, 2),

    t(237, DOWN,  A),  t(238, UP,   B),  t(239, RIGHT, A),
    t(240, LEFT,  B),
    h(241, UP,    A, 3),

    t(245, DOWN,  B),  t(246, RIGHT, A), t(247, LEFT,  B), t(248, UP,    A),
    t(249, DOWN,  B),  t(250, RIGHT, A),
    h(251, LEFT,  B, 4),

    t(261, RIGHT, B),
    h(265, RIGHT, A, 8),
];

export const CHARTS: ChartDef[] = [
    { name: "CLASSIC", notes: CHART_CLASSIC },
    { name: "FAST",    notes: CHART_FAST },
    { name: "GROOVE",  notes: CHART_GROOVE },
];
